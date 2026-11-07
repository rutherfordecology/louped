// Layers left out of the client view. job.hidden lists layer ids, and
// "_records" for the species records. A hidden layer is taken out of the
// package as it goes to a client (deploy, client preview): its files aren't
// sent and the manifest doesn't name it. The data stays in sites/<slug>/, so
// ticking it back on brings it back.
export const RECORDS_ID = '_records';

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
  const sources = (m.sources || []).filter(s => !(goneSrc.has(s.key) && !keptSrc.has(s.key)));
  const out = { ...m, layers, records, sources };
  // Notes meant for you only stay out of what a client can download
  delete out.leftOut; delete out.licenceUnclear;
  return { manifest: out, drop };
}
