# Catchment maps

Layers-only biodiversity maps for catchment groups and landowners, by
Rutherford Ecology. Every catchment is built by the same **catchment map
engine** (`engine/`) from one settings file, `<catchment>/catchment.json`.
Nothing about a catchment is coded by hand. No scoring or ranking: people
turn layers on and off, click a spot to see every layer there, or draw an
area to get its species list and land cover.

Where the project is heading (Louped, a viewer for exported packages) is
in [DESIGN.md](DESIGN.md).

| Folder | Area |
|---|---|
| `whangara/` | Whangārā community catchments: Turihaua, Pouawa, Waiomoko and Pakarae rivers plus the coastal streams between them |
| `waimata/` | Waimata River catchment above its confluence with the Taruheru |

## Build a catchment (run from this folder)
    npm install
    node engine/build.mjs waimata              # every step
    node engine/build.mjs waimata page         # only remake the pages
    node engine/build.mjs waimata gbif names page

Steps, in order: `boundary`, `vectors`, `gbif`, `names`, `nztcs`, `lidar`, `page`.

`site.json` holds the project-wide LINZ Data Service API key (`ldsKey`, from
data.linz.govt.nz; it only needs the tiles scope) for the base maps; copy
`site.example.json` to start. It is kept out of git, and so is
`assets/keys.json`, where the page step puts the key for the maps to read.
With no key the maps use Esri's basemaps.

A new catchment: make a folder with a `catchment.json` (copy one of the
others), set its name, wording and boundary, and run `node engine/build.mjs
<folder>`. The page step adds it to the project home page.

## catchment.json
- **Wording:** `name`, `title`, `pageTitle`, `mapLabel`, `description`,
  `areaText`, `card` (home page), `boundaryNote`, `region`.
- **`boundary`:** from a catchment polygon layer (CC BY 4.0), e.g. Gisborne
  District Council's River Catchments: `{ "layer": "<FeatureServer layer URL>",
  "field": "SubCatchment", "parts": { "Waimata": "Waimata River" }, "coast":
  { "values": ["Coastal", "Other"] } }` (plus `sourceName`, `sourceBy`,
  `sourceShort` for the credits). Or `{ "bbox": [...], "rivers": ["Waimata"] }`
  to trace rivers through NIWA's REC2 network (non-commercial). Or
  `{ "file": "inputs/catchments.geojson" }` for a boundary from elsewhere (for
  example the catchment group's own), with a `name` on each part.
- **`layers`:** which vector layers to fetch: `landcover`, `qeii`, `doc`,
  `rivers` (LINZ, needs `ldsKey`), `luc`, `rivers_rec2` (NIWA, non-commercial),
  and the Gisborne District Council layers `wetlands`, `pma`, `overlay3a`,
  `overlays`, `stability`, `scheduled`.
- **`lidar`:** LINZ nz-elevation region and survey names, e.g.
  `{ "region": "gisborne", "now": "gisborne_2023", "before": "gisborne_2018-2020", "nowLabel": "2023", "beforeLabel": "2018–20", "credit": "..." }`;
  `credit` names the surveys' licensors for the About page.
  Leave it out for no LiDAR; leave out `before` for no height change.
- **`basemap`:** the LINZ Data Service aerial imagery layer for the region,
  e.g. `{ "aerialLayer": 121749, "aerialName": "Gisborne 0.1m Rural Aerial Photos (2024–2025)" }`.
- **`gbif`:** `maxUncertaintyM` (records that could be further off are left
  out), `exclude` (species to leave out, e.g. marine species recorded at
  the coast) and `years` (only records from the last that many years).

## The engine
- `engine/build.mjs` runs the steps in `engine/steps/`, each taking the
  catchment folder.
- `boundary.mjs` builds the boundary from a catchment layer or a REC2 trace
  (holes filled).
- `vectors.mjs` fetches and clips the vector layers into `data/layers/`.
- `gbif.mjs` snapshots the public GBIF records in the area at the coordinates
  GBIF publishes, with each record's licence. Left out: records with no name,
  records whose location was obscured or could be more than
  `maxUncertaintyM` off, and `exclude`d species.
- `names.mjs` picks common names: iNaturalist's NZ name first, then GBIF's.
- `nztcs.mjs` matches each species to the NZ Threat Classification System as
  Occurd does, from `engine/data/nztcs/` (Occurd's `nztcs.json`, locality
  table and `locality-core`, copied; copy them again to refresh). Only
  threatened and at-risk species are drawn on the map.
- `lidar.mjs` renders hillshade, canopy height (DSM − DEM) and height change
  from LINZ's 1 m COGs: 4 m images per 1:10k tile and a 16 m overview.
- `page.mjs` writes `index.html` (from `engine/templates/map.html`),
  `about.html` and `data/config.json`, and remakes the home page.
- `engine/sources.mjs` is the register of data sources and their licences;
  the About page's licence table comes from it.

Edit the templates in `engine/templates/`, never the generated pages.

Data and licences: see any catchment's About page. In short, GBIF records
are CC0, CC BY or CC BY-NC per record, and the iNaturalist names and LookLike
photos have terms to check before commercial use. The rest (GDC catchments,
LINZ rivers, base maps and LiDAR) is CC BY 4.0. NIWA REC2, if used, is
CC BY-NC 4.0.
