// Draws the original mesh (cs-map-bin: <name>.json + <name>.bin) of a map that has `def.mesh`.
//   def.mesh = { url: '/mapmesh/dust2_bin', scale: 39.37, ox, oy, oz }      world = mesh * scale + (ox, oy, oz)
// Collision/physics always use the baked 1 m grid (shared/meshbake.js); this is only what you SEE.
//
// The mesh is cut into spatial tiles (24 m) so the GPU can frustum-cull it, tiny triangles are dropped by detail level
// (they are ~1% of the surface but half of the triangles) and surfaces are tinted by their direction (floor / wall / underside)
// because the file has no textures.
import * as THREE from 'three';
import { unpackContainer } from '/shared/meshfile.js';

const TILE = 24;
export const DETAIL = { high: 0.05, medium: 0.15, low: 0.3 };   // drop triangles whose longest edge is shorter than this (m)

// in-memory sources (map editor: files the user just picked) are looked up before the network
const sources = new Map();
export function registerMeshSource(url, manifest, buffer) { sources.set(url, { manifest, buffer }); }
export const hasMeshSource = (url) => sources.has(url);

async function fetchSource(url, onProgress) {
  if (sources.has(url)) return sources.get(url);
  // <url>.json (small manifest; for static hosting it lists how many <url>.bin.<n> parts the geometry is split into) + the geometry
  let manifest = null; try { const mr = await fetch(url + '.json'); if (mr.ok) manifest = await mr.json(); } catch (e) { /* maybe a single-file .bin */ }
  const grab = async (u, expect, base) => { // download one file with progress (base..base+share of the bar)
    const r = await fetch(u); if (!r.ok) throw new Error('mesh ' + u + ' ' + r.status);
    const total = +r.headers.get('content-length') || expect || 0;
    if (!r.body || !total) return new Uint8Array(await r.arrayBuffer());
    const rd = r.body.getReader(), got = []; let n = 0; for (;;) { const { done, value } = await rd.read(); if (done) break; got.push(value); n += value.length; onProgress?.(base.at + n / total * base.share); }
    const all = new Uint8Array(n); let o = 0; for (const p of got) { all.set(p, o); o += p.length; } return all;
  };
  let u8;
  if (manifest && manifest.parts > 1) {   // split for static hosting (Cloudflare assets: max 25 MiB per file)
    const k = manifest.parts, per = manifest.bytes ? manifest.bytes / k : 0; const pieces = [];
    for (let i = 0; i < k; i++) pieces.push(await grab(url + '.bin.' + i, per, { at: i / k * 0.5, share: 0.5 / k }));
    u8 = new Uint8Array(pieces.reduce((n, a) => n + a.length, 0)); let o = 0; for (const p of pieces) { u8.set(p, o); o += p.length; }
  } else u8 = await grab(url + '.bin', 0, { at: 0, share: 0.5 });
  const buffer = u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength ? u8.buffer : u8.slice().buffer;
  if (!manifest || !manifest.geometries) { manifest = unpackContainer(buffer); if (!manifest) throw new Error('mesh: no manifest (.json) next to the .bin and none embedded in it'); }
  return { manifest, buffer };
}

function makeMaterial(th) {
  const floor = new THREE.Color(th.floor || '#cdb98f'), wall = new THREE.Color(th.wall || '#c4a574');
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0, side: THREE.FrontSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uFloor = { value: floor }; sh.uniforms.uWall = { value: wall };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp; varying vec3 vWn;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix * vec4(position, 1.0)).xyz; vWn = normalize(mat3(modelMatrix) * normal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vWp; varying vec3 vWn; uniform vec3 uFloor; uniform vec3 uWall;
float h21(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float up = clamp(vWn.y, 0.0, 1.0), dn = clamp(-vWn.y, 0.0, 1.0);
  vec3 c = mix(uWall, uFloor, smoothstep(0.45, 0.85, up));
  c = mix(c, uWall * 0.5, smoothstep(0.3, 0.8, dn));
  vec2 q = vWp.xz + vec2(vWp.y * 1.7, vWp.y * 0.9);          // vertical faces vary with height too
  float big = vn(q * 0.11), mid = vn(q * 0.9), grain = vn(q * 6.0);
  c *= (0.88 + 0.24 * big) * (0.94 + 0.10 * mid) * (0.97 + 0.06 * grain);
  c *= 0.86 + 0.14 * clamp(vWp.y / 10.0, 0.0, 1.0);
  diffuseColor.rgb *= c;
}`);
  };
  return mat;
}

// -> { group, ready: Promise, dispose, stats(), cancel() }
export function attachMesh(parent, def, opts = {}) {
  const md = def.mesh, group = new THREE.Group(); group.name = 'mesh-map'; parent.add(group);
  const state = { tris: 0, tiles: 0, loaded: false, error: null, progress: 0 };
  let dead = false; const geos = []; let mat = null;
  const detail = DETAIL[opts.detail] ?? DETAIL.medium;
  const ready = (async () => {
    const src = await fetchSource(md.url, (p) => { state.progress = p; opts.onProgress?.(p); });
    if (dead) return; const { manifest, buffer } = src; mat = makeMaterial(opts.theme || {});
    const sc = md.scale || 1, ox = md.ox || 0, oy = md.oy || 0, oz = md.oz || 0, gl = manifest.geometries;
    // pass 1: count the kept triangles per tile, pass 2: fill exact-size arrays
    const tiles = new Map(); const tkey = (cx, cz) => cx * 4096 + cz; const min2 = detail * detail / (sc * sc);   // threshold in mesh units, squared
    const decode = (g) => { const q = new Uint16Array(buffer, g.pos, g.vertexCount * 3), idx = g.index32 ? new Uint32Array(buffer, g.idx, g.indexCount) : new Uint16Array(buffer, g.idx, g.indexCount);
      const nr = g.nrm !== undefined ? new Int8Array(buffer, g.nrm, g.vertexCount * 3) : null;
      const P = new Float32Array(g.vertexCount * 3), kx = g.posRange[0] / 65535, ky = g.posRange[1] / 65535, kz = g.posRange[2] / 65535;
      for (let i = 0, n = g.vertexCount; i < n; i++) { P[i * 3] = g.posMin[0] + q[i * 3] * kx; P[i * 3 + 1] = g.posMin[1] + q[i * 3 + 1] * ky; P[i * 3 + 2] = g.posMin[2] + q[i * 3 + 2] * kz; }
      return { P, idx, nr }; };
    const kept = (P, a, b, c) => { const d1 = (P[a] - P[b]) ** 2 + (P[a + 1] - P[b + 1]) ** 2 + (P[a + 2] - P[b + 2]) ** 2, d2 = (P[a] - P[c]) ** 2 + (P[a + 1] - P[c + 1]) ** 2 + (P[a + 2] - P[c + 2]) ** 2, d3 = (P[b] - P[c]) ** 2 + (P[b + 1] - P[c + 1]) ** 2 + (P[b + 2] - P[c + 2]) ** 2; return Math.max(d1, d2, d3) >= min2; };
    const tileOf = (P, a, b, c) => { const x = ((P[a] + P[b] + P[c]) / 3 * sc + ox) / TILE, z = ((P[a + 2] + P[b + 2] + P[c + 2]) / 3 * sc + oz) / TILE; return tkey(Math.floor(x) + 64, Math.floor(z) + 64); };
    let gi = 0;
    for (const g of gl) { const { P, idx } = decode(g); for (let t = 0; t < g.indexCount; t += 3) { const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3; if (!kept(P, a, b, c)) continue; const k = tileOf(P, a, b, c); tiles.set(k, (tiles.get(k) || 0) + 1); }
      state.progress = 0.5 + ++gi / gl.length * 0.25; opts.onProgress?.(state.progress); if (gi % 6 === 0) { await new Promise((r) => setTimeout(r)); if (dead) return; } }
    const bufs = new Map(); for (const [k, n] of tiles) bufs.set(k, { pos: new Float32Array(n * 9), nrm: new Int8Array(n * 9), n: 0 });
    gi = 0;
    for (const g of gl) { const { P, idx, nr } = decode(g);
      for (let t = 0; t < g.indexCount; t += 3) {
        const ia = idx[t], ib = idx[t + 1], ic = idx[t + 2], a = ia * 3, b = ib * 3, c = ic * 3; if (!kept(P, a, b, c)) continue;
        const B = bufs.get(tileOf(P, a, b, c)), o = B.n * 9; B.n++;
        for (let v = 0; v < 3; v++) { const s = (v === 0 ? a : v === 1 ? b : c); B.pos[o + v * 3] = P[s] * sc + ox; B.pos[o + v * 3 + 1] = P[s + 1] * sc + oy; B.pos[o + v * 3 + 2] = P[s + 2] * sc + oz;
          if (nr) { B.nrm[o + v * 3] = nr[s]; B.nrm[o + v * 3 + 1] = nr[s + 1]; B.nrm[o + v * 3 + 2] = nr[s + 2]; } }
        if (!nr) { // no stored normals: flat normal
          const ux = B.pos[o + 3] - B.pos[o], uy = B.pos[o + 4] - B.pos[o + 1], uz = B.pos[o + 5] - B.pos[o + 2], vx = B.pos[o + 6] - B.pos[o], vy = B.pos[o + 7] - B.pos[o + 1], vz = B.pos[o + 8] - B.pos[o + 2];
          let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx = nx / l * 127; ny = ny / l * 127; nz = nz / l * 127; for (let v = 0; v < 3; v++) { B.nrm[o + v * 3] = nx; B.nrm[o + v * 3 + 1] = ny; B.nrm[o + v * 3 + 2] = nz; } }
      }
      state.progress = 0.75 + ++gi / gl.length * 0.25; opts.onProgress?.(state.progress); if (gi % 6 === 0) { await new Promise((r) => setTimeout(r)); if (dead) return; } }
    for (const B of bufs.values()) {
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(B.pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(B.nrm, 3, true));
      geo.computeBoundingSphere(); geo.computeBoundingBox(); const mesh = new THREE.Mesh(geo, mat); mesh.matrixAutoUpdate = false; mesh.castShadow = false; mesh.receiveShadow = false; group.add(mesh); geos.push(geo);
      state.tris += B.n; state.tiles++;
    }
    state.loaded = true; opts.onProgress?.(1); opts.onReady?.(state);
  })().catch((e) => { state.error = e; console.error('[meshview]', e); opts.onError?.(e); });
  return {
    group, ready, state, stats: () => ({ ...state }),
    dispose() { dead = true; parent.remove(group); for (const g of geos) g.dispose(); mat?.dispose(); },
  };
}
