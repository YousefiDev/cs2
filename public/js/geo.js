// Mutable geometry builder used by the chunked world. One Geo = one material inside one chunk.
// Colours are per-vertex multipliers: a number (grey shade) or [r, g, b].
import * as THREE from 'three';

const col = (c) => (typeof c === 'number' ? [c, c * 0.985, c * 0.96] : c);
export const hexRGB = (h) => { const n = parseInt(String(h).replace('#', ''), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
export const mulRGB = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

export class Geo {
  constructor() { this.p = []; this.n = []; this.u = []; this.c = []; this.i = []; }
  get tris() { return this.i.length / 3; }
  vert(x, y, z, n, u, v, c) { this.p.push(x, y, z); this.n.push(n[0], n[1], n[2]); this.u.push(u, v); const k = col(c); this.c.push(k[0], k[1], k[2]); return this.p.length / 3 - 1; }
  quad(a, b, c, d, n, uvs, cols) { // CCW as seen from the normal side
    const k = [a, b, c, d].map((v, j) => this.vert(v[0], v[1], v[2], n, uvs[j][0], uvs[j][1], Array.isArray(cols) && Array.isArray(cols[0]) || (Array.isArray(cols) && typeof cols[0] === 'number' && cols.length === 4) ? cols[j] : cols));
    this.i.push(k[0], k[1], k[2], k[0], k[2], k[3]);
  }
  wall(x0, z0, x1, z1, n, yb0, yb1, yt0, yt1, tile, cBot = 1, cTop = 1) { // vertical face between (x0,z0)-(x1,z1)
    const r = [n[2], 0, -n[0]]; let A = [x0, z0], B = [x1, z1];
    if (A[0] * r[0] + A[1] * r[2] > B[0] * r[0] + B[1] * r[2]) { [A, B] = [B, A]; [yb0, yb1] = [yb1, yb0]; [yt0, yt1] = [yt1, yt0]; }
    const ua = (A[0] * r[0] + A[1] * r[2]) / tile, ub = (B[0] * r[0] + B[1] * r[2]) / tile;
    this.quad([A[0], yb0, A[1]], [B[0], yb1, B[1]], [B[0], yt1, B[1]], [A[0], yt0, A[1]], n, [[ua, yb0 / tile], [ub, yb1 / tile], [ub, yt1 / tile], [ua, yt0 / tile]], [cBot, cBot, cTop, cTop]);
  }
  floor(x0, z0, x1, z1, y00, y10, y11, y01, tile, c = 1, down = false) {
    const ex = [x1 - x0, y10 - y00, 0], ez = [0, y01 - y00, z1 - z0];
    let n = [ex[1] * ez[2] - ex[2] * ez[1], ex[2] * ez[0] - ex[0] * ez[2], ex[0] * ez[1] - ex[1] * ez[0]]; const l = Math.hypot(...n); n = n.map((v) => -v / l);
    if (down) { n = n.map((v) => -v); this.quad([x0, y00, z0], [x1, y10, z0], [x1, y11, z1], [x0, y01, z1], n, [[x0 / tile, z0 / tile], [x1 / tile, z0 / tile], [x1 / tile, z1 / tile], [x0 / tile, z1 / tile]], c); }
    else this.quad([x0, y01, z1], [x1, y11, z1], [x1, y10, z0], [x0, y00, z0], n, [[x0 / tile, z1 / tile], [x1 / tile, z1 / tile], [x1 / tile, z0 / tile], [x0 / tile, z0 / tile]], c);
  }
  box(x0, y0, z0, x1, y1, z1, tile, c = 1, skipBottom = true) {
    const k = col(c), top = mulRGB(k, 1.05), side = mulRGB(k, 0.8);
    this.floor(x0, z0, x1, z1, y1, y1, y1, y1, tile, top);
    if (!skipBottom) this.floor(x0, z0, x1, z1, y0, y0, y0, y0, tile, mulRGB(k, 0.6), true);
    const f = (a, b, c2, d, n) => this.wall(a, b, c2, d, n, y0, y0, y1, y1, tile, side, k);
    f(x0, z0, x1, z0, [0, 0, -1]); f(x0, z1, x1, z1, [0, 0, 1]); f(x0, z0, x0, z1, [-1, 0, 0]); f(x1, z0, x1, z1, [1, 0, 0]);
  }
  // ---- transformed primitives for props (local box centred at cx,cz on the ground y; rotated about Y by r; scaled by s) ----
  tbox(T, cx, y0, cz, sx, sy, sz, c, uvScale = 1) {
    const k = col(c), co = Math.cos(T.r || 0), si = Math.sin(T.r || 0), s = T.s || 1;
    const P = (lx, ly, lz) => { const X = lx * s, Z = lz * s; return [T.x + X * co + Z * si, T.y + ly * s, T.z - X * si + Z * co]; };
    const N = (nx, nz) => [nx * co + nz * si, 0, -nx * si + nz * co];
    const hx = sx / 2, hz = sz / 2, x0 = cx - hx, x1 = cx + hx, z0 = cz - hz, z1 = cz + hz, y1 = y0 + sy;
    const q = (a, b, c2, d, n, cc) => this.quad(P(...a), P(...b), P(...c2), P(...d), n, [[0, 0], [uvScale, 0], [uvScale, uvScale], [0, uvScale]], cc);
    q([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], mulRGB(k, 1.08));
    q([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], N(0, -1), [mulRGB(k, 0.7), mulRGB(k, 0.7), k, k]);
    q([x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], N(0, 1), [mulRGB(k, 0.7), mulRGB(k, 0.7), k, k]);
    q([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], N(-1, 0), [mulRGB(k, 0.75), mulRGB(k, 0.75), mulRGB(k, 0.95), mulRGB(k, 0.95)]);
    q([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], N(1, 0), [mulRGB(k, 0.75), mulRGB(k, 0.75), mulRGB(k, 0.95), mulRGB(k, 0.95)]);
  }
  // upright cylinder / cone frustum (r0 bottom, r1 top)
  tcyl(T, cx, y0, cz, r0, r1, h, seg, c) {
    const k = col(c), co = Math.cos(T.r || 0), si = Math.sin(T.r || 0), s = T.s || 1;
    const P = (lx, ly, lz) => { const X = lx * s, Z = lz * s; return [T.x + X * co + Z * si, T.y + ly * s, T.z - X * si + Z * co]; };
    for (let j = 0; j < seg; j++) {
      const a0 = (j / seg) * Math.PI * 2, a1 = ((j + 1) / seg) * Math.PI * 2, am = (a0 + a1) / 2;
      const n = [Math.cos(am) * co + Math.sin(am) * si, (r0 - r1) / Math.max(h, 1e-3) * 0.5, -Math.cos(am) * si + Math.sin(am) * co];
      const nl = Math.hypot(...n); const nn = [n[0] / nl, n[1] / nl, n[2] / nl];
      this.quad(P(cx + Math.cos(a0) * r0, y0, cz + Math.sin(a0) * r0), P(cx + Math.cos(a1) * r0, y0, cz + Math.sin(a1) * r0), P(cx + Math.cos(a1) * r1, y0 + h, cz + Math.sin(a1) * r1), P(cx + Math.cos(a0) * r1, y0 + h, cz + Math.sin(a0) * r1), nn, [[0, 0], [1, 0], [1, 1], [0, 1]], [mulRGB(k, 0.72), mulRGB(k, 0.72), k, k]);
    }
    if (r1 > 0.01) for (let j = 0; j < seg; j++) { // cap
      const a0 = (j / seg) * Math.PI * 2, a1 = ((j + 1) / seg) * Math.PI * 2, tk = mulRGB(k, 1.08);
      this.quad(P(cx, y0 + h, cz), P(cx + Math.cos(a1) * r1, y0 + h, cz + Math.sin(a1) * r1), P(cx + Math.cos(a0) * r1, y0 + h, cz + Math.sin(a0) * r1), P(cx, y0 + h, cz), [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], tk);
    }
  }
  bounds() { const b = new THREE.Box3(); const v = new THREE.Vector3(); for (let i = 0; i < this.p.length; i += 3) b.expandByPoint(v.set(this.p[i], this.p[i + 1], this.p[i + 2])); return b; }
  mesh(mat, shadows = true) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere(); g.computeBoundingBox(); const m = new THREE.Mesh(g, mat); m.castShadow = shadows; m.receiveShadow = true; m.matrixAutoUpdate = false; return m;
  }
}
