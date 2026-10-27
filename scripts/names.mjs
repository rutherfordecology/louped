// Common names for the species in a GBIF snapshot. English: iNaturalist's
// preferred name for New Zealand first (e.g. Tūī, Chaffinch), then GBIF's
// NZ-sourced English name, then any GBIF English name that isn't a code
// like "COST". Māori: GBIF's Māori name.
// usage: node scripts/names.mjs <data/gbif.json>   (re-picks names in place)
import fs from 'node:fs';

const GBIF = 'https://api.gbif.org/v1/', INAT = 'https://api.inaturalist.org/v1/';
const get = async (url) => { for (let i = 0; ; i++) { try { const r = await fetch(url, { signal: AbortSignal.timeout(60000) }); if (!r.ok) throw new Error(r.status); return await r.json(); } catch (err) { if (i === 5) throw err; await new Promise(r => setTimeout(r, 3000 * (i + 1))); } } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// Banding codes and initials ("COST", "C F") have no lower-case letters
const usable = (s) => s && /\p{Ll}/u.test(s) && s.replace(/[^\p{L}]/gu, '').length > 2;

export async function commonNames(taxa) {
  const species = taxa.filter(t => t.rank === 'SPECIES');
  // GBIF answers quickly in parallel
  const queue = [...species];
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const t = queue.pop();
      try {
        const v = (await get(GBIF + 'species/' + t.key + '/vernacularNames?limit=50')).results;
        const pick = (lang) => { const ok = v.filter(x => x.language === lang && usable(x.vernacularName)); return (ok.find(x => /new zealand|nz/i.test(x.source || '')) || ok[0] || {}).vernacularName; };
        t.en = pick('eng'); t.mi = pick('mri');
      } catch (err) {}
    }
  }));
  // iNaturalist asks for about one request a second
  let done = 0;
  for (const t of species) {
    try {
      const r = (await get(INAT + 'taxa?q=' + encodeURIComponent(t.name) + '&preferred_place_id=6803&locale=en&per_page=5')).results;
      const hit = r.find(x => x.name === t.name);
      if (hit && usable(hit.preferred_common_name)) t.en = hit.preferred_common_name;
    } catch (err) {}
    if (++done % 100 === 0) console.error(done + ' names');
    await sleep(1000);
  }
}

if (process.argv[1] && process.argv[1].endsWith('names.mjs')) {
  const file = process.argv[2], data = JSON.parse(fs.readFileSync(file, 'utf8'));
  await commonNames(data.taxa);
  fs.writeFileSync(file, JSON.stringify(data));
  console.error('wrote', file);
}
