// Map editor: top-down painter + 3D preview (real engine) + walk test + validation + auto bot routes.
import * as THREE from 'three';
import { buildMap, MAT, MAT_NAMES, MAP_DEFS } from '/shared/maps.js';
import { THEME_PRESETS, PROP_KINDS, BLOCK_KINDS, autoGameplay, validateMap } from '/shared/mapkit.js';
import { stepMove, hasLOS } from '/shared/physics.js';
import { buildNav } from '/shared/nav.js';
import { PHYS, WALL } from '/shared/constants.js';
import { buildWorld } from './world.js';

const $ = (id) => document.getElementById(id);
const MATCOL = ['#2a2623', '#c9ad83', '#d8c29c', '#a99273', '#8a5a2b', '#a07a4e', '#a98d68', '#b9a07c', '#5f8a3a', '#9a9a98', '#8c9399', '#eef3f8', '#3a3c40'];
const BLKCOL = { crate: '#8a5a2b', cont: '#3b6fb6', barrel: '#2f6fa3', concrete: '#a3a39f', pillar: '#cdbb98', planter: '#5f8a3a', bench: '#6b4a2c', jersey: '#b0b0aa', sandbags: '#bca77c', dumpster: '#3d6b45', car: '#b33a3a', ledge: '#e0cfa6' };
const hexRGB = (h) => { const n = parseInt(String(h).replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const toast = (t, ms = 2600) => { const e = $('toast'); e.textContent = t; e.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => (e.style.display = 'none'), ms); };

// ------------------------------------------------------------------ state
let maps = {}, customIds = new Set(), curId = null, def = null, m = null, adminKey = sessionStorage.getItem('cs2key') || '';
let clip = null, sight = null, vmode = 'normal', last = [10, 10];
let undo = [], redo = [], sel = null, tool = 'sel', preview = null, drag = null, issues = [], showRoutes = false;
const L = { grid: true, roofs: true, wallz: true, decals: true, sites: true, callouts: true, props: true, lamps: true, doors: true };
const P = { h: 0, mat: 1, h0: 0, h1: 1, axis: 'auto', rise: 0.3, roofC: 3.2, bkind: 'crate', bh: 1.2, bcolor: '', dcolor: '#e8e2c8', wz: 7, dh: 2.6, site: 'A', pkind: 'palm', prot: 0, pscale: 1, pcolor: '', lampY: 3.8, lcolor: '#ffc78a', sym: 'none', bsize: 1, bmode: 'floor', eyeH: 1.64, sightR: 70 };
const view = { x: 20, y: 20, zoom: 6 };
const cv = $('c2d'), cx2 = cv.getContext('2d'), bg = document.createElement('canvas'), bgx = bg.getContext('2d');
let dirtyBg = true, raf2 = 0;

const TOOLS = [
  ['sel', '⬚', 'انتخاب', 'v'], ['hand', '✋', 'جابه‌جایی', 'h'], ['floor', '▭', 'کف', 'f'], ['carve', '▩', 'دیوار', 'e'], ['ramp', '◢', 'رمپ', 'r'], ['stairs', '☰', 'پله', 't'],
  ['roof', '⌂', 'سقف', 'o'], ['block', '▣', 'بلوک', 'b'], ['decal', '▤', 'رنگ‌کف', 'd'], ['wallz', '▮', 'قد دیوار', 'w'], ['door', '🚪', 'در', 'g'], ['site', '💣', 'سایت', 's'],
  ['prop', '🌴', 'دکور', 'p'], ['lamp', '💡', 'چراغ', 'l'], ['spT', 'T', 'اسپاون T', '1'], ['spCT', 'CT', 'اسپاون CT', '2'], ['brush', '🖌', 'قلم', 'c'], ['sight', '👁', 'خط دید', 'y'], ['erase', '✕', 'پاک‌کن', 'x'],
];
const RECT_TOOLS = new Set(['floor', 'carve', 'ramp', 'stairs', 'roof', 'block', 'decal', 'wallz', 'door', 'site', 'sel-box']);

// ------------------------------------------------------------------ def helpers
const clone = (o) => JSON.parse(JSON.stringify(o));
function bakeScale(d) { const S = d.scale || 1; if (S === 1) return; for (const a of d.areas || []) for (let i = 0; i < 4; i++) a[i] *= S; for (const r of d.ramps || []) for (let i = 0; i < 4; i++) r[i] *= S; delete d.scale; }
function ensure(d) { for (const k of ['areas', 'ramps', 'roofs', 'crates', 'doors', 'lamps', 'props', 'decals', 'wallZones']) d[k] ||= []; d.spawns ||= {}; d.spawns.T ||= []; d.spawns.CT ||= []; d.sites ||= {}; d.theme ||= { preset: 'desert' }; d.yaw ||= { T: 0, CT: Math.PI }; d.name ||= d.id; return d; }
function template(id, name, W, H, preset) {
  const d = { id, name, size: [W, H], theme: { preset }, areas: [[3, 3, W - 3, H - 3, 0, preset === 'snow' ? 11 : preset === 'urban' || preset === 'night' ? 12 : preset === 'jungle' ? 8 : 1]], ramps: [], roofs: [], crates: [], doors: [], lamps: [], props: [], decals: [], wallZones: [], sites: {}, spawns: { T: [], CT: [] }, yaw: { T: Math.PI, CT: 0 } };
  for (let i = 0; i < 10; i++) { d.spawns.T.push([6 + (i % 5) * 2, H - 8 + Math.floor(i / 5) * 2]); d.spawns.CT.push([W - 16 + (i % 5) * 2, 6 + Math.floor(i / 5) * 2]); }
  d.sites.A = [W - 28, H / 2 - 4, W - 18, H / 2 + 6]; d.sites.B = [10, 12, 20, 22];
  const cxm = W >> 1, czm = H >> 1; d.crates.push([cxm - 2, czm - 2, 4, 4, 1.2, 'crate'], [W - 25, H / 2, 2, 2, 1.2, 'crate'], [13, 15, 2, 2, 1.2, 'crate'], [cxm - 12, czm + 8, 6, 3, 2.6, 'cont']);
  d.props.push(['palm', 8, 8, 0, 1], ['palm', W - 8, H - 8, 0, 1.1]); return d;
}

// ------------------------------------------------------------------ build + history
function viewDef() { return { ...def, routes: def.routes || {}, holds: def.holds || { A: [] }, buy: def.buy || { T: [0, 0, 1, 1], CT: [0, 0, 1, 1] }, callouts: def.callouts || [] }; }
function rebuild() { try { m = buildMap(viewDef()); } catch (e) { toast('خطا در ساخت مپ: ' + e.message, 5000); } dirtyBg = true; draw(); schedule3d(); updateSide(); }
function commit(msg) {
  if (!customIds.has(curId)) { customIds.add(curId); fillMapSel(); }
  maps[curId] = def; undo.push(JSON.stringify(def)); if (undo.length > 120) undo.shift(); redo = [];
  $('stSave').textContent = '● تغییر ذخیره‌نشده'; if (msg) $('stMsg').textContent = msg; autosave(); rebuild();
}
function doUndo() { if (undo.length < 2) return; redo.push(undo.pop()); def = JSON.parse(undo[undo.length - 1]); maps[curId] = def; sel = null; rebuild(); }
function doRedo() { if (!redo.length) return; const s = redo.pop(); undo.push(s); def = JSON.parse(s); maps[curId] = def; sel = null; rebuild(); }

// ------------------------------------------------------------------ 2D drawing
function renderBase() {
  const { W, H } = m; bg.width = W; bg.height = H; const img = bgx.createImageData(W, H), d = img.data; const walk = vmode === 'walk' ? buildNav(m).walk : null;
  for (let i = 0; i < W * H; i++) {
    let c; const hh = m.heights[i];
    if (vmode === 'height' && hh < WALL) { const t = clamp((m.floor[i] + 1.5) / 5, 0, 1); c = [255 * clamp(t * 2 - 0.2, 0, 1), 255 * (1 - Math.abs(t - 0.5) * 1.6), 255 * clamp(1 - t * 2, 0, 1)]; if (hh > m.floor[i] + 0.01) c = c.map((v) => v * 0.6 + 80); }
    else if (walk && hh < WALL) c = walk[i] ? [70, 170, 95] : [190, 70, 70];
    else if (hh >= WALL) c = hexRGB(MATCOL[0]);
    else if (c === undefined) {
      const mt = m.mat[i], f = m.floor[i], lum = clamp(0.82 + f * 0.09, 0.45, 1.4);
      if (mt === 4) { const cr = m.crates.find((q) => (i % W) >= q.x && (i % W) < q.x + q.w && ((i / W) | 0) >= q.z && ((i / W) | 0) < q.z + q.d); c = hexRGB(BLKCOL[cr ? cr.kind : 'crate'] || '#8a5a2b').map((v) => v * clamp(0.85 + hh * 0.06, 0.8, 1.3)); }
      else { c = hexRGB(MATCOL[mt] || MATCOL[1]).map((v) => v * lum * (m.rampIdx[i] >= 0 ? 0.92 : 1)); if (m.ceil[i] < 1e8) { c[0] *= 0.72; c[1] *= 0.76; c[2] *= 0.95; } }
    }
    d[i * 4] = clamp(c[0], 0, 255); d[i * 4 + 1] = clamp(c[1], 0, 255); d[i * 4 + 2] = clamp(c[2], 0, 255); d[i * 4 + 3] = 255;
  }
  bgx.putImageData(img, 0, 0); dirtyBg = false;
}
const sx = (x) => x * view.zoom + view.x, sy = (z) => z * view.zoom + view.y;
function draw() { if (!raf2) raf2 = requestAnimationFrame(() => { raf2 = 0; paint(); }); }
function rectOutline(x0, z0, x1, z1, col, fill, lw = 1.5) { cx2.lineWidth = lw; cx2.strokeStyle = col; if (fill) { cx2.fillStyle = fill; cx2.fillRect(sx(x0), sy(z0), (x1 - x0) * view.zoom, (z1 - z0) * view.zoom); } cx2.strokeRect(sx(x0), sy(z0), (x1 - x0) * view.zoom, (z1 - z0) * view.zoom); }
function label(t, x, z, col = '#fff') { cx2.font = '11px Tahoma'; cx2.fillStyle = '#000b'; const w = cx2.measureText(t).width; cx2.fillRect(sx(x) - 2, sy(z) - 11, w + 4, 14); cx2.fillStyle = col; cx2.fillText(t, sx(x), sy(z)); }
function paint() {
  const w = cv.clientWidth, h = cv.clientHeight; if (cv.width !== w * devicePixelRatio) { cv.width = w * devicePixelRatio; cv.height = h * devicePixelRatio; }
  cx2.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0); cx2.fillStyle = '#0d0f12'; cx2.fillRect(0, 0, w, h); if (!m) return; if (dirtyBg) renderBase();
  cx2.imageSmoothingEnabled = false; cx2.drawImage(bg, view.x, view.y, m.W * view.zoom, m.H * view.zoom);
  if (L.grid && view.zoom >= 7) { cx2.strokeStyle = '#ffffff14'; cx2.lineWidth = 1; cx2.beginPath(); for (let x = 0; x <= m.W; x++) { cx2.moveTo(sx(x), sy(0)); cx2.lineTo(sx(x), sy(m.H)); } for (let z = 0; z <= m.H; z++) { cx2.moveTo(sx(0), sy(z)); cx2.lineTo(sx(m.W), sy(z)); } cx2.stroke(); }
  if (L.grid && view.zoom >= 3) { cx2.strokeStyle = '#ffffff22'; cx2.beginPath(); for (let x = 0; x <= m.W; x += 16) { cx2.moveTo(sx(x), sy(0)); cx2.lineTo(sx(x), sy(m.H)); } for (let z = 0; z <= m.H; z += 16) { cx2.moveTo(sx(0), sy(z)); cx2.lineTo(sx(m.W), sy(z)); } cx2.stroke(); }
  if (L.roofs) for (const r of def.roofs) rectOutline(r[0], r[1], r[2], r[3], '#7aa7ff88', '#7aa7ff22', 1);
  if (L.wallz) for (const r of def.wallZones) { rectOutline(r[0], r[1], r[2], r[3], '#ff9ad588', '#ff9ad522', 1); }
  if (L.decals) for (const r of def.decals) rectOutline(r[0], r[1], r[2], r[3], r[4] || '#fff', (r[4] || '#fff') + '66', 1);
  if (L.doors) for (const r of def.doors) { cx2.fillStyle = '#4aa3ff'; cx2.fillRect(sx(r[0]), sy(r[1]) - 1, (r[2] - r[0]) * view.zoom, Math.max(3, (r[3] - r[1]) * view.zoom)); }
  for (const [k, r] of Object.entries(def.sites)) if (L.sites) { rectOutline(r[0], r[1], r[2], r[3], '#ff5d5d', '#ff5d5d22', 2); label('سایت ' + k, (r[0] + r[2]) / 2 - 1.5, (r[1] + r[3]) / 2, '#ffb3b3'); }
  if (L.callouts) for (const c of def.callouts || []) { rectOutline(c[1], c[2], c[3], c[4], '#ffffff44', null, 1); label(c[0], c[1] + 0.3, c[2] + 1.2, '#ddd'); }
  if (showRoutes && def.routes) for (const [k, rs] of Object.entries(def.routes)) rs.forEach((r, ri) => { cx2.strokeStyle = ['#4cd07d', '#4aa3ff', '#f0a53a'][ri % 3]; cx2.lineWidth = 2; cx2.beginPath(); r.forEach(([x, z], i) => (i ? cx2.lineTo(sx(x), sy(z)) : cx2.moveTo(sx(x), sy(z)))); cx2.stroke(); });
  if (showRoutes && def.holds) for (const hs of Object.values(def.holds)) for (const h of hs) { cx2.fillStyle = '#4aa3ff'; cx2.beginPath(); cx2.arc(sx(h[0]), sy(h[1]), 4, 0, 7); cx2.fill(); cx2.strokeStyle = '#4aa3ff'; cx2.beginPath(); cx2.moveTo(sx(h[0]), sy(h[1])); cx2.lineTo(sx(h[0] + (h[2] - h[0]) * 0.25), sy(h[1] + (h[3] - h[1]) * 0.25)); cx2.stroke(); }
  if (L.props) for (const p of def.props) { cx2.fillStyle = p[0] === 'rock' ? '#999' : '#3f9b4a'; cx2.beginPath(); cx2.arc(sx(p[1]), sy(p[2]), Math.max(3, view.zoom * 0.4), 0, 7); cx2.fill(); }
  if (L.lamps) for (const l of def.lamps) { cx2.fillStyle = '#ffd35c'; cx2.beginPath(); cx2.arc(sx(l[0]), sy(l[1]), Math.max(3, view.zoom * 0.35), 0, 7); cx2.fill(); }
  for (const t of ['T', 'CT']) def.spawns[t].forEach(([x, z]) => { cx2.fillStyle = t === 'T' ? '#f0a53a' : '#4aa3ff'; cx2.fillRect(sx(x) + 1, sy(z) + 1, Math.max(4, view.zoom - 2), Math.max(4, view.zoom - 2)); if (view.zoom >= 8) { cx2.fillStyle = '#000'; cx2.font = 'bold ' + Math.min(10, view.zoom - 1) + 'px sans-serif'; cx2.fillText(t, sx(x) + 2, sy(z) + view.zoom - 3); } });
  if (sight) { cx2.fillStyle = '#4cff8a55'; const { W } = m; for (let i = 0; i < sight.cells.length; i++) if (sight.cells[i]) cx2.fillRect(sx(i % W), sy((i / W) | 0), view.zoom + 0.5, view.zoom + 0.5); cx2.fillStyle = '#fff'; cx2.beginPath(); cx2.arc(sx(sight.x), sy(sight.z), 5, 0, 7); cx2.fill(); }
  if (drag && drag.mode === 'brush') { cx2.fillStyle = tool === 'brush' && P.bmode === 'wall' ? '#ff5d5d99' : '#ffffff77'; for (const c of drag.cells) cx2.fillRect(sx(c % m.W), sy((c / m.W) | 0), view.zoom, view.zoom); }
  if (sel) { const r = rectOf(sel); cx2.setLineDash([5, 3]); if (r) { rectOutline(r[0], r[1], r[2], r[3], '#ffe14d', null, 2); for (const [hx, hz] of [[r[0], r[1]], [r[2], r[1]], [r[0], r[3]], [r[2], r[3]]]) { cx2.fillStyle = '#ffe14d'; cx2.fillRect(sx(hx) - 4, sy(hz) - 4, 8, 8); } } else { const p = pointOf(sel); if (p) { cx2.strokeStyle = '#ffe14d'; cx2.lineWidth = 2; cx2.strokeRect(sx(p[0]) - 6, sy(p[1]) - 6, 12 + (sel.t === 'spawns' ? view.zoom : 0), 12 + (sel.t === 'spawns' ? view.zoom : 0)); } } cx2.setLineDash([]); }
  if (preview) { const q = preview; cx2.setLineDash([4, 3]); rectOutline(q[0], q[1], q[2], q[3], '#ffffffcc', '#ffffff22', 2); cx2.setLineDash([]); label(`${q[2] - q[0]}×${q[3] - q[1]}`, q[0], q[1] - 0.2); }
}

// ------------------------------------------------------------------ selection geometry
function rectOf(s) {
  if (!s) return null; const a = s.t === 'sites' ? def.sites[s.k] : def[s.t]?.[s.i]; if (!a) return null;
  if (['areas', 'ramps', 'roofs', 'decals', 'wallZones', 'doors'].includes(s.t) || s.t === 'sites') return [a[0], a[1], a[2], a[3]];
  if (s.t === 'crates') return [a[0], a[1], a[0] + a[2], a[1] + a[3]]; return null;
}
function setRect(s, r) { if (s.t === 'sites') { def.sites[s.k] = r.slice(); return; } const a = def[s.t][s.i]; if (s.t === 'crates') { a[0] = r[0]; a[1] = r[1]; a[2] = r[2] - r[0]; a[3] = r[3] - r[1]; } else { a[0] = r[0]; a[1] = r[1]; a[2] = r[2]; a[3] = r[3]; } }
function pointOf(s) { if (s.t === 'spawns') { const a = def.spawns[s.team][s.i]; return a && [a[0], a[1]]; } if (s.t === 'props') { const a = def.props[s.i]; return a && [a[1], a[2]]; } if (s.t === 'lamps') { const a = def.lamps[s.i]; return a && [a[0], a[1]]; } return null; }
function movePoint(s, x, z) { if (s.t === 'spawns') { const a = def.spawns[s.team][s.i]; a[0] = Math.floor(x); a[1] = Math.floor(z); } else if (s.t === 'props') { const a = def.props[s.i]; a[1] = Math.round(x * 2) / 2; a[2] = Math.round(z * 2) / 2; } else if (s.t === 'lamps') { const a = def.lamps[s.i]; a[0] = Math.round(x * 2) / 2; a[1] = Math.round(z * 2) / 2; } }
function hit(x, z) {
  const near = 0.9 / Math.max(1, view.zoom / 6);
  for (const t of ['T', 'CT']) for (let i = def.spawns[t].length - 1; i >= 0; i--) { const a = def.spawns[t][i]; if (x >= a[0] && x < a[0] + 1 && z >= a[1] && z < a[1] + 1) return { t: 'spawns', team: t, i }; }
  for (let i = def.props.length - 1; i >= 0; i--) if (L.props && Math.hypot(def.props[i][1] - x, def.props[i][2] - z) < near) return { t: 'props', i };
  for (let i = def.lamps.length - 1; i >= 0; i--) if (L.lamps && Math.hypot(def.lamps[i][0] - x, def.lamps[i][1] - z) < near) return { t: 'lamps', i };
  const inR = (r) => x >= r[0] && x < r[2] && z >= r[1] && z < r[3];
  for (const t of ['crates', 'doors', 'ramps', 'areas', 'roofs', 'decals', 'wallZones']) { if (t === 'roofs' && !L.roofs || t === 'decals' && !L.decals || t === 'wallZones' && !L.wallz) continue; for (let i = def[t].length - 1; i >= 0; i--) { const r = rectOf({ t, i }); if (r && (t === 'doors' ? x >= r[0] - 0.3 && x < r[2] + 0.3 && z >= r[1] - 0.6 && z < r[3] + 0.6 : inR(r))) return { t, i }; } }
  for (const k of Object.keys(def.sites)) if (inR(def.sites[k])) return { t: 'sites', k }; return null;
}
function removeSel(s) { if (!s) return; if (s.t === 'sites') delete def.sites[s.k]; else if (s.t === 'spawns') def.spawns[s.team].splice(s.i, 1); else def[s.t].splice(s.i, 1); }

// ------------------------------------------------------------------ pointer interaction
const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left - view.x) / view.zoom, (e.clientY - r.top - view.y) / view.zoom]; };
const cellRect = (a, b) => [Math.floor(Math.min(a[0], b[0])), Math.floor(Math.min(a[1], b[1])), Math.floor(Math.max(a[0], b[0])) + 1, Math.floor(Math.max(a[1], b[1])) + 1];
const pointers = new Map(); let pinch = null, panning = null, spaceDown = false;
cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('pointerdown', (e) => {
  cv.setPointerCapture(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: view.zoom }; drag = null; preview = null; return; }
  if (e.button === 1 || e.button === 2 || tool === 'hand' || spaceDown) { panning = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; return; }
  const p = pos(e); if (!m) return;
  if (tool === 'sel') {
    if (sel) { const r = rectOf(sel); if (r) for (const [ci, [hx, hz]] of [[[0, 1], [r[0], r[1]]], [[2, 1], [r[2], r[1]]], [[0, 3], [r[0], r[3]]], [[2, 3], [r[2], r[3]]]]) if (Math.hypot((hx - p[0]) * view.zoom, (hz - p[1]) * view.zoom) < 9) { drag = { mode: 'resize', corner: ci, rect: r.slice(), moved: false }; return; } }
    const h = hit(p[0], p[1]); sel = h; updateSide(); draw();
    if (h) drag = { mode: 'move', start: p, orig: rectOf(h) ? rectOf(h).slice() : pointOf(h), moved: false }; return;
  }
  if (tool === 'erase') { const h = hit(p[0], p[1]); if (h) { removeSel(h); sel = null; commit('حذف شد'); } return; }
  if (tool === 'sight') { computeSight(p[0], p[1]); return; }
  if (tool === 'brush') { drag = { mode: 'brush', cells: new Set() }; brushAt(p); return; }
  if (['prop', 'lamp', 'spT', 'spCT'].includes(tool)) { placePoint(p); return; }
  if (RECT_TOOLS.has(tool)) { drag = { mode: 'rect', a: p, b: p }; preview = cellRect(p, p); draw(); }
});
cv.addEventListener('pointermove', (e) => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (pinch && pointers.size === 2) { const [a, b] = [...pointers.values()]; zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, clamp(pinch.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d, 1.5, 60)); return; }
  if (panning) { view.x = panning.vx + e.clientX - panning.x; view.y = panning.vy + e.clientY - panning.y; draw(); return; }
  const p = pos(e); last = p; if (m) { const cx = Math.floor(p[0]), cz = Math.floor(p[1]), ok = cx >= 0 && cz >= 0 && cx < m.W && cz < m.H, i = cz * m.W + cx; $('stPos').textContent = `x ${cx}  z ${cz}`; $('stCell').textContent = ok ? (m.heights[i] >= WALL ? 'دیوار' : `ارتفاع ${m.floor[i].toFixed(2)}${m.heights[i] > m.floor[i] + 0.01 ? ' (بلوک ' + m.heights[i].toFixed(1) + ')' : ''} · ${MAT_NAMES[m.mat[i]] || ''}${m.ceil[i] < 1e8 ? ' · سقف ' + m.ceil[i] : ''}`) : ''; }
  if (!drag) return;
  if (drag.mode === 'brush') { brushAt(p); return; }
  if (drag.mode === 'rect') { drag.b = p; preview = cellRect(drag.a, drag.b); draw(); }
  else if (drag.mode === 'move' && sel) {
    drag.moved = true; const dx = Math.round(p[0] - drag.start[0]), dz = Math.round(p[1] - drag.start[1]);
    if (rectOf(sel)) { const o = drag.orig; setRect(sel, [o[0] + dx, o[1] + dz, o[2] + dx, o[3] + dz]); } else movePoint(sel, drag.orig[0] + (p[0] - drag.start[0]), drag.orig[1] + (p[1] - drag.start[1]));
    dirtyBg = false; draw();
  } else if (drag.mode === 'resize' && sel) {
    drag.moved = true; const r = drag.rect.slice(), [ix, iz] = drag.corner; r[ix] = Math.round(p[0]); r[iz] = Math.round(p[1]);
    const n = [Math.min(r[0], r[2]), Math.min(r[1], r[3]), Math.max(r[0], r[2], Math.min(r[0], r[2]) + 1), Math.max(r[1], r[3], Math.min(r[1], r[3]) + 1)]; setRect(sel, n); draw();
  }
});
cv.addEventListener('pointerup', (e) => {
  pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; if (panning) { panning = null; return; }
  if (!drag) return; const d = drag; drag = null; preview = null;
  if (d.mode === 'brush') { commitBrush(d.cells); return; }
  if (d.mode === 'rect') commitSym(d.a, d.b);
  else if (d.moved) commit('جابه‌جا شد'); else draw();
});
function zoomAt(px, py, z) { const r = cv.getBoundingClientRect(), wx = (px - r.left - view.x) / view.zoom, wz = (py - r.top - view.y) / view.zoom; view.zoom = z; view.x = px - r.left - wx * z; view.y = py - r.top - wz * z; draw(); }
cv.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, clamp(view.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 1.5, 60)); }, { passive: false });

function applyRect(r, a, b, T) {
  const [x0, z0, x1, z1] = r, w = x1 - x0, d = z1 - z0; let made = null; const siteKey = T.swap ? { A: 'B', B: 'A', C: 'C' }[P.site] : P.site;
  const axis = P.axis === 'auto' ? (w >= d ? 'x' : 'z') : P.axis, fwd = axis === 'x' ? b[0] >= a[0] : b[1] >= a[1];
  switch (tool) {
    case 'floor': def.areas.push([x0, z0, x1, z1, +P.h, +P.mat]); made = { t: 'areas', i: def.areas.length - 1 }; break;
    case 'carve': def.areas.push([x0, z0, x1, z1, WALL, 0]); made = { t: 'areas', i: def.areas.length - 1 }; break;
    case 'ramp': def.ramps.push([x0, z0, x1, z1, fwd ? +P.h0 : +P.h1, fwd ? +P.h1 : +P.h0, axis, +P.mat]); made = { t: 'ramps', i: def.ramps.length - 1 }; break;
    case 'stairs': { const n = axis === 'x' ? w : d; for (let k = 0; k < n; k++) { const kk = fwd ? k : n - 1 - k, h = +P.h + (k + 1) * +P.rise; def.areas.push(axis === 'x' ? [x0 + kk, z0, x0 + kk + 1, z1, +h.toFixed(3), +P.mat] : [x0, z0 + kk, x1, z0 + kk + 1, +h.toFixed(3), +P.mat]); } toast(`${n} پله ساخته شد`); break; }
    case 'roof': def.roofs.push([x0, z0, x1, z1, +P.roofC]); made = { t: 'roofs', i: def.roofs.length - 1 }; break;
    case 'block': def.crates.push(P.bcolor ? [x0, z0, w, d, +P.bh, P.bkind, P.bcolor] : [x0, z0, w, d, +P.bh, P.bkind]); made = { t: 'crates', i: def.crates.length - 1 }; break;
    case 'decal': def.decals.push([x0, z0, x1, z1, P.dcolor]); made = { t: 'decals', i: def.decals.length - 1 }; break;
    case 'wallz': def.wallZones.push([x0, z0, x1, z1, +P.wz]); made = { t: 'wallZones', i: def.wallZones.length - 1 }; break;
    case 'door': { if (w >= d) { const zc = z0 + 0.5; def.doors.push([x0, zc - 0.06, x1, zc + 0.06, +P.dh]); } else { const xc = x0 + 0.5; def.doors.push([xc - 0.06, z0, xc + 0.06, z1, +P.dh]); } made = { t: 'doors', i: def.doors.length - 1 }; break; }
    case 'site': def.sites[siteKey] = [x0, z0, x1, z1]; made = { t: 'sites', k: siteKey }; break;
  }
  return made;
}
// ---- symmetry: every drawing action is repeated through these transforms (a/b/rot/swap = teams and A/B trade places)
function transforms() {
  const W = m.W, H = m.H, id = { p: (q) => q, rot: (r) => r, swap: false }, mx = { p: (q) => [W - q[0], q[1]], rot: (r) => -r, swap: false }, mz = { p: (q) => [q[0], H - q[1]], rot: (r) => -r, swap: true }, m180 = { p: (q) => [W - q[0], H - q[1]], rot: (r) => r + Math.PI, swap: true };
  return { none: [id], x: [id, mx], z: [id, mz], rot: [id, m180], quad: [id, mx, mz, m180] }[P.sym] || [id];
}
function commitSym(a, b) {
  let first = null; for (const T of transforms()) { const a2 = T.p(a), b2 = T.p(b), made = applyRect(cellRect(a2, b2), a2, b2, T); first ||= made; }
  sel = first; commit('ثبت شد');
}
function brushAt(p) { const { W, H } = m, r = Math.floor(P.bsize / 2); for (let dz = -r; dz < P.bsize - r; dz++) for (let dx = -r; dx < P.bsize - r; dx++) { const x = Math.floor(p[0]) + dx, z = Math.floor(p[1]) + dz; if (x >= 0 && z >= 0 && x < W && z < H) drag.cells.add(z * W + x); } draw(); }
function commitBrush(cells) {
  const { W, H } = m, all = new Set(); for (const T of transforms()) for (const c of cells) { const q = T.p([(c % W) + 0.5, ((c / W) | 0) + 0.5]); all.add(Math.floor(q[1]) * W + Math.floor(q[0])); }
  // merge cells into rectangles: horizontal runs, then identical runs stacked vertically
  const rows = new Map(); for (let z = 0; z < H; z++) { const runs = []; let s0 = -1; for (let x = 0; x <= W; x++) { const on = x < W && all.has(z * W + x); if (on && s0 < 0) s0 = x; if (!on && s0 >= 0) { runs.push([s0, x]); s0 = -1; } } if (runs.length) rows.set(z, runs); }
  const done = new Set(), out = []; for (const [z, runs] of rows) for (const [a, b] of runs) { const key = z + ':' + a + ':' + b; if (done.has(key)) continue; let zz = z + 1; while ((rows.get(zz) || []).some(([a2, b2]) => a2 === a && b2 === b)) { done.add(zz + ':' + a + ':' + b); zz++; } out.push([a, z, b, zz]); }
  for (const r of out) def.areas.push(P.bmode === 'wall' ? [...r, WALL, 0] : [...r, +P.h, +P.mat]);
  sel = null; if (out.length) commit(`قلم: ${out.length} ناحیه`); else draw();
}
function computeSight(x, z) {
  const { W, H } = m, cx = Math.floor(x), cz = Math.floor(z), i0 = cz * W + cx; if (cx < 0 || cz < 0 || cx >= W || cz >= H || m.heights[i0] >= WALL) return toast('داخل دیوار است');
  const e = [cx + 0.5, m.heights[i0] + P.eyeH, cz + 0.5], cells = new Uint8Array(W * H); let n = 0, open = 0, R = P.sightR;
  for (let zz = Math.max(0, cz - R); zz < Math.min(H, cz + R); zz++) for (let xx = Math.max(0, cx - R); xx < Math.min(W, cx + R); xx++) { const i = zz * W + xx; if (m.heights[i] >= WALL) continue; open++; if (Math.hypot(xx - cx, zz - cz) > R) continue; if (hasLOS(m, e, [xx + 0.5, m.heights[i] + 1.2, zz + 0.5])) { cells[i] = 1; n++; } }
  sight = { x: e[0], z: e[2], cells }; $('stMsg').textContent = `از اینجا ${n.toLocaleString('en')} خانه دیده می‌شود (${Math.round(n / Math.max(1, open) * 100)}٪ فضای باز در شعاع)`; draw();
}
function placePoint(p) {
  let first = null;
  for (const T of transforms()) {
    const q = T.p(p);
    if (tool === 'spT' || tool === 'spCT') { const t = (tool === 'spT') !== T.swap ? 'T' : 'CT'; def.spawns[t].push([Math.floor(q[0]), Math.floor(q[1])]); first ||= { t: 'spawns', team: t, i: def.spawns[t].length - 1 }; }
    else if (tool === 'prop') { const r = T.rot(+P.prot), xx = Math.round(q[0] * 2) / 2, zz = Math.round(q[1] * 2) / 2; def.props.push(P.pcolor ? [P.pkind, xx, zz, r, +P.pscale, P.pcolor] : [P.pkind, xx, zz, r, +P.pscale]); first ||= { t: 'props', i: def.props.length - 1 }; }
    else if (tool === 'lamp') { def.lamps.push([Math.round(q[0] * 2) / 2, Math.round(q[1] * 2) / 2, +P.lampY, P.lcolor, 1, 13]); first ||= { t: 'lamps', i: def.lamps.length - 1 }; }
  }
  sel = first; commit('ثبت شد');
}

// ------------------------------------------------------------------ tool + option bars
function buildTools() {
  $('tools').innerHTML = ''; for (const [id, ico, name, key] of TOOLS) { const b = document.createElement('button'); b.dataset.t = id; b.title = `${name} (${key.toUpperCase()})`; b.innerHTML = `<b>${ico}</b>${name}`; b.onclick = () => setTool(id); $('tools').appendChild(b); }
}
function setTool(t) { tool = t; for (const b of $('tools').children) b.classList.toggle('on', b.dataset.t === t); cv.style.cursor = t === 'hand' ? 'grab' : t === 'sel' ? 'default' : 'crosshair'; renderOpts(); }
const optHtml = {
  field: (k, lab, type = 'number', extra = '') => `<label>${lab}<input data-p="${k}" type="${type}" value="${P[k]}" ${extra}></label>`,
  sel: (k, lab, opts) => `<label>${lab}<select data-p="${k}">${opts.map(([v, t]) => `<option value="${v}" ${String(P[k]) === String(v) ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`,
};
const matOpts = () => MAT_NAMES.map((n, i) => [i, n]).filter(([i]) => i > 0 && i !== 4);
function renderOpts() {
  const o = optHtml; let h = '';
  const hint = { brush: 'روی نقشه بکش؛ با تقارن فعال، سمت مقابل هم کشیده می‌شود', sight: 'روی یک نقطه کلیک کن تا ببینی از آنجا کجاها دیده می‌شود (مناسب بررسی زاویه‌ها و تعادل)', sel: 'روی شکل کلیک کن؛ بکش تا جابه‌جا شود، گوشه‌ها را بکش تا اندازه عوض شود. Delete = حذف', hand: 'بکش تا نقشه جابه‌جا شود (راست‌کلیک/وسط موس هم کار می‌کند)', carve: 'ناحیه را به دیوار تبدیل می‌کند', roof: 'سقف تونل/ساختمان؛ ارتفاع پایین سقف', erase: 'روی هر چیزی کلیک کن تا پاک شود', spT: 'کلیک = یک اسپاون T', spCT: 'کلیک = یک اسپاون CT' }[tool];
  if (tool === 'floor') h = o.field('h', 'ارتفاع کف', 'number', 'step="0.1"') + o.sel('mat', 'جنس', matOpts());
  else if (tool === 'ramp') h = o.field('h0', 'ارتفاع شروع', 'number', 'step="0.1"') + o.field('h1', 'ارتفاع پایان', 'number', 'step="0.1"') + o.sel('axis', 'جهت', [['auto', 'خودکار'], ['x', 'محور X'], ['z', 'محور Z']]) + o.sel('mat', 'جنس', matOpts()) + '<span style="color:var(--mut)">جهت کشیدن = جهت بالا رفتن</span>';
  else if (tool === 'stairs') h = o.field('h', 'ارتفاع پایه', 'number', 'step="0.1"') + o.field('rise', 'ارتفاع هر پله', 'number', 'step="0.05" max="0.5"') + o.sel('axis', 'جهت', [['auto', 'خودکار'], ['x', 'محور X'], ['z', 'محور Z']]) + o.sel('mat', 'جنس', matOpts()) + '<span style="color:var(--mut)">هر پله ۱ متر عمق؛ حداکثر ارتفاع قابل‌صعود ۰٫۵۵</span>';
  else if (tool === 'roof') h = o.field('roofC', 'ارتفاع سقف', 'number', 'step="0.1"');
  else if (tool === 'block') h = o.sel('bkind', 'نوع', Object.entries(BLOCK_KINDS)) + o.field('bh', 'ارتفاع', 'number', 'step="0.1"') + `<label>رنگ<input data-p="bcolor" type="color" value="${P.bcolor || '#888888'}"></label><button id="clrB">بدون رنگ</button>`;
  else if (tool === 'decal') h = `<label>رنگ<input data-p="dcolor" type="color" value="${P.dcolor}"></label><span style="color:var(--mut)">خط‌کشی/رنگ روی کف</span>`;
  else if (tool === 'wallz') h = o.field('wz', 'ارتفاع دیوار (۳٫۵ تا ۱۴)', 'number', 'step="0.5"');
  else if (tool === 'door') h = o.field('dh', 'ارتفاع در', 'number', 'step="0.1"') + '<span style="color:var(--mut)">یک خط روی راهرو بکش</span>';
  else if (tool === 'site') h = o.sel('site', 'سایت', [['A', 'A'], ['B', 'B'], ['C', 'C']]);
  else if (tool === 'prop') h = o.sel('pkind', 'دکور', Object.entries(PROP_KINDS).map(([k, v]) => [k, v.name])) + o.field('prot', 'چرخش (رادیان)', 'number', 'step="0.26"') + o.field('pscale', 'اندازه', 'number', 'step="0.1"') + `<label>رنگ<input data-p="pcolor" type="color" value="${P.pcolor || '#3f6b3a'}"></label><button id="clrP">بدون رنگ</button>`;
  else if (tool === 'lamp') h = o.field('lampY', 'ارتفاع', 'number', 'step="0.1"') + `<label>رنگ<input data-p="lcolor" type="color" value="${P.lcolor}"></label>`;
  if (tool === 'brush') h = o.sel('bmode', 'حالت', [['floor', 'کف'], ['wall', 'دیوار']]) + o.field('bsize', 'اندازه قلم', 'number', 'min="1" max="9"') + o.field('h', 'ارتفاع کف', 'number', 'step="0.1"') + o.sel('mat', 'جنس', matOpts());
  if (tool === 'sight') h = o.field('eyeH', 'ارتفاع چشم', 'number', 'step="0.1"') + o.field('sightR', 'شعاع', 'number') + '<button id="clrS">پاک کردن</button>';
  if (!['sel', 'hand', 'erase', 'sight'].includes(tool)) h += o.sel('sym', '⇋ تقارن', [['none', 'ندارد'], ['x', 'چپ/راست'], ['z', 'بالا/پایین (T↔CT)'], ['rot', 'چرخشی ۱۸۰° (T↔CT)'], ['quad', 'چهارگانه']]);
  $('opts').innerHTML = h + (hint ? `<span style="color:var(--mut)">${hint}</span>` : '');
  $('opts').querySelectorAll('[data-p]').forEach((i) => (i.oninput = () => { P[i.dataset.p] = i.type === 'number' ? parseFloat(i.value) : i.value; }));
  const cs = $('clrS'); if (cs) cs.onclick = () => { sight = null; draw(); };
  const cb = $('clrB'); if (cb) cb.onclick = () => { P.bcolor = ''; toast('رنگ پیش‌فرض'); }; const cp = $('clrP'); if (cp) cp.onclick = () => { P.pcolor = ''; toast('رنگ پیش‌فرض'); };
}

// ------------------------------------------------------------------ side panel
const SCHEMA = {
  areas: [['x۰', 0], ['z۰', 1], ['x۱', 2], ['z۱', 3], ['ارتفاع', 4, 'n', 0.1], ['جنس', 5, 'mat']], ramps: [['x۰', 0], ['z۰', 1], ['x۱', 2], ['z۱', 3], ['ارتفاع شروع', 4, 'n', 0.1], ['ارتفاع پایان', 5, 'n', 0.1], ['جهت', 6, 'axis'], ['جنس', 7, 'mat']],
  roofs: [['x۰', 0], ['z۰', 1], ['x۱', 2], ['z۱', 3], ['ارتفاع سقف', 4, 'n', 0.1]], crates: [['x', 0], ['z', 1], ['عرض', 2], ['عمق', 3], ['ارتفاع', 4, 'n', 0.1], ['نوع', 5, 'bk'], ['رنگ', 6, 'col']],
  decals: [['x۰', 0], ['z۰', 1], ['x۱', 2], ['z۱', 3], ['رنگ', 4, 'col']], wallZones: [['x۰', 0], ['z۰', 1], ['x۱', 2], ['z۱', 3], ['ارتفاع', 4, 'n', 0.5]], doors: [['x۰', 0, 'n', 0.01], ['z۰', 1, 'n', 0.01], ['x۱', 2, 'n', 0.01], ['z۱', 3, 'n', 0.01], ['ارتفاع', 4, 'n', 0.1]],
  lamps: [['x', 0, 'n', 0.5], ['z', 1, 'n', 0.5], ['ارتفاع', 2, 'n', 0.1], ['رنگ', 3, 'col'], ['شدت', 4, 'n', 0.1], ['برد', 5, 'n', 1]], props: [['نوع', 0, 'pk'], ['x', 1, 'n', 0.5], ['z', 2, 'n', 0.5], ['چرخش', 3, 'n', 0.1], ['اندازه', 4, 'n', 0.1], ['رنگ', 5, 'col']],
  sites: [['x۰', 0], ['z۰', 1], ['x۱', 2], ['z۱', 3]], spawns: [['x', 0], ['z', 1]],
};
let tab = 'sel';
document.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => { tab = b.dataset.tab; document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b)); updateSide(); }));
const NAMES = { areas: 'کف', ramps: 'رمپ', roofs: 'سقف', crates: 'بلوک', decals: 'رنگ کف', wallZones: 'قد دیوار', doors: 'در', lamps: 'چراغ', props: 'دکور', sites: 'سایت', spawns: 'اسپاون' };
function fieldInput(v, kind, step) {
  if (kind === 'mat') return `<select>${MAT_NAMES.map((n, i) => (i && i !== 4 ? `<option value="${i}" ${+v === i ? 'selected' : ''}>${n}</option>` : '')).join('')}</select>`;
  if (kind === 'axis') return `<select>${['x', 'z'].map((a) => `<option ${v === a ? 'selected' : ''}>${a}</option>`).join('')}</select>`;
  if (kind === 'bk') return `<select>${Object.entries(BLOCK_KINDS).map(([k, t]) => `<option value="${k}" ${(v || 'crate') === k ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  if (kind === 'pk') return `<select>${Object.entries(PROP_KINDS).map(([k, t]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${t.name}</option>`).join('')}</select>`;
  if (kind === 'col') return `<input type="color" value="${v || '#888888'}">`;
  return `<input type="number" step="${step || 1}" value="${v ?? ''}">`;
}
function updateSide() {
  const el = $('tab'); if (!m) return;
  if (tab === 'sel') {
    if (!sel) { el.innerHTML = `<div style="color:var(--mut)">چیزی انتخاب نشده.<br>با ابزار «انتخاب» روی هر شکل کلیک کن.</div><h4>آمار مپ</h4><div class="row"><span>اندازه</span>${m.W}×${m.H}</div><div class="row"><span>کف‌ها</span>${def.areas.length} · رمپ ${def.ramps.length} · سقف ${def.roofs.length}</div><div class="row"><span>بلوک‌ها</span>${def.crates.length} · دکور ${def.props.length} · چراغ ${def.lamps.length}</div><div class="row"><span>اسپاون</span>T ${def.spawns.T.length} · CT ${def.spawns.CT.length}</div><div class="row"><span>ربات‌ها</span>${def.routes ? 'مسیرها ذخیره شده‌اند' : 'مسیرها هنگام لود خودکار ساخته می‌شوند'}</div>`; return; }
    const sch = SCHEMA[sel.t], arr = sel.t === 'sites' ? def.sites[sel.k] : sel.t === 'spawns' ? def.spawns[sel.team][sel.i] : def[sel.t][sel.i]; if (!arr) { sel = null; return updateSide(); }
    el.innerHTML = `<h4>${NAMES[sel.t]}${sel.k ? ' ' + sel.k : ''}${sel.team ? ' ' + sel.team : ''}</h4>` + sch.map(([lab, idx, kind, step], n) => `<div class="row"><span>${lab}</span><span data-n="${n}">${fieldInput(arr[idx], kind, step)}</span></div>`).join('') + `<div class="row" style="margin-top:10px"><button id="sDel">🗑 حذف</button><button id="sDup">⧉ کپی</button>${['areas', 'crates', 'ramps'].includes(sel.t) ? '<button id="sUp">⬆ روی بقیه</button><button id="sDn">⬇ زیر بقیه</button>' : ''}</div>`;
    el.querySelectorAll('[data-n]').forEach((w) => { const [lab, idx, kind] = sch[+w.dataset.n]; const inp = w.firstChild; inp.onchange = () => { let v = inp.value; if (kind === 'mat') v = +v; else if (!kind || kind === 'n') v = parseFloat(v); if (kind === 'col' && sel.t === 'crates') { } arr[idx] = v; commit(); }; });
    $('sDel').onclick = () => { removeSel(sel); sel = null; commit('حذف شد'); };
    $('sDup').onclick = () => { if (sel.t === 'sites') return toast('هر سایت فقط یکی'); if (sel.t === 'spawns') { def.spawns[sel.team].push([arr[0] + 1, arr[1]]); sel.i = def.spawns[sel.team].length - 1; } else { const c = clone(arr); if (rectOf(sel)) { c[0] += 2; c[1] += 2; if (sel.t !== 'crates') { c[2] += 2; c[3] += 2; } } else if (sel.t === 'props') { c[1] += 1; } else { c[0] += 1; } def[sel.t].push(c); sel.i = def[sel.t].length - 1; } commit('کپی شد'); };
    if ($('sUp')) { $('sUp').onclick = () => { const a = def[sel.t]; const x = a.splice(sel.i, 1)[0]; a.push(x); sel.i = a.length - 1; commit(); }; $('sDn').onclick = () => { const a = def[sel.t]; const x = a.splice(sel.i, 1)[0]; a.unshift(x); sel.i = 0; commit(); }; }
  } else if (tab === 'map') mapTab(el);
  else if (tab === 'chk') chkTab(el);
  else el.innerHTML = `<div class="row"><span>نمای نقشه</span><select id="vm"><option value="normal" ${vmode === 'normal' ? 'selected' : ''}>عادی</option><option value="height" ${vmode === 'height' ? 'selected' : ''}>ارتفاع</option><option value="walk" ${vmode === 'walk' ? 'selected' : ''}>قابل‌راه‌رفتن</option></select></div>` + Object.entries({ grid: 'خطوط شبکه', roofs: 'سقف‌ها', wallz: 'قد دیوار', decals: 'رنگ کف', sites: 'سایت‌ها', callouts: 'نام مکان‌ها', props: 'دکورها', lamps: 'چراغ‌ها', doors: 'درها' }).map(([k, t]) => `<div class="row"><label><input type="checkbox" data-l="${k}" ${L[k] ? 'checked' : ''}> ${t}</label></div>`).join('') + `<div class="row"><label><input type="checkbox" id="lRoutes" ${showRoutes ? 'checked' : ''}> مسیر و نقطه‌ی نگهبانی ربات‌ها</label></div>`,
    el.querySelectorAll('[data-l]').forEach((c) => (c.onchange = () => { L[c.dataset.l] = c.checked; draw(); })), $('lRoutes') && ($('lRoutes').onchange = (e) => { showRoutes = e.target.checked; draw(); }), $('vm') && ($('vm').onchange = (e) => { vmode = e.target.value; dirtyBg = true; draw(); });
}
function mapTab(el) {
  const th = def.theme || {}, T = { ...THEME_PRESETS[th.preset || 'desert'], ...th }, cols = [['sky', 'آسمان'], ['haze', 'مه افق'], ['sun', 'نور خورشید'], ['wall', 'دیوار'], ['plaster', 'گچ'], ['floor', 'کف'], ['trim', 'قرنیز/قاب']];
  el.innerHTML = `<div class="row"><span>نام</span><input id="mName" type="text" value="${def.name || ''}"></div><div class="row"><span>شناسه</span><code>${def.id}</code></div>
  <div class="row"><span>اندازه</span><input id="mW" type="number" value="${def.size[0]}" min="32" max="512"> × <input id="mH" type="number" value="${def.size[1]}" min="32" max="512"></div>
  <div class="row"><span>جهت دید T / CT</span><input id="yT" type="number" step="15" value="${Math.round(def.yaw.T * 180 / Math.PI)}"> <input id="yC" type="number" step="15" value="${Math.round(def.yaw.CT * 180 / Math.PI)}"> °</div>
  <h4>ظاهر و محیط</h4><div class="row"><span>تم آماده</span><select id="thP">${Object.keys(THEME_PRESETS).map((k) => `<option ${th.preset === k ? 'selected' : ''}>${k}</option>`).join('')}</select><button id="thReset">بازنشانی رنگ‌ها</button></div>
  ${cols.map(([k, t]) => `<div class="row"><span>${t}</span><input type="color" data-th="${k}" value="${T[k] || '#888888'}"></div>`).join('')}
  <div class="row"><span>افق</span><select data-th="horizon">${['dunes', 'city', 'mountains', 'forest'].map((k) => `<option ${T.horizon === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
  <div class="row"><span>دیوار A / B</span><select data-ws="0">${['blocks', 'plaster', 'brick', 'concrete', 'metal'].map((k) => `<option ${(T.wallStyle || [])[0] === k ? 'selected' : ''}>${k}</option>`).join('')}</select><select data-ws="1">${['blocks', 'plaster', 'brick', 'concrete', 'metal'].map((k) => `<option ${(T.wallStyle || [])[1] === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
  <div class="row"><span>مه (نزدیک/دور)</span><input type="number" data-thn="fogNear" value="${T.fogNear}"> <input type="number" data-thn="fogFar" value="${T.fogFar}"></div>
  <div class="row"><span>نوردهی</span><input type="number" step="0.05" data-thn="exposure" value="${T.exposure}"></div>
  <div class="row"><label><input type="checkbox" data-thb="night" ${T.night ? 'checked' : ''}> شب</label><label><input type="checkbox" data-thb="windows" ${T.windows === false ? '' : 'checked'}> پنجره روی دیوارها</label></div>
  <h4>قد دیوارها (آسمان‌خط)</h4><div class="row"><span>کمینه/بازه/لبه</span><input type="number" step="0.5" data-sk="min" value="${def.skyline?.min ?? 5.6}"><input type="number" step="0.5" data-sk="range" value="${def.skyline?.range ?? 3.6}"><input type="number" step="0.5" data-sk="edge" value="${def.skyline?.edge ?? 9}"></div>
  <h4>ربات‌ها</h4><div class="row"><button id="rClr">حذف مسیرهای ذخیره‌شده (خودکار بسازد)</button></div>`;
  const ch = (f) => (e) => { f(e.target); commit(); };
  $('mName').onchange = ch((i) => (def.name = i.value || def.id));
  $('mW').onchange = $('mH').onchange = ch(() => (def.size = [clamp(+$('mW').value | 0, 32, 512), clamp(+$('mH').value | 0, 32, 512)]));
  $('yT').onchange = ch((i) => (def.yaw.T = i.value * Math.PI / 180)); $('yC').onchange = ch((i) => (def.yaw.CT = i.value * Math.PI / 180));
  $('thP').onchange = ch((i) => { def.theme = { preset: i.value }; });
  $('thReset').onclick = () => { def.theme = { preset: def.theme.preset || 'desert' }; commit(); };
  el.querySelectorAll('[data-th]').forEach((i) => (i.onchange = ch((x) => { def.theme[x.dataset.th] = x.value; })));
  el.querySelectorAll('[data-thn]').forEach((i) => (i.onchange = ch((x) => { def.theme[x.dataset.thn] = parseFloat(x.value); })));
  el.querySelectorAll('[data-thb]').forEach((i) => (i.onchange = ch((x) => { def.theme[x.dataset.thb] = x.checked; })));
  el.querySelectorAll('[data-ws]').forEach((i) => (i.onchange = ch((x) => { const cur = (def.theme.wallStyle || T.wallStyle || ['blocks', 'plaster']).slice(); cur[+x.dataset.ws] = x.value; def.theme.wallStyle = cur; })));
  el.querySelectorAll('[data-sk]').forEach((i) => (i.onchange = ch((x) => { def.skyline = { ...(def.skyline || {}), [x.dataset.sk]: parseFloat(x.value) }; })));
  $('rClr').onclick = () => { delete def.routes; delete def.holds; delete def.buy; delete def.callouts; commit('مسیرها پاک شد؛ هنگام لود دوباره خودکار ساخته می‌شوند'); };
}
function runCheck() { try { issues = validateMap(m); } catch (e) { issues = [{ level: 'error', msg: 'بررسی ناموفق: ' + e.message }]; } }
function chkTab(el) {
  runCheck(); const bad = issues.filter((i) => i.level === 'error').length;
  el.innerHTML = `<div class="row"><b style="color:${bad ? 'var(--bad)' : 'var(--ok)'}">${bad ? bad + ' خطا' : 'خطای مهمی نیست'}</b><button id="rr">بررسی مجدد</button></div>` + issues.map((i, n) => `<div class="issue ${i.level}" data-i="${n}">${i.msg}</div>`).join('');
  el.querySelectorAll('.issue').forEach((d) => (d.onclick = () => { const a = issues[+d.dataset.i].at; if (a) { view.x = cv.clientWidth / 2 - a[0] * view.zoom; view.y = cv.clientHeight / 2 - a[1] * view.zoom; draw(); } }));
  $('rr').onclick = () => chkTab(el);
}

function pasteClip() {
  const c = clone(clip.data), t = clip.t, ix = { crates: [0, 1], lamps: [0, 1], props: [1, 2], spawns: [0, 1] }[t] || [0, 1], span = ['areas', 'ramps', 'roofs', 'decals', 'wallZones', 'doors'].includes(t);
  const dx = Math.floor(last[0]) - Math.floor(c[ix[0]]), dz = Math.floor(last[1]) - Math.floor(c[ix[1]]);
  c[ix[0]] += dx; c[ix[1]] += dz; if (span) { c[2] += dx; c[3] += dz; }
  if (t === 'spawns') { def.spawns[clip.team].push(c); sel = { t, team: clip.team, i: def.spawns[clip.team].length - 1 }; } else { def[t].push(c); sel = { t, i: def[t].length - 1 }; }
  commit('چسبانده شد');
}
// ---- one-click detail pass: lamps along walls + theme-matched props scattered on open ground (undo with Ctrl+Z)
function autoDecorate() {
  const lvl = clamp(parseInt(prompt('چگالی جزئیات (۱ کم تا ۵ زیاد):', '3'), 10) || 3, 1, 5); if (!m) return;
  const { W, H } = m, th = { ...(THEME_PRESETS[def.theme.preset || 'desert']), ...def.theme }; let seed = 7 + def.id.length * 131; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pal = { desert: ['palm', 'rock', 'hay', 'tire', 'rubble', 'bush'], urban: ['bench', 'tire', 'rubble', 'sign', 'acunit', 'bush'], snow: ['pine', 'rock', 'pine', 'rubble'], industrial: ['pipe', 'tire', 'acunit', 'rubble', 'sign'], night: ['bench', 'tire', 'rubble', 'sign', 'bush'], jungle: ['tree', 'bush', 'bush', 'rock', 'palm'] }[def.theme.preset || 'desert'] || ['rock', 'bush'];
  const keepOut = (x, z) => Object.values(def.sites).some((r) => x >= r[0] - 1 && x < r[2] + 1 && z >= r[1] - 1 && z < r[3] + 1) || ['T', 'CT'].some((t) => def.spawns[t].some((q) => Math.abs(q[0] - x) < 4 && Math.abs(q[1] - z) < 4));
  const wallN = (x, z) => { let n = 0; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, zz = z + dz; if (xx < 0 || zz < 0 || xx >= W || zz >= H || m.heights[zz * W + xx] >= WALL) n++; } return n; };
  let nl = 0, np = 0; const lampsAt = [];
  for (const l of def.lamps) lampsAt.push([l[0], l[1]]);
  for (let z = 2; z < H - 2; z++) for (let x = 2; x < W - 2; x++) {
    const i = z * W + x; if (m.heights[i] >= WALL || m.mat[i] === MAT.CRATE || m.ceil[i] < 1e8 || m.rampIdx[i] >= 0 || keepOut(x, z)) continue;
    const wn = wallN(x, z);
    if (wn === 1 && nl < 60 && (th.night || lvl >= 3 || def.theme.preset === 'urban') && lampsAt.every(([a, b]) => Math.hypot(a - x, b - z) > 13 - lvl)) { lampsAt.push([x, z]); def.lamps.push([x + 0.5, z + 0.5, 3.8, th.night ? '#ffd9a0' : '#ffc78a', 1, 13]); nl++; }
    else if (rnd() < 0.0035 * lvl * (wn >= 1 ? 2.2 : 1) && def.props.every((q) => Math.hypot(q[1] - x, q[2] - z) > 3)) { const k = pal[Math.floor(rnd() * pal.length)]; def.props.push([k, x + 0.5, z + 0.5, +(rnd() * 6.28).toFixed(2), +(0.85 + rnd() * 0.5).toFixed(2)]); np++; }
  }
  commit(`جزئیات خودکار: ${np} دکور، ${nl} چراغ`);
}
// ---- autosave (survives a closed tab / crash)
let saveT = 0; function autosave() { clearTimeout(saveT); saveT = setTimeout(() => { try { const o = {}; for (const id of customIds) if (maps[id]) o[id] = maps[id]; localStorage.setItem('cs2-editor-autosave', JSON.stringify({ t: Date.now(), maps: o })); } catch {} }, 800); }

// ------------------------------------------------------------------ top bar actions
function fillMapSel() { const s = $('mapSel'); s.innerHTML = Object.keys(maps).map((k) => `<option value="${k}" ${k === curId ? 'selected' : ''}>${customIds.has(k) ? '★ ' : ''}${maps[k].name || k} (${k})</option>`).join(''); }
function selectMap(id, fit = true) {
  curId = id; def = ensure(clone(maps[id])); if (def.scale && def.scale !== 1) { bakeScale(def); toast('مقیاس مپ به ۱ تبدیل شد (ظاهر و بازی همان می‌ماند)'); } maps[id] = def; if (def.grid) toast('این مپ «گرید» دارد: ارتفاع کف از گرید می‌آید و کف‌ها فقط جنس را رنگ می‌کنند', 5000);
  undo = [JSON.stringify(def)]; redo = []; sel = null; rebuild(); if (fit) fitView(); fillMapSel(); setTool(tool);
}
function fitView() { const w = cv.clientWidth || 800, h = cv.clientHeight || 600; view.zoom = clamp(Math.min(w / m.W, h / m.H) * 0.94, 2, 20); view.x = (w - m.W * view.zoom) / 2; view.y = (h - m.H * view.zoom) / 2; draw(); }
$('mapSel').onchange = (e) => selectMap(e.target.value);
$('bUndo').onclick = doUndo; $('bRedo').onclick = doRedo;
$('bNew').onclick = () => {
  const id = (prompt('شناسه‌ی مپ (فقط حروف کوچک انگلیسی، عدد، - و _):', 'my_map') || '').trim(); if (!id) return; if (!/^[a-z0-9_-]{2,32}$/.test(id)) return toast('شناسه نامعتبر است'); if (maps[id]) return toast('این شناسه وجود دارد');
  const name = prompt('نام نمایشی:', id) || id, size = parseInt(prompt('اندازه (۶۴ تا ۲۵۶):', '128'), 10) || 128, preset = prompt('تم: ' + Object.keys(THEME_PRESETS).join(' / '), 'desert') || 'desert';
  maps[id] = template(id, name, clamp(size, 48, 512), clamp(size, 48, 512), THEME_PRESETS[preset] ? preset : 'desert'); customIds.add(id); selectMap(id); commit('مپ جدید ساخته شد');
};
$('bDup').onclick = () => { const id = (prompt('شناسه‌ی کپی:', curId + '_copy') || '').trim(); if (!id) return; if (!/^[a-z0-9_-]{2,32}$/.test(id) || maps[id]) return toast('شناسه نامعتبر یا تکراری'); const d = clone(def); d.id = id; d.name = (def.name || curId) + ' (کپی)'; maps[id] = d; customIds.add(id); selectMap(id); commit('کپی ساخته شد'); };
$('bDel').onclick = () => { if (!customIds.has(curId)) return toast('مپ‌های اصلی بازی حذف نمی‌شوند'); if (!confirm('این مپ از لیست حذف شود؟ (با «ذخیره» روی سرور هم پاک می‌شود)')) return; delete maps[curId]; customIds.delete(curId); selectMap(Object.keys(maps)[0]); $('stSave').textContent = '● تغییر ذخیره‌نشده'; };
$('bCheck').onclick = () => { tab = 'chk'; document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x.dataset.tab === 'chk')); updateSide(); };
$('bDeco').onclick = autoDecorate;
$('bAuto').onclick = () => {
  const c = { ...clone(def) }; delete c.routes; delete c.holds; delete c.buy; delete c.callouts; try { const mm = buildMap(c); autoGameplay(mm, true); def.routes = c.routes; def.holds = c.holds; def.buy = c.buy; def.callouts = c.callouts; showRoutes = true; commit('مسیر ربات‌ها ساخته شد (روی نقشه سبز/آبی/نارنجی)'); } catch (e) { toast('نشد: ' + e.message, 5000); }
};
$('bExp').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(def, null, 1)], { type: 'application/json' })); a.download = curId + '.json'; a.click(); };
$('bImp').onclick = () => $('file').click();
$('file').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { const d = JSON.parse(await f.text()); if (!d.id || !/^[a-z0-9_-]{2,32}$/.test(d.id)) d.id = (f.name.replace(/\.json$/, '').toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'imported').slice(0, 32); if (maps[d.id] && !confirm('این شناسه وجود دارد؛ جایگزین شود؟')) return; maps[d.id] = ensure(d); customIds.add(d.id); selectMap(d.id); commit('وارد شد'); } catch (err) { toast('JSON نامعتبر: ' + err.message, 5000); } e.target.value = ''; };
$('bSave').onclick = async () => {
  if (!adminKey) return toast('برای ذخیره باید با کلید Admin وارد شوی (صفحه را رفرش کن)', 4000);
  const out = {}; for (const id of customIds) { if (maps[id]) out[id] = maps[id]; }
  try { const r = await fetch('/api/maps/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: adminKey, maps: out }) }); const j = await r.json(); if (!j.ok) throw new Error(j.error || r.status); $('stSave').textContent = '✓ ذخیره شد'; try { localStorage.removeItem('cs2-editor-autosave'); } catch {} toast(`ذخیره شد (${j.count} مپ). بازیکن‌ها با ساخت اتاق جدید مپ تازه را می‌گیرند.`, 4000); } catch (e) { toast('ذخیره نشد: ' + e.message, 6000); }
};
$('bLogin').onclick = async () => { const k = $('key').value.trim(); if (!k) return ($('authmsg').textContent = 'کلید را وارد کن'); try { const r = await fetch('/api/maps/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: k }) }); const j = await r.json(); if (!j.ok) throw 0; adminKey = k; sessionStorage.setItem('cs2key', k); $('login').style.display = 'none'; } catch { $('authmsg').textContent = 'کلید اشتباه است یا سرور جواب نداد'; } };
$('bGuest').onclick = () => ($('login').style.display = 'none');
addEventListener('keydown', (e) => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return; const k = e.key.toLowerCase();
  if (e.code === 'Space') { spaceDown = true; e.preventDefault(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; } if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); doRedo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'd' && sel) { e.preventDefault(); $('sDup')?.click(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'c' && sel) { const arr = sel.t === 'sites' ? def.sites[sel.k] : sel.t === 'spawns' ? def.spawns[sel.team][sel.i] : def[sel.t][sel.i]; if (arr && sel.t !== 'sites') { clip = { t: sel.t, team: sel.team, data: clone(arr) }; toast('کپی شد — Ctrl+V'); } return; }
  if ((e.ctrlKey || e.metaKey) && k === 'v' && clip) { e.preventDefault(); pasteClip(); return; }
  if (k === 'delete' || k === 'backspace') { if (sel) { removeSel(sel); sel = null; commit('حذف شد'); } return; }
  if (sel && k.startsWith('arrow')) { e.preventDefault(); const d = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[k]; const r = rectOf(sel); if (r) setRect(sel, [r[0] + d[0], r[1] + d[1], r[2] + d[0], r[3] + d[1]]); else { const p = pointOf(sel); movePoint(sel, p[0] + d[0], p[1] + d[1]); } commit(); return; }
  if (k === 'escape') { sight = null; sel = null; preview = null; drag = null; updateSide(); draw(); return; }
  if (k === 'r' && (tool === 'prop' || sel?.t === 'props')) { if (sel?.t === 'props') { const a = def.props[sel.i]; a[3] = ((a[3] || 0) + Math.PI / 12) % (Math.PI * 2); commit(); return; } }
  const t = TOOLS.find((x) => x[3] === k); if (t && !e.ctrlKey && !e.metaKey) setTool(t[0]);
});
addEventListener('keyup', (e) => { if (e.code === 'Space') spaceDown = false; });
addEventListener('beforeunload', (e) => { if ($('stSave').textContent.startsWith('●')) { e.preventDefault(); e.returnValue = ''; } });
addEventListener('resize', () => { draw(); resize3d(); });

// ------------------------------------------------------------------ 3D preview + walk test
let R3 = null, scene3 = null, world3 = null, cam3 = null, t3 = null, mode3 = 'orbit', walk = null, last3 = 0, smart = true, q3 = 'medium';
const orbit = { yaw: 0.7, pitch: 0.75, dist: 120, tx: 64, tz: 64 };
const keys = new Set(); let loop3 = 0;
function setView(v) { const st = $('stage'); st.className = v === '2d' ? 's2d' : v === '3d' ? 's3d' : 'split'; for (const [id, k] of [['vw2d', '2d'], ['vwsp', 'sp'], ['vw3d', '3d']]) $(id).classList.toggle('on', k === v); if (v !== '2d') { init3d(); schedule3d(true); } else { cancelAnimationFrame(loop3); loop3 = 0; } setTimeout(() => { resize3d(); if (m) fitView(); }, 40); }
$('vw2d').onclick = () => setView('2d'); $('vwsp').onclick = () => setView('sp'); $('vw3d').onclick = () => setView('3d');
function init3d() {
  if (R3) return; R3 = new THREE.WebGLRenderer({ canvas: $('c3d'), antialias: true }); R3.outputColorSpace = THREE.SRGBColorSpace; R3.toneMapping = THREE.ACESFilmicToneMapping; R3.shadowMap.enabled = true; R3.shadowMap.type = THREE.PCFSoftShadowMap; R3.autoClear = true;
  cam3 = new THREE.PerspectiveCamera(70, 1.6, 0.1, 900); const c = $('c3d'); let d3 = null;
  c.addEventListener('pointerdown', (e) => { if (mode3 === 'walk') { c.requestPointerLock?.(); return; } d3 = { x: e.clientX, y: e.clientY, yaw: orbit.yaw, pitch: orbit.pitch, tx: orbit.tx, tz: orbit.tz, pan: e.button === 2 || e.shiftKey }; c.setPointerCapture(e.pointerId); });
  c.addEventListener('pointermove', (e) => { if (mode3 === 'walk' && document.pointerLockElement === c) { walk.yaw -= e.movementX * 0.0025; walk.pitch = clamp(walk.pitch - e.movementY * 0.0025, -1.5, 1.5); return; } if (!d3) return; const dx = e.clientX - d3.x, dy = e.clientY - d3.y; if (d3.pan) { const s = orbit.dist * 0.0016; orbit.tx = d3.tx - (Math.cos(orbit.yaw) * dx + Math.sin(orbit.yaw) * dy) * s; orbit.tz = d3.tz - (-Math.sin(orbit.yaw) * dx + Math.cos(orbit.yaw) * dy) * s; } else { orbit.yaw = d3.yaw - dx * 0.006; orbit.pitch = clamp(d3.pitch + dy * 0.005, 0.12, 1.5); } });
  c.addEventListener('pointerup', () => (d3 = null)); c.addEventListener('contextmenu', (e) => e.preventDefault());
  c.addEventListener('wheel', (e) => { e.preventDefault(); orbit.dist = clamp(orbit.dist * (e.deltaY > 0 ? 1.1 : 0.9), 8, 600); }, { passive: false });
  addEventListener('keydown', (e) => { if (mode3 === 'walk' && !['INPUT', 'SELECT'].includes(e.target.tagName)) { keys.add(e.code); if (e.code === 'Escape') exitWalk(); } }); addEventListener('keyup', (e) => keys.delete(e.code));
}
function resize3d() { if (!R3) return; const c = $('c3d'), w = c.clientWidth, h = c.clientHeight; if (!w || !h) return; R3.setPixelRatio(Math.min(devicePixelRatio, 1.5)); R3.setSize(w, h, false); cam3.aspect = w / h; cam3.updateProjectionMatrix(); }
function schedule3d(now) { if (!R3 || $('stage').classList.contains('s2d')) return; clearTimeout(t3); t3 = setTimeout(rebuild3d, now ? 0 : 450); }
function rebuild3d() {
  if (!m) return; if (world3) { world3.dispose(); world3 = null; } scene3 = new THREE.Scene(); resize3d();
  try { world3 = buildWorld(scene3, m, { quality: q3, low: q3 === 'low', stream: smart }); } catch (e) { toast('خطا در ساخت ۳بعدی: ' + e.message, 6000); console.error(e); return; }
  R3.toneMappingExposure = world3.exposure || 1.1; orbit.tx = m.W / 2; orbit.tz = m.H / 2; if (!loop3) { last3 = performance.now(); loop3 = requestAnimationFrame(frame3); } renderOpts3();
}
function renderOpts3() { const extra = $('opts3'); if (extra) extra.remove(); const d = document.createElement('span'); d.id = 'opts3'; d.style.cssText = 'display:inline-flex;gap:6px;margin-right:10px;align-items:center'; d.innerHTML = `<button id="bWalk" class="${mode3 === 'walk' ? 'on' : ''}">🎮 قدم‌زدن در مپ</button><label><input type="checkbox" id="cSmart" ${smart ? 'checked' : ''}> لود هوشمند (فقط روبرو)</label><select id="q3"><option ${q3 === 'high' ? 'selected' : ''} value="high">کیفیت بالا</option><option ${q3 === 'medium' ? 'selected' : ''} value="medium">متوسط</option><option ${q3 === 'low' ? 'selected' : ''} value="low">پایین</option></select>`; $('opts').appendChild(d); $('bWalk').onclick = () => (mode3 === 'walk' ? exitWalk() : enterWalk()); $('cSmart').onchange = (e) => { smart = e.target.checked; rebuild3d(); }; $('q3').onchange = (e) => { q3 = e.target.value; rebuild3d(); }; }
function enterWalk() {
  const sp = (sel?.t === 'spawns' ? def.spawns[sel.team][sel.i] : def.spawns.CT[0] || def.spawns.T[0]) || [m.W / 2, m.H / 2]; const x = sp[0] + 0.5, z = sp[1] + 0.5, i = Math.floor(z) * m.W + Math.floor(x);
  walk = { s: { x, y: m.floor[i] < WALL ? m.floor[i] : 0, z, vx: 0, vy: 0, vz: 0, onGround: true, crouch: false }, yaw: def.yaw.CT || 0, pitch: 0 }; mode3 = 'walk'; if ($('stage').classList.contains('s2d')) setView('3d'); toast('روی تصویر ۳بعدی کلیک کن (ماوس قفل می‌شود) · WASD · Space پرش · Ctrl خم‌شدن · Shift آهسته · Esc خروج', 5000); renderOpts3();
}
function exitWalk() { mode3 = 'orbit'; document.exitPointerLock?.(); renderOpts3(); }
function frame3(now) {
  loop3 = requestAnimationFrame(frame3); if (!world3 || $('stage').classList.contains('s2d')) return; const dt = Math.min(0.05, (now - last3) / 1000); last3 = now;
  if (mode3 === 'walk' && walk) {
    const s = walk.s, f = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0), r = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0), fy = Math.sin(walk.yaw), fx = Math.cos(walk.yaw);
    // yaw 0 looks toward -z (same convention as the game): forward = (-sin, -cos), right = (cos, -sin)
    stepMove(m, s, { wx: -fy * f + fx * r, wz: -fx * f - fy * r, jump: keys.has('Space'), crouch: keys.has('ControlLeft'), walk: keys.has('ShiftLeft'), speed: 6.35 }, dt);
    cam3.position.set(s.x, s.y + (s.crouch ? PHYS.crouchEye : PHYS.eye), s.z); cam3.rotation.set(walk.pitch, walk.yaw, 0, 'YXZ');
  } else { const o = orbit, cp = Math.cos(o.pitch); cam3.position.set(o.tx + Math.sin(o.yaw) * cp * o.dist, Math.sin(o.pitch) * o.dist, o.tz + Math.cos(o.yaw) * cp * o.dist); cam3.lookAt(o.tx, 0, o.tz); }
  cam3.updateMatrixWorld(); world3.update(dt, cam3.position, cam3); R3.render(scene3, cam3);
  const st = world3.stats(); $('hud3d').textContent = `تکه‌های لودشده ${st.built}/${st.chunks} · دیده‌شده ${st.visible}\nمثلث ${st.tris.toLocaleString('en')} · ${R3.info.render.calls} draw call`;
}

// ------------------------------------------------------------------ boot
async function getJson(u) { const r = await fetch(u, { cache: 'no-store' }); const t = await r.text(); try { return JSON.parse(t); } catch { throw new Error(t.slice(0, 80)); } }
(async function boot() {
  buildTools(); setTool('sel');
  let base = null, custom = {}; try { base = await getJson('/api/maps/definitions'); try { custom = await getJson('/api/maps/custom'); } catch {} } catch (e) { base = clone(MAP_DEFS); toast('API مپ‌ها در دسترس نیست؛ فقط حالت آفلاین (JSON)', 5000); }
  maps = { ...base, ...custom }; customIds = new Set(Object.keys(custom)); if (adminKey) { try { const r = await fetch('/api/maps/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: adminKey }) }); if ((await r.json()).ok) $('login').style.display = 'none'; } catch {} }
  try { const sv = JSON.parse(localStorage.getItem('cs2-editor-autosave') || 'null'); if (sv && sv.maps) { const diff = Object.keys(sv.maps).filter((id) => JSON.stringify(sv.maps[id]) !== JSON.stringify(custom[id])); if (diff.length && confirm(`تغییرات ذخیره‌نشده‌ی قبلی پیدا شد (${diff.join(', ')}). بازیابی شود؟`)) { for (const id of diff) { maps[id] = sv.maps[id]; customIds.add(id); } $('stSave').textContent = '● بازیابی‌شده — ذخیره کن'; } } } catch {}
  const want = new URLSearchParams(location.search).get('map'); selectMap(maps[want] ? want : Object.keys(custom)[0] || [...customIds][0] || 'dust2');
  window.__editor = { walk: () => walk, get def() { return def; }, get m() { return m; }, P, setTool, commit, selectMap, view, sel: () => sel, setSel: (s) => { sel = s; updateSide(); draw(); } };
})();
