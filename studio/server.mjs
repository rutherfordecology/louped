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
    if (m) packs.push({ dir: d, producer: m.producer, exported: m.exported, title: m.title, layers: (m.layers || []).map(l => ({ name: l.name, group: l.group, features: l.features })), records: (m.records || []).map(r => ({ name: r.name, rows: r.rows, citation: r.citation })), leftOut: m.leftOut || [], licenceUnclear: m.licenceUnclear || [] });
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

async function putJob(slug, input) {
  const jobPath = path.join(SITES, slug, 'job.json');
  const job = await readJson(jobPath);
  for (const k of JOB_FIELDS) if (typeof input[k] === 'string') job[k] = input[k].slice(0, 20000);
  if (input.basemap && typeof input.basemap === 'object') {
    const a = Number(input.basemap.aerialLayer);
    job.basemap = a > 0 ? { aerialLayer: a } : undefined;
  }
  await fs.writeFile(jobPath, JSON.stringify(job, null, 2) + '\n');
  await copyViewer(slug);
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
    if ((m = p.match(/^\/api\/sites\/([^/]+)(\/package|\/job)?$/))) {
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
        await putPackage(slug, JSON.parse((await body(req)).toString('utf8')).files);
        return send(res, 200, await siteInfo(slug));
      }
      if (m[2] === '/job' && req.method === 'PUT') {
        if (!(await exists(path.join(SITES, slug, 'job.json')))) return send(res, 404, { error: 'no such site' });
        await putJob(slug, JSON.parse((await body(req)).toString('utf8')));
        return send(res, 200, await siteInfo(slug));
      }
      return send(res, 405, { error: 'method not allowed' });
    }
    if (req.method === 'GET' && /^\/(sites|assets|viewer)\//.test(p)) return serveFile(res, p.slice(1));
    send(res, 404, 'Not found', 'text/plain');
  } catch (e) {
    send(res, 500, { error: e.message || String(e) });
  }
});
// This computer only
server.listen(PORT, '127.0.0.1', () => console.log('Louped studio: http://localhost:' + PORT + '/'));
