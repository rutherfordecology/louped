// Louped: put client sites online on Cloudflare Pages, behind Cloudflare Access.
//
//   npm run online -- list            what is online, and what isn't
//   npm run online -- add <site>      put a site on the online list
//   npm run online -- remove <site>   take a site off the list
//   npm run online                    build dist/ from the list and deploy it
//   npm run online -- --dry           build dist/ only, deploy nothing
//
// The list is online.json (git-ignored). Every deploy replaces the whole
// hosted site with exactly the sites on the list, so a site taken off the list
// goes offline at the next deploy. Each site is served at
// https://<project>.pages.dev/<site>/. Cloudflare Access decides who may open
// it (one Access application per site path; see HOSTING.md). Never deploy a
// site before its Access application exists.
//
// What goes up: the viewer, job.json and the package folders. Never the LINZ
// key (assets/keys.json): hosted sites fall back to Esri base maps.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITES = path.join(ROOT, 'sites');
const DIST = path.join(ROOT, 'dist');
const LIST = path.join(ROOT, 'online.json');
const WRANGLER = 'wrangler@4.157.0';

const slugOk = (s) => /^[a-z0-9][a-z0-9-]{0,62}$/.test(s);
const exists = (p) => fs.access(p).then(() => true, () => false);
const readJson = async (p) => JSON.parse(await fs.readFile(p, 'utf8'));
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function loadList() {
  const l = await readJson(LIST).catch(() => ({}));
  return { project: l.project || 'louped', sites: Array.isArray(l.sites) ? l.sites : [] };
}
const saveList = (l) => fs.writeFile(LIST, JSON.stringify(l, null, 2) + '\n');

async function allSites() {
  const out = [];
  for (const d of await fs.readdir(SITES, { withFileTypes: true }).catch(() => [])) {
    if (d.isDirectory() && await exists(path.join(SITES, d.name, 'job.json'))) out.push(d.name);
  }
  return out.sort();
}

const PAGE = (title, text) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title>
<style>body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#f7f5f0;color:#222}
header{background:#263b27;color:#fff;padding:14px 20px;font-weight:700}main{max-width:560px;margin:48px auto;padding:0 16px}</style>
</head><body><header>Rutherford ecology</header><main><h1 style="font-size:22px">${esc(title)}</h1><p>${text}</p></main></body></html>
`;

async function copyDir(from, to) {
  await fs.mkdir(to, { recursive: true });
  for (const e of await fs.readdir(from, { withFileTypes: true })) {
    if (e.name === 'keys.json' || e.name.startsWith('.')) continue;
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) await copyDir(a, b); else await fs.copyFile(a, b);
  }
}

async function build(list) {
  if (!list.sites.length) throw new Error('the online list is empty: npm run online -- add <site>');
  await fs.rm(DIST, { recursive: true, force: true });
  await fs.mkdir(DIST, { recursive: true });
  await fs.writeFile(path.join(DIST, 'index.html'), PAGE('Client maps', 'Open the link you were sent for your map. For access, contact Rutherford Ecology.'));
  await fs.writeFile(path.join(DIST, '404.html'), PAGE('Not found', 'There is no map at this address. Check the link you were sent.'));
  // No search engines; data files always checked for a newer copy
  await fs.writeFile(path.join(DIST, '_headers'), '/*\n  X-Robots-Tag: noindex, nofollow\n  Referrer-Policy: same-origin\n/*.json\n  Cache-Control: no-cache\n/*.geojson\n  Cache-Control: no-cache\n');
  for (const slug of list.sites) {
    const src = path.join(SITES, slug), job = await readJson(path.join(src, 'job.json')).catch(() => null);
    if (!job) throw new Error('no site called "' + slug + '" in sites/');
    const out = path.join(DIST, slug);
    await fs.mkdir(out, { recursive: true });
    await fs.copyFile(path.join(ROOT, 'viewer', 'index.html'), path.join(out, 'index.html'));
    await fs.copyFile(path.join(src, 'job.json'), path.join(out, 'job.json'));
    for (const d of job.packages || ['package']) {
      if (!/^[a-z0-9._-]+$/i.test(d) || !await exists(path.join(src, d, 'louped.json'))) throw new Error(slug + ': package folder "' + d + '" is missing');
      await copyDir(path.join(src, d), path.join(out, d));
    }
    console.log('  ' + slug + '/  ' + (job.title || ''));
  }
}

function wrangler(args) {
  // One command string: the arguments are fixed words and a checked project name
  if (!args.every(a => /^[A-Za-z0-9=._-]+$/.test(a))) throw new Error('unexpected wrangler argument');
  const r = spawnSync(['npx', '-y', WRANGLER, ...args].join(' '), { cwd: ROOT, stdio: 'inherit', shell: true });
  if (r.status !== 0) throw new Error('wrangler ' + args[0] + ' ' + (args[1] || '') + ' failed');
}

const [cmd, arg] = process.argv.slice(2);
const list = await loadList();
try {
  if (cmd === 'list') {
    const all = await allSites();
    console.log('Project: ' + list.project + '  (https://' + list.project + '.pages.dev/)');
    for (const s of all) console.log((list.sites.includes(s) ? '  online   ' : '  local    ') + s);
    for (const s of list.sites.filter(s => !all.includes(s))) console.log('  missing  ' + s + '  (on the list, but not in sites/)');
  } else if (cmd === 'add' || cmd === 'remove') {
    if (!arg || !slugOk(arg)) throw new Error('give a site name, as in sites/<name>');
    if (cmd === 'add') {
      if (!(await allSites()).includes(arg)) throw new Error('no site called "' + arg + '" in sites/');
      if (!list.sites.includes(arg)) list.sites.push(arg);
      console.log(arg + ' is on the list. Make its Access application for /' + arg + '/ first (HOSTING.md), then: npm run online');
    } else {
      list.sites = list.sites.filter(s => s !== arg);
      console.log(arg + ' is off the list; it goes offline at the next: npm run online');
    }
    await saveList(list);
  } else if (!cmd || cmd === '--dry') {
    console.log('Building dist/ for ' + list.project + ':');
    await build(list);
    if (cmd === '--dry') { console.log('Built dist/; nothing deployed.'); }
    else {
      wrangler(['pages', 'deploy', 'dist', '--project-name', list.project, '--branch', 'main', '--commit-dirty=true']);
      console.log('Deployed. Check each site in a private window: it should ask you to sign in.');
    }
  } else {
    throw new Error('unknown command "' + cmd + '": use list, add, remove, --dry, or nothing to deploy');
  }
} catch (e) {
  console.error('Error: ' + e.message);
  process.exit(1);
}
