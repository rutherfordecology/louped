// Catchment map engine: builds a catchment's map from its catchment.json.
// usage: node engine/build.mjs <catchment folder> [step ...]
//   steps, in order: boundary vectors gbif names lidar page (default: all)
//   e.g. node engine/build.mjs waimata page   (just remake the pages)
import { spawnSync } from 'node:child_process';
import { loadCatchment } from './lib.mjs';

const STEPS = ['boundary', 'vectors', 'gbif', 'names', 'lidar', 'page'];
const [slug, ...asked] = process.argv.slice(2);
const { cfg } = loadCatchment(slug);
const bad = asked.filter(s => !STEPS.includes(s));
if (bad.length) { console.error('unknown step: ' + bad.join(', ') + ' (steps: ' + STEPS.join(' ') + ')'); process.exit(1); }
const run = asked.length ? STEPS.filter(s => asked.includes(s)) : STEPS;

console.error('Building ' + cfg.name + ': ' + run.join(', '));
for (const step of run) {
  const t0 = Date.now();
  console.error('\n== ' + step);
  const r = spawnSync(process.execPath, ['engine/steps/' + step + '.mjs', slug], { stdio: 'inherit' });
  if (r.status !== 0) { console.error(step + ' failed'); process.exit(r.status || 1); }
  console.error('== ' + step + ' done in ' + Math.round((Date.now() - t0) / 1000) + ' s');
}
