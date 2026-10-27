// The pure half of the locality model: which zones a record is in, which zones a
// taxon occupies, and whether the two meet.
//
// Split out of locality.js so the browser app runs the same rules as the batch
// pipeline. Two implementations of "can this subspecies be here?" would drift
// apart within a week, and the drift would be invisible — both would keep
// producing plausible statuses. Everything here is free of fs and of the DOM;
// locality.js adds file reading for Node, data/localities.js carries the same
// rows to the browser.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QNLocality = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const norm = s => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();

  // Which island a record is on. The QEII region is primary: all 33 of them were
  // checked against the land districts of the records that carry both, and every
  // one falls unambiguously on one island. Land district is the fallback for a
  // blank region, and it is deliberately not preferred — the GBIF working file
  // has no land district at all, and where the two disagree it is the land
  // district that is wrong (two Waiau Catchment records are stamped South
  // Auckland, which would put a Southland covenant in the North Island).
  const NORTH_ISLAND_LD = /^(north auckland|south auckland|taranaki|gisborne|hawke's bay|wellington)$/i;
  const SOUTH_ISLAND_LD = /^(nelson|marlborough|westland|canterbury|otago|southland)$/i;
  const NORTH_ISLAND_REGION = /far north|whangarei|kaipara|auckland|hauraki|coromandel|waikato|waitomo|taranaki|ruapehu|new plymouth|bay of plenty|gisborne|hawke's bay|manawatu|whanganui|tararua|wairarapa|wellington|kapiti|taup/i;
  const SOUTH_ISLAND_REGION = /nelson|marlborough|west coast|canterbury|otago|southland|waiau/i;

  // The zones a record belongs to. A record is in as many as apply: a Southland
  // covenant is SI, and might also be Stewart — the data cannot tell us, so
  // Stewart is offered wherever Southland is and the ambiguity is reported
  // rather than resolved.
  function zonesFor(record) {
    const ld = (record.landDistrict || '').trim();
    const rg = (record.region || '').trim();
    const zones = new Set();
    if (NORTH_ISLAND_REGION.test(rg)) zones.add('NI');
    else if (SOUTH_ISLAND_REGION.test(rg)) zones.add('SI');
    else if (NORTH_ISLAND_LD.test(ld)) zones.add('NI');
    else if (SOUTH_ISLAND_LD.test(ld)) zones.add('SI');
    if (zones.has('SI') && /southland/i.test(rg)) zones.add('Stewart');
    if (zones.has('NI') && /auckland/i.test(rg)) zones.add('GreatBarrier');
    if (/far north/i.test(rg)) zones.add('FarNorth');
    // Finer northern zones. Plenty of northern taxa run out somewhere between Te
    // Paki and the Waikato, and NI is far too coarse to express that.
    // QEII's "North Auckland" region is Rodney and north of the city, distinct
    // from Far North / Whangarei / Kaipara, so Orewa lands in Auckland.
    if (/^(far north|whangarei|kaipara)$/i.test(rg)) zones.add('Northland');
    if (/auckland/i.test(rg)) zones.add('Auckland');
    if (/^(waikato|taupō and central waikato|taupo and central waikato)$/i.test(rg)) zones.add('Waikato');
    if (/^hauraki - coromandel$/i.test(rg)) zones.add('Coromandel');
    // The far south: coastal Otago below the peninsula, and Southland around
    // Foveaux Strait. Several southern endemics stop well short of Central Otago
    // and Canterbury, which SI alone cannot express.
    if (/^(southland|coastal otago - south)$/i.test(rg)) zones.add('Foveaux');
    // East and west of the main divide. Weka split on it — buff weka is the
    // eastern bird, western weka the other — and one zone for the whole South
    // Island had the nominate rule overriding a correct hectori in Central Otago.
    if (/^(west coast|nelson-tasman|marlborough|southland|waiau catchment)/i.test(rg)) zones.add('SIWest');
    if (/^(north canterbury|central canterbury|south canterbury|central otago|coastal otago)/i.test(rg)) zones.add('SIEast');
    // The western Waikato / North Taranaki coast, Kawhia round to Mohakatino.
    // Tainui's whole wild population is inside it.
    if (/^waitomo, north taranaki and ruapehu$/i.test(rg)) zones.add('WaitomoTaranaki');
    // The falcon's three forms need the South Island cut three ways, not two:
    // bush in the north-west, eastern through Marlborough and the east, southern
    // in Fiordland and on Stewart Island.
    if (/^(nelson-tasman|west coast)/i.test(rg)) zones.add('SINorthWest');
    if (/^marlborough/i.test(rg)) zones.add('Marlborough');
    if (/^(southland|waiau catchment)$/i.test(rg)) zones.add('Fiordland');
    // Canterbury apart from Otago and Southland. SIEast covers both together,
    // which is right for the weka but not for the brown teal: its South Island
    // form is a southern bird and Canterbury is not the south.
    if (/canterbury/i.test(rg)) zones.add('Canterbury');
    if (/^(southland|waiau catchment|central otago|coastal otago)/i.test(rg)) zones.add('SouthernSI');
    return zones;
  }

  // The TSV is the single source of truth for ranges. Parsing lives here so the
  // generated browser copy cannot disagree with the file about what a row means.
  function parseTsv(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#'));
    const header = lines.shift().split('\t').map(h => h.trim());
    return lines.map(line => {
      const f = line.split('\t');
      if (f.length !== header.length) {
        throw new Error(`localities: "${f[0]}" has ${f.length} fields, expected ${header.length}`);
      }
      const rec = {};
      header.forEach((h, i) => rec[h] = (f[i] ?? '').trim());
      if (!['certain', 'check'].includes(rec.certainty)) {
        throw new Error(`localities: "${rec.taxon}" has certainty "${rec.certainty}", expected certain or check`);
      }
      rec.allow = rec.allow.split(',').map(s => s.trim()).filter(Boolean);
      rec.instead = (rec.instead || '').trim();
      return rec;
    });
  }

  function makeTable(records) {
    const table = new Map();
    for (const r of records) {
      const rec = Object.assign({}, r, {
        allow: r.allow instanceof Set ? r.allow : new Set(r.allow),
      });
      table.set(norm(rec.taxon), rec);
    }
    return {
      size: table.size,
      get: name => table.get(norm(name)) || null,

      // Can this taxon be here? Returns:
      //   yes      the record's zone is one the taxon occupies, or nothing is known
      //   no       the taxon is recorded as occurring nowhere in this dataset, or
      //            not in this zone, and the entry is marked certain
      //   unknown  the entry says no but is only marked check — the caller should
      //            prefer another candidate rather than refuse outright
      allows(name, zones) {
        const e = table.get(norm(name));
        if (!e) return { verdict: 'yes', reason: 'no locality recorded' };
        if (e.allow.has('any')) return { verdict: 'yes', reason: e.note, entry: e };
        if (e.allow.has('none')) {
          return { verdict: e.certainty === 'certain' ? 'no' : 'unknown',
                   reason: `${e.note} — no covenant in this dataset is there`, entry: e };
        }
        for (const z of zones) if (e.allow.has(z)) return { verdict: 'yes', reason: e.note, entry: e };
        return { verdict: e.certainty === 'certain' ? 'no' : 'unknown',
                 reason: `${e.note} — record is in ${[...zones].join('/') || 'an unknown zone'}`, entry: e };
      },
    };
  }

  // The nominate is the one whose infraspecific epithet repeats the species
  // epithet: Anthornis melanura melanura, Alectryon excelsus subsp. excelsus.
  // Rank connectors are dropped first so both spellings are caught.
  function isNominateName(name) {
    const t = String(name || '').trim().split(/\s+/)
      .filter(w => !/^(subsp|ssp|var|f|forma|subvar)\.?$/i.test(w));
    return t.length >= 3 && t[1].toLowerCase() === t[t.length - 1].toLowerCase();
  }

  // §6 of MATCHING.md: given the taxa NZTCS holds under a name and where the
  // record is, decide whether a person needs to be asked at all.
  //
  //   none viable                     -> warn, the taxon does not occur here
  //   one viable                      -> use it, silently
  //   several viable, one status      -> the nominate, silently: the choice
  //                                      cannot change the threat classification
  //   several viable, statuses differ -> ask, offering only the viable ones
  //
  // `options` is [{name, status, ...}]; the objects are handed back untouched so
  // the caller keeps whatever else it hangs off them.
  function chooseSubspecies(options, zones, table) {
    const yes = [], unsure = [];
    for (const o of options) {
      const v = table.allows(o.name, zones);
      if (v.verdict === 'yes') yes.push({ option: o, reason: v.reason });
      else if (v.verdict === 'unknown') unsure.push({ option: o, reason: v.reason });
    }
    const pool = yes.length ? yes : unsure;
    const confident = yes.length > 0;
    const ruledOut = options.filter(o => !pool.some(p => p.option === o));

    if (!pool.length) {
      return { kind: 'none', options: [], ruledOut, confident,
               why: 'no subspecies of this taxon occurs here' };
    }
    if (pool.length === 1) {
      return { kind: 'one', pick: pool[0].option, options: pool.map(p => p.option), ruledOut, confident,
               why: pool[0].reason || 'the only one that occurs here' };
    }
    if (new Set(pool.map(p => p.option.status)).size === 1) {
      const nom = pool.find(p => isNominateName(p.option.name)) || pool[0];
      return { kind: 'same-status', pick: nom.option, options: pool.map(p => p.option), ruledOut, confident,
               why: 'all ' + pool.length + ' possible here are ' + nom.option.status +
                    ', so the choice cannot change the status' };
    }
    return { kind: 'ask', options: pool.map(p => p.option), ruledOut, confident,
             why: pool.length + ' subspecies could be here and their statuses differ' };
  }

  return { norm, zonesFor, parseTsv, makeTable, isNominateName, chooseSubspecies };
}));
