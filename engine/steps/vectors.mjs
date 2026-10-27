// Public vector layers for the area, clipped to it: land cover, protection,
// rivers, wetlands, land use capability and council erosion overlays.
// Which layers: "layers" in catchment.json (keys of LAYERS below); regional
// council layers only exist for their region.
// usage: node engine/steps/vectors.mjs <catchment folder>
import * as turf from '@turf/turf';
import fs from 'node:fs';
import { loadCatchment } from '../lib.mjs';

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
  rivers: { url: 'https://services3.arcgis.com/fp1tibNcN9mbExhG/arcgis/rest/services/NZ_Rivers_and_Names_WFL1/FeatureServer/0', fields: 'RivName,StreamOrde', props: a => ({ name: (a.RivName || '').trim(), order: a.StreamOrde }), lines: true, tol: 0.00002 }
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

const round = (g) => turf.truncate(g, { precision: 5, mutate: true });
const summary = {};
const unknown = cfg.layers.filter(k => !LAYERS[k]);
if (unknown.length) throw new Error('unknown layers in catchment.json: ' + unknown.join(', ') + ' (known: ' + Object.keys(LAYERS).join(', ') + ')');
for (const [key, L] of Object.entries(LAYERS).filter(([k]) => cfg.layers.includes(k))) {
  const raw = await fetchAll(L), out = [];
  for (const f of raw) {
    if (!f.geometry) continue;
    const props = L.props(f.properties || {});
    if (L.lines) {
      // Keep river segments whose middle is inside the area
      const mid = turf.along(f, turf.length(f) / 2);
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
