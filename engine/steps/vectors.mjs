// Public vector layers for the area, clipped to it: land cover, protection,
// rivers, wetlands, land use capability and council erosion overlays.
// Which layers: "layers" in catchment.json (keys of LAYERS below); regional
// council layers only exist for their region.
// usage: node engine/steps/vectors.mjs <catchment folder>
import * as turf from '@turf/turf';
import fs from 'node:fs';
import { loadCatchment, loadSite } from '../lib.mjs';
import { elevations } from '../elevation.mjs';

const { cfg, path } = loadCatchment(process.argv[2]);
const areaFile = path(cfg.boundary.file || 'inputs/catchments.geojson'), outDir = path('data/layers');
const parts = JSON.parse(fs.readFileSync(areaFile, 'utf8')).features;
let area = parts[0]; for (const p of parts.slice(1)) area = turf.union(area, p);
// Fill any holes left where the parts meet
area = area.geometry.type === 'Polygon' ? turf.polygon([area.geometry.coordinates[0]]) : turf.multiPolygon(area.geometry.coordinates.map(p => [p[0]]));
// and drop specks under 1 ha left where the parts' edges don't quite meet
if (area.geometry.type === 'MultiPolygon') { const keep = area.geometry.coordinates.filter(p => turf.area(turf.polygon(p)) > 1e4); area = keep.length === 1 ? turf.polygon(keep[0]) : turf.multiPolygon(keep); }
area = turf.truncate(area, { precision: 5 });
const [w, s, e, n] = turf.bbox(area), env = [w, s, e, n].map(v => v.toFixed(4)).join(',');
fs.mkdirSync(outDir, { recursive: true });

// National layers, then Gisborne District Council's (AGO), which only cover Tairāwhiti
const AGO = 'https://services7.arcgis.com/8G10QCd84QpdcTJ9/arcgis/rest/services/';
const LAYERS = {
  landcover: { url: 'https://services.arcgis.com/XTtANUDT8Va4DLwI/arcgis/rest/services/New_Zealand_Land_Cover/FeatureServer/0', fields: 'Name_2023,Name_2018,Name_2012,Name_2001', props: a => ({ c: a.Name_2023, c18: a.Name_2018, c12: a.Name_2012, c01: a.Name_2001 }), clip: true, tol: 0.00003 },
  qeii: { url: 'https://services-ap1.arcgis.com/h9r62GhsQQYscUHs/arcgis/rest/services/QEII_National_Trust_protected_areas/FeatureServer/0', fields: 'CovNumber,Type,AreaSurvHa', props: a => ({ name: 'QEII covenant ' + a.CovNumber, ha: a.AreaSurvHa }), tol: 0.00001 },
  pma: { url: AGO + 'plan_protection_management/FeatureServer/0', fields: 'NAME,PROPER_NAME,SUBCLASS,Hectares', props: a => ({ name: (a.PROPER_NAME || a.NAME || 'Protection management area').trim(), sub: a.SUBCLASS, ha: a.Hectares }), tol: 0.00001 },
  doc: { url: 'https://services1.arcgis.com/3JjYDyG3oajxU6HO/arcgis/rest/services/DOC_Public_Conservation_Land/FeatureServer/0', fields: 'Name,Type', props: a => ({ name: a.Name, type: a.Type }), tol: 0.00001 },
  wetlands: { url: AGO + 'GDC_Regional_Wetland_Assessment/FeatureServer/0', fields: 'wl_class,hydro_sys,wl_status,confidence,assumed_eco_value', props: a => ({ cls: a.wl_class, sys: a.hydro_sys, status: a.wl_status, conf: a.confidence, value: a.assumed_eco_value }), clip: true, tol: 0.00001 },
  luc: { url: AGO + 'NZLRI_LUC_Gisborne/FeatureServer/0', fields: 'LUC,LUC1C,LUC1C_DESC', props: a => ({ luc: a.LUC, cls: a.LUC1C, desc: a.LUC1C_DESC }), clip: true, tol: 0.00003 },
  overlay3a: { url: AGO + 'plan_land_management/FeatureServer/0', fields: 'Overlay', props: a => ({ name: 'Land Overlay ' + (a.Overlay || '3A') }), clip: true, tol: 0.00002 },
  overlays: { url: AGO + 'plan_land_management/FeatureServer/1', fields: 'OVERLAY', props: a => ({ name: 'Land Overlay ' + a.OVERLAY, ov: String(a.OVERLAY) }), clip: true, tol: 0.00002 },
  stability: { url: AGO + 'plan_stability_alert/FeatureServer/0', fields: 'LABEL,TEXT', props: a => ({ name: a.LABEL || a.TEXT || 'Stability alert' }), clip: true, tol: 0.00002 },
  scheduled: { url: AGO + 'plan_freshwater_rivers/FeatureServer/0', fields: 'River_name,Species,Catchment,Schedule', props: a => ({ name: (a.River_name || '').trim(), schedule: a.Schedule, species: a.Species }), lines: true, tol: 0.00002 },
  // Rivers and streams: LINZ NZ River Name Lines (Topo50 centrelines with names,
  // CC BY 4.0) from the LINZ Data Service, with stream order worked out here
  rivers: { wfs: 'layer-103632', props: a => ({ name: (a.name || '').trim() }), lines: true, strahler: true, tol: 0.00002 },
  // NIWA REC2 rivers (CC BY-NC 4.0: not for commercial use)
  rivers_rec2: { url: 'https://services3.arcgis.com/fp1tibNcN9mbExhG/arcgis/rest/services/NZ_Rivers_and_Names_WFL1/FeatureServer/0', fields: 'RivName,StreamOrde', props: a => ({ name: (a.RivName || '').trim(), order: a.StreamOrde }), lines: true, tol: 0.00002 }
};

// Esri JSON to GeoJSON. Asked for GeoJSON, some ArcGIS services return each
// hole as a polygon of its own, so outer rings and holes are sorted here:
// clockwise rings are outer, the rest are holes inside the outer that holds them.
function esriToGeo(g) {
  if (g.paths) return g.paths.length === 1 ? { type: 'LineString', coordinates: g.paths[0] } : { type: 'MultiLineString', coordinates: g.paths };
  const cw = (r) => { let s = 0; for (let i = 0; i < r.length - 1; i++) s += (r[i + 1][0] - r[i][0]) * (r[i + 1][1] + r[i][1]); return s > 0; };
  const outers = [], holes = [];
  g.rings.forEach(r => (cw(r) ? outers : holes).push(r));
  const polys = outers.map(r => [r.slice().reverse()]); // GeoJSON outer rings run anticlockwise
  for (const h of holes) {
    const pt = turf.point(h[0]), k = outers.findIndex(o => turf.booleanPointInPolygon(pt, turf.polygon([o])));
    if (k >= 0) polys[k].push(h.slice().reverse()); else polys.push([h.slice().reverse()]);
  }
  return polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };
}

// Pages must be in a fixed order, or a feature can come back on two pages
async function fetchAll(L) {
  const feats = [], seen = new Set();
  for (let off = 0; ; ) {
    const body = new URLSearchParams({ f: 'json', where: '1=1', geometry: env, geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: 'OBJECTID,' + L.fields, orderByFields: 'OBJECTID', outSR: '4326', returnGeometry: 'true', maxAllowableOffset: String(L.tol), geometryPrecision: '6', resultOffset: String(off), resultRecordCount: '1000' });
    let j;
    // ArcGIS Online limits requests per minute: on 429, wait and retry
    for (let i = 0; i < 5; i++) { try { j = await (await fetch(L.url + '/query', { method: 'POST', body })).json(); if (j.error) throw Object.assign(new Error(JSON.stringify(j.error)), { code: j.error.code }); break; } catch (err) { if (i === 4) throw err; await new Promise(r => setTimeout(r, err.code === 429 ? 65000 : 2000)); } }
    for (const f of j.features) { const id = f.attributes.OBJECTID; if (!f.geometry || seen.has(id)) continue; seen.add(id); feats.push({ type: 'Feature', properties: f.attributes, geometry: esriToGeo(f.geometry) }); }
    if (!j.features.length || !j.exceededTransferLimit) break;
    off += j.features.length;
  }
  return feats;
}

// LINZ Data Service WFS (needs the ldsKey in site.json), in pages of 2,000
async function fetchWFS(L) {
  const key = loadSite().ldsKey; if (!key) throw new Error(L.wfs + ' needs ldsKey in site.json');
  const feats = [];
  for (let start = 0; ; start += 2000) {
    const u = 'https://data.linz.govt.nz/services;key=' + key + '/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=' + L.wfs + '&outputFormat=json&srsName=EPSG:4326&count=2000&startIndex=' + start + '&sortBy=id&bbox=' + [s, w, n, e].join(',') + ',urn:ogc:def:crs:EPSG::4326';
    let j; for (let i = 0; i < 5; i++) { try { const r = await fetch(u, { signal: AbortSignal.timeout(120000) }); if (!r.ok) throw new Error(r.status); j = await r.json(); break; } catch (err) { if (i === 4) throw err; await new Promise(r => setTimeout(r, 3000 * (i + 1))); } }
    feats.push(...j.features.filter(f => f.geometry));
    if (j.features.length < 2000) break;
  }
  return L.strahler ? feats : feats.map(f => turf.simplify(f, { tolerance: L.tol }));
}

// River network and Strahler stream order. LINZ's lines break where a name
// changes rather than at confluences, tributaries can meet a line between its
// vertices, and lines aren't all drawn downstream. So: snap loose ends onto
// the line they touch, split lines wherever another line ends, find each
// connected network's outlet (its lowest end, from the LiDAR), point every
// line towards it, then order the streams.
async function riverNetwork(feats) {
  const k = (p) => p[0].toFixed(7) + ',' + p[1].toFixed(7);
  let parts = feats.flatMap(f => (f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates]).filter(c => c.length > 1).map(c => ({ props: f.properties, c: c.map(q => [q[0], q[1]]) })));
  // Snap ends that stop on another line (within 2 m) onto a new vertex there
  const vtx = new Set(parts.flatMap(q => q.c.map(k)));
  const boxes = parts.map(q => turf.bbox(turf.lineString(q.c)));
  for (const q of parts) for (const end of [0, q.c.length - 1]) {
    if (parts.some(o => o !== q && (k(o.c[0]) === k(q.c[end]) || k(o.c.at(-1)) === k(q.c[end])))) continue;
    const pt = turf.point(q.c[end]), [x, y] = q.c[end], m = 0.00003;
    parts.forEach((o, j) => {
      if (o === q) return; const bb = boxes[j]; if (x < bb[0] - m || x > bb[2] + m || y < bb[1] - m || y > bb[3] + m) return;
      const near = turf.nearestPointOnLine(turf.lineString(o.c), pt, { units: 'meters' });
      if (near.properties.dist > 2) return;
      const at = near.geometry.coordinates, i = near.properties.index;
      if (!vtx.has(k(at))) { o.c.splice(i + 1, 0, at); vtx.add(k(at)); }
      q.c[end] = at;
    });
  }
  // Split at every vertex where another line ends
  const ends = new Set(parts.flatMap(q => [k(q.c[0]), k(q.c.at(-1))]));
  const segs = [];
  for (const { props, c } of parts) { let st = 0; for (let i = 1; i < c.length - 1; i++) if (ends.has(k(c[i]))) { segs.push({ props, c: c.slice(st, i + 1) }); st = i; } segs.push({ props, c: c.slice(st) }); }
  // Undirected graph on segment ends
  const adj = new Map(), add = (n, e) => { if (!adj.has(n)) adj.set(n, []); adj.get(n).push(e); };
  segs.forEach((g, i) => { g.a = k(g.c[0]); g.b = k(g.c.at(-1)); add(g.a, i); add(g.b, i); });
  // Outlets: the lowest dead end of each connected network
  const leaves = [...adj.keys()].filter(n => adj.get(n).length === 1);
  const coordOf = new Map(); segs.forEach(g => { coordOf.set(g.a, g.c[0]); coordOf.set(g.b, g.c.at(-1)); });
  const elev = await elevations(leaves.map(n => coordOf.get(n)), cfg.lidar);
  const leafZ = new Map(leaves.map((n, i) => [n, elev[i]]));
  const seen = new Set(), down = new Array(segs.length).fill(null); // down[i]: the end segment i flows to
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const comp = [], stack = [start]; seen.add(start);
    while (stack.length) { const n = stack.pop(); comp.push(n); for (const e of adj.get(n)) for (const m of [segs[e].a, segs[e].b]) if (!seen.has(m)) { seen.add(m); stack.push(m); } }
    const cands = comp.filter(n => leafZ.get(n) != null);
    if (!cands.length) { comp.forEach(n => adj.get(n).forEach(e => { down[e] = down[e] || segs[e].b; })); continue; } // no LiDAR: as drawn
    const outlet = cands.reduce((x, y) => leafZ.get(y) < leafZ.get(x) ? y : x);
    // Walk upstream from the outlet; each segment flows towards the node it was reached from
    const q = [outlet], reached = new Set([outlet]);
    while (q.length) { const n = q.shift(); for (const e of adj.get(n)) { if (down[e]) continue; down[e] = n; const up = segs[e].a === n ? segs[e].b : segs[e].a; if (!reached.has(up)) { reached.add(up); q.push(up); } } }
  }
  // Strahler order, upstream segments being those flowing into this one's top
  const into = new Map(); segs.forEach((g, i) => { const top = down[i] === g.a ? g.b : g.a; g.top = top; if (!into.has(down[i])) into.set(down[i], []); into.get(down[i]).push(i); });
  const order = new Array(segs.length).fill(0), busy = new Set();
  const calc = (i) => {
    if (order[i]) return order[i]; if (busy.has(i)) return 1; busy.add(i);
    const ups = (into.get(segs[i].top) || []).filter(j => j !== i).map(calc), m = ups.length ? Math.max(...ups) : 1;
    busy.delete(i); return (order[i] = ups.filter(v => v === m).length > 1 ? m + 1 : m);
  };
  return segs.map((g, i) => turf.lineString(down[i] === g.a ? g.c.slice().reverse() : g.c, { ...g.props, order: calc(i) }));
}

const round = (g) => turf.truncate(g, { precision: 5, mutate: true });
const summary = {};
const unknown = cfg.layers.filter(k => !LAYERS[k]);
if (unknown.length) throw new Error('unknown layers in catchment.json: ' + unknown.join(', ') + ' (known: ' + Object.keys(LAYERS).join(', ') + ')');
for (const [key, L] of Object.entries(LAYERS).filter(([k]) => cfg.layers.includes(k))) {
  let raw = L.wfs ? await fetchWFS(L) : await fetchAll(L);
  const out = [];
  if (L.strahler) raw = (await riverNetwork(raw)).map(f => turf.simplify(f, { tolerance: L.tol }));
  for (const f of raw) {
    if (!f.geometry) continue;
    const props = { ...L.props(f.properties || {}), ...(L.strahler ? { order: f.properties.order } : {}) };
    if (L.lines) {
      // Keep river segments whose middle is inside the area (a multi-part
      // line by its longest part; a line with no length is dropped)
      const line = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates.map(c => turf.lineString(c.length > 1 ? c : [c[0], c[0]])).sort((x, y) => turf.length(y) - turf.length(x))[0] : f;
      if (line.geometry.coordinates.length < 2) continue;
      const mid = turf.along(line, turf.length(line) / 2);
      if (turf.booleanPointInPolygon(mid, area)) out.push(round(turf.feature(f.geometry, props)));
    } else if (L.clip) {
      let c = null;
      try { c = turf.intersect(f, area); } catch (err) { c = null; }
      if (c && turf.area(c) > 50) out.push(round(turf.feature(c.geometry, props)));
    } else if (turf.booleanIntersects(f, area)) out.push(round(turf.feature(f.geometry, props)));
  }
  fs.writeFileSync(outDir + '/' + key + '.json', JSON.stringify(turf.featureCollection(out)));
  summary[key] = out.length;
  console.error(key, raw.length, '->', out.length, Math.round(fs.statSync(outDir + '/' + key + '.json').size / 1024) + ' KB');
}
fs.writeFileSync(outDir + '/area.json', JSON.stringify({ outline: area, parts: turf.featureCollection(parts.map(p => turf.truncate(p, { precision: 5 }))), km2: +(turf.area(area) / 1e6).toFixed(1) }));
