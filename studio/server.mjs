// Louped studio: a small local server for making client sites from packages.
//   npm run studio      then open http://localhost:7884/
// Drop a package (.louped.zip from inferrd.'s Export for Louped), add the
// title and wording, save. Each site is a static folder, sites/<slug>/:
//   index.html   the viewer (copied from viewer/index.html on every save)
//   job.json     your wording; a new package never touches it
//   package/     the package's files, replaced whole by a newer package
// The studio runs on this computer only; the sites folder is what gets hosted.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { hiddenSet, clientManifest } from './hide.mjs';
import { cfConfig, cfApply, cfCheck, cfRemove, parsePeople } from './cloudflare.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITES = path.join(ROOT, 'sites');
const PORT = Number(process.env.PORT) || 7884;
const JOB_FIELDS = ['title', 'subtitle', 'client', 'date', 'intro', 'about', 'contact', 'areasName'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.geojson': 'application/geo+json', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

const slugOk = (s) => /^[a-z0-9][a-z0-9-]{0,62}$/.test(s);
// Package paths: louped.json, or a file under layers/, records/ or images/
const pkgPathOk = (p) => p === 'louped.json' || /^(layers|records|images)\/[A-Za-z0-9._-]+$/.test(p);
const exists = (p) => fs.access(p).then(() => true, () => false);
const readJson = async (p) => JSON.parse(await fs.readFile(p, 'utf8'));
const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-cache' }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
const body = (req) => new Promise((resolve, reject) => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => resolve(Buffer.concat(c))); req.on('error', reject); });

async function siteInfo(slug) {
  const dir = path.join(SITES, slug);
  const job = await readJson(path.join(dir, 'job.json')).catch(() => null);
  if (!job) return null;
  const packs = [];
  for (const d of job.packages || ['package']) {
    const m = await readJson(path.join(dir, d, 'louped.json')).catch(() => null);
    if (m) packs.push({ dir: d, producer: m.producer, exported: m.exported, title: m.title, layers: (m.layers || []).map(l => ({ id: l.id, name: l.name, group: l.group, features: l.features, kind: l.kind || 'vector', images: (l.images || []).length })), records: (m.records || []).map(r => ({ name: r.name, rows: r.rows, citation: r.citation })), terrain: (m.terrain || []).map(t => ({ name: t.name, survey: t.survey, dsm: !!t.dsm })), leftOut: m.leftOut || [], licenceUnclear: m.licenceUnclear || [], merged: m.merged || null });
  }
  return { slug, job, packages: packs };
}

async function copyViewer(slug) {
  await fs.copyFile(path.join(ROOT, 'viewer', 'index.html'), path.join(SITES, slug, 'index.html'));
}

// A package arrives unzipped by the studio page: { files: { path: base64 } }
async function putPackage(slug, files) {
  if (!files || typeof files !== 'object' || !files['louped.json']) throw new Error('not a Louped package: it has no louped.json');
  const manifest = JSON.parse(Buffer.from(files['louped.json'], 'base64').toString('utf8'));
  if (manifest.format !== 'louped-package') throw new Error('louped.json isn\'t a Louped package');
  if (manifest.formatVersion > 1) throw new Error('this package is format ' + manifest.formatVersion + '; this Louped reads format 1. Update Louped.');
  const bad = Object.keys(files).filter(p => !pkgPathOk(p));
  if (bad.length) throw new Error('unexpected files in the package: ' + bad.slice(0, 5).join(', '));
  const dir = path.join(SITES, slug), pkg = path.join(dir, 'package'), tmp = path.join(dir, 'package.new');
  await fs.rm(tmp, { recursive: true, force: true });
  for (const [p, b64] of Object.entries(files)) {
    const out = path.join(tmp, p);
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, Buffer.from(b64, 'base64'));
  }
  // Swap the whole package in at once
  await fs.rm(pkg, { recursive: true, force: true });
  await fs.rename(tmp, pkg);
  const jobPath = path.join(dir, 'job.json');
  if (!(await exists(jobPath))) {
    const job = Object.fromEntries(JOB_FIELDS.map(k => [k, '']));
    job.title = manifest.title || slug;
    job.packages = ['package'];
    await fs.writeFile(jobPath, JSON.stringify(job, null, 2) + '\n');
  }
  await copyViewer(slug);
}

// Merges a new package into the site's package instead of replacing it:
//   areas    added, each shape once
//   layers   a layer with the same id is replaced by the new one; others added
//   records  a file with the same name is replaced; others added (the viewer
//            counts each GBIF record once across files)
//   sources, leftOut, licenceUnclear   joined, the new one winning
// The manifest keeps the newest export date and a `merged` list of exports.
async function mergePackage(slug, files) {
  const dir = path.join(SITES, slug), pkg = path.join(dir, 'package');
  const old = await readJson(path.join(pkg, 'louped.json')).catch(() => null);
  if (!old) return putPackage(slug, files); // nothing to merge into
  if (!files || typeof files !== 'object' || !files['louped.json']) throw new Error('not a Louped package: it has no louped.json');
  const add = JSON.parse(Buffer.from(files['louped.json'], 'base64').toString('utf8'));
  if (add.format !== 'louped-package') throw new Error('louped.json isn\'t a Louped package');
  if (add.formatVersion > 1) throw new Error('this package is format ' + add.formatVersion + '; this Louped reads format 1. Update Louped.');
  const bad = Object.keys(files).filter(p => !pkgPathOk(p));
  if (bad.length) throw new Error('unexpected files in the package: ' + bad.slice(0, 5).join(', '));
  const tmp = path.join(dir, 'package.new');
  await fs.rm(tmp, { recursive: true, force: true });
  await fs.cp(pkg, tmp, { recursive: true });
  const put = async (p, buf) => { const out = path.join(tmp, p); await fs.mkdir(path.dirname(out), { recursive: true }); await fs.writeFile(out, buf); };
  const b64 = (p) => Buffer.from(files[p], 'base64');
  const filesOf = (l) => l.kind === 'image' ? (l.images || []).map(i => i.file) : [l.file];
  const m = JSON.parse(JSON.stringify(old));
  // Areas: each shape once
  if (add.areas && files[add.areas.file]) {
    const a0 = await readJson(path.join(pkg, old.areas ? old.areas.file : 'layers/areas.geojson')).catch(() => ({ type: 'FeatureCollection', features: [] }));
    const a1 = JSON.parse(b64(add.areas.file).toString('utf8'));
    const seen = new Set(a0.features.map(f => JSON.stringify(f.geometry)));
    a1.features.forEach(f => { const k = JSON.stringify(f.geometry); if (!seen.has(k)) { seen.add(k); a0.features.push(f); } });
    m.areas = { file: 'layers/areas.geojson', count: a0.features.length };
    await put('layers/areas.geojson', JSON.stringify(a0));
  }
  // Layers: same id replaced (its old files removed), others added, new ones on top
  const taken = new Set();
  for (const l of add.layers || []) {
    const i = m.layers.findIndex(x => x.id === l.id);
    if (i >= 0) { for (const f of filesOf(m.layers[i])) await fs.rm(path.join(tmp, f), { force: true }); m.layers.splice(i, 1); }
  }
  m.layers.forEach(l => filesOf(l).forEach(f => taken.add(f)));
  for (const l of add.layers || []) for (const f of filesOf(l)) {
    if (taken.has(f)) throw new Error('layer file ' + f + ' clashes with one already here');
    if (files[f]) await put(f, b64(f));
  }
  m.layers = (add.layers || []).concat(m.layers);
  // Records: same file name replaced, others added under a free file name
  m.records = m.records || [];
  for (const r of add.records || []) {
    const i = m.records.findIndex(x => x.name === r.name);
    if (i >= 0) { await fs.rm(path.join(tmp, m.records[i].file), { force: true }); m.records.splice(i, 1); }
    let n = 1, file;
    do file = 'records/occurd-' + n++ + '.json'; while (m.records.some(x => x.file === file));
    if (files[r.file]) await put(file, b64(r.file));
    m.records.push(Object.assign({}, r, { file }));
  }
  // LiDAR heights: a package that has them replaces the old ones whole
  if (add.terrain && add.terrain.length) {
    for (const t of m.terrain || []) for (const f of [t.dem, t.dsm]) if (f) await fs.rm(path.join(tmp, f), { force: true });
    for (const t of add.terrain) for (const f of [t.dem, t.dsm]) if (f && files[f]) await put(f, b64(f));
    m.terrain = add.terrain;
  }
  const join = (a, b, k) => { const out = (a || []).filter(x => !(b || []).some(y => y[k] === x[k])); return out.concat(b || []); };
  m.sources = join(m.sources, add.sources, 'key');
  m.leftOut = join(m.leftOut, add.leftOut, 'name');
  m.licenceUnclear = join(m.licenceUnclear, add.licenceUnclear, 'name');
  if (old.bbox && add.bbox) m.bbox = [Math.min(old.bbox[0], add.bbox[0]), Math.min(old.bbox[1], add.bbox[1]), Math.max(old.bbox[2], add.bbox[2]), Math.max(old.bbox[3], add.bbox[3])];
  m.merged = (old.merged || [{ producer: old.producer, exported: old.exported, title: old.title }]).concat([{ producer: add.producer, exported: add.exported, title: add.title }]);
  if ((add.exported || '') > (m.exported || '')) { m.exported = add.exported; m.producer = add.producer; }
  await put('louped.json', JSON.stringify(m, null, 2));
  await fs.rm(pkg, { recursive: true, force: true });
  await fs.rename(tmp, pkg);
  await copyViewer(slug);
}

async function putJob(slug, input) {
  const jobPath = path.join(SITES, slug, 'job.json');
  const job = await readJson(jobPath);
  for (const k of JOB_FIELDS) if (typeof input[k] === 'string') job[k] = input[k].slice(0, 20000);
  if (input.basemap && typeof input.basemap === 'object') {
    const a = Number(input.basemap.aerialLayer);
    job.basemap = a > 0 ? { aerialLayer: a } : undefined;
  }
  if (Array.isArray(input.hidden)) job.hidden = [...new Set(input.hidden.filter(x => typeof x === 'string' && /^[A-Za-z0-9._:-]{1,80}$/.test(x)))];
  await fs.writeFile(jobPath, JSON.stringify(job, null, 2) + '\n');
  await copyViewer(slug);
}

// ── Online: the deploy script, and Cloudflare Access, from the studio ──
const LIST = path.join(ROOT, 'online.json');
const loadList = async () => { const l = await readJson(LIST).catch(() => ({})); return { project: l.project || 'louped', sites: Array.isArray(l.sites) ? l.sites : [] }; };
let deploying = false;
// Runs studio/deploy.mjs with fixed arguments and a checked site name; one at a time.
function runDeploy(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'studio', 'deploy.mjs'), ...args], { cwd: ROOT, env: process.env });
    let out = '';
    const take = (d) => { out += d.toString().replace(/\x1b\[[0-9;]*[A-Za-z]/g, ''); };
    child.stdout.on('data', take); child.stderr.on('data', take);
    child.on('close', (code) => resolve({ ok: code === 0, log: out.trim().slice(-6000) }));
    child.on('error', (e) => resolve({ ok: false, log: e.message }));
  });
}
async function deploySites(steps) {
  if (deploying) throw new Error('a deploy is already running');
  deploying = true;
  try {
    let log = '';
    for (const args of steps) {
      const r = await runDeploy(args);
      log += (log ? '\n' : '') + r.log;
      if (!r.ok) return { ok: false, log };
    }
    return { ok: true, log };
  } finally { deploying = false; }
}
async function putAccess(slug, input) {
  const jobPath = path.join(SITES, slug, 'job.json');
  const job = await readJson(jobPath);
  const mode = input.mode === 'link' ? 'link' : 'people';
  const { emails, domains, bad } = parsePeople(input.people);
  if (bad.length) throw new Error('not an email or a domain: ' + bad.slice(0, 5).join(', '));
  job.access = Object.assign({}, job.access, { mode, emails, domains });
  await fs.writeFile(jobPath, JSON.stringify(job, null, 2) + '\n');
  if (!(await cfConfig())) return { applied: false };
  const { project } = await loadList();
  job.access.appId = await cfApply(project, slug, job.access, job.access.appId);
  job.access.applied = new Date().toISOString();
  await fs.writeFile(jobPath, JSON.stringify(job, null, 2) + '\n');
  return { applied: true };
}

async function serveFile(res, rel) {
  const full = path.resolve(ROOT, rel);
  if (!full.startsWith(ROOT + path.sep)) return send(res, 403, { error: 'forbidden' });
  let target = full;
  try { if ((await fs.stat(full)).isDirectory()) target = path.join(full, 'index.html'); } catch (e) { return send(res, 404, 'Not found', 'text/plain'); }
  try { send(res, 200, await fs.readFile(target), TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream'); }
  catch (e) { send(res, 404, 'Not found', 'text/plain'); }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const p = decodeURIComponent(url.pathname);
    let m;
    if (p === '/' || p === '/studio' || p === '/studio/') return serveFile(res, 'studio/index.html');
    if (p === '/api/sites' && req.method === 'GET') {
      await fs.mkdir(SITES, { recursive: true });
      const names = (await fs.readdir(SITES, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name);
      const list = (await Promise.all(names.map(siteInfo))).filter(Boolean);
      list.sort((a, b) => (b.packages[0]?.exported || '').localeCompare(a.packages[0]?.exported || ''));
      return send(res, 200, list);
    }
    if (p === '/api/online' && req.method === 'GET') {
      const list = await loadList(), cfg = await cfConfig();
      return send(res, 200, { project: list.project, url: 'https://' + list.project + '.pages.dev/', sites: list.sites, cloudflare: !!cfg, owners: cfg ? cfg.ownerEmails : [], deploying });
    }
    if ((m = p.match(/^\/api\/sites\/([^/]+)(\/package|\/job|\/access|\/online|\/offline)?$/))) {
      const slug = m[1];
      if (!slugOk(slug)) return send(res, 400, { error: 'a site name is lower-case letters, numbers and dashes' });
      // Writes only from the studio page itself: other web pages open in the
      // browser can't send JSON here without a CORS check this server never passes.
      if (req.method !== 'GET') {
        const origin = req.headers.origin, host = req.headers.host;
        if ((origin && origin !== 'http://' + host) || !/^application\/json\b/.test(req.headers['content-type'] || '')) return send(res, 403, { error: 'only the studio page can change sites' });
      }
      if (!m[2] && req.method === 'GET') { const s = await siteInfo(slug); return s ? send(res, 200, s) : send(res, 404, { error: 'no such site' }); }
      if (m[2] === '/package' && req.method === 'POST') {
        await fs.mkdir(path.join(SITES, slug), { recursive: true });
        const input = JSON.parse((await body(req)).toString('utf8'));
        if (input.merge) await mergePackage(slug, input.files); else await putPackage(slug, input.files);
        return send(res, 200, await siteInfo(slug));
      }
      if (m[2] === '/job' && req.method === 'PUT') {
        if (!(await exists(path.join(SITES, slug, 'job.json')))) return send(res, 404, { error: 'no such site' });
        await putJob(slug, JSON.parse((await body(req)).toString('utf8')));
        return send(res, 200, await siteInfo(slug));
      }
      if (m[2] && m[2] !== '/package' && !(await exists(path.join(SITES, slug, 'job.json')))) return send(res, 404, { error: 'no such site' });
      if (m[2] === '/access' && req.method === 'PUT') {
        const r = await putAccess(slug, JSON.parse((await body(req)).toString('utf8')));
        return send(res, 200, Object.assign(r, { site: await siteInfo(slug) }));
      }
      // Put online (or update): only once the site's path has its own Access
      // application, checked on Cloudflare when the studio has a token, else
      // confirmed by hand.
      if (m[2] === '/online' && req.method === 'POST') {
        const input = JSON.parse((await body(req)).toString('utf8') || '{}');
        const { project } = await loadList(), job = await readJson(path.join(SITES, slug, 'job.json'));
        const chk = await cfCheck(project, slug, job.access && job.access.appId);
        if (chk.configured && !chk.exists) return send(res, 409, { error: 'set who can see it first: this site has no Access application on Cloudflare yet' });
        if (!chk.configured && input.accessConfirmed !== true) return send(res, 409, { error: 'confirm you have made its Access application in Cloudflare' });
        return send(res, 200, await deploySites([['add', slug], []]));
      }
      if (m[2] === '/offline' && req.method === 'POST') {
        const input = JSON.parse((await body(req)).toString('utf8') || '{}');
        const r = await deploySites([['remove', slug], []]);
        if (r.ok && input.removeAccess) {
          const { project } = await loadList(), job = await readJson(path.join(SITES, slug, 'job.json'));
          r.accessRemoved = await cfRemove(project, slug, job.access && job.access.appId);
        }
        return send(res, 200, r);
      }
      return send(res, 405, { error: 'method not allowed' });
    }
    // The client's view, built as a deploy builds it: the current viewer, the
    // site's job.json and package folders, and no LINZ key (the viewer asks
    // for ../../assets/keys.json, which here is /preview/assets/: not found).
    if (req.method === 'GET' && (m = p.match(/^\/preview\/site\/([^/]+)\/(.*)$/))) {
      const [, slug, rest] = m;
      if (!slugOk(slug) || rest.split('/').some(s => s === '..' || s.startsWith('.'))) return send(res, 404, 'Not found', 'text/plain');
      if (rest === '' || rest === 'index.html') return serveFile(res, 'viewer/index.html');
      if (rest === 'job.json') return serveFile(res, 'sites/' + slug + '/job.json');
      const job = await readJson(path.join(SITES, slug, 'job.json')).catch(() => null);
      const dir = rest.split('/')[0], file = rest.slice(dir.length + 1);
      if (job && (job.packages || ['package']).includes(dir) && path.basename(rest) !== 'keys.json') {
        // As a deploy sends it: hidden layers taken out
        const m = await readJson(path.join(SITES, slug, dir, 'louped.json')).catch(() => null);
        const { manifest, drop } = m ? clientManifest(m, hiddenSet(job)) : { manifest: null, drop: new Set() };
        if (file === 'louped.json' && manifest) return send(res, 200, manifest);
        if (!drop.has(file)) return serveFile(res, 'sites/' + slug + '/' + rest);
      }
      return send(res, 404, 'Not found', 'text/plain');
    }
    if (req.method === 'GET' && /^\/preview\//.test(p)) return send(res, 404, 'Not found', 'text/plain');
    if (req.method === 'GET' && /^\/(sites|assets|viewer)\//.test(p)) return serveFile(res, p.slice(1));
    send(res, 404, 'Not found', 'text/plain');
  } catch (e) {
    send(res, 500, { error: e.message || String(e) });
  }
});
// This computer only
server.listen(PORT, '127.0.0.1', () => console.log('Louped studio: http://localhost:' + PORT + '/'));
