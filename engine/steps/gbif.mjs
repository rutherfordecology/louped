// Snapshot of public GBIF occurrence records inside the area, at the
// coordinates GBIF publishes (nothing blurred or gridded here).
// Settings in catchment.json: "gbif": { "exclude": [species...], "maxUncertaintyM": 5000 }
// usage: node engine/steps/gbif.mjs <catchment folder>
import * as turf from '@turf/turf';
import fs from 'node:fs';
import { loadCatchment } from '../lib.mjs';

const { cfg, path } = loadCatchment(process.argv[2]);
const areaFile = path('data/layers/area.json'), outFile = path('data/gbif.json');
const area = JSON.parse(fs.readFileSync(areaFile, 'utf8')).outline;
const [w, s, e, n] = turf.bbox(area);
const API = 'https://api.gbif.org/v1/';
// A request that never answers would stall the run: give each one 60 s and retry
const get = async (url) => { for (let i = 0; ; i++) { try { const r = await fetch(url, { signal: AbortSignal.timeout(60000) }); if (!r.ok) throw new Error(r.status); return await r.json(); } catch (err) { if (i === 5) throw err; await new Promise(r => setTimeout(r, 3000 * (i + 1))); } } };

// GBIF's search stalls past an offset of about 10,000, so any box holding
// more than 8,000 records is split into quarters until each is small enough.
const recs = [], seen = new Set();
const q = (b) => API + 'occurrence/search?hasCoordinate=true&hasGeospatialIssue=false&occurrenceStatus=PRESENT' +
  '&decimalLongitude=' + b[0].toFixed(5) + ',' + b[2].toFixed(5) + '&decimalLatitude=' + b[1].toFixed(5) + ',' + b[3].toFixed(5);
async function fetchBox(b) {
  if (!turf.booleanIntersects(turf.bboxPolygon(b), area)) return;
  const count = (await get(q(b) + '&limit=0')).count;
  if (count > 8000) {
    const mx = (b[0] + b[2]) / 2, my = (b[1] + b[3]) / 2;
    for (const c of [[b[0], b[1], mx, my], [mx, b[1], b[2], my], [b[0], my, mx, b[3]], [mx, my, b[2], b[3]]]) await fetchBox(c);
    return;
  }
  for (let off = 0; off < count; off += 300) {
    const j = await get(q(b) + '&limit=300&offset=' + off);
    for (const r of j.results) if (!seen.has(r.key)) { seen.add(r.key); recs.push(r); }
    if (j.endOfRecords || !j.results.length) break;
  }
  console.error('  ' + recs.length + ' so far');
}
await fetchBox([w, s, e, n]);
console.error(recs.length + ' records in the box');

// Left out: records GBIF couldn't match to any name (they say nothing about
// what was found); records whose location was deliberately obscured (e.g.
// iNaturalist's ~28 km for threatened taxa) or could be more than MAX_UNC_M
// off; and taxa that don't belong on a land map (marine species recorded at
// the coast).
const MAX_UNC_M = cfg.gbif?.maxUncertaintyM ?? 5000, EXCLUDE = new Set(cfg.gbif?.exclude || []);
const why = {}, drop = (k) => { why[k] = (why[k] || 0) + 1; return false; };
const inside = recs.filter(r => {
  if (!turf.booleanPointInPolygon([r.decimalLongitude, r.decimalLatitude], area)) return false;
  if (!(r.species || r.scientificName)) return drop('no name');
  if (/coordinate uncertainty increased|obscured|generali[sz]ed/i.test((r.informationWithheld || '') + ' ' + (r.dataGeneralizations || ''))) return drop('location obscured');
  if ((r.coordinateUncertaintyInMeters || 0) > MAX_UNC_M) return drop('location could be over ' + MAX_UNC_M / 1000 + ' km off');
  if (EXCLUDE.has(r.species)) return drop(r.species);
  return true;
});
console.error(inside.length + ' kept inside the area; left out: ' + JSON.stringify(why));

// Lookup tables keep the file small: species, datasets, record types
const idx = (arr, map, key, make) => { if (!map.has(key)) { map.set(key, arr.length); arr.push(make()); } return map.get(key); };
const taxa = [], taxaM = new Map(), datasets = [], dsM = new Map(), bases = [], bM = new Map(), licences = [], lM = new Map();
// Each record's licence, short form: CC0, CC BY or CC BY-NC
const licence = (u) => /zero|publicdomain/i.test(u || '') ? 'CC0' : /by-nc/i.test(u || '') ? 'CC BY-NC' : /\/by\//i.test(u || '') ? 'CC BY' : (u || 'unknown');
const rows = inside.map(r => {
  const key = r.speciesKey || r.genusKey || r.familyKey || r.taxonKey;
  const t = idx(taxa, taxaM, key, () => ({ key, name: r.species || r.scientificName.split(' ')[0], rank: r.speciesKey ? 'SPECIES' : (r.taxonRank || ''), kingdom: r.kingdom || '', phylum: r.phylum || '', cls: r.class || '', order: r.order || '', family: r.family || '', iucn: r.iucnRedListCategory || '' }));
  const d = idx(datasets, dsM, r.datasetKey, () => ({ key: r.datasetKey, name: r.datasetName || '' }));
  const b = idx(bases, bM, r.basisOfRecord, () => r.basisOfRecord);
  const lic = licence(r.license), l = idx(licences, lM, lic, () => lic);
  return [+r.decimalLongitude.toFixed(5), +r.decimalLatitude.toFixed(5), t, r.year || 0, r.coordinateUncertaintyInMeters || 0, b, d, r.key, (r.eventDate || '').slice(0, 10), l];
});

// Common names: the names step, next
for (const d of datasets) if (!d.name) { try { d.name = (await get(API + 'dataset/' + d.key)).title; } catch (err) {} }

fs.writeFileSync(outFile, JSON.stringify({ fetched: new Date().toISOString().slice(0, 10), cols: ['lng', 'lat', 'taxon', 'year', 'uncertainty_m', 'basis', 'dataset', 'gbifID', 'date', 'licence'], rows, taxa, datasets, bases, licences }));
console.error('wrote', outFile, rows.length + ' records,', taxa.length + ' taxa,', Math.round(fs.statSync(outFile).size / 1024) + ' KB');
