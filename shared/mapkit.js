// Map toolkit shared by the server, the game client and the map editor.
//  - THEME_PRESETS / resolveTheme: one-line "look" presets (desert, urban, snow, industrial, night, jungle)
//  - normalizeDef: fills every optional field so hand-written / editor-written maps never crash the engine
//  - autoGameplay: generates bot routes, holds, buy zones and callouts from spawns + sites when they are missing
//  - validateMap: human readable list of problems (unreachable sites, spawns inside walls, ...)
import { WALL, PHYS } from './constants.js';
import { buildNav, field } from './nav.js';

export const PROP_KINDS = {
  // decoration only (no collision). args after kind: x, z, rot(rad), scale, color, yOffset
  palm: { name: 'نخل' }, tree: { name: 'درخت' }, pine: { name: 'کاج' }, bush: { name: 'بوته' }, rock: { name: 'سنگ' },
  lamppost: { name: 'تیر چراغ' }, fence: { name: 'نرده/حصار' }, sign: { name: 'تابلو' }, flag: { name: 'پرچم' },
  acunit: { name: 'کولر/دستگاه' }, pipe: { name: 'لوله' }, tire: { name: 'لاستیک' }, rubble: { name: 'آوار' },
  hay: { name: 'کاه' }, tent: { name: 'چادر' }, antenna: { name: 'آنتن' }, bench: { name: 'نیمکت' }, barrel: { name: 'بشکه' },
  pot: { name: 'گلدان' }, awning: { name: 'سایبان' }, sandbags: { name: 'کیسه شن' }, wires: { name: 'سیم' },
};
// solid blocks (crates list): collision is the 1 m grid, the look depends on the kind
export const BLOCK_KINDS = {
  crate: 'جعبه چوبی', cont: 'کانتینر', barrel: 'بشکه', concrete: 'بلوک بتنی', pillar: 'ستون', planter: 'باغچه',
  bench: 'نیمکت', jersey: 'مانع بتنی', sandbags: 'کیسه شن', dumpster: 'سطل زباله بزرگ', car: 'ماشین', ledge: 'لبه دیوار',
};

export const THEME_PRESETS = {
  desert: { sky: '#86bfe8', haze: '#e9d2a6', sun: '#fff0d2', wall: '#d9b67f', wall2: '#cfa46c', plaster: '#dfc496', floor: '#ccad80', trim: '#b98f5a', shutter: '#3a7fa8', wallStyle: ['blocks', 'plaster'], horizon: 'dunes', fogNear: 105, fogFar: 520, sunDir: [-0.45, 0.62, 0.64], exposure: 1.1 },
  urban: { sky: '#8fb2d0', haze: '#c4ccd4', sun: '#fff4e6', wall: '#a9a39b', wall2: '#8b857d', plaster: '#b8b2aa', floor: '#8d8f92', trim: '#5f5a55', shutter: '#3d6a7a', wallStyle: ['brick', 'concrete'], groundMat: 'asphalt', horizon: 'city', fogNear: 90, fogFar: 420, sunDir: [-0.4, 0.7, 0.5], exposure: 1.05 },
  snow: { sky: '#b4cfe6', haze: '#e6eef6', sun: '#f4f8ff', wall: '#9aa6b2', wall2: '#7f8c99', plaster: '#c8d2dc', floor: '#e9eff5', trim: '#5c6772', shutter: '#4c6e8c', wallStyle: ['concrete', 'blocks'], groundMat: 'snow', horizon: 'mountains', fogNear: 60, fogFar: 330, sunDir: [-0.3, 0.45, 0.7], exposure: 1.15 },
  industrial: { sky: '#9eb0c0', haze: '#b3b6b8', sun: '#fff6e8', wall: '#8c9296', wall2: '#6e757a', plaster: '#a4a9ad', floor: '#868b90', trim: '#4a4f54', shutter: '#b9772b', wallStyle: ['metal', 'concrete'], groundMat: 'concrete', horizon: 'city', fogNear: 80, fogFar: 380, sunDir: [-0.5, 0.6, 0.55], exposure: 1.0 },
  night: { sky: '#101a2e', haze: '#1c2740', sun: '#8fa8d8', wall: '#6d7482', wall2: '#555c6a', plaster: '#757c8b', floor: '#4d5360', trim: '#2c313b', shutter: '#2a5d78', wallStyle: ['concrete', 'brick'], groundMat: 'asphalt', horizon: 'city', fogNear: 40, fogFar: 240, sunDir: [-0.2, 0.8, 0.3], exposure: 1.5, night: true, lampBoost: 2.2 },
  jungle: { sky: '#8cc4e0', haze: '#bcd9b0', sun: '#fff3d0', wall: '#a89874', wall2: '#8c7d5c', plaster: '#b8aa86', floor: '#6f8a4c', trim: '#5d4a2c', shutter: '#2f6b3f', wallStyle: ['blocks', 'plaster'], groundMat: 'grass', horizon: 'forest', fogNear: 55, fogFar: 300, sunDir: [-0.35, 0.65, 0.6], exposure: 1.05 },
};

export function resolveTheme(theme) {
  const t = theme || {}; const base = THEME_PRESETS[t.preset] || THEME_PRESETS.desert;
  return { ...base, ...t };
}

const arr = (d, k) => { if (!Array.isArray(d[k])) d[k] = []; return d[k]; };
// Fills missing fields in place and returns def. Never throws on partial data.
export function normalizeDef(def) {
  if (!def || typeof def !== 'object') throw new Error('bad def');
  if (!Array.isArray(def.size) || def.size.length < 2) def.size = [128, 128];
  def.size = [Math.max(16, Math.min(512, def.size[0] | 0)), Math.max(16, Math.min(512, def.size[1] | 0))];
  for (const k of ['areas', 'ramps', 'roofs', 'crates', 'doors', 'lamps', 'props', 'decals', 'wallZones']) arr(def, k);
  def.theme = def.theme || {}; if (!def.theme.preset && !def.theme.sky) def.theme.preset = 'desert';
  def.spawns = def.spawns || {}; for (const t of ['T', 'CT']) arr(def.spawns, t);
  def.yaw = def.yaw || { T: 0, CT: Math.PI }; if (typeof def.yaw.T !== 'number') def.yaw.T = 0; if (typeof def.yaw.CT !== 'number') def.yaw.CT = Math.PI;
  def.sites = def.sites || {}; def.name ||= def.id;
  return def;
}

const cellOf = (x, z) => [Math.floor(x), Math.floor(z)];
function rectCenter(r) { return [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2]; }
function bboxOf(points, pad, W, H) {
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (const [x, z] of points) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
  return [Math.max(0, Math.floor(x0 - pad)), Math.max(0, Math.floor(z0 - pad)), Math.min(W, Math.ceil(x1 + pad)), Math.min(H, Math.ceil(z1 + pad))];
}
// A cell a bot can really stand on: walkable, not a crate top, and connected to most neighbours.
const openCell = (nav, x, z) => {
  const { W, H } = nav, i = z * W + x; if (!nav.walk[i] || nav.m.mat[i] === 4) return false; let ok = 0;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dz) continue; const xx = x + dx, zz = z + dz; if (xx < 0 || zz < 0 || xx >= W || zz >= H) continue; const j = zz * W + xx; if (nav.walk[j] && Math.abs(nav.h[j] - nav.h[i]) <= PHYS.step) ok++; }
  return ok >= 5;
};
const nearestWalkable = (nav, x, z) => {
  const { W, H } = nav, cx = Math.floor(x), cz = Math.floor(z); let best = -1, bd = 1e9;
  for (let r = 0; r < 40 && best < 0; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const xx = cx + dx, zz = cz + dz; if (xx < 0 || zz < 0 || xx >= W || zz >= H || !openCell(nav, xx, zz)) continue;
    const d = dx * dx + dz * dz; if (d < bd) { bd = d; best = zz * W + xx; }
  }
  return best;
};
// Walk a distance field from `start` downhill and return waypoints every `step` cells.
function tracePath(nav, dist, start, step = 7) {
  const { W, H } = nav, pts = []; let cur = start, n = 0;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let guard = 0; guard < 4000 && dist[cur] > 0; guard++) {
    const cx = cur % W, cz = (cur / W) | 0; let best = -1, bd = dist[cur];
    for (const [dx, dz] of DIRS) { const xx = cx + dx, zz = cz + dz; if (xx < 0 || zz < 0 || xx >= W || zz >= H) continue; const j = zz * W + xx; if (dist[j] >= 0 && dist[j] < bd) { bd = dist[j]; best = j; } }
    if (best < 0) break; cur = best; if (++n % step === 0) pts.push([(cur % W) + 0.5, ((cur / W) | 0) + 0.5]);
  }
  return pts;
}

// Generates def.routes / holds / buy / callouts when they are missing. `m` is a map built by buildMap().
export function autoGameplay(m, force = false) {
  const def = m.def, { W, H } = m; const nav = buildNav(m);
  const sites = Object.keys(def.sites);
  const spawnPts = (t) => (def.spawns[t] || []).map(([x, z]) => [x + 0.5, z + 0.5]);
  const T = spawnPts('T'), CT = spawnPts('CT');
  if (force || !def.buy || !def.buy.T || !def.buy.CT) {
    def.buy = { T: T.length ? bboxOf(T, 4, W, H) : [0, 0, 8, 8], CT: CT.length ? bboxOf(CT, 4, W, H) : [W - 8, H - 8, W, H] };
  }
  const centroid = (pts) => pts.length ? [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length] : [W / 2, H / 2];
  const tC = centroid(T), ctC = centroid(CT);
  if (force || !def.routes || !Object.keys(def.routes).length) {
    def.routes = {};
    const startCell = nearestWalkable(nav, tC[0], tC[1]);
    for (const k of sites) {
      const c = rectCenter(def.sites[k]); const goal = nearestWalkable(nav, c[0], c[1]); def.routes[k] = [];
      if (startCell < 0 || goal < 0) continue;
      const extra = new Int16Array(W * H);
      for (let v = 0; v < 3; v++) {                       // three different approaches: every route makes its own corridor expensive
        const dist = field(nav, null, [goal], extra);
        if (dist[startCell] < 0) break;
        const pts = tracePath(nav, dist, startCell);
        if (pts.length) def.routes[k].push(pts);
        let cur = startCell, guard = 0; const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        while (dist[cur] > 0 && guard++ < 4000) {
          const cx = cur % W, cz = (cur / W) | 0; let best = -1, bd = dist[cur];
          for (const [dx, dz] of DIRS) { const xx = cx + dx, zz = cz + dz; if (xx < 0 || zz < 0 || xx >= W || zz >= H) continue; const j = zz * W + xx; if (dist[j] >= 0 && dist[j] < bd) { bd = dist[j]; best = j; } }
          if (best < 0) break; cur = best;
          for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) { const xx = (cur % W) + dx, zz = ((cur / W) | 0) + dz; if (xx >= 0 && zz >= 0 && xx < W && zz < H) extra[zz * W + xx] = Math.min(900, extra[zz * W + xx] + 120); }
        }
      }
      if (!def.routes[k].length) def.routes[k] = [[]];
    }
  }
  if (force || !def.holds || !def.holds.A) {
    def.holds = {};
    const look = (x, z) => { const dx = tC[0] - x, dz = tC[1] - z, l = Math.hypot(dx, dz) || 1; return [x + dx / l * 14, z + dz / l * 14]; };
    for (const k of sites) {
      const r = def.sites[k], c = rectCenter(r), list = [];
      for (const [fx, fz] of [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72], [0.5, 0.5]]) {
        const x = r[0] + (r[2] - r[0]) * fx, z = r[1] + (r[3] - r[1]) * fz, ci = nearestWalkable(nav, x, z); if (ci < 0) continue;
        const px = (ci % W) + 0.5, pz = ((ci / W) | 0) + 0.5; list.push([px, pz, ...look(px, pz)]);
      }
      def.holds[k] = list.length ? list : [[c[0], c[1], ...look(c[0], c[1])]];
    }
    if (!def.holds.A) def.holds.A = def.holds[sites[0]] || [[ctC[0], ctC[1], tC[0], tC[1]]];
    if (!def.holds.B) def.holds.B = def.holds[sites[1]] || def.holds.A;
    const mid = nearestWalkable(nav, (tC[0] + ctC[0]) / 2, (tC[1] + ctC[1]) / 2);
    def.holds.MID = [[(mid % W) + 0.5, ((mid / W) | 0) + 0.5, ...look((mid % W) + 0.5, ((mid / W) | 0) + 0.5)]];
  }
  if (force || !Array.isArray(def.callouts) || !def.callouts.length) {
    def.callouts = [];
    for (const k of sites) def.callouts.push([k + ' Site', ...def.sites[k]]);
    def.callouts.push(['T Spawn', ...def.buy.T], ['CT Spawn', ...def.buy.CT]);
  }
  return def;
}

// Returns [{level:'error'|'warn'|'info', msg, at?:[x,z]}]
export function validateMap(m) {
  const def = m.def, { W, H } = m, out = [];
  const add = (level, msg, at) => out.push({ level, msg, at });
  const nav = buildNav(m);
  const walkAt = (x, z) => { const cx = Math.floor(x), cz = Math.floor(z); return cx >= 0 && cz >= 0 && cx < W && cz < H && nav.walk[cz * W + cx] === 1; };
  for (const t of ['T', 'CT']) {
    const sp = def.spawns[t] || [];
    if (sp.length < 5) add('warn', `تعداد اسپاون ${t} فقط ${sp.length} است (حداقل ۵، ترجیحاً ۱۰)`);
    sp.forEach(([x, z], i) => { if (!walkAt(x + 0.5, z + 0.5)) add('error', `اسپاون ${t} #${i + 1} داخل دیوار یا فضای بسته است`, [x, z]); });
  }
  const sites = Object.keys(def.sites || {});
  if (!sites.length) add('error', 'هیچ سایت بمبی تعریف نشده (حداقل سایت A لازم است)');
  const tStart = (def.spawns.T || [])[0], ctStart = (def.spawns.CT || [])[0];
  const tCell = tStart ? Math.floor(tStart[1]) * W + Math.floor(tStart[0]) : -1, ctCell = ctStart ? Math.floor(ctStart[1]) * W + Math.floor(ctStart[0]) : -1;
  if (tCell >= 0 && ctCell >= 0 && nav.walk[tCell] && nav.walk[ctCell]) {
    const d = field(nav, null, [ctCell]);
    if (d[tCell] < 0) add('error', 'اسپاون T به اسپاون CT راه ندارد (مپ دو تیکه است)', tStart);
    else add('info', `طول مسیر T→CT حدود ${Math.round(d[tCell] / 10)} متر`);
    for (const k of sites) {
      const r = def.sites[k], c = rectCenter(r), ci = Math.floor(c[1]) * W + Math.floor(c[0]);
      let cell = nearestWalkable(nav, c[0], c[1]);
      if (cell < 0) { add('error', `سایت ${k} هیچ خانه‌ی قابل‌ایستادنی ندارد`, c); continue; }
      const f = field(nav, null, [cell]);
      if (f[tCell] < 0) add('error', `سایت ${k} از اسپاون T قابل‌دسترس نیست`, c);
      if (f[ctCell] < 0) add('error', `سایت ${k} از اسپاون CT قابل‌دسترس نیست`, c);
      if (f[tCell] >= 0 && f[ctCell] >= 0) { const a = f[tCell] / 10, b = f[ctCell] / 10; add(Math.abs(a - b) > Math.max(40, Math.max(a, b) * 0.6) ? 'warn' : 'info', `سایت ${k}: ${Math.round(a)} متر از T، ${Math.round(b)} متر از CT`, c); }
    }
  }
  for (const [x, z, w, d] of def.crates || []) { const i = z * W + x; if (x < 0 || z < 0 || x >= W || z >= H || m.floor[i] >= WALL) add('warn', 'یک بلوک/جعبه روی دیوار یا بیرون از مپ است', [x, z]); }
  let open = 0; for (let i = 0; i < W * H; i++) if (nav.walk[i]) open++;
  add('info', `${open.toLocaleString('en')} خانه‌ی قابل‌راه‌رفتن (${Math.round(open / (W * H) * 100)}٪ مپ)`);
  if (!def.routes || !Object.keys(def.routes).length) add('info', 'مسیر ربات‌ها ذخیره نشده؛ هنگام لود مپ، خودکار ساخته می‌شود (یا دکمه‌ی «ساخت خودکار مسیر ربات» را بزن تا ببینی و دستی اصلاح کنی)');
  return out;
}
