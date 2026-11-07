// Layers left out of the client view. job.hidden lists layer ids, and
// "_records" for the species records. A hidden layer is taken out of the
// package as it goes to a client (deploy, client preview): its files aren't
// sent and the manifest doesn't name it. The data stays in sites/<slug>/, so
// ticking it back on brings it back.
export const RECORDS_ID = '_records', TERRAIN_ID = '_terrain';

export function hiddenSet(job) {
  return new Set(Array.isArray(job && job.hidden) ? job.hidden.filter(x => typeof x === 'string') : []);
}

// The manifest a client gets, and the package files it must not get
export function clientManifest(m, hidden) {
  const drop = new Set(), goneSrc = new Set(), keptSrc = new Set();
  const layers = (m.layers || []).filter(l => {
    if (!hidden.has(l.id)) { keptSrc.add(l.source); return true; }
    if (l.file) drop.add(l.file);
    (l.images || []).forEach(i => drop.add(i.file));
    goneSrc.add(l.source);
    return false;
  });
  let records = m.records || [];
  if (hidden.has(RECORDS_ID)) {
    records.forEach(r => { drop.add(r.file); goneSrc.add(r.source); });
    records = [];
  } else records.forEach(r => keptSrc.add(r.source));
  // LiDAR heights for the 3D view
  let terrain = m.terrain || [];
  if (hidden.has(TERRAIN_ID)) {
    terrain.forEach(t => { drop.add(t.dem); if (t.dsm) drop.add(t.dsm); goneSrc.add(t.source); });
    terrain = [];
  } else terrain.forEach(t => keptSrc.add(t.source));
  const sources = (m.sources || []).filter(s => !(goneSrc.has(s.key) && !keptSrc.has(s.key)));
  const out = { ...m, layers, records, sources };
  if (terrain.length) out.terrain = terrain; else delete out.terrain;
  // Notes meant for you only stay out of what a client can download
  delete out.leftOut; delete out.licenceUnclear;
  return { manifest: out, drop };
}
