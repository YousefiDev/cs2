// Chunked, streamed 3D world for a shared map.
//  * The map is cut into 16 m chunks. A chunk's geometry is only built when it is in front of the camera,
//    close enough, and not hidden behind walls (grid line-of-sight test); chunks nobody sees are freed again.
//  * Facade detail (cornices, skirting, windows), props, solid blocks, decals and lamps are merged into the chunk meshes.
//  * Only the nearest few lamps own a real PointLight, so light count (and shader cost) stays constant.
import * as THREE from 'three';
import { WALL, WALL_TOP } from '/shared/constants.js';
import { MAT, vnoise, wallHeights } from '/shared/maps.js';
import { resolveTheme } from '/shared/mapkit.js';
import { heightAt } from '/shared/physics.js';
import * as TX from './textures.js';
import { Geo, hexRGB, mulRGB } from './geo.js';
import { emitProp, emitBlock } from './props.js';

const CH = 16;
const QCFG = {
  high: { near: 30, bpf: 3, keep: 4, maxBuilt: 240, lamps: 6, windows: true, view: 1, aniso: 16 },
  medium: { near: 22, bpf: 2, keep: 3, maxBuilt: 120, lamps: 3, windows: true, view: 0.8, aniso: 8 },
  low: { near: 15, bpf: 1, keep: 2, maxBuilt: 60, lamps: 0, windows: false, view: 0.55, aniso: 2 },
};
const WALL_KEY = { blocks: 'blocks', plaster: 'plaster', brick: 'brick', concrete: 'concretew', metal: 'metalw' };
const FLOOR_KEY = { [MAT.SAND]: 'sand', [MAT.TILE]: 'tile', [MAT.TUNNEL]: 'tunnel', [MAT.PLANK]: 'plank', [MAT.DARK]: 'dark', [MAT.COBBLE]: 'cobble', [MAT.CRATE]: 'sand', [MAT.GRASS]: 'grass', [MAT.CONCRETE]: 'concrete', [MAT.METAL]: 'metalf', [MAT.SNOW]: 'snow', [MAT.ASPHALT]: 'asphalt' };
const DIRS = [[0, -1, [0, 0, -1]], [0, 1, [0, 0, 1]], [-1, 0, [-1, 0, 0]], [1, 0, [1, 0, 0]]];
const hsh = (x, z, s = 0) => { const v = Math.sin(x * 12.9898 + z * 78.233 + s * 37.719) * 43758.5453; return v - Math.floor(v); };
const shadeHex = (h, k) => { const [r, g, b] = hexRGB(h); const c = (v) => Math.max(0, Math.min(255, Math.round(v * k * 255))).toString(16).padStart(2, '0'); return '#' + c(r) + c(g) + c(b); };

function greedy(x0, z0, x1, z1, keyAt, emit) {
  const w0 = x1 - x0, seen = new Uint8Array(w0 * (z1 - z0)), at = (x, z) => (z - z0) * w0 + (x - x0);
  for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
    const i = at(x, z); if (seen[i]) continue; const k = keyAt(x, z); if (k === null) { seen[i] = 1; continue; }
    let w = 1; while (x + w < x1 && !seen[i + w] && keyAt(x + w, z) === k) w++;
    let h = 1; grow: while (z + h < z1) { for (let q = 0; q < w; q++) { if (seen[at(x + q, z + h)] || keyAt(x + q, z + h) !== k) break grow; } h++; }
    for (let a = 0; a < h; a++) for (let b = 0; b < w; b++) seen[at(x + b, z + a)] = 1;
    emit(x, z, w, h, k);
  }
}
// box clipped to a chunk range; side faces are only drawn where they lie on the box's true outline
function clippedBox(g, R, x0, y0, z0, x1, y1, z1, tile, c, bottom) {
  const a = Math.max(x0, R[0]), b = Math.min(x1, R[2]), cz0 = Math.max(z0, R[1]), cz1 = Math.min(z1, R[3]); if (a >= b || cz0 >= cz1) return;
  g.floor(a, cz0, b, cz1, y1, y1, y1, y1, tile, mulRGB(Array.isArray(c) ? c : [c, c, c], 1.05));
  if (bottom) g.floor(a, cz0, b, cz1, y0, y0, y0, y0, tile, mulRGB(Array.isArray(c) ? c : [c, c, c], 0.6), true);
  const k = Array.isArray(c) ? c : [c, c, c], side = mulRGB(k, 0.8);
  if (z0 >= R[1]) g.wall(a, z0, b, z0, [0, 0, -1], y0, y0, y1, y1, tile, side, k);
  if (z1 <= R[3]) g.wall(a, z1, b, z1, [0, 0, 1], y0, y0, y1, y1, tile, side, k);
  if (x0 >= R[0]) g.wall(x0, cz0, x0, cz1, [-1, 0, 0], y0, y0, y1, y1, tile, side, k);
  if (x1 <= R[2]) g.wall(x1, cz0, x1, cz1, [1, 0, 0], y0, y0, y1, y1, tile, side, k);
}

export function buildWorld(scene, m, opts = {}) {
  const root = new THREE.Group(); root.name = 'world'; scene.add(root);
  const th = resolveTheme(m.def.theme); const { W, H } = m;
  let quality = opts.quality || (opts.low ? 'low' : 'high'); let Q = QCFG[quality] || QCFG.high;
  const streaming = opts.stream !== false;
  const wh = wallHeights(m), isWall = (x, z) => x < 0 || z < 0 || x >= W || z >= H || m.heights[z * W + x] >= WALL;
  const wallH = (x, z) => (x < 0 || z < 0 || x >= W || z >= H ? 0 : wh[z * W + x]);
  const wStyles = (th.wallStyle || ['blocks', 'plaster']).map((k) => WALL_KEY[k] || 'blocks');
  const style = (x, z) => (vnoise(x / 9 + 50, z / 9 + 50, 3) > 0.52 ? wStyles[1] || wStyles[0] : wStyles[0]);
  const trimRGB = hexRGB(th.trim || '#b98f5a'), isNight = !!th.night;

  // ---------- materials (textures are generated lazily, only for what the map really uses) ----------
  const tile = th.tile || shadeHex(th.floor, 1.0), PBR = {
    blocks: () => [TX.sandstone(th.wall, 7), 0.88, 0.72], plaster: () => [TX.plaster(th.plaster, 3), 0.92, 0.52],
    brick: () => [TX.surface('brick', th.brick || '#9c5b45', 4), 0.9, 0.8], concretew: () => [TX.surface('concrete', th.wall, 11), 0.95, 0.5], metalw: () => [TX.surface('metal', th.wall2, 12), 0.5, 0.45],
    sand: () => [TX.ground(th.floor, 11), 0.98, 0.34], tile: () => [TX.pavers(tile, 5, 4), 0.84, 0.62], tunnel: () => [TX.pavers(shadeHex(th.floor, 0.85), 9, 3), 0.9, 0.5],
    plank: () => [TX.pavers('#a07a4e', 15, 6), 0.78, 0.7], dark: () => [TX.ground(shadeHex(th.floor, 0.92), 17), 0.98, 0.32], cobble: () => [TX.cobble(shadeHex(th.floor, 0.95), 21), 0.86, 0.82],
    grass: () => [TX.surface('grass', th.grass || '#5f8a3a', 6), 1, 0.3], concrete: () => [TX.surface('concrete', '#9a9a98', 8), 0.95, 0.5], metalf: () => [TX.surface('grating', '#8c9399', 9), 0.5, 0.6],
    snow: () => [TX.surface('snow', '#eef3f8', 10), 1, 0.2], asphalt: () => [TX.surface('asphalt', '#3a3c40', 13), 0.96, 0.5],
    crate: () => [TX.crate(31), 0.78, 0.62], cont: () => [TX.surface('metal', '#ffffff', 14), 0.55, 0.4],
  };
  const mats = {}, texList = [];
  const mat = (key) => {
    if (mats[key]) return mats[key];
    let M;
    if (PBR[key]) { const [map, rough, str] = PBR[key](); map.anisotropy = Q.aniso; texList.push(map); const nm = quality === 'low' ? null : TX.normalFrom(map, str); if (nm) texList.push(nm); M = new THREE.MeshStandardMaterial({ map, normalMap: nm, normalScale: new THREE.Vector2(0.42, 0.42), roughness: rough, metalness: key === 'cont' || key === 'metalw' ? 0.25 : 0, vertexColors: true }); }
    else if (key === 'solid') M = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: false });
    else if (key === 'beam') M = new THREE.MeshStandardMaterial({ color: '#5a3d22', roughness: 0.82, vertexColors: true });
    else if (key === 'glass') M = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.4, polygonOffset: true, polygonOffsetFactor: -1 });
    else if (key === 'lit') M = new THREE.MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1 });
    else if (key === 'bulb') M = new THREE.MeshBasicMaterial({ vertexColors: true });
    else if (key === 'decal') M = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    else if (key === 'contact') { const t = TX.radial('rgba(25,18,10,0.42)', 'rgba(25,18,10,0)'); texList.push(t); M = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0.75, vertexColors: true }); }
    else M = mat('blocks');
    mats[key] = M; return M;
  };
  const NO_SHADOW = new Set(['contact', 'glass', 'lit', 'bulb', 'decal']);

  // ---------- spatial buckets (built once; chunk builds are then O(local)) ----------
  const CX = Math.ceil(W / CH), CZ = Math.ceil(H / CH);
  const cid = (x, z) => Math.max(0, Math.min(CZ - 1, Math.floor(z / CH))) * CX + Math.max(0, Math.min(CX - 1, Math.floor(x / CH)));
  const lists = { crates: [], props: [], lamps: [], roofs: [], ramps: [], decals: [], sites: [] };
  const chunks = [];
  for (let cz = 0; cz < CZ; cz++) for (let cx = 0; cx < CX; cx++) { const o = { id: cz * CX + cx, cx, cz, R: [cx * CH, cz * CH, Math.min(W, cx * CH + CH), Math.min(H, cz * CH + CH)], built: false, group: null, tris: 0, lastSeen: -1e9, shown: false, ymin: 1e9, ymax: -1e9, c: { crates: [], props: [], lamps: [], roofs: [], ramps: [], decals: [] } }; chunks.push(o); }
  const put = (kind, x, z, v) => chunks[cid(x, z)].c[kind].push(v);
  for (const c of m.crates) put('crates', c.x + c.w / 2, c.z + c.d / 2, c);
  for (const p of m.def.props || []) put('props', p[1], p[2], p);
  const lampList = [];
  for (const l of m.def.lamps || []) lampList.push({ x: l[0], z: l[1], y: l[2], color: l[3] || '#ffc78a', power: l[4] ?? 1, range: l[5] ?? 13 });
  for (const p of m.def.props || []) if (p[0] === 'lamppost') lampList.push({ x: p[1] + 0.7 * (p[4] || 1) * Math.cos(p[3] || 0), z: p[2] - 0.7 * (p[4] || 1) * Math.sin(p[3] || 0), y: Math.max(0, heightAt(m, p[1], p[2])) + 3.9 * (p[4] || 1), color: '#ffd9a0', power: 1, range: 14 });
  for (const l of lampList) put('lamps', l.x, l.z, l);
  for (const r of m.def.roofs || []) { const x0 = Math.floor(r[0] / CH), x1 = Math.floor((r[2] - 0.01) / CH), z0 = Math.floor(r[1] / CH), z1 = Math.floor((r[3] - 0.01) / CH); for (let a = z0; a <= z1; a++) for (let b = x0; b <= x1; b++) if (chunks[a * CX + b]) chunks[a * CX + b].c.roofs.push(r); }
  for (const r of m.ramps) { const x0 = Math.floor(r.x0 / CH), x1 = Math.floor((r.x1 - 0.01) / CH), z0 = Math.floor(r.z0 / CH), z1 = Math.floor((r.z1 - 0.01) / CH); for (let a = z0; a <= z1; a++) for (let b = x0; b <= x1; b++) if (chunks[a * CX + b]) chunks[a * CX + b].c.ramps.push(r); }
  for (const d of m.def.decals || []) { const x0 = Math.floor(d[0] / CH), x1 = Math.floor((d[2] - 0.01) / CH), z0 = Math.floor(d[1] / CH), z1 = Math.floor((d[3] - 0.01) / CH); for (let a = Math.max(0, z0); a <= Math.min(CZ - 1, z1); a++) for (let b = Math.max(0, x0); b <= Math.min(CX - 1, x1); b++) chunks[a * CX + b].c.decals.push(d); }
  for (const ch of chunks) { // vertical extent (for culling)
    for (let z = ch.R[1]; z < ch.R[3]; z++) for (let x = ch.R[0]; x < ch.R[2]; x++) { const i = z * W + x; if (m.heights[i] >= WALL) { ch.ymax = Math.max(ch.ymax, wh[i]); ch.ymin = Math.min(ch.ymin, 0); } else { ch.ymin = Math.min(ch.ymin, m.floor[i]); ch.ymax = Math.max(ch.ymax, m.heights[i] + 3, m.ceil[i] < 1e8 ? WALL_TOP : 0); } }
    for (const c of ch.c.crates) ch.ymax = Math.max(ch.ymax, c.base + c.h + 1);
    for (const p of ch.c.props) ch.ymax = Math.max(ch.ymax, 7);
    if (ch.ymin > ch.ymax) { ch.ymin = 0; ch.ymax = 4; }
  }

  // ---------- chunk geometry ----------
  const ctx = { G: null, m, th, heightAt };
  function buildChunk(ch) {
    const geos = {}; const G = (k) => (geos[k] = geos[k] || new Geo()); ctx.G = G; const R = ch.R; const [x0, z0, x1, z1] = R;
    const faces = [];
    for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
      if (!isWall(x, z)) continue; const hc = wh[z * W + x];
      for (let di = 0; di < 4; di++) {
        const [dx, dz, n] = DIRS[di]; const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
        let bot, nf = null;
        if (isWall(nx, nz)) { const hn = wallH(nx, nz); if (hn >= hc) continue; bot = hn; } else { nf = m.floor[nz * W + nx]; bot = Math.min(nf, m.heights[nz * W + nx]) - 0.4; }
        const ex = dx === 1 ? x + 1 : x, ez = dz === 1 ? z + 1 : z;
        const ax = dx === 0 ? x : ex, bx = dx === 0 ? x + 1 : ex, az = dz === 0 ? z : ez, bz = dz === 0 ? z + 1 : ez;
        const sk = style(x, z), g = G(sk);
        if (nf !== null) { const mid = Math.min(hc, nf + 1.3); g.wall(ax, az, bx, bz, n, bot, bot, mid, mid, 4, 0.55, 0.95); g.wall(ax, az, bx, bz, n, mid, mid, hc, hc, 4, 0.95, 1.06); faces.push({ di, x, z, hc, nf, sk }); }
        else g.wall(ax, az, bx, bz, n, bot, bot, hc, hc, 4, 0.92, 1.05);
      }
    }
    // facade: cornice + skirting as merged runs, plus occasional windows
    const runs = new Map();
    for (const f of faces) { const horiz = DIRS[f.di][1] !== 0, line = horiz ? f.z : f.x, pos = horiz ? f.x : f.z, key = f.di + '|' + line + '|' + f.hc + '|' + f.nf; let r = runs.get(key); if (!r) runs.set(key, r = { f, list: [] }); r.list.push(pos); }
    const S = G('solid'), cornice = mulRGB(trimRGB, 1.0), skirt = mulRGB(trimRGB, 0.72);
    for (const r of runs.values()) {
      r.list.sort((a, b) => a - b); const f = r.f, [dx, dz] = DIRS[f.di];
      let s = r.list[0], prev = s; const flush = (a, b) => { // cells a..b (inclusive) contiguous
        const off = 0.12, plane = dz !== 0 ? (dz === 1 ? f.z + 1 : f.z) : (dx === 1 ? f.x + 1 : f.x);
        const box = (yb, yt, o, c) => { if (dz !== 0) S.box(a, yb, dz === 1 ? plane : plane - o, b + 1, yt, dz === 1 ? plane + o : plane, 1, c, false); else S.box(dx === 1 ? plane : plane - o, yb, a, dx === 1 ? plane + o : plane, yt, b + 1, 1, c, false); };
        box(f.hc - 0.34, f.hc + 0.02, off, cornice);
        if (f.nf !== null && f.hc - f.nf > 3) box(f.nf - 0.2, f.nf + 0.38, 0.07, skirt);
      };
      for (let k = 1; k < r.list.length; k++) { if (r.list[k] !== prev + 1) { flush(s, prev); s = r.list[k]; } prev = r.list[k]; } flush(s, prev);
    }
    if (Q.windows && th.windows !== false) for (const f of faces) {
      if (f.sk === 'metalw' || f.hc - f.nf < 4.2) continue; const [dx, dz] = DIRS[f.di];
      const hv = hsh(f.x, f.z, f.di); if (hv > 0.2) continue;
      const side = dz !== 0 ? [[f.x - 1, f.z], [f.x + 1, f.z]] : [[f.x, f.z - 1], [f.x, f.z + 1]];
      if (!side.every(([sx, sz]) => isWall(sx, sz) && !isWall(sx + dx, sz + dz))) continue;
      const lit = isNight && hsh(f.x, f.z, 7) < 0.45, gy = f.nf + 2.1 + hsh(f.x, f.z, 2) * 0.5, gh = 1.15, gw = 0.62;
      const px = dz !== 0 ? f.x + 0.5 : (dx === 1 ? f.x + 1.025 : f.x - 0.025), pz = dz !== 0 ? (dz === 1 ? f.z + 1.025 : f.z - 0.025) : f.z + 0.5;
      const a = dz !== 0 ? [px - gw / 2, pz] : [px, pz - gw / 2], b = dz !== 0 ? [px + gw / 2, pz] : [px, pz + gw / 2];
      const gc = lit ? [0.62, 0.44, 0.2] : [0.1 + hsh(f.x, f.z, 5) * 0.06, 0.14, 0.19];
      G(lit ? 'lit' : 'glass').wall(a[0], a[1], b[0], b[1], DIRS[f.di][2], gy, gy, gy + gh, gy + gh, 1, gc, gc);
      if (dz !== 0) { S.box(px - gw / 2 - 0.07, gy - 0.07, dz === 1 ? pz - 0.03 : pz - 0.09, px + gw / 2 + 0.07, gy, dz === 1 ? pz + 0.09 : pz + 0.03, 1, mulRGB(trimRGB, 0.9), false); S.box(px - gw / 2 - 0.05, gy + gh, dz === 1 ? pz - 0.03 : pz - 0.07, px + gw / 2 + 0.05, gy + gh + 0.1, dz === 1 ? pz + 0.07 : pz + 0.03, 1, trimRGB, false); }
      else { S.box(dx === 1 ? px - 0.03 : px - 0.09, gy - 0.07, pz - gw / 2 - 0.07, dx === 1 ? px + 0.09 : px + 0.03, gy, pz + gw / 2 + 0.07, 1, mulRGB(trimRGB, 0.9), false); S.box(dx === 1 ? px - 0.03 : px - 0.07, gy + gh, pz - gw / 2 - 0.05, dx === 1 ? px + 0.07 : px + 0.03, gy + gh + 0.1, pz + gw / 2 + 0.05, 1, trimRGB, false); }
    }
    // roof tops of solid cells
    greedy(x0, z0, x1, z1, (x, z) => (isWall(x, z) ? wh[z * W + x] + ':' + style(x, z) : null), (x, z, w, h) => { const y = wh[z * W + x]; G(style(x, z)).floor(x, z, x + w, z + h, y, y, y, y, 4, 1.08); });
    // floors (merged), darker under roofs
    greedy(x0, z0, x1, z1, (x, z) => { const i = z * W + x; if (isWall(x, z) || m.rampIdx[i] >= 0) return null; return m.floor[i] + ':' + (FLOOR_KEY[m.mat[i]] || 'sand') + ':' + (m.ceil[i] < 1e8 ? 1 : 0); },
      (x, z, w, h, k) => { const [y, mk, roof] = k.split(':'); const v = +y; G(mk).floor(x, z, x + w, z + h, v, v, v, v, mk === 'tile' || mk === 'tunnel' ? 3 : 4, roof === '1' ? 0.62 : 1); });
    for (const r of ch.c.ramps) {
      const hx = (x, z) => (r.axis === 'x' ? r.h0 + (r.h1 - r.h0) * (x - r.x0) / (r.x1 - r.x0) : r.h0 + (r.h1 - r.h0) * (z - r.z0) / (r.z1 - r.z0));
      const ax = Math.max(r.x0, x0), bx = Math.min(r.x1, x1), az = Math.max(r.z0, z0), bz = Math.min(r.z1, z1); if (ax >= bx || az >= bz) continue;
      const i = r.z0 * W + r.x0, mk = FLOOR_KEY[m.mat[i]] || 'sand', roof = m.ceil[i] < 1e8 ? 0.62 : 1;
      G(mk).floor(ax, az, bx, bz, hx(ax, az), hx(bx, az), hx(bx, bz), hx(ax, bz), 3, roof);
    }
    // step faces between floor levels
    for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
      const i = z * W + x; if (isWall(x, z) || m.mat[i] === MAT.CRATE) continue;
      for (const [dx, dz, n] of DIRS) {
        const nx = x + dx, nz = z + dz; if (isWall(nx, nz)) continue; const j = nz * W + nx; if (m.mat[j] === MAT.CRATE) continue;
        const ax = dx === 1 ? x + 1 : x, az = dz === 1 ? z + 1 : z, bx = dx === 0 ? x + 1 : ax, bz = dz === 0 ? z + 1 : az;
        const inset = 0.02, ix = -dx * inset, iz = -dz * inset;
        const ta = heightAt(m, ax + ix + (dx === 0 ? 0.01 : 0), az + iz + (dz === 0 ? 0.01 : 0)), tb = heightAt(m, bx + ix - (dx === 0 ? 0.01 : 0), bz + iz - (dz === 0 ? 0.01 : 0));
        const ba = heightAt(m, ax - ix + (dx === 0 ? 0.01 : 0), az - iz + (dz === 0 ? 0.01 : 0)), bb = heightAt(m, bx - ix - (dx === 0 ? 0.01 : 0), bz - iz - (dz === 0 ? 0.01 : 0));
        if (ta - ba < 0.02 && tb - bb < 0.02) continue;
        G(wStyles[0]).wall(ax, az, bx, bz, n, Math.min(ba, ta), Math.min(bb, tb), ta, tb, 4, 0.7, 0.9);
      }
    }
    // tunnel roofs / archways with beams
    for (const [rx0, rz0, rx1, rz1, c] of ch.c.roofs) {
      const top = Math.max(c + 1.6, WALL_TOP - 0.8), g = G(wStyles[1] || wStyles[0]);
      clippedBox(g, R, rx0, c, rz0, rx1, top, rz1, 4, 1, false);
      const a = Math.max(rx0, x0), b = Math.min(rx1, x1), cz0 = Math.max(rz0, z0), cz1 = Math.min(rz1, z1);
      if (a < b && cz0 < cz1) g.floor(a, cz0, b, cz1, c, c, c, c, 4, 0.5, true);
      const beam = G('beam'), bc = hexRGB('#6b4a2c');
      if ((rx1 - rx0) > (rz1 - rz0)) { for (let x = rx0 + 1.5; x < rx1 - 0.5; x += 3) if (x >= x0 && x < x1) beam.box(x - 0.15, c - 0.32, cz0, x + 0.15, c, cz1, 1, bc, false); }
      else for (let z = rz0 + 1.5; z < rz1 - 0.5; z += 3) if (z >= z0 && z < z1) beam.box(a, c - 0.32, z - 0.15, b, c, z + 0.15, 1, bc, false);
    }
    // solid blocks + contact shadows, props, decals, lamp bulbs
    for (const c of ch.c.crates) { emitBlock(ctx, c); if (quality === 'high') { const s = Math.min(5.5, Math.max(c.w, c.d) * 0.95), cx = c.x + c.w / 2, cz = c.z + c.d / 2; G('contact').quad([cx - s / 2, c.base + 0.012, cz + s / 2], [cx + s / 2, c.base + 0.012, cz + s / 2], [cx + s / 2, c.base + 0.012, cz - s / 2], [cx - s / 2, c.base + 0.012, cz - s / 2], [0, 1, 0], [[0, 1], [1, 1], [1, 0], [0, 0]], [1, 1, 1]); } }
    for (const p of ch.c.props) if (!(p[0] === 'wires' && quality === 'low')) emitProp(ctx, p);
    for (const d of ch.c.decals) {
      const col = hexRGB(d[4] || '#e8e2c8'), dg = G('decal');
      for (let z = Math.max(z0, Math.floor(d[1])); z < Math.min(z1, Math.ceil(d[3])); z++) for (let x = Math.max(x0, Math.floor(d[0])); x < Math.min(x1, Math.ceil(d[2])); x++) { const i = z * W + x; if (isWall(x, z) || m.rampIdx[i] >= 0) continue; const y = m.floor[i] + 0.012, ax = Math.max(x, d[0]), bx = Math.min(x + 1, d[2]), az = Math.max(z, d[1]), bz = Math.min(z + 1, d[3]); dg.quad([ax, y, bz], [bx, y, bz], [bx, y, az], [ax, y, az], [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], col); }
    }
    for (const l of ch.c.lamps) G('bulb').box(l.x - 0.12, l.y - 0.52, l.z - 0.12, l.x + 0.12, l.y - 0.28, l.z + 0.12, 1, hexRGB(l.color), false);
    // ---- turn buffers into meshes ----
    const grp = new THREE.Group(); let tris = 0;
    for (const k in geos) { const g = geos[k]; if (!g.i.length) continue; const mesh = g.mesh(mat(k), !NO_SHADOW.has(k)); if (k === 'contact') mesh.renderOrder = 1; grp.add(mesh); tris += g.tris; }
    grp.matrixAutoUpdate = false; ch.group = grp; ch.tris = tris; ch.built = true; root.add(grp);
  }
  function freeChunk(ch) { if (!ch.group) return; root.remove(ch.group); ch.group.traverse((o) => o.geometry?.dispose?.()); ch.group = null; ch.built = false; ch.tris = 0; ch.shown = false; }

  // ---------- visibility: view cone + distance + grid line-of-sight ----------
  const roofTop = (c) => Math.max(c + 1.6, WALL_TOP - 0.8);
  function blocked(ex, ey, ez, tx, ty, tz) {
    // 2D grid DDA; a cell blocks only when the ray is *certainly* inside solid material
    const dx = tx - ex, dz = tz - ez; let cx = Math.floor(ex), cz = Math.floor(ez); const tcx = Math.floor(tx), tcz = Math.floor(tz);
    const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1, ndx = Math.abs(dx) < 1e-9 ? 1e9 : Math.abs(1 / dx), ndz = Math.abs(dz) < 1e-9 ? 1e9 : Math.abs(1 / dz);
    let tMaxX = (dx > 0 ? cx + 1 - ex : ex - cx) * ndx, tMaxZ = (dz > 0 ? cz + 1 - ez : ez - cz) * ndz, tPrev = 0;
    for (let guard = 0; guard < 600; guard++) {
      if (cx === tcx && cz === tcz) return false;
      const tNext = Math.min(tMaxX, tMaxZ, 1); const y0 = ey + (ty - ey) * tPrev, y1 = ey + (ty - ey) * tNext, lo = Math.min(y0, y1), hi = Math.max(y0, y1);
      if (guard > 0) {
        if (cx < 0 || cz < 0 || cx >= W || cz >= H) return false; const i = cz * W + cx;
        if (m.heights[i] >= WALL) { if (hi < wh[i]) return true; }
        else { if (hi < m.floor[i] - 0.05) return true; if (m.ceil[i] < 1e8 && lo > m.ceil[i] && hi < roofTop(m.ceil[i])) return true; }
      }
      if (tNext >= 1) return false; tPrev = tNext;
      if (tMaxX < tMaxZ) { cx += sx; tMaxX += ndx; } else { cz += sz; tMaxZ += ndz; }
    }
    return false;
  }
  const eyes = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  // Sample targets per chunk (built once): a 4x4 lattice of cells (wall tops or floor level) + every crate/prop in the chunk,
  // so even a small object seen through a narrow gap keeps its chunk alive.
  function samplesOf(ch) {
    if (ch.samples) return ch.samples; const out = [], faceS = [], [x0, z0, x1, z1] = ch.R;
    for (let b = 0; b < 4; b++) for (let a = 0; a < 4; a++) {
      const x = Math.min(x1 - 1, x0 + 1 + a * 4), z = Math.min(z1 - 1, z0 + 1 + b * 4), i = z * W + x;
      if (m.heights[i] >= WALL) out.push([x + 0.5, wh[i] - 0.1, z + 0.5]);
      else { out.push([x + 0.5, m.floor[i] + 0.5, z + 0.5]); out.push([x + 0.5, m.floor[i] + 2.4, z + 0.5]); }
    }
    // wall faces that border open space (what the player actually sees of a building): aim 0.1 m in front of the face
    for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
      if (m.heights[z * W + x] < WALL) continue;
      for (const [dx, dz] of DIRS) { const nx = x + dx, nz = z + dz; if (isWall(nx, nz)) continue; const nf = m.floor[nz * W + nx], top = wh[z * W + x], px = x + 0.5 + dx * 0.6, pz = z + 0.5 + dz * 0.6; faceS.push([px, nf + 1.4, pz], [px, nf + Math.max(1.6, Math.min(top - nf - 0.3, 5)), pz], [px, top - 0.25, pz]); }
    }
    const stride = Math.max(1, Math.ceil(faceS.length / 90)); for (let k = 0; k < faceS.length; k += stride) out.push(faceS[k]);
    for (const c of ch.c.crates) out.push([c.x + c.w / 2, c.base + c.h * 0.6, c.z + c.d / 2], [c.x + c.w / 2, c.base + c.h + 0.1, c.z + c.d / 2]);
    for (const p of ch.c.props) out.push([p[1], Math.max(0, heightAt(m, p[1], p[2])) + 1.4, p[2]]);
    for (const l of ch.c.lamps) out.push([l.x, l.y, l.z]);
    ch.samples = out.length > 180 ? out.filter((_, k) => k % Math.ceil(out.length / 180) === 0) : out; return ch.samples;
  }
  function chunkVisible(ch, ey) {
    for (const [px, py, pz] of samplesOf(ch)) for (const eye of eyes) if (!blocked(eye[0], ey, eye[2], px, py, pz)) return true;
    return false;
  }
  // ---------- statics: outside ground, horizon, sky, lights ----------
  const outsideKey = th.groundMat && PBR[th.groundMat] ? th.groundMat : 'sand';
  const og = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ map: (() => { const [t] = PBR[outsideKey](); t.repeat.set(140, 140); texList.push(t); return t; })(), roughness: 1 }));
  og.rotation.x = -Math.PI / 2; og.position.set(W / 2, -0.6, H / 2); og.receiveShadow = true; root.add(og);
  {
    const hz = th.horizon || 'dunes'; const pos = [], col = [], seg = 96, R0 = Math.max(230, Math.max(W, H) * 0.9);
    const base = hz === 'forest' ? hexRGB('#44683c') : hz === 'mountains' ? hexRGB('#8d97a3') : hz === 'city' ? hexRGB(shadeHex(th.haze, 0.78)) : hexRGB('#cfa774');
    if (hz === 'city') {
      for (let s = 0; s < 70; s++) { const a = (s / 70) * Math.PI * 2 + hsh(s, 1) * 0.05, r = R0 + hsh(s, 2) * 50, w = 14 + hsh(s, 3) * 22, h = 25 + hsh(s, 4) * 70, cx = W / 2 + Math.cos(a) * r, cz = H / 2 + Math.sin(a) * r; const g = new Geo(); g.box(cx - w / 2, -1, cz - w / 2, cx + w / 2, h, cz + w / 2, 8, mulRGB(base, 0.85 + hsh(s, 5) * 0.3)); for (const k of g.i) { pos.push(g.p[k * 3], g.p[k * 3 + 1], g.p[k * 3 + 2]); col.push(g.c[k * 3], g.c[k * 3 + 1], g.c[k * 3 + 2]); } }
    } else {
      const amp = hz === 'mountains' ? 85 : hz === 'forest' ? 18 : 38, fr = hz === 'mountains' ? 2.2 : 6;
      for (let s = 0; s < seg; s++) {
        const a0 = (s / seg) * Math.PI * 2, a1 = ((s + 1) / seg) * Math.PI * 2, R = R0;
        const h0 = 14 + vnoise(s / fr, 3, 9) * amp, h1 = 14 + vnoise((s + 1) / fr, 3, 9) * amp;
        const P = (a, r, y) => [W / 2 + Math.cos(a) * r, y, H / 2 + Math.sin(a) * r];
        const tri = (A, B, C, k) => { pos.push(...A, ...B, ...C); for (let q = 0; q < 3; q++) col.push(...mulRGB(base, k[q])); };
        tri(P(a0, R, -1), P(a1, R, -1), P(a1, R + 30, h1), [0.8, 0.8, 1.05]); tri(P(a0, R, -1), P(a1, R + 30, h1), P(a0, R + 30, h0), [0.8, 1.05, 1.1]);
        if (hz === 'mountains') { const pk = (a, h) => P(a, R + 60, h + 45 + vnoise(a * 9, 2, 4) * 40); tri(P(a0, R + 30, h0), P(a1, R + 30, h1), pk((a0 + a1) / 2, (h0 + h1) / 2), [1.0, 1.0, 1.35]); }
      }
    }
    const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); hg.setAttribute('color', new THREE.Float32BufferAttribute(col.length ? col : pos.map(() => 1), 3));
    hg.computeVertexNormals();
    const hm = new THREE.Mesh(hg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide })); hm.frustumCulled = false; root.add(hm);
  }
  const sunDir = new THREE.Vector3(...(th.sunDir || [-0.45, 0.62, 0.64])).normalize();
  const skyTop = th.skyTop || shadeHex(th.sky, 0.7);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(skyTop) }, mid: { value: new THREE.Color(th.sky) }, hor: { value: new THREE.Color(th.haze) }, sun: { value: sunDir }, time: { value: 0 }, clouds: { value: opts.low || isNight ? 0.0 : 1.0 }, night: { value: isNight ? 1.0 : 0.0 } },
    vertexShader: 'varying vec3 vp; void main(){ vp = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 hor; uniform vec3 sun; uniform float time; uniform float clouds; uniform float night; varying vec3 vp;
      float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
      float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
      float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*n2(p); p*=2.03; a*=0.5; } return v; }
      void main(){ vec3 d = normalize(vp); float h = d.y; vec3 c = mix(hor, mid, smoothstep(0.0, 0.18, h)); c = mix(c, top, smoothstep(0.18, 0.75, h));
        float s = max(dot(d, sun), 0.0);
        if (clouds > 0.5 && h > 0.02) {
          vec2 uv = d.xz / (h + 0.18) * 1.6 + vec2(time * 0.006, time * 0.0025);
          float cl = smoothstep(0.52, 0.86, fbm(uv)) * smoothstep(0.02, 0.22, h);
          vec3 cc = mix(vec3(0.97,0.93,0.86), vec3(1.0,0.97,0.9), pow(s,4.0)); c = mix(c, cc, cl * 0.72);
        }
        if (night > 0.5) { vec2 g = floor(vec2(atan(d.z, d.x) * 90.0, asin(clamp(d.y,-1.0,1.0)) * 90.0)); float st = step(0.992, h21(g)) * smoothstep(0.08, 0.35, h) * (0.45 + 0.55 * h21(g + 7.0)); c += vec3(st); c += vec3(0.75,0.82,1.0) * pow(s, 400.0) * 1.5 + vec3(0.4,0.5,0.8) * pow(s, 12.0) * 0.12; }
        else c += vec3(1.0,0.86,0.6) * pow(s, 18.0) * 0.45 + vec3(1.0,0.95,0.85) * pow(s, 900.0) * 3.0 + vec3(1.0,0.8,0.55) * pow(s, 4.0) * 0.08;
        if (h < 0.0) c = hor * 0.92; gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), skyMat); sky.position.set(W / 2, 0, H / 2); sky.renderOrder = -1; sky.frustumCulled = false; root.add(sky);

  const fogNear0 = th.fogNear ?? 105, fogFar0 = th.fogFar ?? 520;
  scene.fog = new THREE.Fog(th.haze, fogNear0 * Q.view * 0.8, fogFar0 * Q.view);
  const hemi = new THREE.HemisphereLight(th.hemiSky || (isNight ? '#3a4a78' : '#cfe3ff'), th.hemiGround || shadeHex(th.floor, 0.8), isNight ? 0.95 : (opts.low ? 1.25 : 1.1)); root.add(hemi);
  const sunInt = () => (isNight ? 0.9 : quality === 'high' ? 3.25 : quality === 'medium' ? 3.0 : 2.75);
  const sun = new THREE.DirectionalLight(th.sun, sunInt()); sun.position.set(W / 2 - 60, 85, H / 2 + 75); sun.target.position.set(W / 2, 0, H / 2); root.add(sun, sun.target);
  const bounce = new THREE.DirectionalLight('#e8b47a', isNight ? 0.1 : 0.45); bounce.position.set(W / 2 + 60, 12, H / 2 - 75); bounce.target.position.set(W / 2, 0, H / 2); bounce.visible = quality !== 'low'; root.add(bounce, bounce.target);
  const SH = quality === 'high' ? 58 : 44;
  { sun.castShadow = quality !== 'low'; sun.shadow.mapSize.set(quality === 'high' ? 4096 : 2048, quality === 'high' ? 4096 : 2048); const sc = sun.shadow.camera; sc.left = -SH; sc.right = SH; sc.top = SH; sc.bottom = -SH; sc.near = 5; sc.far = 260; sc.updateProjectionMatrix(); sun.shadow.bias = -0.00035; sun.shadow.normalBias = 0.035; sun.shadow.radius = 2.5; }
  const sunOff = sunDir.clone().multiplyScalar(110);
  // real lights only for the nearest lamps (constant count => no shader recompiles)
  const lampLights = []; const lampBoost = (th.lampBoost || 1);
  for (let i = 0; i < 6; i++) { const l = new THREE.PointLight('#ffc78a', 0, 13, 1.8); l.visible = i < Q.lamps; root.add(l); lampLights.push(l); }
  function updateLamps(cam) {
    if (!lampList.length) return; const arr = lampList.map((l) => ({ l, d: (l.x - cam.x) ** 2 + (l.z - cam.z) ** 2 })).sort((a, b) => a.d - b.d);
    for (let i = 0; i < lampLights.length; i++) { const L = lampLights[i], e = arr[i]; if (!e || i >= Q.lamps || e.d > 45 * 45) { L.intensity = 0; continue; } L.position.set(e.l.x, e.l.y - 0.4, e.l.z); L.color.set(e.l.color); L.intensity = 6 * e.l.power * lampBoost; L.distance = e.l.range; }
  }
  let motes = null;
  if (!opts.low) {
    const N = 700, pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 36; pos[i * 3 + 1] = Math.random() * 7; pos[i * 3 + 2] = (Math.random() - 0.5) * 36; seed[i] = Math.random() * 6.28; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'); const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,236,200,1)'); gr.addColorStop(1, 'rgba(255,236,200,0)'); x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; texList.push(tex);
    motes = new THREE.Points(g, new THREE.PointsMaterial({ map: tex, size: 0.07, sizeAttenuation: true, transparent: true, opacity: isNight ? 0.25 : 0.55, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffe2b0' }));
    motes.frustumCulled = false; motes.visible = quality !== 'low'; motes.userData = { seed, base: pos.slice() }; root.add(motes);
  }
  // doors + bombsite graffiti (few objects, always present)
  const doorMeshes = [];
  const doorTex = (() => { const [t] = [TX.blueDoor(41)]; texList.push(t); return t; })();
  const doorMat = new THREE.MeshStandardMaterial({ map: doorTex, roughness: 0.66 });
  for (const d of m.doors || []) {
    const along = d.axis === 'z';
    const b = new THREE.Mesh(new THREE.BoxGeometry(along ? d.thick : d.len, d.h, along ? d.len : d.thick), doorMat); b.castShadow = true; b.receiveShadow = true;
    if (d.kind === 'auto') { const pivot = new THREE.Group(); pivot.position.set(d.hinge.x, d.y0 + d.h / 2, d.hinge.z); b.position.set(along ? 0 : d.u * d.len / 2, 0, along ? d.u * d.len / 2 : 0); pivot.add(b); root.add(pivot); doorMeshes.push({ d, pivot }); }
    else { b.position.set((d.x0 + d.x1) / 2, d.y0 + d.h / 2, (d.z0 + d.z1) / 2); root.add(b); }
  }
  for (const [k, r] of Object.entries(m.def.sites || {})) {
    let best = null; const cx = Math.floor((r[0] + r[2]) / 2);
    for (let z = r[1]; z < r[3]; z++) { if (isWall(cx, z - 1) && !isWall(cx, z)) { best = z; break; } }
    if (best === null) continue; const fy = m.floor[best * W + cx];
    const dm = new THREE.MeshStandardMaterial({ map: TX.siteDecal(k), transparent: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }); texList.push(dm.map);
    const d = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), dm); d.position.set(cx + 0.5, fy + 2.6, best + 0.02); root.add(d);
  }

  // ---------- per-frame streaming ----------
  const stat = { chunks: chunks.length, built: 0, visible: 0, tris: 0, builds: 0, frees: 0 };
  let t = 0, acc = 1, lastCam = null, lampAcc = 1; const _c = new THREE.Vector3(), _f = new THREE.Vector3();
  function refresh(cam, camObj) {
    const ex = cam.x, ey = cam.y, ez = cam.z; let fx = 0, fy = 0, fz = -1, halfDiag = 1.2;
    if (camObj) { camObj.getWorldDirection(_f); fx = _f.x; fy = _f.y; fz = _f.z; const vf = THREE.MathUtils.degToRad(camObj.fov || 75) / 2; halfDiag = Math.atan(Math.tan(vf) * Math.sqrt(1 + (camObj.aspect || 1.7) ** 2)); }
    const viewDist = scene.fog ? scene.fog.far : 500, margin = 0.38, now = t;
    eyes[0][0] = ex; eyes[0][2] = ez; const rx = -fz, rz = fx, rl = Math.hypot(rx, rz) || 1; eyes[1][0] = ex + rx / rl * 1.1; eyes[1][2] = ez + rz / rl * 1.1; eyes[2][0] = ex - rx / rl * 1.1; eyes[2][2] = ez - rz / rl * 1.1;
    const want = [];
    for (const ch of chunks) {
      const cx = (ch.R[0] + ch.R[2]) / 2, cz = (ch.R[1] + ch.R[3]) / 2, cy = (ch.ymin + ch.ymax) / 2, rad = Math.hypot(CH / 2 + 3, (ch.ymax - ch.ymin) / 2);
      const dx = cx - ex, dy = cy - ey, dz = cz - ez, dist = Math.hypot(dx, dy, dz); let vis = false;
      if (!streaming) vis = true;
      else if (dist - rad < viewDist) {
        const near = Math.hypot(dx, dz) < Q.near + CH * 0.7;
        if (near) vis = true;
        else { const cosA = (dx * fx + dy * fy + dz * fz) / (dist || 1), ang = Math.acos(Math.max(-1, Math.min(1, cosA))), sa = Math.asin(Math.min(1, rad / dist)); vis = ang - sa < halfDiag + margin && chunkVisible(ch, ey); }
      }
      if (vis) { ch.lastSeen = now; if (!ch.built) want.push([dist, ch]); }
      ch.wantShown = vis;
    }
    want.sort((a, b) => a[0] - b[0]);
    const budget = stat.built === 0 || !streaming ? 999 : Q.bpf;
    for (let i = 0; i < want.length && i < (budget === 999 ? want.length : budget * 3); i++) { buildChunk(want[i][1]); stat.builds++; if (budget !== 999 && i + 1 >= budget * 3) break; }
    let built = 0, visible = 0, tris = 0;
    for (const ch of chunks) {
      if (ch.built) {
        ch.group.visible = ch.wantShown; ch.shown = ch.wantShown;
        if (streaming && !ch.wantShown && now - ch.lastSeen > Q.keep) { freeChunk(ch); stat.frees++; continue; }
        built++; if (ch.wantShown) { visible++; tris += ch.tris; }
      }
    }
    if (streaming && built > Q.maxBuilt) { const idle = chunks.filter((c) => c.built && !c.wantShown).sort((a, b) => a.lastSeen - b.lastSeen); for (let i = 0; i < idle.length && built > Q.maxBuilt; i++, built--) { freeChunk(idle[i]); stat.frees++; } }
    stat.built = built; stat.visible = visible; stat.tris = tris;
  }
  function update(dt, cam, camObj) {
    for (const dm of doorMeshes) { const o = dm.d.open; dm.pivot.rotation.y = dm.d.swing * (o * o * (3 - 2 * o)) * Math.PI * 0.49; }
    t += dt; skyMat.uniforms.time.value = t; acc += dt; lampAcc += dt;
    if (cam) {
      // a quick turn or a moved camera triggers a refresh right away, otherwise ~12 times a second
      let force = !lastCam; if (camObj && lastCam) { camObj.getWorldDirection(_f); force = _f.dot(lastCam.dir) < 0.97 || Math.hypot(cam.x - lastCam.x, cam.z - lastCam.z) > 1.5; }
      if (force || acc > 0.085) { acc = 0; refresh(cam, camObj); lastCam = { x: cam.x, z: cam.z, dir: camObj ? camObj.getWorldDirection(new THREE.Vector3()) : new THREE.Vector3(0, 0, -1) }; }
      if (lampAcc > 0.2) { lampAcc = 0; updateLamps(cam); }
      if (sun.castShadow) { const step = (SH * 2) / sun.shadow.mapSize.x * 4; _c.set(Math.round(cam.x / step) * step, 0, Math.round(cam.z / step) * step); sun.target.position.copy(_c); sun.position.copy(_c).add(sunOff); sun.target.updateMatrixWorld(); }
      if (motes) { const p = motes.geometry.attributes.position, b = motes.userData.base, sd = motes.userData.seed; for (let i = 0; i < sd.length; i++) { let x = b[i * 3] + Math.sin(t * 0.21 + sd[i]) * 0.9 + t * 0.35, z = b[i * 3 + 2] + Math.cos(t * 0.17 + sd[i]) * 0.9 + t * 0.12; x = ((x - cam.x) % 36 + 54) % 36 - 18 + cam.x; z = ((z - cam.z) % 36 + 54) % 36 - 18 + cam.z; p.array[i * 3] = x; p.array[i * 3 + 1] = (b[i * 3 + 1] + Math.sin(t * 0.3 + sd[i] * 2) * 0.35) + Math.max(0, cam.y - 3); p.array[i * 3 + 2] = z; } p.needsUpdate = true; }
    }
  }
  function setQuality(q) {
    if (!QCFG[q] || q === quality) return; quality = q; Q = QCFG[q]; const low = q === 'low', high = q === 'high';
    if (scene.fog) { scene.fog.near = fogNear0 * Q.view * 0.8; scene.fog.far = fogFar0 * Q.view; }
    sun.intensity = sunInt(); sun.castShadow = !low; sun.shadow.mapSize.set(high ? 4096 : 2048, high ? 4096 : 2048); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    bounce.visible = !low; if (motes) { motes.visible = !low; motes.geometry.setDrawRange(0, high ? 700 : q === 'medium' ? 350 : 0); }
    lampLights.forEach((l, i) => { l.visible = i < Q.lamps; });
    for (const M of Object.values(mats)) if (M.normalMap) M.normalScale.set(low ? 0 : high ? 0.42 : 0.24, low ? 0 : high ? 0.42 : 0.24);
    for (const ch of chunks) freeChunk(ch); lastCam = null; acc = 1; // geometry depends on quality (windows, contact shadows)
  }
  // Build everything around a camera before the first frame (loading screen) so there is no pop-in at spawn.
  function warm(cam, camObj) { acc = 1; lastCam = null; refresh(cam, camObj); }
  function buildAll() { for (const ch of chunks) { if (!ch.built) buildChunk(ch); ch.group.visible = true; } }
  function dispose() {
    scene.remove(root); root.traverse((o) => { o.geometry?.dispose?.(); }); for (const M of Object.values(mats)) M.dispose?.(); for (const tx of texList) tx.dispose?.();
  }
  const stats = () => ({ ...stat, lamps: Math.min(Q.lamps, lampList.length) });
  return { root, mats, sun, sky, update, setQuality, warm, buildAll, dispose, stats, chunks, exposure: th.exposure, theme: th };
}
