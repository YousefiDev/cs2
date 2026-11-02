// CS2 weapon models (GLB exports from Source 2 Viewer, textures stripped) for the game.
// Self-contained GLB reader: /vendor only ships three's core, so there is no GLTFLoader.
//
// Game conventions: weapon points down -Z, +Y is up, origin = firing-hand grip.
// The CS2 exports point down +Z, so every firearm is turned 180deg about Y on load.
// Models stream in lazily; until one has arrived makeGun() keeps using the procedural
// model, and `onGunModelsChanged` tells the game when a swap is possible.
import * as THREE from 'three';

const BASE = '/weapons/models/';

// ------------------------------------------------------------------ catalogue
// kind -> orientation / scale / where the off-hand goes (sup = fraction of the muzzle distance)
const KIND = {
  rifle:   { rotY: Math.PI, sup: 0.47 },
  smg:     { rotY: Math.PI, sup: 0.45 },
  sniper:  { rotY: Math.PI, sup: 0.38 },
  shotgun: { rotY: Math.PI, sup: 0.50 },
  mg:      { rotY: Math.PI, sup: 0.42 },
  pistol:  { rotY: Math.PI, pistol: true },
  nade:    { rotY: Math.PI, offset: [0, 0.02, -0.035], muzzle: [0, 0, -0.05] },   // sits in the palm like the procedural nades
  knife:   { rotX: -Math.PI / 2, rotZ: Math.PI, scale: 1.3, tip: true },   // rotZ: edge down, spine up like the real thing                       // blade runs along +Y in the export
  c4:      { rotY: 0, offset: [0, 0, -0.08], muzzle: [0, 0, -0.2] },
};
// colour / roughness / metalness per model (the GLBs carry no materials)
const F = (file, kind, color, rough = 0.45, metal = 0.6, extra = {}) => ({ file, kind, color, rough, metal, ...extra });
const CFG = {
  // rifles
  ak47:   F('ak47/weapon_rif_ak47.glb', 'rifle', '#4a4038', 0.5, 0.5),
  m4a4:   F('m4a4/weapon_rif_m4a4.glb', 'rifle', '#2b2d30', 0.45, 0.6, { shift: [0, -0.195, 0.376] }),   // export origin is off the grip: lined up with the M4A1-S
  m4a1s:  F('m4a1_silencer/weapon_rif_m4a1_silencer.glb', 'rifle', '#35383c'),
  galil:  F('galilar/weapon_rif_galilar.glb', 'rifle', '#4a4f55'),
  famas:  F('famas/weapon_rif_famas.glb', 'rifle', '#3d4a3d', 0.55, 0.4),
  sg553:  F('sg556/weapon_rif_sg556.glb', 'rifle', '#2e3034'),
  aug:    F('aug/weapon_rif_aug.glb', 'rifle', '#4b5646', 0.55, 0.4),
  // snipers
  awp:    F('awp/weapon_snip_awp.glb', 'sniper', '#4d5b3c', 0.55, 0.35, { shift: [0, -0.155, 0] }),
  ssg08:  F('ssg08/weapon_snip_ssg08.glb', 'sniper', '#5a6247', 0.55, 0.35),
  g3sg1:  F('g3sg1/weapon_snip_g3sg1.glb', 'sniper', '#3f4338', 0.55, 0.4, { shift: [0, -0.07, 0.35] }),
  scar20: F('scar20/weapon_snip_scar20.glb', 'sniper', '#6f6650', 0.55, 0.4, { shift: [0, -0.25, 0.38] }),
  // SMGs
  mac10:  F('mac10/weapon_smg_mac10.glb', 'smg', '#30343a', 0.45, 0.6, { shift: [0, -0.03, 0.10] }),
  mp9:    F('mp9/weapon_smg_mp9.glb', 'smg', '#2b2d30', 0.45, 0.6, { shift: [0, -0.06, 0.12] }),
  p90:    F('p90/weapon_smg_p90.glb', 'smg', '#3a3b38', 0.6, 0.3),
  mp7:    F('mp7/weapon_smg_mp7.glb', 'smg', '#2c2e31'),
  mp5sd:  F('mp5sd/weapon_smg_mp5sd.glb', 'smg', '#2a2c2f'),
  ump45:  F('ump45/weapon_smg_ump45.glb', 'smg', '#3a3d41'),
  bizon:  F('bizon/weapon_smg_bizon.glb', 'smg', '#44484c'),
  // heavy
  nova:     F('nova/weapon_shot_nova.glb', 'shotgun', '#3d3f42'),
  xm1014:   F('xm1014/weapon_shot_xm1014.glb', 'shotgun', '#2b2d30'),
  sawedoff: F('sawedoff/weapon_shot_sawedoff.glb', 'shotgun', '#5a4a38', 0.6, 0.3),
  m249:   F('m249/weapon_mach_m249.glb', 'mg', '#3a3d3a', 0.55, 0.45),
  negev:  F('negev/weapon_mach_negev.glb', 'mg', '#4a4f49', 0.55, 0.45),
  // pistols
  glock:     F('glock18/weapon_pist_glock18.glb', 'pistol', '#25272a', 0.55, 0.35, { shift: [0, 0, -0.02] }),
  usp:       F('usp_silencer/weapon_pist_usp_silencer.glb', 'pistol', '#2d3035', 0.45, 0.6, { shift: [0, -0.005, 0.056] }),
  p2000:     F('hkp2000/weapon_pist_hkp2000.glb', 'pistol', '#3a3e44', 0.45, 0.6, { shift: [0, -0.015, 0.068] }),
  deagle:    F('deagle/weapon_pist_deagle.glb', 'pistol', '#b9bcc0', 0.3, 0.9, { shift: [0, 0, -0.044] }),
  elite:     F('elite/weapon_pist_elite.glb', 'pistol', '#4a4d52', 0.4, 0.6, { shift: [0, -0.006, 0.011], split: { x: 0.25, leftX: -0.108 } }),   // export holds both guns side by side
  p250:      F('p250/weapon_pist_p250.glb', 'pistol', '#4b4f55', 0.45, 0.6, { shift: [0, -0.056, 0.03] }),
  tec9:      F('tec9/weapon_pist_tec9.glb', 'pistol', '#2a2c30', 0.45, 0.6, { shift: [0, -0.05, 0.107] }),
  fiveseven: F('fiveseven/weapon_pist_fiveseven.glb', 'pistol', '#4d5040', 0.5, 0.4, { shift: [0, -0.101, -0.021] }),
  cz75:      F('cz75a/weapon_pist_cz75a.glb', 'pistol', '#4a4d52', 0.45, 0.6, { shift: [0, -0.027, 0.014] }),
  r8:        F('revolver/weapon_pist_revolver.glb', 'pistol', '#6b7078', 0.35, 0.8, { shift: [0, 0, -0.025], cut: { zMax: 0.30 } }),   // cut: loose speed-loader piece floating in front of the barrel
  zeus:      F('taser/weapon_pist_taser.glb', 'pistol', '#c9c14a', 0.5, 0.3, { shift: [0, -0.044, -0.04] }),
  // grenades
  he:         F('grenade/hegrenade/weapon_hegrenade.glb', 'nade', '#4d5b3c', 0.6, 0.3),
  flash:      F('grenade/flashbang/weapon_flashbang.glb', 'nade', '#7a7f85', 0.5, 0.5),
  smoke:      F('grenade/smokegrenade/weapon_smokegrenade.glb', 'nade', '#66765a', 0.6, 0.3),
  decoy:      F('grenade/decoy/weapon_decoy.glb', 'nade', '#8c7a4f', 0.6, 0.3),
  molotov:    F('grenade/molotov/weapon_molotov.glb', 'nade', '#7c5a2c', 0.4, 0.2),
  incendiary: F('grenade/incendiary/weapon_incendiarygrenade.glb', 'nade', '#b8553a', 0.55, 0.3),
  // melee / bomb  (knife: one model per team)
  knife_ct: F('knife/knife_default_ct/weapon_knife_default_ct.glb', 'knife', '#c3cad1', 0.25, 0.92, { zones: 'knife' }),
  knife_t:  F('knife/knife_default_t/weapon_knife_default_t.glb', 'knife', '#c3cad1', 0.25, 0.92, { zones: 'knife' }),
  c4:       F('c4/weapon_c4.glb', 'c4', '#a89968', 0.8, 0.05, { screenPrim: 0, accent: '#2b2d30', dark: '#121314' }),
  // mag7: no GLB in the pack -> keeps the procedural model
};
// per-weapon colours of the individual parts (body = cfg.color; slide/mag/accent/dark override the defaults)
// partFn(x,y,z)/pieceFn(centerY,centerZ,piece) pick a colour by position in the export's own axes (+Z = muzzle)
const WOOD = '#8a5a2b', STEEL = '#1d1f21';
const PAL = {
  ak47:   { color: '#2f3033', mag: '#3b3a38', dark: '#17181a', partFn: (x, y, z) => (z < 0.045 || (z > 0.26 && z < 0.47 && Math.hypot(x, y - 0.066) > 0.017) ? WOOD : z > 0.47 ? STEEL : null), pieceFn: (cy, cz) => (cz < 0.06 && cy < 0.02 ? WOOD : cz > 0.26 && cz < 0.47 && cy < 0.1 ? WOOD : null) },
  m4a4:   { color: '#2a2c2f', mag: '#1e1f21', accent: '#3a3d41' },
  m4a1s:  { color: '#2f3236', mag: '#1e1f21', accent: '#3f4348' },
  awp:    { partFn: (x, y, z) => (z > 0.58 ? STEEL : null) },
  ssg08:  { color: '#4a5238', partFn: (x, y, z) => (z > 0.5 ? STEEL : null) },
  scar20: { color: '#3b3d40', mag: '#2a2c2e', accent: '#6f6650' },
  g3sg1:  { color: '#34373a', mag: '#26282a' },
  glock:  { color: '#2a2c2e', slide: '#3c3f43' },
  usp:    { color: '#26282b', slide: '#4a4e55', slideH: 0.04 },
  p2000:  { color: '#33373d', slide: '#4f545b' },
  deagle: { color: '#a9adb2', slide: '#b4b8bd', slideH: 0.055, dark: '#2a2c2f' },
  elite:  { color: '#3c3f44', slide: '#6d7177' },
  p250:   { color: '#3d4147', slide: '#5d6269' },
  tec9:   { color: '#2a2c30', slide: '#3c3f44', slideH: 0.04 },
  fiveseven: { color: '#5b5340', slide: '#2d2f31' },
  cz75:   { color: '#3a3d41', slide: '#6a6e74' },
  r8:     { color: '#6b7078', partFn: (x, y, z) => (y < 0.0 && z > -0.03 && z < 0.04 ? '#5a3a22' : null) },
  zeus:   { dark: '#1c1c1c' },
  m249:   { color: '#33362f', mag: '#3d4a36' },
  negev:  { color: '#3f443f', mag: '#2e332e' },
  nova:   { color: '#2f3134', partFn: (x, y, z) => (z < 0.0 || (z > 0.28 && z < 0.5 && y < 0.08) ? '#3a2a1e' : null) },
};
for (const k in PAL) Object.assign(CFG[k], PAL[k]);
export const GLB_KEYS = Object.keys(CFG);
// loaded first (before a match starts); the rest streams in afterwards
export const ESSENTIAL = ['knife_ct', 'knife_t', 'glock', 'usp', 'p2000', 'c4', 'he', 'flash', 'smoke', 'deagle', 'ak47', 'm4a4', 'm4a1s', 'awp'];

const tkeyFor = (k, team) => (k === 'knife' ? (team === 'T' ? 'knife_t' : 'knife_ct') : k);

// ------------------------------------------------------------------ GLB reader
const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function parseGLB(buf) {
  const dv = new DataView(buf);
  if (dv.byteLength < 20 || dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB file');
  let off = 12, json = null, bin = null;
  while (off + 8 <= buf.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true); off += 8;
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, off, len)));
    else if (type === 0x004e4942) bin = buf.slice(off, off + len);   // slice -> aligned copy
    off += len;                                                      // chunk lengths are already 4-byte padded
  }
  if (!json || !bin) throw new Error('GLB without JSON/BIN chunk');
  return { json, bin };
}

function readAccessor(glb, i) {
  const { json, bin } = glb, a = json.accessors[i], bv = json.bufferViews[a.bufferView];
  const T = COMP[a.componentType], n = NCOMP[a.type], es = T.BYTES_PER_ELEMENT;
  const start = (bv.byteOffset || 0) + (a.byteOffset || 0), stride = bv.byteStride;
  if (!stride || stride === n * es) return new T(bin, start, a.count * n);
  const out = new T(a.count * n), src = new DataView(bin);
  for (let v = 0; v < a.count; v++) for (let c = 0; c < n; c++) {
    const p = start + v * stride + c * es;
    out[v * n + c] = es === 4 ? (T === Float32Array ? src.getFloat32(p, true) : src.getUint32(p, true)) : es === 2 ? src.getUint16(p, true) : src.getUint8(p);
  }
  return out;
}

function nodeMatrix(n) {
  const m = new THREE.Matrix4();
  if (n.matrix) m.fromArray(n.matrix);
  else m.compose(new THREE.Vector3(...(n.translation || [0, 0, 0])), new THREE.Quaternion(...(n.rotation || [0, 0, 0, 1])), new THREE.Vector3(...(n.scale || [1, 1, 1])));
  return m;
}

// -> [{ geo, prim, material }] with node transforms baked in
function extractPrimitives(glb) {
  const { json } = glb, out = [];
  const visit = (ni, parent) => {
    const n = json.nodes[ni], world = parent.clone().multiply(nodeMatrix(n));
    if (n.mesh !== undefined) {
      for (const p of json.meshes[n.mesh].primitives) {
        if (p.mode !== undefined && p.mode !== 4) continue;              // triangles only
        const g = new THREE.BufferGeometry(), at = p.attributes;
        g.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(readAccessor(glb, at.POSITION)), 3));
        if (at.NORMAL !== undefined) g.setAttribute('normal', new THREE.BufferAttribute(Float32Array.from(readAccessor(glb, at.NORMAL)), 3));
        if (at.TEXCOORD_0 !== undefined) g.setAttribute('uv', new THREE.BufferAttribute(Float32Array.from(readAccessor(glb, at.TEXCOORD_0)), 2));
        if (p.indices !== undefined) g.setIndex(new THREE.BufferAttribute(Uint32Array.from(readAccessor(glb, p.indices)), 1));
        if (at.NORMAL === undefined) g.computeVertexNormals();
        g.applyMatrix4(world);
        out.push({ geo: g, prim: out.length, material: p.material });
      }
    }
    for (const c of n.children || []) visit(c, world);
  };
  const scene = json.scenes && json.scenes[json.scene || 0];
  for (const ni of (scene ? scene.nodes : json.nodes.map((_, i) => i))) visit(ni, new THREE.Matrix4());
  return out;
}

// Optional: a GLB that still carries a base-colour factor / texture keeps it (future textured exports).
async function embeddedMaterial(glb, idx, cache) {
  const m = glb.json.materials && glb.json.materials[idx]; if (!m) return null;
  if (cache.has(idx)) return cache.get(idx);
  const pbr = m.pbrMetallicRoughness || {}, f = pbr.baseColorFactor || [1, 1, 1, 1];
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(f[0], f[1], f[2]), roughness: pbr.roughnessFactor ?? 0.6, metalness: pbr.metallicFactor ?? 0.2 });
  const ti = pbr.baseColorTexture && pbr.baseColorTexture.index;
  if (ti !== undefined && typeof createImageBitmap === 'function') {
    try {
      const img = glb.json.images[glb.json.textures[ti].source], bv = glb.json.bufferViews[img.bufferView];
      const blob = new Blob([new Uint8Array(glb.bin, bv.byteOffset || 0, bv.byteLength)], { type: img.mimeType || 'image/png' });
      const tex = new THREE.Texture(await createImageBitmap(blob, { imageOrientation: 'none' }));
      tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true; mat.map = tex;
      if (f[3] < 1 || m.alphaMode === 'BLEND') { mat.transparent = true; mat.opacity = f[3]; }
    } catch (e) { /* keep the flat colour */ }
  }
  cache.set(idx, mat); return mat;
}

// ------------------------------------------------------------------ template building
const median = (a) => { const s = Float32Array.from(a).sort(); return s.length ? s[s.length >> 1] : 0; };
const percentile = (a, p) => { const s = Float32Array.from(a).sort(); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0; };

// two-tone vertex colours for models that are a single mesh (knife handle/blade, C4 timer/bricks); pre-rotation coords
function zoneColors(geo, zones) {
  const p = geo.attributes.position, c = new Float32Array(p.count * 3), a = new THREE.Color();
  const steel = new THREE.Color('#c3cad1'), grip = new THREE.Color('#22262b'), brick = new THREE.Color('#b9a577'), plastic = new THREE.Color('#222426');
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (zones === 'knife') a.copy(y < 0.0 ? grip : steel); else a.copy(y > 0.008 ? plastic : brick);
    c[i * 3] = a.r; c[i * 3 + 1] = a.g; c[i * 3 + 2] = a.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
}

// ---- part-by-part colouring: the exports have no textures, so parts are told apart by geometry --------------
// 1) weld vertices -> connected pieces (scope, magazine, sights, pins ... are separate pieces)
// 2) colour pieces by role (body / magazine / optic / small parts), 3) split the big body piece by position
function pieces(geo) {
  const pos = geo.attributes.position, n = pos.count, idx = geo.index.array, id = new Int32Array(n), map = new Map();
  for (let i = 0; i < n; i++) { const k = Math.round(pos.getX(i) * 1e4) + ',' + Math.round(pos.getY(i) * 1e4) + ',' + Math.round(pos.getZ(i) * 1e4); let w = map.get(k); if (w === undefined) { w = map.size; map.set(k, w); } id[i] = w; }
  const par = new Int32Array(map.size).map((_, i) => i), find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  for (let i = 0; i < idx.length; i += 3) { const a = find(id[idx[i]]), b = find(id[idx[i + 1]]), c = find(id[idx[i + 2]]); par[b] = a; par[c] = a; }
  const label = new Int32Array(n), stats = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(id[i]); label[i] = r; let st = stats.get(r);
    if (!st) { st = { n: 0, min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] }; stats.set(r, st); }
    st.n++; const v = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    for (let c = 0; c < 3; c++) { if (v[c] < st.min[c]) st.min[c] = v[c]; if (v[c] > st.max[c]) st.max[c] = v[c]; }
  }
  return { label, stats };
}
const _hex = new Map(); const hexc = (h) => { let c = _hex.get(h); if (!c) { c = new THREE.Color(h); _hex.set(h, c); } return c; };
const shade = (hex, f) => new THREE.Color(hex).multiplyScalar(f);

function paintGeo(geo, prim, cfg) {
  const pos = geo.attributes.position, n = pos.count, col = new Float32Array(n * 3), K = KIND[cfg.kind];
  const base = new THREE.Color(cfg.color), dark = new THREE.Color(cfg.dark || '#15171a'), optic = new THREE.Color('#0d0e10');
  const mag = cfg.mag ? new THREE.Color(cfg.mag) : shade(cfg.color, 0.78), accent = cfg.accent ? new THREE.Color(cfg.accent) : shade(cfg.color, 0.62);
  const slide = cfg.slide ? new THREE.Color(cfg.slide) : null;
  const put = (i, c) => { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; };
  const isMain = cfg.screenPrim === undefined ? prim === 0 : prim !== cfg.screenPrim;
  if (!isMain || !geo.index) { for (let i = 0; i < n; i++) put(i, dark); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); return; }
  const { label, stats } = pieces(geo);
  let main = null; for (const [r, st] of stats) if (!main || st.n > stats.get(main).n) main = r;
  const M = stats.get(main), nade = cfg.kind === 'nade';
  for (let i = 0; i < n; i++) {
    const st = stats.get(label[i]), x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const cy = (st.min[1] + st.max[1]) / 2, cz = (st.min[2] + st.max[2]) / 2, zlen = st.max[2] - st.min[2];
    let c;
    if (label[i] === main) {
      c = base;
      if (K.pistol && slide) c = y > M.max[1] - (cfg.slideH || 0.034) ? slide : base;                     // slide vs frame
      const pf = cfg.partFn && cfg.partFn(x, y, z); if (pf) c = hexc(pf);                                // wood / barrel / furniture by position
    } else if (cfg.pieceFn && cfg.pieceFn(cy, cz, st)) c = hexc(cfg.pieceFn(cy, cz, st));
    else if (st.n > 600 && st.min[1] >= M.max[1] - 0.02 && zlen > 0.08 && !K.pistol && !nade) c = optic;   // scope / sight tube sitting on top
    else if (st.n > 600 && st.min[1] < M.min[1] - 0.025 && !K.pistol && !nade) c = mag;                    // hangs below the body = magazine / drum / box
    else if (st.n < 1200) c = dark;                                                                       // sights, pins, trigger, levers
    else c = accent;
    put(i, c);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

// keep only the triangles whose centroid satisfies `pick(cx, cy, cz)`; the result keeps just the vertices it uses,
// so bounds and measurements are per piece. partition() returns [matching, rest].
function partition(geo, pick) {
  const idx = geo.index.array, pos = geo.attributes.position, A = [], B = [];
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    (pick((pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3, (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3, (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3) ? A : B).push(a, b, c);
  }
  const mk = (tris) => {
    const remap = new Map(), order = [], ni = new Uint32Array(tris.length);
    tris.forEach((v, i) => { let r = remap.get(v); if (r === undefined) { r = order.length; remap.set(v, r); order.push(v); } ni[i] = r; });
    const g = new THREE.BufferGeometry();
    for (const [name, at] of Object.entries(geo.attributes)) {
      const n = at.itemSize, arr = new Float32Array(order.length * n);
      order.forEach((v, i) => { for (let c = 0; c < n; c++) arr[i * n + c] = at.array[v * n + c]; });
      g.setAttribute(name, new THREE.BufferAttribute(arr, n));
    }
    g.setIndex(new THREE.BufferAttribute(ni, 1)); return g;
  };
  return [mk(A), mk(B)];
}

async function buildTemplate(tk, cfg, glb) {
  const K = KIND[cfg.kind], prims = extractPrimitives(glb), cache = new Map();
  let parts = [];
  for (const p of prims) {
    if (cfg.zones && p.prim !== cfg.screenPrim) zoneColors(p.geo, cfg.zones);
    else if (!cfg.zones) paintGeo(p.geo, p.prim, cfg);
    if (cfg.cut && p.geo.index) p.geo = partition(p.geo, (x, y, z) => z <= cfg.cut.zMax)[0];   // drop stray pieces (pre-rotation coords)
    if (cfg.split && p.geo.index) { const [b, a] = partition(p.geo, (x) => x > cfg.split.x); parts.push({ ...p, geo: a, side: 0 }, { ...p, geo: b, side: 1 }); }
    else parts.push({ ...p, side: 0 });
  }
  // rotation * scale * offset (applied to the vertices once, so clones share geometry)
  const M = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(K.rotX || 0, K.rotY || 0, 0, 'XYZ'));
  if (K.rotZ) M.premultiply(new THREE.Matrix4().makeRotationZ(K.rotZ));
  if (K.pistol) M.premultiply(new THREE.Matrix4().makeTranslation(0, 0, -0.02));   // grip sits in front of the palm instead of buried in the glove
  if (K.scale) M.premultiply(new THREE.Matrix4().makeScale(K.scale, K.scale, K.scale));
  if (cfg.shift) M.premultiply(new THREE.Matrix4().makeTranslation(...cfg.shift));   // per-model grip alignment
  if (K.offset) M.premultiply(new THREE.Matrix4().makeTranslation(...K.offset));
  for (const p of parts) {
    let m = M;
    if (p.side === 1) {   // left gun of the dual pistols: pull it next to the right one (export has them 0.5 m apart)
      p.geo.computeBoundingBox(); const cx = (p.geo.boundingBox.min.x + p.geo.boundingBox.max.x) / 2;
      m = M.clone().premultiply(new THREE.Matrix4().makeTranslation(cfg.split.leftX + cx, 0, 0));
    }
    p.geo.applyMatrix4(m); p.geo.computeBoundingBox(); p.geo.computeBoundingSphere();
  }
  // materials
  // no environment map in the scene, so strongly metallic surfaces would render near-black: keep colours readable
  const base = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: Math.max(cfg.rough, 0.5), metalness: Math.min(cfg.metal, 0.35), vertexColors: true });
  const dark = new THREE.MeshStandardMaterial({ color: '#121315', roughness: 0.5, metalness: 0.4 });
  const screen = new THREE.MeshBasicMaterial({ color: '#7dff4f', toneMapped: false });
  const out = [];
  for (const p of parts) {
    let mat = p.material !== undefined ? await embeddedMaterial(glb, p.material, cache) : null;
    if (!mat) mat = cfg.screenPrim !== undefined && p.prim === cfg.screenPrim ? screen : base;
    out.push({ geo: p.geo, mat, side: p.side });
  }
  // muzzle + off-hand support, measured on the final (game-space) geometry
  const right = out.filter((o) => o.side === 0 && o.mat !== screen);
  const xs = [], ys = [], zs = []; let minZ = Infinity;
  for (const o of right) { const a = o.geo.attributes.position; for (let i = 0; i < a.count; i++) { xs.push(a.getX(i)); ys.push(a.getY(i)); zs.push(a.getZ(i)); if (a.getZ(i) < minZ) minZ = a.getZ(i); } }
  let muzzle, support = null;
  if (K.muzzle) muzzle = new THREE.Vector3(...K.muzzle);
  else {
    const fx = [], fy = [];
    for (let i = 0; i < zs.length; i++) if (zs[i] < minZ + 0.015) { fx.push(xs[i]); fy.push(ys[i]); }
    let my = median(fy);
    if (K.pistol && fy.length) { const hi = fy.filter((v) => v >= my); my = (my + median(hi)) / 2; }   // barrel sits in the upper half of the slide front
    muzzle = new THREE.Vector3(median(fx), my, minZ - 0.004);
  }
  if (K.pistol) support = new THREE.Vector3(cfg.split ? cfg.split.leftX : -0.03, -0.035, 0.012);
  else if (K.sup) {
    const zS = minZ * K.sup, sy = [];
    for (let i = 0; i < zs.length; i++) if (Math.abs(zs[i] - zS) < 0.035) sy.push(ys[i]);
    support = new THREE.Vector3(0, sy.length ? percentile(sy, 0.15) + 0.02 : 0, zS);   // hand sits under the fore-end
  }
  return { tk, parts: out, muzzle, support, kind: cfg.kind };
}

// ------------------------------------------------------------------ loading / cache
const templates = new Map();   // tkey -> template | null (failed)
const loading = new Map();
const listeners = new Set();
let version = 0, started = false, essentialPromise = null, active = 0;
const queue = [];

function slot() { return new Promise((res) => { const go = () => { active++; res(); }; if (active < 4) go(); else queue.push(go); }); }
function release() { active--; const n = queue.shift(); if (n) n(); }

function loadKey(tk) {
  const cfg = CFG[tk]; if (!cfg) return Promise.resolve(null);
  if (templates.has(tk)) return Promise.resolve(templates.get(tk));
  if (loading.has(tk)) return loading.get(tk);
  const p = (async () => {
    await slot();
    try {
      const r = await fetch(BASE + cfg.file); if (!r.ok) throw new Error('HTTP ' + r.status);
      const t = await buildTemplate(tk, cfg, parseGLB(await r.arrayBuffer()));
      templates.set(tk, t); version++; listeners.forEach((fn) => { try { fn(tk); } catch (e) {} });
      return t;
    } catch (e) { console.warn('[glbguns] ' + tk + ' failed, using procedural model:', e && e.message); templates.set(tk, null); return null; }
    finally { release(); loading.delete(tk); }
  })();
  loading.set(tk, p); return p;
}

export function loadGun(k, team) { return loadKey(tkeyFor(k, team)); }
export const hasGunGLB = (k, team) => !!templates.get(tkeyFor(k, team));
export const gunModelVersion = () => version;
export function onGunModelsChanged(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// start streaming the pack (idempotent): essential models first, the rest in the background
export function startGunPreload() {
  if (started) return essentialPromise; started = true;
  essentialPromise = Promise.all(ESSENTIAL.map(loadKey));
  const rest = GLB_KEYS.filter((k) => !ESSENTIAL.includes(k));
  essentialPromise.then(() => { for (const k of rest) loadKey(k); });
  return essentialPromise;
}
// resolves when the essential set is in (or after ms, whichever comes first) - never rejects
export function gunsEssentialReady(ms = 8000) {
  const p = startGunPreload();
  return Promise.race([p.catch(() => {}), new Promise((r) => setTimeout(r, ms))]);
}

// Group in the game's gun convention, or null while the GLB is not loaded (caller falls back to procedural)
export function makeGunGLB(k, team) {
  const tk = tkeyFor(k, team);
  if (!CFG[tk]) return null;
  const t = templates.get(tk);
  if (!t) { if (t === undefined) loadKey(tk); return null; }
  const g = new THREE.Group(); g.name = 'gun:' + k;
  for (const p of t.parts) { const m = new THREE.Mesh(p.geo, p.mat); m.castShadow = true; g.add(m); }
  g.userData.muzzle = t.muzzle.clone(); g.userData.support = t.support ? t.support.clone() : null; g.userData.glb = true;
  return g;
}
