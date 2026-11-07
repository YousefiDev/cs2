// Mesh (.bin + .json, "cs-map-bin") -> playable grid map definition.
//
// The game's physics is a 1 m grid (floor height + ceiling per cell, solid walls, boxes). A real mesh map such as Dust II
// has millions of triangles, so it is "baked" once into that grid; the original mesh is then only used for rendering
// (public/js/meshview.js). Runs in the browser (map editor) and in Node (tools/bin2map.mjs).
//
// Pipeline: voxelise (0.5 m x 0.25 m) -> drop junk objects (wires, doors, foliage ... by collider name) -> walkable floors
// (1.75 m headroom) -> flood from the dominant walkable area -> fill invisible floors -> boxes/cars as crates ->
// smoothing + slope limiter (ramps/stairs a 1 m cell can hold) -> roofs -> wall heights -> props -> spawns/sites.
const UP = 1, DN = 2, WL = 4, FL = 8, OCC = 7;
const CS = 0.5, VY = 0.25;
const INCH = 0.0254;
const JUNK = /blocklight|steam|lightshaft|palm_frond|wire|power_pole|hammer_mesh|lantern|satellite|chainlink|window_bars|ladder|cart_|awning|garbage|electric|breeze|dust_door_|rollupdoor|window_frame|windows_|kasbah_windows|window_insets|vents|braces|rope|ornament|trim_decoractive|metal_trim|grape_leaves|sagebrush|sumac|olive_branch|zebra_grass|weeds|agave|laundry|umbrella|patio|cell_tower|light_pole|street_lamp|hanging_light/i;
const tick = () => new Promise((r) => setTimeout(r, 0));
const median = (a) => { if (!a.length) return NaN; const s = Float64Array.from(a).sort(); return s[s.length >> 1]; };
const pct = (a, p) => { if (!a.length) return NaN; const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const fin = Number.isFinite;

class Heap { // binary min-heap on a numeric key
  constructor() { this.k = []; this.v = []; }
  push(key, val) { const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val); while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; } k[i] = key; v[i] = val; }
  pop() { const k = this.k, v = this.v, topV = v[0], lk = k.pop(), lv = v.pop(); const n = k.length; if (n) { let i = 0; for (;;) { let c = i * 2 + 1; if (c >= n) break; if (c + 1 < n && k[c + 1] < k[c]) c++; if (k[c] >= lk) break; k[i] = k[c]; v[i] = v[c]; i = c; } k[i] = lk; v[i] = lv; } return topV; }
  get size() { return this.k.length; }
}

// ---------------------------------------------------------------------------------------------------------------------
export function readManifest(m) {
  if (!m || m.format !== 'cs-map-bin' || !Array.isArray(m.geometries) || !m.bounds) throw new Error('این فایل JSON از نوع cs-map-bin نیست (خروجی map2json.js)');
  return m;
}
// the files are often exported with an extra 0.0254 (inch -> metre) factor: a Dust-sized map then measures ~4.5 "metres"
export function guessScale(m) {
  const b = m.bounds, size = Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]);
  return size < 30 ? 1 / INCH : 1;
}

export async function bakeMesh(manifest, bin, opts = {}) {
  readManifest(manifest);
  const prog = opts.onProgress || (() => {});
  const log = [];
  const scale = opts.scale || guessScale(manifest);
  const b = manifest.bounds, mn = b.min.map((v) => v * scale), mx = b.max.map((v) => v * scale);
  const X0 = mn[0] - 1, Z0 = mn[2] - 1, Y0 = mn[1] - 0.5;
  const NX = Math.ceil((mx[0] - X0) / CS) + 2, NZ = Math.ceil((mx[2] - Z0) / CS) + 2, NY = Math.ceil((mx[1] - Y0) / VY) + 2;
  if (NX * NZ * NY > 420e6) throw new Error('ابعاد مش خیلی بزرگ است؛ scale را بررسی کنید (' + scale + ')');
  const V = new Uint8Array(NX * NZ * NY);
  const vi = (x, z, y) => (x * NZ + z) * NY + y;

  // ---------- 1. voxelise: up-facing / down-facing / steep surfaces ----------
  let done = 0, total = manifest.geometries.length;
  for (const g of manifest.geometries) {
    const nv = g.vertexCount, ni = g.indexCount;
    const q = new Uint16Array(bin, g.pos, nv * 3), idx = g.index32 ? new Uint32Array(bin, g.idx, ni) : new Uint16Array(bin, g.idx, ni);
    const P = new Float32Array(nv * 3), kx = g.posRange[0] / 65535 * scale, ky = g.posRange[1] / 65535 * scale, kz = g.posRange[2] / 65535 * scale;
    const ax = g.posMin[0] * scale, ay = g.posMin[1] * scale, az = g.posMin[2] * scale;
    for (let i = 0; i < nv; i++) { P[i * 3] = ax + q[i * 3] * kx; P[i * 3 + 1] = ay + q[i * 3 + 1] * ky; P[i * 3 + 2] = az + q[i * 3 + 2] * kz; }
    for (let t = 0; t < ni; t += 3) {
      const a = idx[t] * 3, bb = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const e1x = P[bb] - P[a], e1y = P[bb + 1] - P[a + 1], e1z = P[bb + 2] - P[a + 2], e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
      const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x, ln = Math.hypot(nx, ny, nz);
      if (ln < 1e-12) continue;
      const nyn = ny / ln, flag = nyn > 0.7 ? UP : nyn < -0.7 ? DN : WL;
      const e3 = Math.hypot(P[c] - P[bb], P[c + 1] - P[bb + 1], P[c + 2] - P[bb + 2]);
      const k = Math.max(1, Math.min(700, Math.ceil(Math.max(Math.hypot(e1x, e1y, e1z), Math.hypot(e2x, e2y, e2z), e3) / 0.2)));
      for (let i = 0; i <= k; i++) for (let j = 0; j <= k - i; j++) {
        const x = P[a] + (e1x * i + e2x * j) / k, y = P[a + 1] + (e1y * i + e2y * j) / k, z = P[a + 2] + (e1z * i + e2z * j) / k;
        const ix = ((x - X0) / CS) | 0, iz = ((z - Z0) / CS) | 0, iy = ((y - Y0) / VY) | 0;
        if (ix >= 0 && ix < NX && iz >= 0 && iz < NZ && iy >= 0 && iy < NY) V[vi(ix, iz, iy)] |= flag;
      }
    }
    prog('مش → ووکسل', ++done / total * 0.35); if (done % 4 === 0) await tick();
  }
  log.push(`scale ${scale.toFixed(4)}  voxels ${NX}x${NZ}x${NY}`);

  // ---------- 2. junk objects (named in the colliders list): erase them, but keep the bottom 0.4 m so the ground stays ----------
  let junk = 0;
  for (const c of manifest.colliders || []) {
    if (!JUNK.test(c.name)) continue;
    const a0 = c.min[0] * scale + 0.08, a1 = c.max[0] * scale - 0.08, b0 = c.min[1] * scale + 0.4, b1 = c.max[1] * scale - 0.08, c0 = c.min[2] * scale + 0.08, c1 = c.max[2] * scale - 0.08;
    if (a1 <= a0 || b1 <= b0 || c1 <= c0 || Math.max(a1 - a0, b1 - b0, c1 - c0) > 14) continue;
    const x0 = Math.max(0, ((a0 - X0) / CS) | 0), x1 = Math.min(NX - 1, ((a1 - X0) / CS) | 0), z0 = Math.max(0, ((c0 - Z0) / CS) | 0), z1 = Math.min(NZ - 1, ((c1 - Z0) / CS) | 0), y0 = Math.max(0, ((b0 - Y0) / VY) | 0), y1 = Math.min(NY - 1, ((b1 - Y0) / VY) | 0);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const o = vi(x, z, 0); for (let y = y0; y <= y1; y++) V[o + y] &= ~OCC; }
    junk++;
  }
  log.push(`junk objects removed ${junk}`); prog('جداکردن اشیای اضافه', 0.4); await tick();

  // ---------- 3. walkable floors: up-facing voxel with 1.75 m of free space above ----------
  const FREE = 7; let nF = 0;
  for (let x = 0; x < NX; x++) for (let z = 0; z < NZ; z++) {
    const o = vi(x, z, 0); let run = 0;
    for (let y = NY - 1; y >= 0; y--) { const v = V[o + y]; if ((v & UP) && run >= FREE) { V[o + y] = v | FL; nF++; } if (v & OCC) run = 0; else run++; }
  }
  log.push(`walkable voxels ${nF}`);
  if (nF < 200) throw new Error('هیچ سطح قابل‌راه‌رفتنی در مش پیدا نشد (scale یا جهت محور Y را بررسی کنید)');
  prog('کف‌ها', 0.45); await tick();

  // ---------- 4. strict components (vertical reach 0.75 m between neighbours) -> the dominant one seeds the flood ----------
  const fid = new Map(), fv = new Int32Array(nF); let k0 = 0;
  for (let x = 0; x < NX; x++) for (let z = 0; z < NZ; z++) { const o = vi(x, z, 0); for (let y = 0; y < NY; y++) if (V[o + y] & FL) { fid.set(o + y, k0); fv[k0++] = o + y; } }
  const par = new Int32Array(nF).map((_, i) => i); const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  for (let f = 0; f < nF; f++) {
    const lin = fv[f], y = lin % NY, xz = (lin - y) / NY, z = xz % NZ, x = (xz - z) / NZ;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const xx = x + dx, zz = z + dz; if (xx < 0 || zz < 0 || xx >= NX || zz >= NZ) continue;
      const o = vi(xx, zz, 0);
      for (let dy = -3; dy <= 3; dy++) { if (!dx && !dz && dy <= 0) continue; const yy = y + dy; if (yy < 0 || yy >= NY || !(V[o + yy] & FL)) continue; const g2 = fid.get(o + yy); const ra = find(f), rb = find(g2); if (ra !== rb) par[rb] = ra; }
    }
  }
  const csize = new Map(); for (let f = 0; f < nF; f++) { const r = find(f); csize.set(r, (csize.get(r) || 0) + 1); }
  let biggest = 0; for (const s of csize.values()) biggest = Math.max(biggest, s);
  const seedComps = [...csize.entries()].filter(([, s]) => s >= Math.max(800, 0.15 * biggest)).map(([r]) => r);
  log.push(`largest walkable area ${biggest} voxels, seed areas ${seedComps.length}`);

  // grid placement: cover the dominant walkable area with a margin; the lowest floor becomes height 0
  let bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9, by0 = 1e9; const seedSet = new Set(seedComps);
  const sumX = new Map(), sumZ = new Map(), sumN = new Map();
  for (let f = 0; f < nF; f++) {
    const r = find(f); if (!seedSet.has(r)) continue;
    const lin = fv[f], y = lin % NY, xz = (lin - y) / NY, z = xz % NZ, x = (xz - z) / NZ;
    const wx = X0 + x * CS, wz = Z0 + z * CS, wy = Y0 + y * VY;
    if (wx < bx0) bx0 = wx; if (wx > bx1) bx1 = wx; if (wz < bz0) bz0 = wz; if (wz > bz1) bz1 = wz; if (wy < by0) by0 = wy;
    sumX.set(r, (sumX.get(r) || 0) + x); sumZ.set(r, (sumZ.get(r) || 0) + z); sumN.set(r, (sumN.get(r) || 0) + 1);
  }
  const GX0 = Math.floor(bx0) - 8, GZ0 = Math.floor(bz0) - 8, W = Math.ceil(bx1) - GX0 + 9, H = Math.ceil(bz1) - GZ0 + 9, YB = Math.floor(by0 * 20) / 20;
  if (W > 520 || H > 520) throw new Error(`نقشه خیلی بزرگ است (${W}x${H})`);
  const N = W * H;

  // ---------- 5. candidate floor layers per 1 m cell (needs support in >=2 of its 4 sub-columns) ----------
  const cand = new Array(N);
  for (let gz = 0; gz < H; gz++) for (let gx = 0; gx < W; gx++) {
    const cnt = new Map();
    for (let sx = 0; sx < 2; sx++) for (let sz = 0; sz < 2; sz++) {
      const ix = ((GX0 + gx + sx * 0.5 + 0.25 - X0) / CS) | 0, iz = ((GZ0 + gz + sz * 0.5 + 0.25 - Z0) / CS) | 0; if (ix < 0 || iz < 0 || ix >= NX || iz >= NZ) continue;
      const o = vi(ix, iz, 0); for (let y = 0; y < NY; y++) if (V[o + y] & FL) cnt.set(y, (cnt.get(y) || 0) + 1);
    }
    if (!cnt.size) { cand[gz * W + gx] = null; continue; }
    const ys = [...cnt.keys()].sort((a, c) => a - c), layers = [];
    for (const y of ys) { const L = layers[layers.length - 1]; if (L && y - L[0] <= 1) { if (cnt.get(y) > L[2]) L[0] = y, L[2] = cnt.get(y); L[1] += cnt.get(y); } else layers.push([y, cnt.get(y), cnt.get(y)]); }
    const out = []; for (const L of layers) if (L[1] >= 2) out.push(L[0] * VY + Y0 - YB);
    cand[gz * W + gx] = out.length ? out : null;
  }
  prog('سلول‌ها', 0.55); await tick();

  // ---------- 6. flood: connected walkable space with steps up to 1.1 m per cell (ramps/stairs/crates) ----------
  const TOL = 1.1; let h = new Float32Array(N).fill(NaN); const heap = new Heap();
  for (const r of seedComps) {
    const n = sumN.get(r), cx = sumX.get(r) / n, cz = sumZ.get(r) / n; let best = null, bd = 1e18;
    for (let f = 0; f < nF; f++) { if (find(f) !== r) continue; const lin = fv[f], y = lin % NY, xz = (lin - y) / NY, z = xz % NZ, x = (xz - z) / NZ; const d = (x - cx) ** 2 + (z - cz) ** 2; if (d < bd) { bd = d; best = [x, z, y]; } }
    const gx = Math.floor(X0 + best[0] * CS - GX0), gz = Math.floor(Z0 + best[1] * CS - GZ0), c = cand[gz * W + gx]; if (!c) continue;
    const yy = Y0 + best[2] * VY - YB; let pick = c[0]; for (const v of c) if (Math.abs(v - yy) < Math.abs(pick - yy)) pick = v;
    h[gz * W + gx] = pick; heap.push(0, gz * W + gx);
  }
  const nearest = (c, hh) => { let p = c[0]; for (let i = 1; i < c.length; i++) if (Math.abs(c[i] - hh) < Math.abs(p - hh)) p = c[i]; return p; };
  while (heap.size) {
    const cur = heap.pop(), x = cur % W, z = (cur - x) / W, hc = h[cur];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = x + dx, bb = z + dz; if (a < 0 || bb < 0 || a >= W || bb >= H) continue; const ci = bb * W + a; if (fin(h[ci]) || !cand[ci]) continue;
      const best = nearest(cand[ci], hc); if (Math.abs(best - hc) <= TOL) { h[ci] = best; heap.push(Math.max(0, Math.abs(best - hc) - 0.25), ci); }
    }
  }
  const walkCount = () => { let n = 0; for (let i = 0; i < N; i++) if (fin(h[i])) n++; return n; };
  log.push(`flooded cells ${walkCount()}`);

  // ---------- 7. invisible floors (clip/nodraw): bridge short gaps between two walkable cells at the same height ----------
  const openBand = (gx, gz, hh) => {
    for (let sx = 0; sx < 2; sx++) for (let sz = 0; sz < 2; sz++) {
      const ix = ((GX0 + gx + sx * 0.5 + 0.25 - X0) / CS) | 0, iz = ((GZ0 + gz + sz * 0.5 + 0.25 - Z0) / CS) | 0; if (ix < 0 || iz < 0 || ix >= NX || iz >= NZ) return false;
      const lo = Math.max(0, ((hh + YB + 0.45 - Y0) / VY) | 0), hi = Math.min(NY, ((hh + YB + 2.4 - Y0) / VY) | 0), o = vi(ix, iz, 0);
      for (let y = lo; y < hi; y++) if (V[o + y] & OCC) return false;
    }
    return true;
  };
  const MAXGAP = 9; let voidFilled = 0; const nh = Float32Array.from(h);
  const scan = (A, B, at) => {
    for (let a = 0; a < A; a++) {
      let b = 0;
      while (b < B) {
        if (fin(h[at(a, b)])) { b++; continue; }
        const s = b; while (b < B && !fin(h[at(a, b)])) b++; const e = b;
        if (s === 0 || e >= B || e - s > MAXGAP) continue;
        const hp = h[at(a, s - 1)], hq = h[at(a, e)]; if (!fin(hp) || !fin(hq) || Math.abs(hp - hq) > 0.35) continue;
        let ok = true; for (let t = s; t < e && ok; t++) { const i = at(a, t), hh = hp + (hq - hp) * (t - s + 1) / (e - s + 1); ok = openBand(i % W, (i - i % W) / W, hh); }
        if (ok) for (let t = s; t < e; t++) { const i = at(a, t); if (!fin(nh[i])) { nh[i] = Math.round((hp + (hq - hp) * (t - s + 1) / (e - s + 1)) * 20) / 20; voidFilled++; } }
      }
    }
  };
  scan(H, W, (a, b) => a * W + b); scan(W, H, (a, b) => b * W + a); h = nh;
  log.push(`invisible-floor cells filled ${voidFilled}`); prog('یکپارچه‌سازی', 0.65); await tick();

  // ---------- 8. boxes / cars / barrels as crates ----------
  const cells = (z0, z1, x0, x1, fn) => { for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) if (x >= 0 && z >= 0 && x < W && z < H) fn(z * W + x, x, z); };
  const D4 = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  // ground = grey opening (9x9) of the floor
  const hfill = Float32Array.from(h); { // nearest fill for holes (multi-source BFS)
    const q = []; for (let i = 0; i < N; i++) if (fin(h[i])) q.push(i); let head = 0;
    while (head < q.length) { const c = q[head++], x = c % W, z = (c - x) / W; for (const [dx, dz] of D4) { const a = x + dx, bb = z + dz; if (a < 0 || bb < 0 || a >= W || bb >= H) continue; const ci = bb * W + a; if (!fin(hfill[ci])) { hfill[ci] = hfill[c]; q.push(ci); } } }
    for (let i = 0; i < N; i++) if (!fin(hfill[i])) hfill[i] = 0;
  }
  const filt = (src, fn, r) => { // separable min / max filter
    const tmp = new Float32Array(N), out = new Float32Array(N);
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) { let v = src[z * W + x]; for (let d = -r; d <= r; d++) { const a = x + d; if (a >= 0 && a < W) v = fn(v, src[z * W + a]); } tmp[z * W + x] = v; }
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) { let v = tmp[z * W + x]; for (let d = -r; d <= r; d++) { const bb = z + d; if (bb >= 0 && bb < H) v = fn(v, tmp[bb * W + x]); } out[z * W + x] = v; }
    return out;
  };
  const ground = filt(filt(hfill, Math.min, 4), Math.max, 4);
  const isWalk = (i) => fin(h[i]);
  const crates = [], used = new Uint8Array(N);
  { // (a) raised blocks standing on walkable ground
    const bump = new Uint8Array(N); for (let i = 0; i < N; i++) if (isWalk(i) && h[i] - ground[i] > 0.7) bump[i] = 1;
    const lab = new Int32Array(N); let nl = 0;
    for (let i = 0; i < N; i++) {
      if (!bump[i] || lab[i]) continue; nl++; const comp = [i]; lab[i] = nl;
      for (let p = 0; p < comp.length; p++) { const c = comp[p], x = c % W, z = (c - x) / W; for (const [dx, dz] of D4) { const a = x + dx, bb = z + dz; if (a < 0 || bb < 0 || a >= W || bb >= H) continue; const ci = bb * W + a; if (bump[ci] && !lab[ci]) { lab[ci] = nl; comp.push(ci); } } }
      let x0 = 1e9, x1 = -1, z0 = 1e9, z1 = -1; for (const c of comp) { const x = c % W, z = (c - x) / W; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
      x1++; z1++; const area = comp.length; if (area > 60 || z1 - z0 > 12 || x1 - x0 > 12 || area / ((z1 - z0) * (x1 - x0)) < 0.6) continue;
      const ring = []; cells(z0 - 2, z1 + 2, x0 - 2, x1 + 2, (ci, x, z) => { if (!(x >= x0 && x < x1 && z >= z0 && z < z1) && isWalk(ci) && lab[ci] !== nl && !bump[ci]) ring.push(h[ci]); });
      if (ring.length < 4) continue;
      const g = Math.min(median(comp.map((c) => ground[c])), pct(ring, 0.25)), t = median(comp.map((c) => h[c]));
      if (t - g < 0.7 || t - g > 3.4 || t - median(ring) < 0.45) continue;
      crates.push({ x: x0, z: z0, w: x1 - x0, d: z1 - z0, base: g, top: t, area, src: 'bump' });
    }
  }
  { // (b) boxes in space the flood left out (too tall to step on): small flat tops 0.7-3.2 m above the ground around them
    const top = new Float32Array(N).fill(NaN);
    for (let i = 0; i < N; i++) if (!isWalk(i) && cand[i]) top[i] = cand[i][0];
    const lab = new Int32Array(N); let nl = 0;
    for (let i = 0; i < N; i++) {
      if (!fin(top[i]) || lab[i]) continue; nl++; const comp = [i]; lab[i] = nl;
      for (let p = 0; p < comp.length && comp.length <= 400; p++) { const c = comp[p], x = c % W, z = (c - x) / W; for (const [dx, dz] of D4) { const a = x + dx, bb = z + dz; if (a < 0 || bb < 0 || a >= W || bb >= H) continue; const ci = bb * W + a; if (fin(top[ci]) && !lab[ci] && Math.abs(top[ci] - top[c]) <= 0.3) { lab[ci] = nl; comp.push(ci); } } }
      const area = comp.length; if (area > 48) continue;
      let x0 = 1e9, x1 = -1, z0 = 1e9, z1 = -1; for (const c of comp) { const x = c % W, z = (c - x) / W; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
      x1++; z1++; if (z1 - z0 > 10 || x1 - x0 > 10 || area / ((z1 - z0) * (x1 - x0)) < 0.7) continue;
      const ring = []; cells(z0 - 2, z1 + 2, x0 - 2, x1 + 2, (ci, x, z) => { if (!(x >= x0 && x < x1 && z >= z0 && z < z1) && isWalk(ci)) ring.push(h[ci]); });
      if (ring.length < 4) continue; const g = median(ring), t = median(comp.map((c) => top[c])), hh = t - g;
      if (hh >= 0.7 && hh <= 3.2) crates.push({ x: x0, z: z0, w: x1 - x0, d: z1 - z0, base: g, top: t, area, src: 'ring' });
    }
  }
  const finalCrates = [];
  for (const c of crates.sort((a, b) => b.area - a.area)) { // drop overlapping footprints
    if (finalCrates.some((f) => !(c.x >= f.x + f.w || f.x >= c.x + c.w || c.z >= f.z + f.d || f.z >= c.z + c.d))) continue; finalCrates.push(c);
  }
  for (const c of finalCrates) cells(c.z, c.z + c.d, c.x, c.x + c.w, (i) => { h[i] = c.src === 'bump' ? ground[i] : c.base; used[i] = 1; });
  log.push(`crates ${finalCrates.length}`); prog('جعبه‌ها', 0.72); await tick();

  // ---------- 9. smoothing + slope limiter (a 1 m cell cannot hold a ramp steeper than the 0.55 m step: spread it out) ----------
  let hm = Float32Array.from(h);
  for (let it = 0; it < 2; it++) {
    const src = Float32Array.from(hm);
    for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) {
      const i = z * W + x; if (!fin(src[i])) continue; const nb = [];
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const v = src[i + dz * W + dx]; if (fin(v) && Math.abs(v - src[i]) < 0.45) nb.push(v); }
      if (nb.length >= 5) { const m = median(nb); if (Math.abs(m - src[i]) < 0.3) hm[i] = it === 0 ? 0.5 * src[i] + 0.5 * m : m; }
    }
  }
  const LIM = 0.5;
  for (let it = 0; it < 80; it++) {
    const acc = new Float32Array(N), cnt = new Float32Array(N); let worst = 0;
    for (const [dz, dx] of [[0, 1], [1, 0]]) for (let z = 0; z < H - dz; z++) for (let x = 0; x < W - dx; x++) {
      const a = z * W + x, bb = (z + dz) * W + (x + dx), A = hm[a], B = hm[bb]; if (!fin(A) || !fin(B)) continue;
      const dd = B - A, ad = Math.abs(dd); if (ad <= LIM + 0.01 || ad > 1.1) continue;
      const sh = (ad - LIM) / 2 * Math.sign(dd); acc[a] += sh; acc[bb] -= sh; cnt[a]++; cnt[bb]++; if (ad > worst) worst = ad;
    }
    if (!worst) break; for (let i = 0; i < N; i++) if (cnt[i] > 0) hm[i] += acc[i] / cnt[i];
  }
  for (let i = 0; i < N; i++) h[i] = fin(h[i]) ? Math.round(hm[i] * 20) / 20 : NaN;
  prog('صاف‌سازی', 0.78); await tick();

  // ---------- 10. roofs (tunnels, covered buildings) ----------
  const ceil = new Float32Array(N).fill(NaN);
  for (let gz = 0; gz < H; gz++) for (let gx = 0; gx < W; gx++) {
    const i = gz * W + gx; if (!isWalk(i) || used[i]) continue; const found = [];
    for (let sx = 0; sx < 2; sx++) for (let sz = 0; sz < 2; sz++) {
      const ix = ((GX0 + gx + sx * 0.5 + 0.25 - X0) / CS) | 0, iz = ((GZ0 + gz + sz * 0.5 + 0.25 - Z0) / CS) | 0; if (ix < 0 || iz < 0 || ix >= NX || iz >= NZ) continue;
      const lo = Math.max(0, ((h[i] + YB + 2.0 - Y0) / VY) | 0), hi = Math.min(NY, ((h[i] + YB + 9.0 - Y0) / VY) | 0), o = vi(ix, iz, 0);
      for (let y = lo; y < hi; y++) if (V[o + y] & OCC) { found.push(y * VY + Y0 - YB); break; }
    }
    if (found.length >= 2) ceil[i] = median(found);
  }
  const labelBlobs = (mask, conn8) => { const lab = new Int32Array(N); let nl = 0; const sizes = [0]; const nbs = conn8 ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] : D4;
    for (let i = 0; i < N; i++) { if (!mask[i] || lab[i]) continue; nl++; const comp = [i]; lab[i] = nl; for (let p = 0; p < comp.length; p++) { const c = comp[p], x = c % W, z = (c - x) / W; for (const [dx, dz] of nbs) { const a = x + dx, bb = z + dz; if (a < 0 || bb < 0 || a >= W || bb >= H) continue; const ci = bb * W + a; if (mask[ci] && !lab[ci]) { lab[ci] = nl; comp.push(ci); } } } sizes.push(comp.length); }
    return { lab, sizes }; };
  { // drop tiny fragments, smooth, keep only roofs with a real 2x2 core, snap, require 2.6 m headroom
    let mask = new Uint8Array(N); for (let i = 0; i < N; i++) mask[i] = fin(ceil[i]) ? 1 : 0;
    let { lab, sizes } = labelBlobs(mask, false); for (let i = 0; i < N; i++) if (mask[i] && sizes[lab[i]] < 6) { mask[i] = 0; ceil[i] = NaN; }
    const cm = Float32Array.from(ceil);
    for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) { const i = z * W + x; if (!fin(ceil[i])) continue; const nb = []; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const v = ceil[i + dz * W + dx]; if (fin(v) && Math.abs(v - ceil[i]) < 0.8) nb.push(v); } cm[i] = median(nb); }
    const core = new Uint8Array(N); // 2x2 opening: cells that belong to some fully covered 2x2 square
    for (let z = 0; z < H - 1; z++) for (let x = 0; x < W - 1; x++) { const i = z * W + x; if (fin(cm[i]) && fin(cm[i + 1]) && fin(cm[i + W]) && fin(cm[i + W + 1])) core[i] = core[i + 1] = core[i + W] = core[i + W + 1] = 1; }
    const keep = new Uint8Array(N); for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) { if (!fin(cm[z * W + x])) continue; let near = false; for (let dz = -1; dz <= 1 && !near; dz++) for (let dx = -1; dx <= 1; dx++) { const a = x + dx, bb = z + dz; if (a >= 0 && bb >= 0 && a < W && bb < H && core[bb * W + a]) { near = true; break; } } if (near) keep[z * W + x] = 1; }
    ({ lab, sizes } = labelBlobs(keep, true));
    for (let i = 0; i < N; i++) ceil[i] = keep[i] && sizes[lab[i]] >= 10 && fin(cm[i]) && Math.round(cm[i] * 4) / 4 - h[i] >= 2.6 ? Math.round(cm[i] * 4) / 4 : NaN;
  }
  log.push(`roof cells ${ceil.reduce((n, v) => n + (fin(v) ? 1 : 0), 0)}`); prog('سقف‌ها', 0.84); await tick();

  // ---------- 11. wall heights from the real building height ----------
  const nearH = new Float32Array(N).fill(NaN); { const q = []; for (let i = 0; i < N; i++) if (isWalk(i)) { nearH[i] = h[i]; q.push(i); } let head = 0;
    while (head < q.length) { const c = q[head++], x = c % W, z = (c - x) / W; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const a = x + dx, bb = z + dz; if (a < 0 || bb < 0 || a >= W || bb >= H) continue; const ci = bb * W + a; if (!fin(nearH[ci])) { nearH[ci] = nearH[c]; q.push(ci); } } } }
  const QH = [3.5, 4.5, 5.5, 6.5, 8, 10, 12, 14]; const qz = (v) => QH.reduce((p, c) => (Math.abs(c - Math.min(14, Math.max(3.5, v))) < Math.abs(p - Math.min(14, Math.max(3.5, v))) ? c : p), QH[0]);
  const nearWalk = new Uint8Array(N); for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) { const i = z * W + x; if (isWalk(i)) continue; let ok = false; for (let dz = -2; dz <= 2 && !ok; dz++) for (let dx = -2; dx <= 2; dx++) { const a = x + dx, bb = z + dz; if (a >= 0 && bb >= 0 && a < W && bb < H && isWalk(bb * W + a)) { ok = true; break; } } nearWalk[i] = ok ? 1 : 0; }
  const rel = new Float32Array(N).fill(NaN);
  for (let gz = 0; gz < H; gz++) for (let gx = 0; gx < W; gx++) {
    const i = gz * W + gx; if (!nearWalk[i]) continue; let best = -1e9;
    for (let sx = 0; sx < 2; sx++) for (let sz = 0; sz < 2; sz++) {
      const ix = ((GX0 + gx + sx * 0.5 + 0.25 - X0) / CS) | 0, iz = ((GZ0 + gz + sz * 0.5 + 0.25 - Z0) / CS) | 0; if (ix < 0 || iz < 0 || ix >= NX || iz >= NZ) continue;
      const o = vi(ix, iz, 0); for (let y = NY - 1; y >= 0; y--) if (V[o + y] & OCC) { best = Math.max(best, y * VY + Y0 - YB); break; }
    }
    if (best > -1e8 && fin(nearH[i])) rel[i] = qz(best - nearH[i]);
  }
  const wq = Float32Array.from(rel);
  for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) { const i = z * W + x; if (!fin(rel[i])) continue; const nb = []; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const v = rel[i + dz * W + dx]; nb.push(fin(v) ? v : 0); } wq[i] = median(nb) || NaN; }

  // ---------- 12. rectangles (greedy cover) for the editable lists ----------
  const greedy = (vals) => { const done = new Uint8Array(N), rects = [];
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) { const i = z * W + x, v = vals[i]; if (done[i] || !fin(v)) continue; let x1 = x + 1; while (x1 < W && !done[z * W + x1] && vals[z * W + x1] === v) x1++; let z1 = z + 1; for (;;) { if (z1 >= H) break; let ok = true; for (let k = x; k < x1; k++) if (done[z1 * W + k] || vals[z1 * W + k] !== v) { ok = false; break; } if (!ok) break; z1++; } for (let a = z; a < z1; a++) for (let c = x; c < x1; c++) done[a * W + c] = 1; rects.push([x, z, x1, z1, v]); }
    return rects; };
  const roofs = greedy(ceil), wallZones = greedy(wq);

  // ---------- 13. props / lamps / crate kinds from the collider names (Source 2 asset names) ----------
  const col = (manifest.colliders || []).map((c) => { const n = c.name.replace(/^n\d+_lr\d+_(c\d+_s_)?/, '').replace(/^agg_(no)?merge_|^agg_prop_/, '');
    return { n, x: (c.min[0] + c.max[0]) / 2 * scale - GX0, z: (c.min[2] + c.max[2]) / 2 * scale - GZ0, w: (c.max[0] - c.min[0]) * scale, d: (c.max[2] - c.min[2]) * scale, y0: c.min[1] * scale - YB, y1: c.max[1] * scale - YB, hgt: (c.max[1] - c.min[1]) * scale }; });
  const nearC = (c, re, pad = 0.7) => col.some((o) => re.test(o.n) && o.x >= c.x - pad && o.x <= c.x + c.w + pad && o.z >= c.z - pad && o.z <= c.z + c.d + pad);
  const CARCOL = ['#9c2b24', '#c9b99a', '#2f5f86', '#6c7a4a', '#d9d4c4', '#7b4a2c'];
  const crateDefs = [];
  for (const c of finalCrates) {
    const base = h[c.z * W + c.x]; if (!fin(base)) continue; const hh = Math.max(0.5, Math.round((c.top - base) * 4) / 4); if (hh > 3.4) continue;
    let kind = 'crate';
    if (nearC(c, /300d|car_wreck|flatbed|dust_r5|truck/i)) kind = 'car'; else if (nearC(c, /garbage_container|dumpster/i)) kind = 'dumpster'; else if (nearC(c, /oil_drum|propane|barrel/i)) kind = 'barrel';
    else if (nearC(c, /concrete_barrier|jersey/i)) kind = 'jersey'; else if (nearC(c, /sack|sandbag/i)) kind = 'sandbags'; else if (nearC(c, /shipping_crate|crate|wood/i)) kind = 'crate';
    else if (Math.max(c.w, c.d) >= 5 && hh >= 2 && hh <= 3.2) kind = 'cont'; else if (hh <= 1.3 && Math.max(c.w, c.d) <= 2) kind = 'crate'; else kind = 'concrete';
    const e = [c.x, c.z, c.w, c.d, hh, kind]; if (kind === 'car') e.push(CARCOL[(c.x * 7 + c.z * 3) % CARCOL.length]); crateDefs.push(e);
  }
  const nearWalkP = (x, z) => { const cx = Math.floor(x), cz = Math.floor(z); for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const a = cx + dx, bb = cz + dz; if (a >= 0 && bb >= 0 && a < W && bb < H && isWalk(bb * W + a)) return true; } return false; };
  const floorAt = (x, z) => { const cx = Math.floor(x), cz = Math.floor(z), v = []; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const a = cx + dx, bb = cz + dz; if (a >= 0 && bb >= 0 && a < W && bb < H && isWalk(bb * W + a)) v.push(h[bb * W + a]); } return v.length ? median(v) : 0; };
  const R = (v) => Math.round(v * 2) / 2, props = [], lamps = []; const clamp = (v, a, b2) => Math.max(a, Math.min(b2, v));
  for (const o of col) {
    if (!nearWalkP(o.x, o.z)) continue; const f = floorAt(o.x, o.z), rot = o.w >= o.d ? 0 : 1.5708, L = Math.max(o.w, o.d), n = o.n;
    if (/palm_bark/.test(n)) props.push(['palm', R(o.x), R(o.z), 0, +clamp(o.hgt / 5.5, 0.9, 1.5).toFixed(2)]);
    else if (/olive_bark|sumac_01/.test(n)) props.push(['tree', R(o.x), R(o.z), 0, +clamp(Math.max(o.hgt, 2) / 4, 0.8, 1.3).toFixed(2)]);
    else if (/sagebrush|agave/.test(n)) props.push(['bush', R(o.x), R(o.z), 0, +clamp(L / 1.6, 0.6, 1.1).toFixed(2)]);
    else if (/street_lamp_0/.test(n)) props.push(['lamppost', R(o.x), R(o.z), 0, 1]);
    else if (/street_lantern|street_lamp|light_pole/.test(n)) lamps.push([R(o.x), R(o.z), +o.y1.toFixed(1), '#ffd9a0', 1, 13]);
    else if (/hr_dust_tire/.test(n)) props.push(['tire', R(o.x), R(o.z), 0, 1]);
    else if (/dust_awning_0\d_\d$|dust_awning_02_1/.test(n) && L >= 1.8) props.push(['awning', R(o.x), R(o.z), rot, +L.toFixed(1), '', +Math.max(0, o.y1 - f - 2.5).toFixed(1)]);
    else if (/ac_unit/.test(n)) props.push(['acunit', R(o.x), R(o.z), rot, 1, '', +Math.max(0, o.y0 - f).toFixed(1)]);
    else if (/small_rocks/.test(n)) props.push(['rock', R(o.x), R(o.z), 0, +clamp(L / 1.6, 0.6, 1.3).toFixed(2)]);
    else if (/pottery/.test(n)) props.push(['pot', R(o.x), R(o.z), 0, 1]);
    else if (/chainlink_fence_0/.test(n) && L >= 2) props.push(['fence', R(o.x), R(o.z), rot, Math.round(L)]);
  }
  const propsOut = []; for (const p of props) { if (propsOut.some((q) => q[0] === p[0] && Math.abs(q[1] - p[1]) < 0.6 && Math.abs(q[2] - p[2]) < 0.6)) continue; if (p[2] !== undefined && p.length >= 7 && !p[6]) p.length = 5; propsOut.push(p); }
  const lampsOut = []; for (const l of lamps) if (lampsOut.every((k) => (l[0] - k[0]) ** 2 + (l[1] - k[1]) ** 2 > 16)) lampsOut.push(l);

  // ---------- 14. spawns / sites (the editor can move them) ----------
  const gp = autoPlacement(h, W, H, used, opts.gameplay);
  // roofed cells get tunnel pavers; everything else keeps the theme's sand
  const roofRects = roofs; const areas = []; { const M = new Float32Array(N).fill(NaN); for (let i = 0; i < N; i++) if (isWalk(i) && fin(ceil[i])) M[i] = 3; for (const r of greedy(M)) areas.push([r[0], r[1], r[2], r[3], +median(Array.from({ length: (r[2] - r[0]) * (r[3] - r[1]) }, (_, k) => h[(r[1] + ((k / (r[2] - r[0])) | 0)) * W + r[0] + (k % (r[2] - r[0]))])).toFixed(2), 3]); }

  const enc = (arr) => { const out = []; let v = arr[0], c = 1; for (let i = 1; i < arr.length; i++) { if (arr[i] === v && c < 32000) c++; else { out.push(v, c); v = arr[i]; c = 1; } } out.push(v, c); const u8 = new Uint8Array(new Int16Array(out).buffer); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64'); };
  const hr = new Int16Array(N), cr = new Int16Array(N).fill(32767); for (let i = 0; i < N; i++) hr[i] = fin(h[i]) ? Math.round(h[i] * 100) : 32767;
  const walkN = walkCount();
  log.push(`walkable cells ${walkN} (${(100 * walkN / N).toFixed(0)}%), roofs ${roofs.length}, wall zones ${wallZones.length}, props ${propsOut.length}, lamps ${lampsOut.length}`);
  prog('پایان', 1);
  const id = (opts.id || 'mesh_map').toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 32);
  const def = {
    id, name: opts.name || manifest.name || id, size: [W, H], scale: 1, cs2: true, theme: opts.theme || { preset: 'desert' }, skyline: { min: 10, edge: 15 },
    grid: { hr: enc(hr), cr: enc(cr) }, areas, ramps: [], roofs, crates: crateDefs, doors: [], lamps: lampsOut, props: propsOut, decals: [], wallZones,
    spawns: gp.spawns, yaw: gp.yaw, sites: gp.sites, buy: gp.buy, routes: {}, holds: {}, callouts: gp.callouts,
    // world = mesh * scale + (ox, oy, oz); the original mesh is drawn by meshview.js, the grid above is what players collide with
    mesh: { url: opts.meshUrl || '', scale, ox: -GX0, oy: -YB, oz: -GZ0 },
  };
  return { def, log, stats: { W, H, walk: walkN, crates: crateDefs.length, scale } };
}

// ---------------------------------------------------------------------------------------------------------------------
// Spawns, bomb sites and buy zones: T and CT at the two ends of the longest walk, A / B on the two biggest open areas in between.
export function autoPlacement(h, W, H, blocked, given) {
  const N = W * H, fin2 = Number.isFinite, ok = (i) => fin2(h[i]) && !(blocked && blocked[i]);
  const bfs = (src) => { const d = new Int32Array(N).fill(-1); const q = [src]; d[src] = 0; for (let p = 0; p < q.length; p++) { const c = q[p], x = c % W, z = (c - x) / W; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = x + dx, b = z + dz; if (a < 0 || b < 0 || a >= W || b >= H) continue; const ci = b * W + a; if (d[ci] < 0 && ok(ci) && Math.abs(h[ci] - h[c]) <= 0.55) { d[ci] = d[c] + 1; q.push(ci); } } } return { d, far: q[q.length - 1], n: q.length }; };
  let start = -1; for (let i = 0; i < N; i++) if (ok(i)) { start = i; break; }
  if (start < 0) return { spawns: { T: [[1, 1]], CT: [[2, 2]] }, yaw: { T: 0, CT: Math.PI }, sites: { A: [0, 0, 4, 4], B: [4, 4, 8, 8] }, buy: { T: [0, 0, 3, 3], CT: [3, 3, 6, 6] }, callouts: [] };
  // start from the middle of the largest reachable component
  let best = null; { const seen = new Uint8Array(N); for (let i = 0; i < N; i++) if (ok(i) && !seen[i]) { const r = bfs(i); let n = 0; for (let k = 0; k < N; k++) if (r.d[k] >= 0) { seen[k] = 1; n++; } if (!best || n > best.n) best = { n, i }; } }
  // distance to the nearest wall (chamfer) = how open a spot is; spawns and sites need room, narrow ramps do not qualify
  const dt = new Float32Array(N); for (let i = 0; i < N; i++) dt[i] = ok(i) ? 1e3 : 0;
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) { const i = z * W + x; if (x > 0) dt[i] = Math.min(dt[i], dt[i - 1] + 1); if (z > 0) dt[i] = Math.min(dt[i], dt[i - W] + 1); }
  for (let z = H - 1; z >= 0; z--) for (let x = W - 1; x >= 0; x--) { const i = z * W + x; if (x < W - 1) dt[i] = Math.min(dt[i], dt[i + 1] + 1); if (z < H - 1) dt[i] = Math.min(dt[i], dt[i + W] + 1); }
  const farOpen = (d, minOpen) => { let b2 = -1, bv = -1; for (let i = 0; i < N; i++) if (d[i] > bv && dt[i] >= minOpen) { bv = d[i]; b2 = i; } return b2; };
  const r0 = bfs(best.i); let a0 = farOpen(r0.d, 4); if (a0 < 0) a0 = r0.far;
  const fromU = bfs(a0); let vcell = farOpen(fromU.d, 4); if (vcell < 0) vcell = fromU.far;
  const fromV = bfs(vcell), Dm = Math.max(1, fromU.d[vcell]);
  const spawnsAt = (c) => { const cx = c % W, cz = (c - cx) / W, out = []; for (let r = 0; r < 14 && out.length < 10; r++) for (let dz = -r; dz <= r && out.length < 10; dz++) for (let dx = -r; dx <= r && out.length < 10; dx++) { if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; const a = cx + dx, b = cz + dz; if (a < 0 || b < 0 || a >= W || b >= H) continue; const i = b * W + a; if (ok(i) && dt[i] >= 1.5 && fromU.d[i] >= 0 && Math.abs(h[i] - h[c]) < 0.6 && out.every((p) => (p[0] - a) ** 2 + (p[1] - b) ** 2 >= 3.2)) out.push([a, b]); } return out; };
  const uCell = a0, T = spawnsAt(uCell), CT = spawnsAt(vcell);
  const peak = (lo, hi, avoid) => { let b2 = -1, bv = -1; for (let i = 0; i < N; i++) { if (!ok(i) || fromU.d[i] < 0) continue; const f = fromV.d[i] / Dm; if (f < lo || f > hi) continue; if (avoid.some((p) => (p[0] - i % W) ** 2 + (p[1] - ((i / W) | 0)) ** 2 < 900)) continue; if (dt[i] > bv) { bv = dt[i]; b2 = i; } } return b2; };
  const aC = peak(0.25, 0.85, []), ax = aC % W, az = (aC / W) | 0, bC = peak(0.15, 0.95, [[ax, az]]), bx = bC % W, bz = (bC / W) | 0;
  const box = (x, z, r) => [Math.max(0, x - r), Math.max(0, z - r), Math.min(W, x + r + 1), Math.min(H, z + r + 1)];
  const yawTo = (x0, z0, x1, z1) => Math.atan2(-(x1 - x0), -(z1 - z0));
  const tx = uCell % W, tz = (uCell / W) | 0, cx = vcell % W, cz = (vcell / W) | 0;
  const res = {
    spawns: { T: T.length ? T : [[tx, tz]], CT: CT.length ? CT : [[cx, cz]] }, yaw: { T: +yawTo(tx, tz, cx, cz).toFixed(3), CT: +yawTo(cx, cz, tx, tz).toFixed(3) },
    sites: { A: box(ax, az, 11), B: bC >= 0 ? box(bx, bz, 11) : box(cx, cz, 6) }, buy: { T: box(tx, tz, 9), CT: box(cx, cz, 9) }, callouts: [],
  };
  return Object.assign(res, given || {});
}
