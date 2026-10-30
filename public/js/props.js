// Prop + solid-block mesh recipes for the chunked world. Everything is written into merged Geo buffers
// ("solid" = flat vertex colours, "crate"/"cont"/"concrete"/"blocks" = textured), so a chunk is a handful of draw calls.
import { hexRGB, mulRGB } from './geo.js';

const rgb = (c, d) => (c ? (Array.isArray(c) ? c : hexRGB(c)) : hexRGB(d));
const hash = (x, z, s = 0) => { const v = Math.sin(x * 12.9898 + z * 78.233 + s * 37.719) * 43758.5453; return v - Math.floor(v); };
export const CAR_COLORS = ['#b33a3a', '#2f5d9e', '#d8d8d2', '#2c2f33', '#c79a2e', '#4a7d4e'];

// Decoration (no collision). p = [kind, x, z, rot, scale, color, yOffset]
export function emitProp(ctx, p) {
  const { G, m, th, heightAt } = ctx; const [kind, x, z, a = 0, size = 1, color, yo = 0] = p;
  const y = Math.max(-0.5, heightAt(m, x, z)) + 0.02 + yo; const S = G('solid');
  const sc = kind === 'awning' || kind === 'fence' || kind === 'pipe' ? 1 : (size || 1);
  const T = { x, y, z, r: kind === 'awning' ? (a ? Math.PI / 2 : 0) : a, s: sc };
  const green = rgb(color, '#3f6b3a'), wood = hexRGB('#6b4a2c'), steel = hexRGB('#30363d'), clay = hexRGB('#a7603e'), grey = hexRGB('#8a8a86');
  switch (kind) {
    case 'barrel': S.tcyl(T, 0, 0, 0, 0.28, 0.28, 0.75, 8, rgb(color, '#30363d')); break;
    case 'pot': S.tcyl(T, 0, 0, 0, 0.34, 0.26, 0.38, 8, rgb(color, '#a7603e')); S.tcyl(T, 0, 0.38, 0, 0.3, 0, 0.35, 6, hexRGB('#3f6b3a')); break;
    case 'palm':
      S.tcyl(T, 0, 0, 0, 0.14, 0.09, 2.6, 7, clay);
      for (let i = 0; i < 7; i++) { const t2 = { ...T, r: T.r + i * Math.PI * 2 / 7 }; S.tbox(t2, 0.55, 2.45 - (i % 2) * 0.12, 0, 1.25, 0.04, 0.2, green); S.tbox(t2, 1.05, 2.3 - (i % 2) * 0.12, 0, 0.5, 0.04, 0.14, mulRGB(green, 0.85)); }
      break;
    case 'tree': S.tcyl(T, 0, 0, 0, 0.22, 0.16, 2.2, 7, wood); S.tcyl(T, 0, 1.6, 0, 1.5, 0.5, 1.5, 8, green); S.tcyl(T, 0, 2.7, 0, 1.0, 0.0, 1.3, 8, mulRGB(green, 1.12)); break;
    case 'pine': S.tcyl(T, 0, 0, 0, 0.16, 0.12, 1.2, 6, wood); for (let i = 0; i < 4; i++) S.tcyl(T, 0, 0.9 + i * 0.95, 0, 1.45 - i * 0.28, 0.05, 1.25, 8, mulRGB(rgb(color, '#2f5a3a'), 1 + i * 0.05)); break;
    case 'bush': S.tcyl(T, 0, 0, 0, 0.75, 0.35, 0.7, 7, green); S.tcyl({ ...T, x: x + 0.3 * sc, z: z + 0.2 * sc }, 0, 0, 0, 0.5, 0.2, 0.6, 6, mulRGB(green, 1.15)); break;
    case 'rock': { const g = rgb(color, '#8a867c'); S.tbox({ ...T, r: T.r }, 0, 0, 0, 1.1, 0.7, 0.9, g); S.tbox({ ...T, r: T.r + 0.7 }, 0.25, 0, 0.1, 0.8, 1.0, 0.7, mulRGB(g, 0.92)); S.tbox({ ...T, r: T.r - 0.5 }, -0.4, 0, -0.2, 0.6, 0.45, 0.6, mulRGB(g, 1.08)); break; }
    case 'lamppost': S.tcyl(T, 0, 0, 0, 0.09, 0.06, 4.2, 6, steel); S.tbox(T, 0.35, 4.1, 0, 0.8, 0.07, 0.1, steel); S.tbox(T, 0.7, 3.98, 0, 0.3, 0.1, 0.22, hexRGB('#ffe8b8')); break;
    case 'fence': { const L = Math.max(1, size || 4); for (let i = 0; i <= L; i++) S.tbox(T, i - L / 2, 0, 0, 0.07, 1.5, 0.07, steel); S.tbox(T, 0, 1.4, 0, L, 0.05, 0.05, steel); S.tbox(T, 0, 0.1, 0, L, 0.05, 0.05, steel); S.tbox(T, 0, 0.15, 0, L, 1.25, 0.015, rgb(color, '#6f777d')); break; }
    case 'sign': S.tbox(T, 0, 0, 0, 0.08, 2.4, 0.08, steel); S.tbox(T, 0, 1.6, 0.06, 1.1, 0.7, 0.05, rgb(color, th.shutter || '#3a7182')); S.tbox(T, 0, 1.75, 0.09, 0.8, 0.07, 0.02, [0.95, 0.95, 0.9]); S.tbox(T, 0, 1.55, 0.09, 0.6, 0.07, 0.02, [0.95, 0.95, 0.9]); break;
    case 'flag': S.tcyl(T, 0, 0, 0, 0.04, 0.03, 4, 5, steel); S.tbox(T, 0.55, 3.0, 0, 1.1, 0.7, 0.02, rgb(color, '#b33a3a')); break;
    case 'acunit': S.tbox(T, 0, 0, 0, 1.1, 0.8, 0.7, rgb(color, '#a9adb0')); S.tcyl(T, 0, 0.8, 0, 0.3, 0.3, 0.05, 8, steel); S.tbox(T, 0, 0.1, 0.36, 0.9, 0.5, 0.02, [0.35, 0.37, 0.4]); break;
    case 'pipe': { const L = Math.max(1, size || 4); S.tbox(T, 0, 0.35, 0, L, 0.22, 0.22, rgb(color, '#6c7378')); for (let i = 0; i <= L; i += 2) S.tbox(T, i - L / 2, 0, 0, 0.12, 0.35, 0.3, steel); break; }
    case 'tire': S.tcyl(T, 0, 0, 0, 0.36, 0.36, 0.2, 10, [0.09, 0.09, 0.1]); S.tcyl({ ...T, y: y + 0.2 * sc }, 0, 0, 0, 0.34, 0.34, 0.2, 10, [0.1, 0.1, 0.11]); break;
    case 'rubble': for (let i = 0; i < 6; i++) { const r = hash(x + i, z, 3); S.tbox({ ...T, r: r * 6 }, (hash(x, z + i, 1) - 0.5) * 1.2, 0, (hash(x + 4, z + i, 2) - 0.5) * 1.2, 0.3 + r * 0.4, 0.2 + hash(i, x, 9) * 0.4, 0.3 + r * 0.3, mulRGB(rgb(color, '#9a9488'), 0.8 + r * 0.4)); } break;
    case 'hay': S.tcyl(T, 0, 0, 0, 0.55, 0.55, 0.8, 9, rgb(color, '#cdb15a')); S.tcyl({ ...T, x: x + 0.9 * sc }, 0, 0, 0, 0.5, 0.5, 0.75, 9, rgb(color, '#c4a850')); break;
    case 'tent': S.tcyl({ ...T, r: T.r + Math.PI / 4 }, 0, 0, 0, 1.5, 0.08, 1.5, 4, rgb(color, th.shutter || '#3a7182')); break;
    case 'antenna': S.tcyl(T, 0, 0, 0, 0.06, 0.03, 6, 5, steel); for (let i = 0; i < 4; i++) S.tbox(T, 0, 3 + i * 0.7, 0, 0.9 - i * 0.18, 0.03, 0.03, steel); break;
    case 'bench': S.tbox(T, 0, 0.42, 0, 1.6, 0.07, 0.45, wood); S.tbox(T, 0, 0.75, -0.2, 1.6, 0.4, 0.05, wood); S.tbox(T, -0.65, 0, 0, 0.07, 0.42, 0.4, steel); S.tbox(T, 0.65, 0, 0, 0.07, 0.42, 0.4, steel); break;
    case 'awning': { const w = Math.max(2, size || 3); S.tbox({ ...T, s: 1 }, 0, 2.4, 0, w, 0.08, 1.3, rgb(color, th.shutter || '#3a7182')); S.tbox({ ...T, s: 1 }, -w / 2 + 0.15, 0, 0.58, 0.06, 2.4, 0.06, steel); S.tbox({ ...T, s: 1 }, w / 2 - 0.15, 0, 0.58, 0.06, 2.4, 0.06, steel); break; }
    case 'sandbags': for (let i = 0; i < 5; i++) S.tbox({ ...T, r: T.r + 0.1 * (i - 2) }, (i - 2) * 0.62, (i % 2) * 0.32, 0, 0.7, 0.38, 0.42, rgb(color, '#bca77c')); break;
    case 'wires': S.tbox({ ...T, s: 1 }, 0, 3.1, 0, 7, 0.03, 0.03, steel); break;
    default: S.tbox(T, 0, 0, 0, 0.6, 0.6, 0.6, grey);
  }
}

// Solid blocks (def.crates). c = {x,z,w,d,base,h,kind,color}; collision is the grid, this is only the look.
export function emitBlock(ctx, c) {
  const { G, th } = ctx; const S = G('solid'); const { x, z, w, d, base: y, h, kind } = c;
  const cx = x + w / 2, cz = z + d / 2, T = { x: cx, y, z: cz, r: 0, s: 1 };
  switch (kind) {
    case 'cont': {
      const col = rgb(c.color, th.cont || '#3b6fb6'), g = G('cont'), long = w >= d, layers = Math.max(1, Math.round(h / 2.6)), lh = h / layers;
      for (let L = 0; L < layers; L++) g.tbox({ ...T, y: y + lh * L, r: L ? Math.sin(x * 3 + z) * 0.03 : 0 }, 0, 0, 0, w - 0.04, lh - 0.01, d - 0.04, mulRGB(col, 1 - L * 0.06), long ? Math.max(1, Math.round(w / 2.4)) : 1);
      const lw = Math.min(w, d); if (long) S.tbox({ ...T, y: y + h }, 0, 0, 0, w * 0.96, 0.03, lw * 0.9, mulRGB(col, 0.7)); break;
    }
    case 'barrel': for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) { const t2 = { ...T, x: x + i + 0.5, z: z + j + 0.5 }, col = rgb(c.color, ['#2f6fa3', '#a33b2f', '#3d7a4a'][((x + i + z + j) % 3 + 3) % 3]); S.tcyl(t2, 0, 0, 0, 0.44, 0.44, h, 10, col); S.tcyl(t2, 0, h * 0.25, 0, 0.455, 0.455, 0.05, 10, mulRGB(col, 0.7)); S.tcyl(t2, 0, h * 0.7, 0, 0.455, 0.455, 0.05, 10, mulRGB(col, 0.7)); } break;
    case 'concrete': G('concrete').tbox(T, 0, 0, 0, w - 0.02, h, d - 0.02, rgb(c.color, '#a3a39f'), Math.max(1, Math.max(w, d) / 2)); break;
    case 'ledge': G('blocks').tbox(T, 0, 0, 0, w - 0.02, h, d - 0.02, rgb(c.color, '#e0cfa6'), Math.max(1, Math.max(w, d) / 3)); break;
    case 'pillar': {
      const col = rgb(c.color, '#cdbb98');
      if (w === 1 && d === 1) { S.tcyl(T, 0, 0, 0, 0.5, 0.5, 0.25, 10, mulRGB(col, 0.9)); S.tcyl(T, 0, 0.25, 0, 0.4, 0.38, h - 0.5, 12, col); S.tcyl(T, 0, h - 0.25, 0, 0.5, 0.5, 0.25, 10, mulRGB(col, 1.05)); }
      else { S.tbox(T, 0, 0, 0, w, 0.25, d, mulRGB(col, 0.9)); S.tbox(T, 0, 0.25, 0, w - 0.2, h - 0.5, d - 0.2, col); S.tbox(T, 0, h - 0.25, 0, w, 0.25, d, mulRGB(col, 1.05)); } break;
    }
    case 'planter': { const col = rgb(c.color, '#a39a8c'); G('concrete').tbox(T, 0, 0, 0, w - 0.04, h * 0.75, d - 0.04, col, 1); S.tbox(T, 0, h * 0.72, 0, w - 0.3, h * 0.08, d - 0.3, hexRGB('#4a3626')); for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) S.tcyl({ ...T, x: x + i + 0.5, z: z + j + 0.5 }, 0, h * 0.78, 0, 0.42, 0.1, 0.5 + h * 0.2, 7, hexRGB('#3f7a3a')); break; }
    case 'bench': { const long = w >= d, T2 = { ...T, r: long ? 0 : Math.PI / 2 }, L = Math.max(w, d), col = rgb(c.color, '#6b4a2c'); S.tbox(T2, 0, h * 0.55, 0, L - 0.1, 0.08, 0.6, col); S.tbox(T2, 0, h * 0.8, -0.28, L - 0.1, h * 0.4, 0.06, col); S.tbox(T2, -L / 2 + 0.15, 0, 0, 0.08, h * 0.55, 0.5, [0.2, 0.22, 0.24]); S.tbox(T2, L / 2 - 0.15, 0, 0, 0.08, h * 0.55, 0.5, [0.2, 0.22, 0.24]); break; }
    case 'jersey': { const col = rgb(c.color, '#b0b0aa'), g = G('concrete'); g.tbox(T, 0, 0, 0, w - 0.02, h * 0.45, d - 0.02, col, 1); g.tbox(T, 0, h * 0.45, 0, Math.max(0.3, w - 0.5), h * 0.55, Math.max(0.3, d - 0.5), mulRGB(col, 1.03), 1); break; }
    case 'sandbags': { const col = rgb(c.color, '#bca77c'), courses = Math.max(1, Math.round(h / 0.38)), ch = h / courses, long = w >= d, L = Math.max(w, d); for (let k = 0; k < courses; k++) for (let i = 0; i < L; i++) { const off = (k % 2) * 0.25, p = i + 0.5 + off - 0.12; const t2 = { ...T, x: long ? x + Math.min(L - 0.4, p) : cx, z: long ? cz : z + Math.min(L - 0.4, p), y: y + ch * k, r: (hash(i, k, x) - 0.5) * 0.12 }; S.tbox(t2, 0, 0, 0, long ? 1.0 : Math.min(w, 1.3) - 0.05, ch * 0.96, long ? Math.min(d, 1.3) - 0.05 : 1.0, mulRGB(col, 0.9 + hash(i, k, z) * 0.2)); } break; }
    case 'dumpster': { const col = rgb(c.color, '#3d6b45'); S.tbox(T, 0, 0, 0, w - 0.05, h * 0.9, d - 0.05, col); S.tbox({ ...T, y: y + h * 0.9 }, 0, 0, 0.02, w - 0.02, h * 0.1, d - 0.02, mulRGB(col, 0.75)); S.tbox(T, 0, h * 0.35, 0, w + 0.01, 0.08, d + 0.01, mulRGB(col, 0.7)); break; }
    case 'car': {
      const col = rgb(c.color, CAR_COLORS[Math.abs((x * 7 + z * 13) | 0) % CAR_COLORS.length]), long = w >= d, T2 = { ...T, r: long ? 0 : Math.PI / 2 }, L = Math.max(w, d) - 0.3, Wd = Math.min(w, d) - 0.3;
      S.tbox(T2, 0, h * 0.2, 0, L, h * 0.42, Wd, col); S.tbox(T2, -L * 0.04, h * 0.6, 0, L * 0.52, h * 0.38, Wd - 0.12, mulRGB(col, 0.95)); S.tbox(T2, -L * 0.04, h * 0.64, 0, L * 0.5, h * 0.28, Wd - 0.1, [0.12, 0.16, 0.2]);
      for (const sx of [-0.32, 0.32]) for (const sz of [-1, 1]) S.tbox(T2, L * sx, 0, sz * (Wd / 2 - 0.02), 0.5, h * 0.3, 0.14, [0.07, 0.07, 0.08]); break;
    }
    default: { // crate: stacked wooden boxes, bigger footprints are split into 2 m crates
      const g = G('crate'), layers = Math.max(1, Math.round(h / 1.1)), lh = h / layers, cw = w >= 4 ? 2 : w, cd = d >= 4 ? 2 : d, tint = c.color ? rgb(c.color) : [1, 1, 1];
      for (let L = 0; L < layers; L++) for (let ox = 0; ox < w; ox += cw) for (let oz = 0; oz < d; oz += cd) { const sh = L ? 0.08 : 0.01; g.tbox({ x: x + ox + cw / 2, y: y + lh * L, z: z + oz + cd / 2, r: L ? Math.sin(x * 3 + z) * 0.06 : 0, s: 1 }, 0, 0, 0, cw - sh * 2, lh - 0.005, cd - sh * 2, tint); }
    }
  }
}
