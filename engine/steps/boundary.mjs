// Catchment boundaries. Settings in catchment.json, one of:
// 1. From a catchment polygon layer (e.g. Gisborne District Council's River
//    Catchments, CC BY 4.0): each part is the polygons whose `field` has that value.
//    "boundary": { "layer": "<ArcGIS FeatureServer layer URL>", "field": "SubCatchment",
//                  "parts": { "Waimata": "Waimata River" },
//                  "coast": { "values": ["Coastal", "Other"], "label": "Coastal streams" } }
//    "coast" adds the small coastal catchments lying between the parts.
// 2. Traced upstream through NIWA's REC2 river network (CC BY-NC 4.0, so not
//    for commercial use) and merged from REC2 watersheds:
//    "boundary": { "bbox": [minLng, minLat, maxLng, maxLat], "rivers": ["Waimata"], "coast": false }
//    "coast" also takes in the small streams reaching the sea between the rivers.
// 3. A boundary from elsewhere: "boundary": { "file": "inputs/catchments.geojson" }
// (a FeatureCollection with a "name" on each part); this step then does nothing.
// usage: node engine/steps/boundary.mjs <catchment folder>
import * as turf from '@turf/turf';
import fs from 'node:fs';
import { loadCatchment } from '../lib.mjs';

const { cfg, path } = loadCatchment(process.argv[2]);
const outFile = path('inputs/catchments.geojson');
if (cfg.boundary.file) { console.error('boundary from ' + cfg.boundary.file); process.exit(0); }
fs.mkdirSync(path('inputs'), { recursive: true });

// Holes between neighbouring polygons are filled; specks under 1 ha dropped
const tidy = (u, label, n) => {
  const g = u.geometry, polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).map(p => [p[0]]).filter(p => turf.area(turf.polygon(p)) > 1e4);
  const f = turf.truncate(polys.length === 1 ? turf.polygon(polys[0]) : turf.multiPolygon(polys), { precision: 5 });
  f.properties = { name: label, polygons: n, km2: +(turf.area(f) / 1e6).toFixed(1) };
  console.error(label + ': ' + n + ' polygons, ' + f.properties.km2 + ' km²');
  return f;
};
if (cfg.boundary.layer) {
  const B = cfg.boundary, cw = (r) => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += (r[i + 1][0] - r[i][0]) * (r[i + 1][1] + r[i][1]); return a > 0; };
  const get = async (where) => {
    const body = new URLSearchParams({ f: 'json', outSR: '4326', where, outFields: B.field, returnGeometry: 'true', resultRecordCount: '2000' });
    for (let i = 0; ; i++) { try { const j = await (await fetch(B.layer + '/query', { method: 'POST', body })).json(); if (j.error) throw new Error(JSON.stringify(j.error)); return j.features; } catch (e) { if (i === 2) throw e; await new Promise(r => setTimeout(r, 3000)); } }
  };
  // Outer rings only: catchments don't have holes worth keeping
  const toGeo = (g) => { const o = g.rings.filter(cw).map(r => [r.slice().reverse()]); return o.length === 1 ? turf.polygon(o[0]) : turf.multiPolygon(o); };
  const unite = (list) => list.reduce((a, b) => a ? turf.union(a, b) : b, null);
  const q = (v) => "'" + String(v).replace(/'/g, "''") + "'";
  const out = [];
  for (const [value, label] of Object.entries(B.parts)) {
    const polys = (await get(B.field + ' = ' + q(value))).map(f => toGeo(f.geometry));
    if (!polys.length) throw new Error('no ' + B.field + ' = ' + value + ' in ' + B.layer);
    out.push(tidy(unite(polys), label, polys.length));
  }
  if (B.coast) {
    // Coastal catchments whose middle lies within the hull of the named parts
    const hull = turf.convex(turf.featureCollection(out));
    const polys = (await get(B.field + ' IN (' + B.coast.values.map(q).join(',') + ')')).map(f => toGeo(f.geometry))
      .filter(p => turf.booleanPointInPolygon(turf.pointOnFeature(p), hull));
    if (polys.length) out.push(tidy(unite(polys), B.coast.label || 'Coastal streams', polys.length));
  }
  fs.writeFileSync(outFile, JSON.stringify(turf.featureCollection(out)));
  process.exit(0);
}
const bboxArg = cfg.boundary.bbox.join(','), names = [...cfg.boundary.rivers];
const RIV = 'https://services3.arcgis.com/fp1tibNcN9mbExhG/arcgis/rest/services/NZ_Rivers_and_Names_WFL1/FeatureServer/0/query';
const WS = 'https://services3.arcgis.com/fp1tibNcN9mbExhG/arcgis/rest/services/REC2_Layers/FeatureServer/1/query';

async function query(url, params) {
  const body = new URLSearchParams({ f: 'json', outSR: '4326', ...params });
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, { method: 'POST', body }); const j = await r.json(); if (j.error) throw new Error(JSON.stringify(j.error)); return j; }
    catch (e) { if (i === 2) throw e; }
  }
}

// Every river segment in the box
const segs = [];
for (let off = 0; ; off += 2000) {
  const j = await query(RIV, { where: '1=1', geometry: bboxArg, geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
    outFields: 'nzsegment,FROM_NODE,TO_NODE,LENGTHDOWN,RivName,StreamOrde', returnGeometry: 'false', resultOffset: String(off), resultRecordCount: '2000' });
  segs.push(...j.features.map(f => f.attributes));
  if (!j.exceededTransferLimit) break;
}
console.error(segs.length + ' segments');
const byTo = new Map();
segs.forEach(s => { if (!byTo.has(s.TO_NODE)) byTo.set(s.TO_NODE, []); byTo.get(s.TO_NODE).push(s); });

const upstream = (mouths) => {
  const ids = new Set(), stack = [...mouths];
  while (stack.length) { const s = stack.pop(); if (ids.has(s.nzsegment)) continue; ids.add(s.nzsegment); (byTo.get(s.FROM_NODE) || []).forEach(u => stack.push(u)); }
  return ids;
};
const coast = !!cfg.boundary.coast;

const out = [], mouths = [];
for (const name of names) {
  const re = new RegExp('^\\s*' + name + '\\b', 'i');
  const named = segs.filter(s => re.test(s.RivName || ''));
  if (!named.length) { console.error('no segments named ' + name); continue; }
  const mouth = named.reduce((a, b) => (b.LENGTHDOWN < a.LENGTHDOWN ? b : a));
  mouths.push(mouth);
  await addArea(upstream([mouth]), (mouth.RivName || name).trim());
}
if (coast && mouths.length > 1) {
  // Outlets: segments at the sea (nothing downstream, ~0 m to the sea)
  const froms = new Set(segs.map(s => s.FROM_NODE)), taken = new Set(mouths.map(m => m.nzsegment));
  const outlets = segs.filter(s => !froms.has(s.TO_NODE) && s.LENGTHDOWN < 100 && !taken.has(s.nzsegment));
  const ends = async (list) => { const r = new Map(); for (let i = 0; i < list.length; i += 250) { const j = await query(RIV, { where: 'nzsegment IN (' + list.slice(i, i + 250).map(s => s.nzsegment).join(',') + ')', outFields: 'nzsegment', returnGeometry: 'true' }); j.features.forEach(f => r.set(f.attributes.nzsegment, f.geometry.paths.at(-1).at(-1))); } return r; };
  const me = await ends(mouths), oe = await ends(outlets), lats = [...me.values()].map(p => p[1]);
  const lo = Math.min(...lats), hi = Math.max(...lats);
  const between = outlets.filter(s => { const p = oe.get(s.nzsegment); return p && p[1] > lo && p[1] < hi; });
  console.error(between.length + ' coastal streams between the rivers');
  await addArea(upstream(between), 'Coastal streams');
}

async function addArea(ids, label) {
  const list = [...ids], polys = [];
  for (let i = 0; i < list.length; i += 250) {
    const j = await query(WS, { where: 'nzsegment IN (' + list.slice(i, i + 250).join(',') + ')', outFields: 'nzsegment', returnGeometry: 'true' });
    j.features.forEach(f => polys.push(turf.polygon(f.geometry.rings)));
  }
  let u = polys[0];
  for (const p of polys.slice(1)) u = turf.union(u, p);
  // Slivers between REC2 watersheds leave holes in the union: fill them
  const outer = (g) => g.type === 'Polygon' ? turf.polygon([g.coordinates[0]]) : turf.multiPolygon(g.coordinates.map(p => [p[0]]));
  u = turf.truncate(outer(u.geometry), { precision: 5 });
  u.properties = { name: label, segments: list.length, km2: +(turf.area(u) / 1e6).toFixed(1) };
  console.error(u.properties.name + ': ' + list.length + ' segments, ' + u.properties.km2 + ' km²');
  out.push(u);
}
fs.writeFileSync(outFile, JSON.stringify(turf.featureCollection(out)));
