# Changelog

## v0.4.1 — 2026-10-27

- **Yellow mistletoe left out of Whangārā** (*Alepis flavida*, 2 records),
  added to `gbif.exclude` in its catchment.json.
- The "All catchments" button is gone from the map and About pages, and the
  logo from the top of the home page.
- The names step keeps the names it has looked up in `data/names.json` and
  reuses them, so re-fetching a catchment's records no longer spends ~10
  minutes on iNaturalist names.

## v0.4.0 — 2026-10-27

- **No NIWA data left: boundaries and rivers now CC BY 4.0.** NIWA's REC2 is
  non-commercial, so:
  - Boundaries come from Gisborne District Council's River Catchments layer
    (a new `boundary.layer` mode in catchment.json). They match the old
    REC2 traces to within 1–2.5%: Waimata 226.5 km², Whangārā 397 km² with
    GDC's coastal catchments between the rivers.
  - Rivers and streams are LINZ's NZ River Name Lines (Topo50 centrelines
    with names, from the LINZ Data Service). LINZ's lines don't all run
    downstream or meet at their ends, so the engine joins them into a
    network, finds each network's outlet as its lowest end on the LiDAR,
    and works out Strahler stream order from that.
  - The REC2 options stay in the engine (`boundary.rivers`, layer
    `rivers_rec2`) for non-commercial work, flagged on the About page.
- **Scheduled rivers layer:** the rivers and streams scheduled in the
  Tairāwhiti Resource Management Plan, with the plan schedule and species
  (Gisborne District Council, CC BY 4.0). Clicking near a river now names it.
- **Threatened species on the map, everything else as a list.** The map
  shows dots only for species that are Threatened or At Risk under the NZ
  Threat Classification System, coloured by status; the species list still
  covers every species. A new `nztcs` engine step matches each species the
  way Occurd does (GBIF taxon key, then name, then binomial; subspecies
  settled by island, then the nominate), using Occurd's `nztcs.json` and
  locality table, copied to `engine/data/nztcs/`. The list has Occurd's
  NZTCS badges and filter chips (All species, Threatened & at risk, each
  status, and ? where the subspecies isn't settled), the area summary counts
  threatened and at-risk species, and the species download has their status.
- Layers, species records and LiDAR rebuilt for the new boundaries.

## v0.3.2 — 2026-10-27

- **LINZ base maps switched on, through the LINZ Data Service.** The aerial photo is the catchment's
  regional LINZ aerial imagery (for Tairāwhiti, Gisborne 0.1m Rural Aerial
  Photos 2024–2025) and the topographic map is NZ Topo50, both from the
  LINZ Data Service under CC BY 4.0, so they can be used commercially. The
  LDS API key goes in `site.json` (`ldsKey`) and the imagery layer in
  catchment.json (`basemap.aerialLayer`); without them the maps fall back
  to Esri's and the page step warns.
- This replaces v0.3.1's LINZ Basemaps setup (`linzBasemapsKey`): Basemaps
  and Data Service keys are different, and a Data Service key serves both
  layers.
- The key stays out of git: `site.json` is ignored, and the page step copies
  the key to `assets/keys.json` (also ignored), which the map reads when it
  loads. `site.example.json` shows the format.

## v0.3.1 — 2026-10-27

- **LINZ Basemaps instead of Esri.** The aerial photo and topographic map
  come from LINZ Basemaps (aerial imagery and Topo50, CC BY 4.0), which can
  be used commercially. They need a LINZ Basemaps API key in `site.json`
  (`linzBasemapsKey`); until one is set, the maps fall back to Esri's and
  the page step warns.
- The LiDAR is credited to its licensors: NIWA (2023 survey) and Gisborne
  District Council (2018–2020), both CC BY 4.0 (`lidar.credit` in
  catchment.json).

## v0.3.0 — 2026-10-27

- **Catchment map engine.** Every catchment is now built from one settings
  file, `<catchment>/catchment.json` (wording, boundary recipe, layers,
  LiDAR surveys, species exclusions), by `node engine/build.mjs <catchment>`.
  The build scripts, templates and data-source register live in `engine/`;
  `scripts/` and the old master page are gone.
- **Waimata figures corrected.** After v0.2.1's boundary change the area is
  17% native cover, 1,410 ha protected and 41.0 ha of mapped wetlands; the
  figures read off the map then came from cached data files.
- **Species list like Occurd's.** Species are grouped (birds, plants, fungi
  and so on) under headers that fold away. Tick species or whole groups to
  show them on the map. Each species links to its photos in LookLike, and
  *Photos in LookLike* opens the ticked species (up to 50).
- **Land cover classes.** The land cover layer has a *classes* dropdown:
  tick the LCDB classes to show, or pick all, native or none.
- **Licences.** Each species record now carries its licence (CC0, CC BY or
  CC BY-NC), shown in the record popup and the records download, with a
  filter for records that allow commercial use.
- **Rutherford Ecology branding and an About page** for each catchment:
  how to use the map, the boundary, what was left out, a table of data
  sources with their licences and whether they allow commercial use, and how
  to cite the map. The project home page is branded too.
- The map always checks for newer data files, so a rebuilt catchment never
  shows cached data.

## v0.2.2 — 2026-10-27

- **Better common names.** Species now take iNaturalist's preferred name for
  New Zealand (Tūī, Chaffinch, Southern Black-backed Gull), then GBIF's
  NZ-sourced English name. Codes and initials GBIF sometimes lists as English
  names ("COST", "C F") are skipped. `scripts/names.mjs` re-picks names in an
  existing snapshot without refetching records.
- The Māori name isn't repeated when the English name already includes it
  ("Tauhou (Silvereye)"), and genus and family names no longer show their
  author ("Anarhynchus", not "Anarhynchus Quoy & Gaimard, 1832").

## v0.2.1 — 2026-10-27

- **Waimata stops at the Taruheru confluence.** The Waimata area is now the
  Waimata River catchment above where the Taruheru joins it at Marina Park
  (224 km²). The Taruheru and the lower Tūranganui are out, and the layers,
  species records and LiDAR were rebuilt for the new area.

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
