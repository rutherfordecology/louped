// The catchment's pages: the map (index.html), the About page (about.html)
// and the map's settings (data/config.json), from the templates in
// engine/templates. Also remakes the project home page listing every
// catchment, and copies the shared assets.
// usage: node engine/steps/page.mjs <catchment folder>
import fs from 'node:fs';
import { loadCatchment, allCatchments, ENGINE_VERSION } from '../lib.mjs';
import { SOURCES } from '../sources.mjs';

const { cfg, path } = loadCatchment(process.argv[2]);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fill = (tpl, vals) => fs.readFileSync('engine/templates/' + tpl, 'utf8').replace(/^<!--[^]*?-->\r?\n/, '').replace(/\{\{(\w+)\}\}/g, (m, k) => { if (!(k in vals)) throw new Error(tpl + ': no value for ' + k); return vals[k]; });

const area = JSON.parse(fs.readFileSync(path('data/layers/area.json'), 'utf8'));
const gbif = JSON.parse(fs.readFileSync(path('data/gbif.json'), 'utf8'));
const sources = SOURCES.filter(s => s.uses(cfg));

// Map settings
fs.writeFileSync(path('data/config.json'), JSON.stringify({
  slug: cfg.slug, name: cfg.name, title: cfg.title, mapLabel: cfg.mapLabel, areaText: cfg.areaText, boundaryNote: cfg.boundaryNote,
  layers: cfg.layers, version: ENGINE_VERSION,
  sources: sources.map(s => ({ key: s.key, short: s.short, attr: s.attr || '' }))
}, null, 2) + '\n');

fs.writeFileSync(path('index.html'), fill('map.html', { TITLE: esc(cfg.pageTitle), DESCRIPTION: esc(cfg.description), NAME: esc(cfg.name), VERSION: ENGINE_VERSION }));

// About page
const nSpecies = gbif.taxa.filter(t => t.rank === 'SPECIES').length;
const byLic = {}; if (gbif.licences) gbif.rows.forEach(r => { const l = gbif.licences[r[9]]; byLic[l] = (byLic[l] || 0) + 1; });
const pct = (n) => Math.round(100 * n / gbif.rows.length) + '%';
const licText = gbif.licences ? ' By licence: ' + Object.entries(byLic).sort((a, b) => b[1] - a[1]).map(([l, n]) => l + ' ' + n.toLocaleString() + ' (' + pct(n) + ')').join(', ') + '.' : '';
const TAG = { yes: 'Yes', no: 'No', mixed: 'Depends on the record', check: 'Check the terms' };
const rows = sources.map(s => '<tr><td><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.name) + '</a><br><span class="note">' + esc(s.by) + '</span></td><td>' + esc(s.used) + '</td><td>' + esc(s.licence) + '</td><td><span class="tag ' + s.commercial + '">' + TAG[s.commercial] + '</span></td></tr>').join('');
const nc = sources.filter(s => s.commercial === 'no').map(s => s.short), mixed = sources.filter(s => s.commercial === 'mixed').map(s => s.short), unclear = sources.filter(s => s.commercial === 'check').map(s => s.short);
const licSummary = (nc.length ? 'Non-commercial only: ' + nc.join(', ') + '. ' : '') + (mixed.length ? 'Depends on the record: ' + mixed.join(', ') + '. ' : '') + (unclear.length ? 'Terms to check before commercial use: ' + unclear.join(', ') + '. ' : '') + 'The rest is CC BY 4.0: free to use, including commercially, with attribution.';
const excluded = (cfg.gbif?.exclude || []).length ? ' (' + cfg.gbif.exclude.map(n => '<i>' + esc(n) + '</i>').join(', ') + ')' : '';
fs.writeFileSync(path('about.html'), fill('about.html', {
  NAME: esc(cfg.name), TITLE: esc(cfg.title), BOUNDARY_NOTE: esc(cfg.boundaryNote), AREA_HA: Math.round(area.km2 * 100).toLocaleString(),
  GBIF_SUMMARY: esc(gbif.rows.length.toLocaleString() + ' public records of ' + nSpecies.toLocaleString() + ' species from GBIF.org, snapshot ' + gbif.fetched + '.' + licText),
  MAX_UNC_KM: String((cfg.gbif?.maxUncertaintyM ?? 5000) / 1000), EXCLUDED: excluded,
  CHECKED: '27 October 2026', SOURCES_ROWS: rows, LICENCE_SUMMARY: esc(licSummary),
  YEAR: gbif.fetched.slice(0, 4), VERSION: ENGINE_VERSION, GBIF_DATE: gbif.fetched
}));
console.error('wrote ' + path('index.html') + ', ' + path('about.html') + ', ' + path('data/config.json'));

// Project home page and shared assets
fs.mkdirSync('assets', { recursive: true });
fs.copyFileSync('engine/assets/logo.png', 'assets/logo.png');
fs.copyFileSync('engine/templates/site.css', 'assets/site.css');
const cards = allCatchments().sort((a, b) => a.cfg.name.localeCompare(b.cfg.name, 'en'))
  .map(({ dir, cfg: c }) => '<a class="card" href="' + esc(dir) + '/"><b>' + esc(c.name) + '</b><span>' + esc(c.card) + (c.region ? ' · ' + esc(c.region) : '') + '</span></a>').join('\n    ');
fs.writeFileSync('index.html', fill('home.html', { CARDS: cards, VERSION: ENGINE_VERSION }));
console.error('wrote index.html and assets/');
