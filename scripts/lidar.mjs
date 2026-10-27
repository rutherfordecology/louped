// LiDAR images for the area from LINZ's 1 m elevation COGs (2018-20 and 2023):
// hillshade, canopy height (DSM - DEM) and canopy height change. One 4 m
// image per LINZ 1:10k tile, plus a 16 m overview of the whole area; all
// warped to Web Mercator and cut to the area outline.
// usage: node scripts/lidar.mjs <data/layers/area.json> <out dir>
import { fromUrl } from 'geotiff';
import proj4 from 'proj4';
import * as turf from '@turf/turf';
import { PNG } from 'pngjs';
import fs from 'node:fs';

const [areaFile, outDir] = process.argv.slice(2);
const area = JSON.parse(fs.readFileSync(areaFile, 'utf8')).outline;
proj4.defs('EPSG:2193', '+proj=tmerc +lat_0=0 +lon_0=173 +k=0.9996 +x_0=1600000 +y_0=10000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
const toNZ = (p) => proj4('EPSG:4326', 'EPSG:2193', p), toLL = (p) => proj4('EPSG:2193', 'EPSG:4326', p);
const B = 'https://nz-elevation.s3.ap-southeast-2.amazonaws.com/gisborne/';
const NEW = 'gisborne_2023', OLD = 'gisborne_2018-2020';
const OX = 988000, OY = 6234000, TW = 4800, TH = 7200;
const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ', p2 = v => String(v).padStart(2, '0');
const tileName = (tx, ty) => { const col = Math.floor((tx - OX) / 24000), row = Math.floor((OY - ty) / 36000), sx0 = OX + col * 24000, sy0 = OY - row * 36000, idx = row + 16; return L[Math.floor(idx / 24)] + L[idx % 24] + p2(col) + '_10000_' + p2((sy0 - ty) / TH + 1) + p2((tx - sx0) / TW + 1); };

// Area rings in NZTM, for masking by scanline
const rings = (area.geometry.type === 'Polygon' ? [area.geometry.coordinates] : area.geometry.coordinates).flat().map(r => r.map(toNZ));
function inside(x, y) { let c = false; for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > y) !== (r[j][1] > y) && x < (r[j][0] - r[i][0]) * (y - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c; return c; }
function maskRow(y, x0, res, n) { // inside flags for n cells along a row, by crossings
  const xs = [];
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > y) !== (r[j][1] > y)) xs.push((r[j][0] - r[i][0]) * (y - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]);
  xs.sort((a, b) => a - b);
  const m = new Uint8Array(n);
  for (let k = 0; k + 1 < xs.length; k += 2) { const a = Math.max(0, Math.ceil((xs[k] - x0) / res - 0.5)), b = Math.min(n - 1, Math.floor((xs[k + 1] - x0) / res - 0.5)); for (let c = a; c <= b; c++) m[c] = 1; }
  return m;
}

const items = {};
for (const s of [NEW, OLD]) for (const k of ['dem_1m', 'dsm_1m']) items[s + k] = new Set((await (await fetch(B + s + '/' + k + '/2193/collection.json')).json()).links.filter(l => l.rel === 'item').map(l => l.href.replace(/^\.\//, '').replace(/\.json$/, '')));
async function read(survey, kind, name, level) {
  if (!items[survey + kind].has(name)) return null;
  for (let i = 0; i < 3; i++) {
    try { const im = await (await fromUrl(B + survey + '/' + kind + '/2193/' + name + '.tiff')).getImage(level); const nd = im.getGDALNoData(); const r = (await im.readRasters({ samples: [0] }))[0]; return { r, nd, w: im.getWidth(), h: im.getHeight() }; }
    catch (err) { if (i === 2) { console.error('read failed', survey, kind, name, err.message); return null; } }
  }
}

// Colours
const CHM_STOPS = [[1, [237, 248, 177]], [3, [199, 233, 180]], [6, [127, 205, 187]], [10, [65, 182, 196]], [15, [44, 127, 184]], [20, [37, 52, 148]], [30, [8, 29, 88]], [45, [74, 20, 134]]];
const ramp = (stops, v) => { if (v <= stops[0][0]) return stops[0][1]; for (let i = 1; i < stops.length; i++) if (v <= stops[i][0]) { const [a, ca] = stops[i - 1], [b, cb] = stops[i], f = (v - a) / (b - a); return ca.map((c, k) => Math.round(c + (cb[k] - c) * f)); } return stops.at(-1)[1]; };
const LOSS = [[2, [254, 224, 144]], [5, [253, 141, 60]], [10, [227, 26, 28]], [20, [128, 0, 38]]], GAIN = [[2, [199, 233, 192]], [5, [116, 196, 118]], [10, [35, 139, 69]], [20, [0, 68, 27]]];
const colour = {
  hillshade: (v) => { const k = Math.round(40 + 215 * v); return [k, k, k, 255]; },
  chm: (v) => v < 1 ? null : [...ramp(CHM_STOPS, v), 235],
  change: (v) => Math.abs(v) < 2 ? null : [...ramp(v < 0 ? LOSS : GAIN, Math.abs(v)), 235]
};

// Grids in NZTM: hillshade, chm, change
function compute(dem, dsm, odem, odsm, res, w, h, x0, y1) {
  const n = w * h, hs = new Float32Array(n).fill(NaN), chm = new Float32Array(n).fill(NaN), chg = new Float32Array(n).fill(NaN);
  const ok = (g, i) => g && g.r[i] !== g.nd && g.r[i] > -1000;
  const z = (x, y, c) => { x = Math.min(w - 1, Math.max(0, x)); y = Math.min(h - 1, Math.max(0, y)); const i = y * w + x; return ok(dem, i) ? dem.r[i] : c; };
  const zen = Math.PI / 4, az = (360 - 315 + 90) * Math.PI / 180, zf = 1.5;
  for (let y = 0; y < h; y++) {
    const m = maskRow(y1 - (y + 0.5) * res, x0, res, w);
    for (let x = 0; x < w; x++) {
      const i = y * w + x; if (!m[x] || !ok(dem, i)) continue;
      const c = dem.r[i], a = z(x - 1, y - 1, c), b = z(x, y - 1, c), cc = z(x + 1, y - 1, c), d = z(x - 1, y, c), f = z(x + 1, y, c), gg = z(x - 1, y + 1, c), hh = z(x, y + 1, c), ii = z(x + 1, y + 1, c);
      const dzdx = zf * ((cc + 2 * f + ii) - (a + 2 * d + gg)) / (8 * res), dzdy = zf * ((gg + 2 * hh + ii) - (a + 2 * b + cc)) / (8 * res);
      const sl = Math.atan(Math.hypot(dzdx, dzdy)); let asp = Math.atan2(dzdy, -dzdx); if (asp < 0) asp += 2 * Math.PI;
      hs[i] = Math.max(0, Math.cos(zen) * Math.cos(sl) + Math.sin(zen) * Math.sin(sl) * Math.cos(az - asp));
      if (ok(dsm, i)) chm[i] = Math.max(0, Math.min(80, dsm.r[i] - c));
      if (chm[i] === chm[i] && ok(odem, i) && ok(odsm, i)) chg[i] = chm[i] - Math.max(0, Math.min(80, odsm.r[i] - odem.r[i]));
    }
  }
  return { hillshade: hs, chm, change: chg };
}

// Warp NZTM grids to a Mercator image over a lat/lng box
const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
function warp(grids, res, w, h, x0, y1, bb, OW) {
  const [west, south, east, north] = bb, my0 = merc(south), my1 = merc(north);
  const OH = Math.round(OW * (my1 - my0) / ((east - west) * Math.PI / 180));
  const pngs = Object.fromEntries(Object.keys(grids).map(k => [k, new PNG({ width: OW, height: OH })]));
  for (let y = 0; y < OH; y++) {
    const my = my1 - (y + 0.5) / OH * (my1 - my0), lat = (2 * Math.atan(Math.exp(my)) - Math.PI / 2) * 180 / Math.PI;
    for (let x = 0; x < OW; x++) {
      const [X, Y] = toNZ([west + (x + 0.5) / OW * (east - west), lat]);
      const c = Math.floor((X - x0) / res), r = Math.floor((y1 - Y) / res), o = (y * OW + x) * 4;
      const inGrid = c >= 0 && r >= 0 && c < w && r < h;
      for (const k in grids) {
        const v = inGrid ? grids[k][r * w + c] : NaN, rgba = v === v ? colour[k](v) : null;
        if (rgba) pngs[k].data.set(rgba, o); else pngs[k].data[o + 3] = 0;
      }
    }
  }
  return pngs;
}
const save = (png, file) => { fs.mkdirSync(file.replace(/\/[^/]+$/, ''), { recursive: true }); fs.writeFileSync(file, PNG.sync.write(png, { deflateLevel: 9, ...(file.includes('/hillshade/') ? { colorType: 4, inputColorType: 6 } : {}) })); return fs.statSync(file).size; };

// Tiles touching the area
const [w, s, e, n] = turf.bbox(area), cs = [[w, s], [e, s], [w, n], [e, n]].map(toNZ);
const gx0 = OX + Math.floor((Math.min(...cs.map(c => c[0])) - OX) / TW) * TW, gx1 = OX + Math.ceil((Math.max(...cs.map(c => c[0])) - OX) / TW) * TW;
const gy1 = OY - Math.floor((OY - Math.max(...cs.map(c => c[1]))) / TH) * TH, gy0 = OY - Math.ceil((OY - Math.min(...cs.map(c => c[1]))) / TH) * TH;
const tiles = [];
for (let ty = gy1; ty > gy0; ty -= TH) for (let tx = gx0; tx < gx1; tx += TW) {
  const poly = turf.polygon([[[tx, ty], [tx + TW, ty], [tx + TW, ty - TH], [tx, ty - TH], [tx, ty]].map(toLL)]);
  if (turf.booleanIntersects(poly, area)) tiles.push({ tx, ty, name: tileName(tx, ty), bb: turf.bbox(poly) });
}
console.error(tiles.length + ' LiDAR tiles touch the area');

// Overview grid at 16 m over all tiles
const OR = 16, ow = (gx1 - gx0) / OR, oh = (gy1 - gy0) / OR;
const ov = { hillshade: new Float32Array(ow * oh).fill(NaN), chm: new Float32Array(ow * oh).fill(NaN), change: new Float32Array(ow * oh).fill(NaN) };
const index = [];
const RES = 4, W = TW / RES, H = TH / RES;
for (const t of tiles) {
  const [dem, dsm, odem, odsm] = await Promise.all([read(NEW, 'dem_1m', t.name, 2), read(NEW, 'dsm_1m', t.name, 2), read(OLD, 'dem_1m', t.name, 2), read(OLD, 'dsm_1m', t.name, 2)]);
  if (!dem) { console.error('no 2023 DEM for', t.name); continue; }
  const g = compute(dem, dsm, odem, odsm, RES, W, H, t.tx, t.ty);
  // 16 m overview: mean of 4 x 4 blocks (hillshade, chm), mean change
  const c0 = (t.tx - gx0) / OR, r0 = (gy1 - t.ty) / OR, k = OR / RES;
  for (const key in ov) for (let r = 0; r < H / k; r++) for (let c = 0; c < W / k; c++) {
    let sum = 0, cnt = 0; for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) { const v = g[key][(r * k + dy) * W + c * k + dx]; if (v === v) { sum += v; cnt++; } }
    if (cnt > k * k / 4) ov[key][(r0 + r) * ow + c0 + c] = sum / cnt;
  }
  const pngs = warp(g, RES, W, H, t.tx, t.ty, t.bb, 1300);
  let bytes = 0; for (const key in pngs) bytes += save(pngs[key], outDir + '/' + key + '/' + t.name + '.png');
  index.push({ name: t.name, bounds: [[t.bb[1], t.bb[0]], [t.bb[3], t.bb[2]]], old: !!odem });
  console.error(t.name, Math.round(bytes / 1024) + ' KB');
}
const obb = [w - 0.003, s - 0.003, e + 0.003, n + 0.003];
const opng = warp(ov, OR, ow, oh, gx0, gy1, obb, 1600);
for (const key in opng) console.error('overview', key, Math.round(save(opng[key], outDir + '/' + key + '/overview.png') / 1024) + ' KB');
fs.writeFileSync(outDir + '/index.json', JSON.stringify({ surveys: { now: '2023', before: '2018–20' }, overview: [[obb[1], obb[0]], [obb[3], obb[2]]], tiles: index }));
