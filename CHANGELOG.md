# Changelog

## v0.14.0 — 2026-11-08 (in inferrd.)

- The viewer has moved into inferrd. (`inferrd/louped/index.html`), with
  inferrd.'s new Louped tab (inferrd. v0.73.0): sites made, worded,
  hidden-layer ticked and previewed straight from inferrd.'s map, in a
  folder laid out as `sites/` here. v0.14.0 there adds a preview mode
  (`#preview`: the files come from the Louped tab). `viewer/index.html`
  here stays at v0.13.0 for the studio's deploys until publishing moves
  into inferrd. too (phase 2); then the studio retires.

## v0.13.0 — 2026-11-08

- **Packages straight from inferrd.** The studio takes inferrd.'s new
  "Send to Louped" at `/api/inferrd/`: list the sites, and send a package
  to a new site or to one already there (replace or merge, as a drop
  does). Only inferrd.'s own pages (rutherfordecology.github.io, and
  localhost:7899 and :7883 for testing) may use it, with the CORS and
  private network answers Chrome needs; they can't reach the wording,
  Access or deploy endpoints. A new site won't overwrite one of the same
  name.
- The studio opens at a site from its address: `http://localhost:7884/#<site>`.

## v0.12.0 — 2026-11-08

- **3D view in the client viewer.** A site whose package has LiDAR heights
  (inferrd. v0.71.0) gets a **3D** button in the header. It opens the
  same kind of model as inferrd.'s 3D view: the ground (or the surface:
  crowns and roofs) as a block cut out of the landscape, with the map
  draped over it as it is when 3D opens: the base map, every layer that's
  on, at its opacity, and the species dots. Drag to turn, right-drag or two
  fingers to move, scroll or pinch to zoom; Height × up to 5, Sides (the
  wire cut-out) and Dark (black background, grey wire), both remembered.
  three.js 0.147 and proj4 load only when 3D is opened.
- The studio lists the heights in a site's facts and gives them a tick box,
  "3D view (LiDAR heights)", under "In the client's view": untick it and
  the heights aren't deployed and the button doesn't show.
- A merged package with heights replaces the old heights; one without
  keeps them.

## v0.11.0 — 2026-11-08

- **Leave layers out of the client's view.** The studio lists a site's
  layers under "In the client's view", each with a tick box, plus one for
  the species records. Untick one and save, and it's gone from the
  client's map. It isn't just switched off:
  - a deploy doesn't send its files, and the package's manifest doesn't
    name it;
  - its source leaves the About page (unless a layer still shown uses it);
  - the client preview shows the site the same way.
  The data stays in the site folder, so ticking it back brings it back.
  The list is kept in job.json (`hidden`), so a data update or merge
  keeps it.
- A deployed package no longer carries the "left out" and
  "licence not stated" notes; those were for you only.

## v0.10.0 — 2026-11-08

- **Merge a new package instead of replacing.** When you drop a new
  "for Louped" zip on a site, the studio now asks: **Replace** (as
  before: the new export becomes the site's data) or **Merge** (add it to
  what is there). A merge:
  - adds the new areas to the old ones, skipping any that are the same shape;
  - replaces a layer that has the same id, and adds new layers at the top;
  - replaces a records file with the same name, and adds the others;
  - joins the sources, left-out and licence-unclear lists;
  - widens the map extent to cover both.
  The studio's facts show how many exports were merged.
- The viewer counts a GBIF record once, even when two merged exports both
  carry it.
- The title and wording are kept either way.

## v0.9.1 — 2026-11-08

- **Preview as the client sees it.** The studio's "Open in a tab" is now
  "Preview as the client sees it": it opens the site in a new tab built
  the way a deploy builds it (the current viewer, the site's wording and
  data, and no LINZ key, so the hosted Esri base maps), at
  `/preview/site/<site>/`. Nothing is deployed.
- **Open the live site** sits beside it once the site is online.

## v0.9.0 — 2026-11-08

- **Image layers (phase 2).** The viewer draws a package's image layers
  (`kind: "image"`, PNGs in `images/` with their bounds), with the same
  on/off switch, opacity slider and legend as the other layers, sharp
  cells from zoom 19. From inferrd. v0.70.0: the LiDAR layer and the Earth
  Engine layers. The studio lists them as "image".
- Older sites keep their copy of the viewer until their next save or data
  update in the studio; a deploy always uses the current viewer.

## v0.8.1 — 2026-11-08

- **The studio without a terminal.** `studio/start-studio.vbs` starts it
  with no window, logging to `run.log`, so a bookmark to
  http://localhost:7884/ works. HOSTING.md has the one-line command that
  starts it at every Windows sign-in.

## v0.8.0 — 2026-11-08

- **Put sites online from the studio.** A site's new **Online** section
  shows whether it's online and its address, with **Put online**,
  **Update online** and **Take offline**. They run the same deploy as
  `npm run online` and show its log. One deploy runs at a time.
- **Who can see it, set from the studio.** Choose "Only these people"
  (emails, or whole email domains) or "Anyone with the link". With a
  Cloudflare API token in the git-ignored `cloudflare.json` (HOSTING.md),
  saving makes or updates the site's Cloudflare Access application, and
  your own emails (`ownerEmails`) are always included. A link-only site
  gets a Bypass policy; the studio warns when its name could be guessed.
- **No site goes online unprotected.** Put online refuses a site with no
  Access application on Cloudflare, or, without a token, until you tick
  that you made one by hand.
- Taking the last site offline now deploys the landing page alone, instead
  of failing on an empty list.

## v0.7.0 — 2026-11-08

- **Licences on client sites.** The viewer's About view now gives each
  source's licence, linked, from the package (inferrd. v0.69.0 and later).
- **Studio flags layers with no licence stated.** A package's
  `licenceUnclear` list shows under the site's facts, so you decide before
  the site goes to anyone. Layers whose licence bars passing them on are
  left out in inferrd. and listed under "Left out of the package".
- DESIGN.md records the licence of every layer inferrd. can export.

## v0.6.0 — 2026-11-05

- **Client sites online on Cloudflare Pages, behind Cloudflare Access.**
  `npm run online` (studio/deploy.mjs) builds `dist/` from the sites on the
  online list (`online.json`) and deploys it to the `louped` Pages project.
  Each site is at `louped.pages.dev/<site>/` with its own Access
  application, so each client opens only their own map; the rest of the
  domain is locked to you. `list`, `add` and `remove` manage the list.
  HOSTING.md has the steps.
- Hosted sites never get the LINZ key; they use Esri base maps. Every page
  sends `noindex`, and the root and 404 pages say only to use the link
  you were sent.
- `online.json` and `dist/` are git-ignored, like `sites/`.
- Set up on 2026-11-05: the `louped` project is live at
  https://louped.pages.dev/ with the whole domain and its previews behind
  Access (members of the Cloudflare account only). First site: test-block.

## v0.5.0 — 2026-11-05

Louped, phase 1: client maps from packages, as set out in DESIGN.md.

- **Viewer** (`viewer/index.html`): a general map page that reads a site's
  `job.json` (your wording) and its package (the data). Layers in the
  package's order, colours and opacity, each with an eye, an opacity
  slider and its key; click the map for every layer at that spot; species
  grouped like occurd.'s checklist with NZTCS badges, a Threatened & at
  risk filter, LookLike links and a records download that carries the
  GBIF citation; an About view listing every source, licence note and DOI.
  The page says the date the data was exported: it is a snapshot.
- **Studio** (`npm run studio`, http://localhost:7884/): drop a
  `.louped.zip` from inferrd.'s Export for Louped to start a site, fill in
  the title, subtitle, client, date, introduction, About text and contact,
  and save; the site shows beside the form. Dropping a newer package
  replaces the data and keeps the wording. The studio listens on this
  computer only and takes changes only from its own page.
- Sites are written to `sites/<name>/`, kept out of git for now: this repo
  is public, and who can see client sites isn't decided.
- The catchment engine and the Waimata and Whangārā maps are unchanged.

## v0.4.7 — 2026-11-05

- **DESIGN.md** sets out where this is going, as agreed: the repo is now
  `rutherfordecology/louped`, a viewer that turns packages exported from
  Occurd, inferrd. and the catchment engine into client sites, where you
  only add the title and wording. Nothing is built yet; open questions are
  listed at the end of the file.

## v0.4.6 — 2026-10-27

- **Canopy height layer removed:** it didn't add enough. The LiDAR step still
  works out canopy height for the height change layer but no longer saves it,
  which drops about 25 MB of images per catchment. Height change and
  hillshade stay.

## v0.4.5 — 2026-10-27

- **Species records from the last 20 years only** (2006 on). A new
  `gbif.years` setting in catchment.json limits the GBIF fetch to the last
  that many years, counted from the current year; records with no year drop
  out too. The old records were mostly herbarium specimens and surveys from
  the 1890s to the 1990s. The map's Since filter now offers 2010, 2015 and
  2020, and the About page says which years are included.

## v0.4.4 — 2026-10-27

- The colour key for the species dots moved from the layers list to the
  Species records section, under its heading; in the layers list the species
  layer is just an on/off switch.

## v0.4.3 — 2026-10-27

- **No licence filter.** The map is a dashboard onto GBIF, so the species
  records' licence filter is gone; each record still links to its GBIF page,
  and its licence still shows in the record popup and the records download.

## v0.4.2 — 2026-10-27

- **Dot colours as in Occurd.** Threatened-species dots are coloured by
  taxon group with Occurd's colours and grouping (`TAXON_COLOURS` and
  `getTaxonGroup`, copied): birds blue, insects red, flowering plants green,
  fish teal and so on. Threat status stays on the badges. The species list's
  group colours use the same palette.
- **Land cover as a pie chart.** The land cover summary has Bars and Pie
  buttons; the pie shows the eight largest classes and the rest as "Other",
  with hectares and percentages, for the whole area or a drawn one. The
  choice is remembered.
- The button that clears a drawn area now reads "✕ Delete drawn area"
  (it said "Back to whole area", which didn't read as a way to remove it).
- Drawing an area no longer breaks when a click lands on a record dot: the
  dot used to open its popup, which then covered the map and caught the
  next clicks. Starting a drawing also closes any open popup.
- **Each layer's key sits under that layer** in the menu while it's on
  (land cover, land use capability, each erosion overlay, the LiDAR layers
  and the species dots), instead of all together at the bottom.

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
