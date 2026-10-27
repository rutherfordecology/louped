// Ground height at points, from the catchment's LINZ LiDAR DEM (the "now"
// survey in catchment.json), read from each 1:10k tile's 16 m overview.
// Used to find which way rivers flow. Points off the LiDAR get null.
import { fromUrl } from 'geotiff';
import proj4 from 'proj4';

proj4.defs('EPSG:2193', '+proj=tmerc +lat_0=0 +lon_0=173 +k=0.9996 +x_0=1600000 +y_0=10000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
const toNZ = (p) => proj4('EPSG:4326', 'EPSG:2193', p);
const OX = 988000, OY = 6234000, TW = 4800, TH = 7200;
const LET = 'ABCDEFGHJKLMNPQRSTUVWXYZ', p2 = v => String(v).padStart(2, '0');
const tileName = (tx, ty) => { const col = Math.floor((tx - OX) / 24000), row = Math.floor((OY - ty) / 36000), sx0 = OX + col * 24000, sy0 = OY - row * 36000, idx = row + 16; return LET[Math.floor(idx / 24)] + LET[idx % 24] + p2(col) + '_10000_' + p2((sy0 - ty) / TH + 1) + p2((tx - sx0) / TW + 1); };

export async function elevations(points, lidar) {
  if (!lidar) return points.map(() => null);
  const base = 'https://nz-elevation.s3.ap-southeast-2.amazonaws.com/' + lidar.region + '/' + lidar.now + '/dem_1m/2193/';
  const tiles = new Map(), out = new Array(points.length).fill(null);
  points.forEach((p, i) => {
    const [x, y] = toNZ(p), tx = OX + Math.floor((x - OX) / TW) * TW, ty = OY - Math.floor((OY - y) / TH) * TH;
    const name = tileName(tx, ty);
    if (!tiles.has(name)) tiles.set(name, { tx, ty, pts: [] });
    tiles.get(name).pts.push([i, x, y]);
  });
  for (const [name, t] of tiles) {
    let im, r;
    try { im = await (await fromUrl(base + name + '.tiff')).getImage(4); r = (await im.readRasters({ samples: [0] }))[0]; } catch (err) { continue; } // no LiDAR here
    const w = im.getWidth(), h = im.getHeight(), nd = im.getGDALNoData(), rx = TW / w, ry = TH / h;
    for (const [i, x, y] of t.pts) {
      const c = Math.min(w - 1, Math.max(0, Math.floor((x - t.tx) / rx))), rr = Math.min(h - 1, Math.max(0, Math.floor((t.ty - y) / ry)));
      const v = r[rr * w + c]; if (v !== nd && v > -1000) out[i] = v;
    }
  }
  return out;
}
