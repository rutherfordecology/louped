// Catchment boundaries for named rivers, traced upstream through NIWA's REC2
// river network and merged from REC2 watersheds.
// usage: node scripts/boundary.mjs <out.geojson> <minLng,minLat,maxLng,maxLat> <River name> [...] [--coast]
import * as turf from '@turf/turf';
import fs from 'node:fs';

const [outFile, bboxArg, ...names] = process.argv.slice(2);
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
// "--coast": also the small streams reaching the sea between the named rivers
const coast = names.includes('--coast'); if (coast) names.splice(names.indexOf('--coast'), 1);

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
