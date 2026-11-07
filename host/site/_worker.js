// Louped hosting, the reading side: runs inside the `louped` Cloudflare Pages
// project (advanced mode: dist/_worker.js). A site published from inferrd.'s
// Louped tab lives in Workers KV (binding SITES), written by the louped-admin
// Worker (host/admin/worker.js):
//   cur:<site>                  { v, files, title, published }  the live version
//   f:<site>:<v>:<path>         one file of that version (metadata.type)
// A request for /<site>/… is answered from KV when the site is there, else
// from the static files deployed with the project (sites put online by the
// old studio), so nothing breaks while sites move over. Who may open a site
// is Cloudflare Access's job, in front of all of this.
const SITE = /^\/([a-z0-9][a-z0-9-]{0,62})(\/.*)?$/;
const TYPES = { html: 'text/html; charset=utf-8', json: 'application/json', geojson: 'application/geo+json', png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml', js: 'text/javascript', css: 'text/css' };
const typeOf = (p) => TYPES[(p.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';
const HEADERS = { 'Cache-Control': 'no-cache', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'same-origin', 'X-Content-Type-Options': 'nosniff' };

export default {
  async fetch(req, env) {
    const url = new URL(req.url), m = url.pathname.match(SITE);
    if (m && env.SITES && (req.method === 'GET' || req.method === 'HEAD')) {
      const cur = await env.SITES.get('cur:' + m[1], 'json');
      if (cur) {
        if (!m[2]) return Response.redirect(url.origin + '/' + m[1] + '/' + url.search, 301);
        let p;
        try { p = decodeURIComponent(m[2].slice(1)); } catch (e) { p = ''; }
        if (!p || p.endsWith('/')) p += 'index.html';
        if (p.split('/').some(s => s === '..' || s.startsWith('.'))) return env.ASSETS.fetch(new Request(url.origin + '/404.html'));
        const { value, metadata } = await env.SITES.getWithMetadata('f:' + m[1] + ':' + cur.v + ':' + p, 'arrayBuffer');
        if (value) return new Response(req.method === 'HEAD' ? null : value, { headers: Object.assign({ 'Content-Type': (metadata && metadata.type) || typeOf(p) }, HEADERS) });
        const nf = await env.ASSETS.fetch(new Request(url.origin + '/404.html'));
        return new Response(nf.body, { status: 404, headers: nf.headers });
      }
    }
    return env.ASSETS.fetch(req);
  }
};
