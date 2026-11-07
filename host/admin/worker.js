// Louped hosting, the writing side: the louped-admin Worker (workers.dev).
// inferrd.'s Louped tab publishes through it; the `louped` Pages project's
// _worker.js (host/site/_worker.js) serves what it writes, from the same
// Workers KV namespace (binding SITES).
//
// Every call needs `Authorization: Bearer <ADMIN_KEY>` (a Worker secret) and
// comes from inferrd.'s pages only (CORS). Publishing a site:
//   POST /sites/<site>/begin   { access? }  sets who may open it first (when
//        the Worker has a Cloudflare token), then gives a new version id
//   PUT  /sites/<site>/v/<v>/<path>          one file of that version
//   POST /sites/<site>/commit  { v, files, title }  the version goes live;
//        the previous one's files are deleted
//   DELETE /sites/<site>       { removeAccess? }   takes it offline
//   GET  /sites                what's online, and whether Access is managed
//
// Access (who may open a site) is managed only when the Worker has the
// secret CF_API_TOKEN (Account → Access: Apps and Policies → Edit). Without
// it, sites sit behind the project's own Access application (you only),
// and others are added in the Cloudflare dashboard.
const ORIGINS = new Set(['https://rutherfordecology.github.io', 'http://localhost:7899', 'http://localhost:7883']);
const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;
const PATH_OK = (p) => p === 'index.html' || p === 'job.json' || p === 'package/louped.json' || /^package\/(layers|records|images)\/[A-Za-z0-9._-]+$/.test(p);
const API = 'https://api.cloudflare.com/client/v4';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

const json = (body, status, cors) => new Response(JSON.stringify(body), { status: status || 200, headers: Object.assign({ 'Content-Type': 'application/json' }, cors) });
const fail = (msg, status, cors) => json({ error: msg }, status || 400, cors);

// Same length, same time: no early exit on the first wrong character
function sameKey(a, b) {
  const x = new TextEncoder().encode(a || ''), y = new TextEncoder().encode(b || '');
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] || 0) ^ (y[i] || 0);
  return d === 0 && x.length > 0;
}

// ── Cloudflare Access: one self-hosted application per site path ──
async function cf(env, method, url, body) {
  const r = await fetch(API + url, { method, headers: { Authorization: 'Bearer ' + env.CF_API_TOKEN, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.success === false) throw new Error('Cloudflare: ' + ((j.errors || []).map(e => e.message).join('; ') || 'HTTP ' + r.status));
  return j.result;
}
const appDomain = (env, slug) => env.HOST + '/' + slug + '/';
async function findApp(env, slug) {
  const want = appDomain(env, slug).replace(/\/$/, '');
  const apps = await cf(env, 'GET', '/accounts/' + env.ACCOUNT_ID + '/access/apps?per_page=1000');
  return apps.find(a => (a.domain || '').replace(/\/$/, '') === want) || null;
}
function people(access) {
  const emails = [], domains = [];
  for (const t of [].concat(access.emails || [], access.domains || [])) {
    const v = String(t).trim().toLowerCase().replace(/^@/, '');
    if (EMAIL.test(v)) emails.push(v); else if (DOMAIN.test(v)) domains.push(v);
  }
  return { emails, domains };
}
async function applyAccess(env, slug, access) {
  const owners = String(env.OWNERS || '').split(',').map(s => s.trim()).filter(e => EMAIL.test(e));
  const { emails, domains } = people(access);
  const link = access.mode === 'link';
  if (!link && !owners.length && !emails.length && !domains.length) throw new Error('list at least one person who may open it');
  const dom = appDomain(env, slug);
  const policy = link
    ? { name: 'louped ' + slug + ': anyone with the link', decision: 'bypass', include: [{ everyone: {} }], precedence: 1 }
    : { name: 'louped ' + slug + ': people', decision: 'allow', precedence: 1,
        include: [...new Set([...owners, ...emails])].map(email => ({ email: { email } })).concat(domains.map(domain => ({ email_domain: { domain } }))) };
  const body = { name: 'louped ' + slug, type: 'self_hosted', domain: dom, destinations: [{ type: 'public', uri: dom }], session_duration: '168h', app_launcher_visible: false, policies: [policy] };
  const app = await findApp(env, slug);
  const out = app ? await cf(env, 'PUT', '/accounts/' + env.ACCOUNT_ID + '/access/apps/' + app.id, body) : await cf(env, 'POST', '/accounts/' + env.ACCOUNT_ID + '/access/apps', body);
  return out.id;
}

// Every KV key under a prefix (KV lists 1000 at a time)
async function keysUnder(kv, prefix) {
  const out = [];
  let cursor;
  do {
    const r = await kv.list({ prefix, cursor });
    r.keys.forEach(k => out.push(k.name));
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  return out;
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const cors = ORIGINS.has(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
    if (req.method === 'OPTIONS') {
      if (!ORIGINS.has(origin)) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: Object.assign({ 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '600' }, cors) });
    }
    if (origin && !ORIGINS.has(origin)) return fail('not from inferrd.', 403);
    const auth = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!env.ADMIN_KEY || !sameKey(auth, env.ADMIN_KEY)) return fail('wrong or missing Louped key', 401, cors);
    const kv = env.SITES, url = new URL(req.url), parts = url.pathname.split('/').filter(Boolean);
    const managed = !!(env.CF_API_TOKEN && env.ACCOUNT_ID);
    try {
      if (parts[0] === 'sites' && parts.length === 1 && req.method === 'GET') {
        const sites = [];
        for (const k of await keysUnder(kv, 'cur:')) {
          const c = await kv.get(k, 'json');
          if (c) sites.push({ slug: k.slice(4), title: c.title, published: c.published, files: c.files.length, access: c.access || null });
        }
        return json({ host: 'https://' + env.HOST + '/', accessManaged: managed, sites }, 200, cors);
      }
      if (parts[0] !== 'sites' || !SLUG.test(parts[1] || '')) return fail('not found', 404, cors);
      const slug = parts[1];
      if (parts[2] === 'begin' && req.method === 'POST') {
        const input = await req.json().catch(() => ({}));
        let access = null;
        if (managed && input.access) {
          const appId = await applyAccess(env, slug, input.access);
          access = { mode: input.access.mode === 'link' ? 'link' : 'people', appId, applied: new Date().toISOString() };
        }
        const v = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        await kv.put('up:' + slug + ':' + v, JSON.stringify({ access, started: new Date().toISOString() }), { expirationTtl: 86400 });
        return json({ v, access, accessManaged: managed }, 200, cors);
      }
      if (parts[2] === 'v' && req.method === 'PUT') {
        const v = parts[3], path = parts.slice(4).map(decodeURIComponent).join('/');
        if (!(await kv.get('up:' + slug + ':' + v))) return fail('that upload has expired: put the site online again', 409, cors);
        if (!PATH_OK(path)) return fail('not a site file: ' + path, 400, cors);
        const body = await req.arrayBuffer();
        if (body.byteLength > 25 * 1024 * 1024) return fail(path + ' is over 25 MB', 413, cors);
        await kv.put('f:' + slug + ':' + v + ':' + path, body, { metadata: { type: req.headers.get('Content-Type') || '' } });
        return json({ ok: true }, 200, cors);
      }
      if (parts[2] === 'commit' && req.method === 'POST') {
        const input = await req.json();
        const up = await kv.get('up:' + slug + ':' + input.v, 'json');
        if (!up) return fail('that upload has expired: put the site online again', 409, cors);
        const have = new Set((await keysUnder(kv, 'f:' + slug + ':' + input.v + ':')).map(k => k.slice(('f:' + slug + ':' + input.v + ':').length)));
        const files = (input.files || []).filter(p => PATH_OK(p));
        const missing = files.filter(p => !have.has(p));
        if (missing.length || !have.has('index.html')) return fail('some files didn\'t arrive: ' + (missing.slice(0, 5).join(', ') || 'index.html'), 409, cors);
        const old = await kv.get('cur:' + slug, 'json');
        const cur = { v: input.v, files, title: String(input.title || slug).slice(0, 200), published: new Date().toISOString(), access: up.access || (old && old.access) || null };
        await kv.put('cur:' + slug, JSON.stringify(cur));
        await kv.delete('up:' + slug + ':' + input.v);
        // The previous version and any abandoned uploads
        for (const k of await keysUnder(kv, 'f:' + slug + ':')) if (!k.startsWith('f:' + slug + ':' + input.v + ':')) await kv.delete(k);
        return json(Object.assign({ url: 'https://' + env.HOST + '/' + slug + '/' }, cur), 200, cors);
      }
      if (parts.length === 2 && req.method === 'DELETE') {
        const input = await req.json().catch(() => ({}));
        await kv.delete('cur:' + slug);
        for (const k of await keysUnder(kv, 'f:' + slug + ':')) await kv.delete(k);
        let removed = false;
        if (managed && input.removeAccess) {
          const app = await findApp(env, slug);
          if (app) { await cf(env, 'DELETE', '/accounts/' + env.ACCOUNT_ID + '/access/apps/' + app.id); removed = true; }
        }
        return json({ offline: true, accessRemoved: removed }, 200, cors);
      }
      return fail('not found', 404, cors);
    } catch (e) {
      return fail(e.message || String(e), 500, cors);
    }
  }
};
