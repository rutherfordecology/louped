// New Zealand Threat Classification System status for each species in the
// snapshot (data/gbif.json, in place), matched the way Occurd does it: GBIF
// taxon key first, then the name, then the binomial. Where NZTCS lists several
// subspecies under a name, the catchment's island settles it (Occurd's
// locality table), then the nominate subspecies when that is not itself
// threatened; otherwise the species is left ambiguous with its options.
// Data: engine/data/nztcs/, copied from Occurd (nztcs.json, locality-core.js as .cjs,
// localities.tsv). Refresh by copying them again.
// usage: node engine/steps/nztcs.mjs <catchment folder>
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { loadCatchment } from '../lib.mjs';

const require = createRequire(import.meta.url);
const QNLocality = require('../data/nztcs/locality-core.cjs');
const { path } = loadCatchment(process.argv[2]);
const file = path('data/gbif.json'), gbif = JSON.parse(fs.readFileSync(file, 'utf8'));
const area = JSON.parse(fs.readFileSync(path('data/layers/area.json'), 'utf8'));
const data = JSON.parse(fs.readFileSync('engine/data/nztcs/nztcs.json', 'utf8'));
const table = QNLocality.makeTable(QNLocality.parseTsv(fs.readFileSync('engine/data/nztcs/localities.tsv', 'utf8')));

// Which island the catchment is on, from its middle (Occurd's islandZonesFor)
const ring = (area.outline.geometry.type === 'Polygon' ? area.outline.geometry.coordinates : area.outline.geometry.coordinates[0])[0];
const lat = ring.reduce((s, p) => s + p[1], 0) / ring.length, lng = ring.reduce((s, p) => s + p[0], 0) / ring.length;
const zones = new Set(); if (lat >= -41.7) zones.add('NI'); if (lat <= -41.0) zones.add('SI'); if (lat <= -46.5 && lng > 166.5 && lng < 168.7) zones.add('Stewart');

const norm = (s) => s ? s.toLowerCase().replace(/^["'\s]+|["'\s]+$/g, '').replace(/\s+/g, ' ') : null;
const rankDepth = (name) => { const parts = String(name || '').replace(/\([^)]*\)/g, ' ').trim().split(/\s+/); if (!parts[0]) return 0; let n = 1; for (const p of parts.slice(1)) { const t = p.replace(/[.,;]+$/, ''); if (/^(subsp|ssp|var|forma|f|cf|aff)$/i.test(t)) continue; if (!/^[a-z-]+$/.test(t)) break; if (++n === 3) break; } return n; };
const nominateDefault = (options) => { const nom = options.filter(o => QNLocality.isNominateName(o.name)); return nom.length === 1 && !/^(Threatened|At Risk)$/.test(nom[0].category || '') ? nom[0] : null; };
function resolve(options) {
  const d = QNLocality.chooseSubspecies(options, zones, table);
  if (d.kind === 'one' || d.kind === 'same-status') return { entry: d.pick, certain: true };
  const pool = d.kind === 'ask' ? d.options : options, nom = nominateDefault(pool);
  return nom ? { entry: nom, certain: false } : { conflict: true, options: pool };
}
function lookup(t) {
  const e = data['gbifkey:' + t.key];
  if (e) { const bin = (e.name || '').toLowerCase().split(/\s+/).slice(0, 2).join(' '), bc = data['conflict:' + bin]; return bc && rankDepth(e.name) < 3 ? resolve(bc.options) : { entry: e, certain: true }; }
  const c = data['gbifconflict:' + t.key]; if (c) return resolve(c.options);
  const k = norm(t.name);
  if (k && data[k]) return { entry: data[k], certain: true };
  if (k && data['conflict:' + k]) return resolve(data['conflict:' + k].options);
  const bin = (t.name || '').trim().split(/\s+/).slice(0, 2).join(' ').toLowerCase();
  if (bin.includes(' ') && data[bin]) return { entry: data[bin], certain: false };
  if (bin.includes(' ') && data['conflict:' + bin]) return resolve(data['conflict:' + bin].options);
  return null;
}

let n = 0; const tally = {};
for (const t of gbif.taxa) {
  delete t.nztcs;
  if (t.rank !== 'SPECIES') continue;
  const m = lookup(t); if (!m) continue;
  t.nztcs = m.conflict
    ? { ambiguous: true, options: m.options.map(o => ({ name: o.name, status: o.status, year: o.year })) }
    : { status: m.entry.status, category: m.entry.category, year: m.entry.year, name: m.entry.name, certain: m.certain };
  const s = m.conflict ? 'ambiguous' : m.entry.status; tally[s] = (tally[s] || 0) + 1; n++;
}
gbif.nztcsZones = [...zones];
fs.writeFileSync(file, JSON.stringify(gbif));
console.error('NZTCS: ' + n + ' species matched (' + [...zones].join('/') + '): ' + Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(', '));
