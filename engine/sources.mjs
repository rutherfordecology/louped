// Every data source the engine can use, with its licence and whether it can
// be used commercially. The page step lists the ones a catchment uses on its
// About page and in the map's attribution. Checked 2026-10-27 from each
// service's own licence information.
//   commercial: 'yes' | 'no' | 'mixed' (depends on the record) | 'check' (terms unclear)
export const SOURCES = [
  { key: 'boundary', uses: (c) => !c.boundary.file || c.layers.includes('rivers'), name: 'River Environment Classification (REC2 v2.5) and NZ Rivers and Names', by: 'NIWA (now Earth Sciences New Zealand)',
    licence: 'CC BY-NC 4.0', commercial: 'no', short: 'NIWA REC2', attr: 'NIWA',
    url: 'https://services3.arcgis.com/fp1tibNcN9mbExhG/arcgis/rest/services/REC2_Layers/FeatureServer',
    used: 'Catchment boundary (traced upstream through the river network) and the rivers and streams layer.' },
  { key: 'gbif', uses: () => true, name: 'Occurrence records', by: 'GBIF.org and the datasets published through it',
    licence: 'Per record: CC0, CC BY 4.0 or CC BY-NC 4.0', commercial: 'mixed', short: 'GBIF.org', attr: 'GBIF.org',
    url: 'https://www.gbif.org/', used: 'Species records. The licence filter on the map leaves out the CC BY-NC records.' },
  { key: 'names', uses: () => true, name: 'Common names', by: 'iNaturalist (preferred names for New Zealand) and GBIF',
    licence: 'iNaturalist Terms of Use; GBIF checklists under their own licences', commercial: 'check', short: 'iNaturalist and GBIF names',
    url: 'https://www.inaturalist.org/pages/terms', used: 'English and Māori names in the species list.' },
  { key: 'landcover', uses: (c) => c.layers.includes('landcover'), name: 'Land Cover Database v6 (LCDB, 2023)', by: 'Manaaki Whenua – Landcare Research, via Eagle Technology\'s ArcGIS service',
    licence: 'CC BY 4.0 (data); Eagle Technology web services terms for the service', commercial: 'yes', short: 'LCDB v6, Manaaki Whenua', attr: 'LCDB Manaaki Whenua',
    url: 'https://lris.scinfo.org.nz/', used: 'Land cover layer, native cover and the land cover summary.' },
  { key: 'luc', uses: (c) => c.layers.includes('luc'), name: 'NZ Land Resource Inventory, Land Use Capability', by: 'Manaaki Whenua – Landcare Research, via Gisborne District Council',
    licence: 'CC BY 4.0 (NZLRI)', commercial: 'yes', short: 'NZLRI', attr: 'NZLRI',
    url: 'https://lris.scinfo.org.nz/', used: 'Land use capability layer.' },
  { key: 'gdc', uses: (c) => ['wetlands', 'pma', 'overlays', 'overlay3a', 'stability'].some(k => c.layers.includes(k)), name: 'Regional wetland assessment (2022), protection management areas, Land Overlays 1–3 and 3A', by: 'Gisborne District Council',
    licence: 'CC BY 4.0', commercial: 'yes', short: 'Gisborne District Council', attr: 'GDC',
    url: 'https://www.gdc.govt.nz/', used: 'Wetlands, council protection management areas and erosion overlays.' },
  { key: 'qeii', uses: (c) => c.layers.includes('qeii'), name: 'QEII National Trust protected areas', by: 'QEII National Trust – Ngā Kairauhī Papa',
    licence: 'CC BY 4.0 (QEII asks users to keep the Privacy Act 2020 in mind)', commercial: 'yes', short: 'QEII National Trust', attr: 'QEII',
    url: 'https://qeiinationaltrust.org.nz/', used: 'QEII covenants.' },
  { key: 'doc', uses: (c) => c.layers.includes('doc'), name: 'Public Conservation Land', by: 'Department of Conservation',
    licence: 'CC BY 4.0', commercial: 'yes', short: 'DOC', attr: 'DOC',
    url: 'https://www.doc.govt.nz/', used: 'DOC land.' },
  { key: 'lidar', uses: (c) => !!c.lidar, name: 'LiDAR 1 m elevation models (DEM and DSM)', by: 'Toitū Te Whenua Land Information New Zealand',
    licence: 'CC BY 4.0', commercial: 'yes', short: 'LINZ LiDAR', attr: 'LINZ',
    url: 'https://registry.opendata.aws/nz-elevation/', used: 'Canopy height, height change and hillshade.' },
  { key: 'basemap', uses: () => true, name: 'World Imagery and World Topographic Map basemaps', by: 'Esri, Maxar, Earthstar Geographics',
    licence: 'Esri terms of use', commercial: 'check', short: 'Esri basemaps',
    url: 'https://www.esri.com/en-us/legal/terms/full-master-agreement', used: 'Aerial photo and topographic base maps.' },
  { key: 'looklike', uses: () => true, name: 'LookLike', by: 'Rutherford Ecology, with photos from iNaturalist',
    licence: 'Each photo carries its photographer\'s licence', commercial: 'check', short: 'LookLike',
    url: 'https://occurd.rutherfordecology.co.nz/looklike/', used: 'Species photos, opened from the species list (linked, not copied).' }
];
