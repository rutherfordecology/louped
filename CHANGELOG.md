# Changelog

## v0.2.0 — 2026-10-27

- **Waimata.** Second catchment, `waimata/`: the Waimata and Taruheru rivers
  and the lower Tūranganui (309 km², the same system as NIWA's Waimata
  catchment), with the same layers as Whangārā.
- **One shared map page.** `map.html` is the master; `scripts/pages.mjs`
  copies it into each catchment folder. Each catchment's wording is in its
  `data/config.json`. The project home page lists both catchments.
- Vector fetches wait and retry when ArcGIS Online's per-minute limit is hit,
  and specks under 1 ha left where catchment parts meet are dropped.
- GBIF snapshots split any box holding over 8,000 records into quarters
  (GBIF's search stalls past an offset of about 10,000), and every request has
  a 60 s timeout with retries.

## v0.1.1 — 2026-10-27

- Sea species recorded at the coast are left out of the species records
  along with rock lobster: kina, pāua, blue shark, Cook's turban and the
  turret shell (*Maoricolpus roseus*).

## v0.1.0 — 2026-10-27

- First version, as the `catchment_reports` project: shared build scripts,
  one folder per catchment. First catchment: `whangara/`, a layers map of the Whangārā community catchments (Turihaua,
  Pouawa, Waiomoko, Pakarae and the coastal streams between them, 389 km²),
  traced from NIWA's REC2 river network.
- Layers: GBIF species records, rivers and streams, council wetland
  assessment, QEII covenants, council protection management areas, DOC land,
  catchment boundaries, LCDB 2023 land cover, land use capability, council
  erosion overlays, LiDAR canopy height, height change since 2018–20,
  hillshade, aerial photo and topographic base maps. Each has an eye and an
  opacity slider.
- Click anywhere for every layer at that spot, plus nearby species records
  with their location uncertainty drawn as a circle.
- Draw an area for its size, native cover, protected and wetland area,
  river length, land cover breakdown and species list; download the species
  list, the records or the drawn area.
- Species records filter by group, year and location precision; search
  species and click one to show only its records. Left out: records with no
  name, obscured locations (e.g. iNaturalist's ~28 km for threatened taxa),
  locations that could be over 5 km off, and rock lobster.
