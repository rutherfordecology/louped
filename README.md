# Catchment maps

Layers-only biodiversity maps for catchment groups and landowners, by
Rutherford Ecology. Every catchment is built by the same **catchment map
engine** (`engine/`) from one settings file, `<catchment>/catchment.json`.
Nothing about a catchment is coded by hand. No scoring or ranking: people
turn layers on and off, click a spot to see every layer there, or draw an
area to get its species list and land cover.

| Folder | Area |
|---|---|
| `whangara/` | Whangārā community catchments: Turihaua, Pouawa, Waiomoko and Pakarae rivers plus the coastal streams between them |
| `waimata/` | Waimata River catchment above its confluence with the Taruheru |

## Build a catchment (run from this folder)
    npm install
    node engine/build.mjs waimata              # every step
    node engine/build.mjs waimata page         # only remake the pages
    node engine/build.mjs waimata gbif names page

Steps, in order: `boundary`, `vectors`, `gbif`, `names`, `lidar`, `page`.

A new catchment: make a folder with a `catchment.json` (copy one of the
others), set its name, wording and boundary, and run `node engine/build.mjs
<folder>`. The page step adds it to the project home page.

## catchment.json
- **Wording:** `name`, `title`, `pageTitle`, `mapLabel`, `description`,
  `areaText`, `card` (home page), `boundaryNote`, `region`.
- **`boundary`:** `{ "bbox": [...], "rivers": ["Waimata"], "coast": false }`
  traces each named river upstream through NIWA's REC2 network; `coast` adds
  the small streams reaching the sea between the rivers. Or
  `{ "file": "inputs/catchments.geojson" }` for a boundary from elsewhere (for
  example the catchment group's own), with a `name` on each part.
- **`layers`:** which vector layers to fetch: `landcover`, `qeii`, `doc`,
  `rivers`, `luc`, and the Gisborne District Council layers `wetlands`, `pma`,
  `overlay3a`, `overlays`, `stability`.
- **`lidar`:** LINZ nz-elevation region and survey names, e.g.
  `{ "region": "gisborne", "now": "gisborne_2023", "before": "gisborne_2018-2020", "nowLabel": "2023", "beforeLabel": "2018–20" }`.
  Leave it out for no LiDAR; leave out `before` for no height change.
- **`gbif`:** `maxUncertaintyM` (records that could be further off are left
  out) and `exclude` (species to leave out, e.g. marine species recorded at
  the coast).

## The engine
- `engine/build.mjs` runs the steps in `engine/steps/`, each taking the
  catchment folder.
- `boundary.mjs` traces the boundary (REC2 watersheds, holes filled).
- `vectors.mjs` fetches and clips the vector layers into `data/layers/`.
- `gbif.mjs` snapshots the public GBIF records in the area at the coordinates
  GBIF publishes, with each record's licence. Left out: records with no name,
  records whose location was obscured or could be more than
  `maxUncertaintyM` off, and `exclude`d species.
- `names.mjs` picks common names: iNaturalist's NZ name first, then GBIF's.
- `lidar.mjs` renders hillshade, canopy height (DSM − DEM) and height change
  from LINZ's 1 m COGs: 4 m images per 1:10k tile and a 16 m overview.
- `page.mjs` writes `index.html` (from `engine/templates/map.html`),
  `about.html` and `data/config.json`, and remakes the home page.
- `engine/sources.mjs` is the register of data sources and their licences;
  the About page's licence table comes from it.

Edit the templates in `engine/templates/`, never the generated pages.

Data and licences: see any catchment's About page. In short, NIWA REC2
(boundaries and rivers) is CC BY-NC 4.0, GBIF records are CC0, CC BY or
CC BY-NC per record, and the iNaturalist names, Esri basemaps and LookLike
photos have terms to check before commercial use. The rest is CC BY 4.0.
