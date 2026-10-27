// Shared by the engine's steps: a catchment's settings and folder paths.
import fs from 'node:fs';

export const ENGINE_VERSION = 'v0.4.4';

// A catchment is a folder with a catchment.json; every step takes its folder name
export function loadCatchment(slug) {
  if (!slug) throw new Error('usage: node engine/steps/<step>.mjs <catchment folder>');
  const dir = slug.replace(/[\\/]+$/, '');
  const file = dir + '/catchment.json';
  if (!fs.existsSync(file)) throw new Error('no ' + file);
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  cfg.slug = cfg.slug || dir;
  return { dir, cfg, path: (...parts) => [dir, ...parts].join('/') };
}

// Project-wide settings (site.json): the LINZ Basemaps API key
export const loadSite = () => fs.existsSync('site.json') ? JSON.parse(fs.readFileSync('site.json', 'utf8')) : {};

// Every folder in the project that holds a catchment
export const allCatchments = () => fs.readdirSync('.', { withFileTypes: true })
  .filter(d => d.isDirectory() && fs.existsSync(d.name + '/catchment.json'))
  .map(d => loadCatchment(d.name));
