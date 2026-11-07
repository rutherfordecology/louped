# Louped: design

Status: phase 1 built, 2026-11-05 (v0.5.0): inferrd.'s Export for
Louped (v0.62.0), the viewer and the studio, for vector layers and
species records. Phase 2, image layers, built 2026-11-08 (v0.9.0, inferrd.
v0.70.0): LiDAR and Earth Engine layers as PNGs on the web map's grid.
Still to come: the catchment engine writing packages (phase 3). Hosting: v0.6.0, Cloudflare Pages + Access.

## What Louped is

Louped turns an exported package into a web viewer for a client or
stakeholder. It shows and labels; it does not fetch, select or analyse.
Those choices are made in the tools that already make them:

- **Occurd**: species records (Big Data downloads, with their GBIF DOI).
- **inferrd.**: drawn areas, vegetation trends, maps.
- **The catchment engine**: boundaries, council and national layers, LiDAR.

You should never have to pick layers or records again in Louped. The only
things you add there are presentation: title, subtitle, client, intro
text, contact, date.

## The flow

1. **Export.** In Occurd or inferrd, set up the job as usual and press
   **Export for Louped**. That writes one package (a zip).
2. **Present.** In Louped, open the package and add the title and
   wording. They are saved in the job's own file, not in the package.
3. **Publish.** Louped writes a finished site folder, one per job, for
   example `waimata-2026/`.
4. **Update.** Export again and drop the new package in. The data is
   replaced; the title and wording are kept.

A site is a snapshot. It shows what was true when the package was
exported, and it says that date. It is not live.

## The package

One zip from one export. Several packages can make one site, for example
an Occurd package and an inferrd package for the same area.

    louped.json          the manifest: what made it, when, the area, layers, sources
    layers/areas.geojson the areas
    layers/<id>.geojson  vector layers; each feature's drawn style in
                         properties._s, its popup text in _label
    records/<n>.json     species records (occurd.), { cols, rows }
    images/*.png         rasters, each with its bounds in the manifest
                         (phase 2: inferrd vegetation maps, LiDAR)

A style (`_s`, or a layer's `style`) is `{ c: line colour, w: width,
o: line opacity, f: fill colour, fo: fill opacity, d: dash, r: point
radius }`; a missing `c` or `f` means no line or no fill.

`louped.json` holds `format: "louped-package"` and `formatVersion: 1`,
and:

- `producer`: tool and version, for example `{ "tool": "occurd", "version": "v7.49" }`.
- `exported`: date and time.
- `area`: a name and the bounding box.
- `layers`: for each one, its file, display name, group, style, legend
  text, whether it starts on, and its source key.
- `sources`: name, licence, citation and link for each source. Occurd
  records carry the GBIF download DOI, as Occurd's exports already do.
- `basemaps`: listed by reference (for example LINZ Data Service layer
  121749), not copied in, because they are tiles.

The package is meant to be the same thing the report Workflow reads, so
one export can also go into `OneDrive\Workflow\projects/<job>/data/`.
Occurd and inferrd already export most of it: Occurd's Big Data CSV with
its `# GBIF citation:` line, and inferrd's `areas.geojson`,
`summary.json` and `map.png`. Export for Louped mostly repackages those.

## The job file

Everything you type in Louped, kept apart from the data so an update
never overwrites it:

    job.json   title, subtitle, client, intro, contact, date shown,
               which packages make up the site, About page text

## What changes in this repo

- The map page, About page and species list (`engine/templates/`) become
  the general viewer. It reads packages instead of the engine's
  `data/config.json`, which today mixes wording and data.
- The catchment engine becomes one more producer: its build ends by
  writing a package. Waimata and Whangārā keep working, as a package plus
  a `job.json` each.
- The project rules stay: Rutherford Ecology branding, records at their
  published coordinates, every record linked to its source and licence.

## Layer licences

Checked 8 November 2026 against each publisher's metadata. inferrd.'s
Export for Louped applies this table (`LOUPED_LICENCES` in its
index.html): "no" layers are left out, "unclear" ones are packaged and
flagged in the studio.

| Layer | Licence | Share with a client |
| --- | --- | --- |
| GDC TRMP layers, GDC parks and reserves | CC BY 4.0 | yes |
| QEII open space covenants | CC BY 4.0 (mind the Privacy Act 2020) | yes |
| NIWA NZ large river catchments | CC BY 4.0 | yes |
| NIWA river catchments, all sizes | not stated (staff account) | unclear |
| LCDB v6, PAN-NZ (Manaaki Whenua) | CC BY 4.0 | yes |
| Threatened Environment Classification 2012 | CC BY 3.0 NZ | yes |
| Potential vegetation, Vegetative Cover Map (Manaaki Whenua) | Landcare Data Use Licence: no passing to third parties | no |
| GNS QMAP geology, faults, landslides (2023, 4th ed.) | CC BY 4.0, "© GNS Science 2023" | yes |
| MPI Erosion Susceptibility Classification, and its LUC classes | not stated; © Landcare Research (NZLRI) | unclear |
| LiDAR contours, LiDAR layer (picture) | CC BY 4.0 (LINZ) | yes |
| Earth Engine layers (index, change, trend, land cover, canopy, loss, fire, water, slope, aspect, elevation) | open data, computed on Earth Engine under a non-commercial registration | unclear: unpaid work yes; paid work needs a commercial Earth Engine licence |
| Species records | per record: CC0, CC BY or CC BY-NC | yes, with each record's licence |

Landcare's own NZLRI layers on LRIS (LUC 2021 among them) are under the
Landcare Data Use Licence, so the ESC's "not stated" leans towards asking
MPI or Landcare before sharing it.

## Not decided yet

1. ~~Who can see a site~~: settled in v0.6.0. Cloudflare Pages behind
   Cloudflare Access, one Access application per site (HOSTING.md).
2. ~~Where the title goes in~~: settled in phase 1. The studio is an
   editor page on this computer (drop the zip, fill in a form, save).
3. ~~Which tool exports first~~: settled in phase 1. inferrd. exports:
   occurd. CSVs go into inferrd.'s Report tab, and the Layers panel there
   is where the map is set up. Occurd needs no change.
4. **Base map key on a hosted site.** The LINZ key is kept out of git.
   A key in a web page is visible to anyone, so a hosted site needs its
   own key used only for that.
   Until then, hosted sites use Esri base maps (the LINZ key is never
   deployed).
