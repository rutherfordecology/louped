// Copies the master map page (map.html) into every catchment folder that has
// a data/config.json, as index.html, with that catchment's title filled in.
// usage: node scripts/pages.mjs
import fs from 'node:fs';

const master = fs.readFileSync('map.html', 'utf8').replace(/^<!--[^]*?-->\r?\n/, '');
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
for (const dir of fs.readdirSync('.', { withFileTypes: true }).filter(d => d.isDirectory())) {
  const cfgFile = dir.name + '/data/config.json';
  if (!fs.existsSync(cfgFile)) continue;
  const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
  fs.writeFileSync(dir.name + '/index.html', master.replace('{{TITLE}}', esc(cfg.pageTitle)).replace('{{DESCRIPTION}}', esc(cfg.description)));
  console.error('wrote ' + dir.name + '/index.html');
}
