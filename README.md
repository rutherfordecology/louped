# Catchment reports

Layers-only biodiversity maps for catchment groups in Tairāwhiti. Each catchment
is a folder with its own static map (`<catchment>/index.html`) and data
(`<catchment>/data/`); the build scripts in `scripts/` are shared. No scoring or
ranking: people turn layers on and off, click a spot to see every layer there,
or draw an area to get its species list and land cover.

| Folder | Area |
|---|---|
| `whangara/` | Whangārā community catchments: Turihaua, Pouawa, Waiomoko and Pakarae rivers plus the coastal streams between them |

## Build a catchment (Whangārā shown; run from this folder)
    npm install
    node scripts/boundary.mjs whangara/inputs/catchments.geojson 177.98,-38.76,178.40,-38.26 Turihaua Pouawa Waiomoko Pakarae --coast
    node scripts/vectors.mjs whangara/inputs/catchments.geojson whangara/data/layers
    node scripts/gbif.mjs whangara/data/layers/area.json whangara/data/gbif.json
    node scripts/lidar.mjs whangara/data/layers/area.json whangara/data/lidar

- `boundary.mjs` traces each named river upstream through NIWA's REC2 network
  and merges the REC2 watersheds (holes filled). `--coast` adds the small
  streams reaching the sea between the named rivers. To change an area, change
  the river names, or put another boundary in `inputs/catchments.geojson`, and
  rerun the rest.
- `vectors.mjs` fetches and clips LCDB v6 land cover, QEII covenants, council
  protection management areas, DOC land, the council wetland assessment
  (2022), NZLRI land use capability, council Land Overlays 1–3 and 3A, and
  REC2 rivers.
- `gbif.mjs` snapshots the public GBIF records in the area at the coordinates
  GBIF publishes, with English and Māori common names where GBIF has them.
  Left out: records with no name, records whose location was obscured or
  could be more than 5 km off (`MAX_UNC_M`), and taxa listed in `EXCLUDE`
  (marine species recorded at the coast: rock lobster, kina, pāua, blue
  shark, Cook's turban, turret shell).
- `lidar.mjs` renders hillshade, canopy height (DSM − DEM, 2023) and height
  change since 2018–20 from LINZ's 1 m COGs: 4 m images per LINZ 1:10k tile
  and a 16 m overview, warped to Web Mercator and cut to the area.

Data: GBIF.org; LINZ LiDAR (CC BY 4.0); LCDB v6, Manaaki Whenua (CC BY 4.0);
NIWA REC2; NZLRI; Gisborne District Council; QEII National Trust; DOC (CC BY 4.0).
