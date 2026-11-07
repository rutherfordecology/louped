// Louped: who may open each site, set from the studio through the Cloudflare
// API. Each site has its own Cloudflare Access application for its path
// (<project>.pages.dev/<site>/), with one policy:
//   people   Allow: the emails and email domains listed, plus yours
//   link     Bypass: anyone with the link, no sign-in
// The settings are kept in the site's job.json (`access`), so they survive a
// new package, and the application's id is kept there too.
//
// Needs cloudflare.json in the repo root (git-ignored), made by hand once:
//   { "apiToken": "…", "accountId": "…", "ownerEmails": ["you@example.com"] }
// The token needs one permission: Account → Access: Apps and Policies → Edit.
// accountId can be left out when the token sees only one account.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = path.join(ROOT, 'cloudflare.json');
const API = 'https://api.cloudflare.com/client/v4';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

export async function cfConfig() {
  const c = await fs.readFile(CONFIG, 'utf8').then(JSON.parse, () => null);
  if (!c || !c.apiToken) return null;
  return { apiToken: c.apiToken, accountId: c.accountId || null, ownerEmails: (c.ownerEmails || []).filter(e => EMAIL.test(e)) };
}

async function call(cfg, method, url, body) {
  const r = await fetch(API + url, { method, headers: { Authorization: 'Bearer ' + cfg.apiToken, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.success === false) {
    const msg = (j.errors || []).map(e => e.message).join('; ') || 'HTTP ' + r.status;
    throw new Error('Cloudflare: ' + msg);
  }
  return j.result;
}

async function accountId(cfg) {
  if (cfg.accountId) return cfg.accountId;
  const list = await call(cfg, 'GET', '/accounts?per_page=5');
  if (list.length !== 1) throw new Error('the token sees ' + list.length + ' accounts: put accountId in cloudflare.json');
  cfg.accountId = list[0].id;
  return cfg.accountId;
}

// Splits what was typed into emails and domains (one a line, or commas).
export function parsePeople(text) {
  const emails = [], domains = [], bad = [];
  for (const raw of String(text || '').split(/[\s,;]+/)) {
    const t = raw.trim().toLowerCase().replace(/^@/, '');
    if (!t) continue;
    if (EMAIL.test(t)) emails.push(t);
    else if (DOMAIN.test(t)) domains.push(t);
    else bad.push(raw);
  }
  return { emails: [...new Set(emails)], domains: [...new Set(domains)], bad };
}

const hostOf = (project) => project + '.pages.dev';
const appDomain = (project, slug) => hostOf(project) + '/' + slug + '/';

// The site's application, by the id kept in job.json, else by its path.
async function findApp(cfg, acct, project, slug, appId) {
  if (appId) {
    try { return await call(cfg, 'GET', '/accounts/' + acct + '/access/apps/' + appId); } catch (e) { /* gone: look by path */ }
  }
  const want = appDomain(project, slug).replace(/\/$/, '');
  const apps = await call(cfg, 'GET', '/accounts/' + acct + '/access/apps?per_page=1000');
  return apps.find(a => (a.domain || '').replace(/\/$/, '') === want) || null;
}

function appBody(project, slug, access, owners) {
  const dom = appDomain(project, slug);
  const policy = access.mode === 'link'
    ? { name: 'louped ' + slug + ': anyone with the link', decision: 'bypass', include: [{ everyone: {} }], precedence: 1 }
    : { name: 'louped ' + slug + ': people', decision: 'allow', precedence: 1,
        include: [...new Set([...owners, ...access.emails])].map(email => ({ email: { email } }))
          .concat(access.domains.map(domain => ({ email_domain: { domain } }))) };
  return {
    name: 'louped ' + slug, type: 'self_hosted', domain: dom,
    destinations: [{ type: 'public', uri: dom }],
    session_duration: '168h', app_launcher_visible: false,
    policies: [policy]
  };
}

// Makes or updates the site's application to match `access`. Returns its id.
export async function cfApply(project, slug, access, appId) {
  const cfg = await cfConfig();
  if (!cfg) throw new Error('no cloudflare.json: see HOSTING.md, "From the studio"');
  if (access.mode !== 'link' && !cfg.ownerEmails.length && !access.emails.length && !access.domains.length) throw new Error('list at least one person, or put your own email in cloudflare.json (ownerEmails)');
  const acct = await accountId(cfg);
  const app = await findApp(cfg, acct, project, slug, appId);
  const body = appBody(project, slug, access, cfg.ownerEmails);
  const out = app
    ? await call(cfg, 'PUT', '/accounts/' + acct + '/access/apps/' + app.id, body)
    : await call(cfg, 'POST', '/accounts/' + acct + '/access/apps', body);
  return out.id;
}

// Whether the site's path has its own application on Cloudflare.
export async function cfCheck(project, slug, appId) {
  const cfg = await cfConfig();
  if (!cfg) return { configured: false };
  const acct = await accountId(cfg);
  const app = await findApp(cfg, acct, project, slug, appId);
  return { configured: true, exists: !!app, id: app ? app.id : null };
}

export async function cfRemove(project, slug, appId) {
  const cfg = await cfConfig();
  if (!cfg) return false;
  const acct = await accountId(cfg);
  const app = await findApp(cfg, acct, project, slug, appId);
  if (app) await call(cfg, 'DELETE', '/accounts/' + acct + '/access/apps/' + app.id);
  return !!app;
}
