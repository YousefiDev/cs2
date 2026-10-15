// CS:GO-inspired weapon table. Speeds in m/s (250u/s ~= 6.35m/s), spread in radians.
export const WEAPONS = {
  knife:  { name: 'Knife', slot: 3, price: 0, team: null, dmg: 40, altDmg: 65, pen: 0.85, rpm: 140, altRpm: 70, mag: 0, res: 0, reload: 0, speed: 6.35, reward: 1500, auto: true, melee: true, range: 2.05, altRange: 1.72, head: 1, falloff: 1, spread: 0, move: 0, air: 0, spray: 0, sprayMax: 0, kick: 0, side: 0, draw: 0.3 },
  glock:  { name: 'Glock-18', slot: 2, price: 200, team: 'T', dmg: 30, pen: 0.47, rpm: 400, mag: 20, res: 120, reload: 2.2, speed: 6.1, reward: 300, auto: false, head: 4, falloff: 0.85, spread: 0.010, move: 0.035, air: 0.15, spray: 0.012, sprayMax: 0.05, kick: 0.012, side: 0.004, draw: 0.35 },
  usp:    { name: 'USP-S', slot: 2, price: 200, team: 'CT', dmg: 35, pen: 0.505, rpm: 352, mag: 12, res: 24, reload: 2.2, speed: 6.1, reward: 300, auto: false, head: 4, falloff: 0.91, spread: 0.006, move: 0.03, air: 0.15, spray: 0.012, sprayMax: 0.05, kick: 0.013, side: 0.003, draw: 0.35 },
  deagle: { name: 'Desert Eagle', slot: 2, price: 700, team: null, dmg: 63, pen: 0.932, rpm: 267, mag: 7, res: 35, reload: 2.2, speed: 5.84, reward: 300, auto: false, head: 4, falloff: 0.88, spread: 0.008, move: 0.09, air: 0.25, spray: 0.04, sprayMax: 0.09, kick: 0.035, side: 0.01, draw: 0.45 },
  mac10:  { name: 'MAC-10', slot: 1, price: 1050, team: 'T', dmg: 29, pen: 0.575, rpm: 800, mag: 30, res: 100, reload: 2.6, speed: 6.1, reward: 600, auto: true, head: 4, falloff: 0.78, spread: 0.014, move: 0.03, air: 0.2, spray: 0.005, sprayMax: 0.05, kick: 0.007, side: 0.005, draw: 0.5 },
  mp9:    { name: 'MP9', slot: 1, price: 1250, team: 'CT', dmg: 26, pen: 0.6, rpm: 857, mag: 30, res: 120, reload: 2.1, speed: 6.1, reward: 600, auto: true, head: 4, falloff: 0.82, spread: 0.012, move: 0.028, air: 0.2, spray: 0.005, sprayMax: 0.045, kick: 0.007, side: 0.005, draw: 0.5 },
  ak47:   { name: 'AK-47', slot: 1, price: 2700, team: 'T', dmg: 36, pen: 0.775, rpm: 600, mag: 30, res: 90, reload: 2.5, speed: 5.47, reward: 300, auto: true, head: 4, falloff: 0.98, spread: 0.0035, move: 0.11, air: 0.3, spray: 0.0045, sprayMax: 0.04, kick: 0.016, side: 0.007, draw: 0.75 },
  m4a4:   { name: 'M4A4', slot: 1, price: 3100, team: 'CT', dmg: 33, pen: 0.7, rpm: 666, mag: 30, res: 90, reload: 3.1, speed: 5.72, reward: 300, auto: true, head: 4, falloff: 0.97, spread: 0.003, move: 0.09, air: 0.3, spray: 0.004, sprayMax: 0.035, kick: 0.013, side: 0.006, draw: 0.75 },
  awp:    { name: 'AWP', slot: 1, price: 4750, team: null, dmg: 115, pen: 0.975, rpm: 41, mag: 10, res: 30, reload: 3.7, speed: 5.3, scopedSpeed: 2.5, reward: 100, auto: false, head: 4, falloff: 0.99, spread: 0.07, scoped: 0.0012, move: 0.25, air: 0.4, spray: 0, sprayMax: 0, kick: 0.05, side: 0, draw: 1.0, scope: [40, 15] },
  c4:     { name: 'C4 Explosive', slot: 5, price: 0, team: 'T', speed: 6.35, draw: 0.3 },
  // ---- added in the merged build (ported from Counter-Strike Online Ready) ----
  p90:    { name: 'P90', slot: 1, price: 2350, team: null, dmg: 26, pen: 0.69, rpm: 857, mag: 50, res: 100, reload: 3.3, speed: 5.97, reward: 300, auto: true, head: 4, falloff: 0.84, spread: 0.013, move: 0.03, air: 0.2, spray: 0.004, sprayMax: 0.045, kick: 0.0065, side: 0.005, draw: 0.6 },
  galil:  { name: 'Galil AR', slot: 1, price: 1800, team: 'T', dmg: 30, pen: 0.775, rpm: 666, mag: 35, res: 90, reload: 3.0, speed: 5.84, reward: 300, auto: true, head: 4, falloff: 0.98, spread: 0.0045, move: 0.1, air: 0.3, spray: 0.0048, sprayMax: 0.042, kick: 0.0145, side: 0.007, draw: 0.75 },
  famas:  { name: 'FAMAS', slot: 1, price: 2050, team: 'CT', dmg: 30, pen: 0.7, rpm: 666, mag: 25, res: 90, reload: 3.3, speed: 5.84, reward: 300, auto: true, head: 4, falloff: 0.96, spread: 0.0042, move: 0.095, air: 0.3, spray: 0.0046, sprayMax: 0.04, kick: 0.0135, side: 0.0065, draw: 0.75 },
  m4a1s:  { name: 'M4A1-S', slot: 1, price: 2900, team: 'CT', dmg: 38, pen: 0.7, rpm: 600, mag: 20, res: 80, reload: 3.1, speed: 5.72, reward: 300, auto: true, head: 4, falloff: 0.94, spread: 0.0028, move: 0.085, air: 0.3, spray: 0.0038, sprayMax: 0.032, kick: 0.0115, side: 0.0045, draw: 0.75 },
  sg553:  { name: 'SG 553', slot: 1, price: 3000, team: 'T', dmg: 30, pen: 1.0, rpm: 545, mag: 30, res: 90, reload: 2.8, speed: 5.3, scopedSpeed: 3.8, reward: 300, auto: true, head: 4, falloff: 0.98, spread: 0.0042, scoped: 0.0016, move: 0.11, air: 0.3, spray: 0.0045, sprayMax: 0.04, kick: 0.015, side: 0.006, draw: 0.75, scope: [45] },
  aug:    { name: 'AUG', slot: 1, price: 3300, team: 'CT', dmg: 28, pen: 0.9, rpm: 666, mag: 30, res: 90, reload: 3.8, speed: 5.5, scopedSpeed: 3.8, reward: 300, auto: true, head: 4, falloff: 0.98, spread: 0.0036, scoped: 0.0015, move: 0.1, air: 0.3, spray: 0.0042, sprayMax: 0.038, kick: 0.0135, side: 0.0055, draw: 0.75, scope: [45] },
  he:     { name: 'HE Grenade', slot: 4, price: 300, team: null, nade: true, max: 1, dmg: 98, pen: 0.575, radius: 9, fuse: 1.6, speed: 6.1, reward: 300, rpm: 60, draw: 0.5 },
  flash:  { name: 'Flashbang', slot: 4, price: 200, team: null, nade: true, max: 2, fuse: 1.6, speed: 6.1, reward: 0, rpm: 60, draw: 0.5 },
  smoke:  { name: 'Smoke Grenade', slot: 4, price: 300, team: null, nade: true, max: 1, fuse: 3.0, life: 18, radius: 4.2, speed: 6.1, reward: 0, rpm: 60, draw: 0.5 },
  // ---- full CS2 roster: pistols ----
  p2000:  { name: 'P2000', slot: 2, price: 200, team: 'CT', dmg: 35, pen: 0.505, rpm: 352, mag: 13, res: 52, reload: 2.2, speed: 6.1, reward: 300, auto: false, head: 4, falloff: 0.91, spread: 0.006, move: 0.03, air: 0.15, spray: 0.012, sprayMax: 0.05, kick: 0.013, side: 0.003, draw: 0.35 },
  elite:  { name: 'Dual Berettas', slot: 2, price: 300, team: null, dmg: 38, pen: 0.575, rpm: 500, mag: 30, res: 120, reload: 3.8, speed: 6.1, reward: 300, auto: false, head: 4, falloff: 0.79, spread: 0.011, move: 0.035, air: 0.15, spray: 0.013, sprayMax: 0.055, kick: 0.012, side: 0.005, draw: 0.55 },
  p250:   { name: 'P250', slot: 2, price: 300, team: null, dmg: 38, pen: 0.64, rpm: 400, mag: 13, res: 26, reload: 2.2, speed: 6.1, reward: 300, auto: false, head: 4, falloff: 0.85, spread: 0.0095, move: 0.03, air: 0.15, spray: 0.012, sprayMax: 0.05, kick: 0.013, side: 0.004, draw: 0.4 },
  tec9:   { name: 'Tec-9', slot: 2, price: 500, team: 'T', dmg: 33, pen: 0.906, rpm: 500, mag: 18, res: 90, reload: 2.5, speed: 6.1, reward: 300, auto: false, head: 4, falloff: 0.79, spread: 0.012, move: 0.035, air: 0.15, spray: 0.012, sprayMax: 0.05, kick: 0.012, side: 0.005, draw: 0.4 },
  fiveseven: { name: 'Five-SeveN', slot: 2, price: 500, team: 'CT', dmg: 32, pen: 0.9115, rpm: 400, mag: 20, res: 100, reload: 2.2, speed: 6.1, reward: 300, auto: false, head: 4, falloff: 0.81, spread: 0.009, move: 0.03, air: 0.15, spray: 0.011, sprayMax: 0.05, kick: 0.011, side: 0.004, draw: 0.4 },
  cz75:   { name: 'CZ75-Auto', slot: 2, price: 500, team: null, dmg: 31, pen: 0.776, rpm: 600, mag: 12, res: 12, reload: 2.8, speed: 6.1, reward: 100, auto: true, head: 4, falloff: 0.85, spread: 0.011, move: 0.04, air: 0.2, spray: 0.014, sprayMax: 0.06, kick: 0.013, side: 0.006, draw: 0.45 },
  r8:     { name: 'R8 Revolver', slot: 2, price: 600, team: null, dmg: 86, pen: 0.932, rpm: 120, mag: 8, res: 8, reload: 2.3, speed: 6.1, reward: 300, auto: false, head: 4, falloff: 0.86, spread: 0.005, move: 0.08, air: 0.25, spray: 0.03, sprayMax: 0.08, kick: 0.045, side: 0.009, draw: 0.6 },
  // ---- SMGs ----
  mp7:    { name: 'MP7', slot: 1, price: 1500, team: null, dmg: 29, pen: 0.625, rpm: 750, mag: 30, res: 120, reload: 3.1, speed: 5.59, reward: 600, auto: true, head: 4, falloff: 0.84, spread: 0.012, move: 0.03, air: 0.2, spray: 0.0045, sprayMax: 0.045, kick: 0.0085, side: 0.005, draw: 0.5 },
  mp5sd:  { name: 'MP5-SD', slot: 1, price: 1500, team: null, dmg: 27, pen: 0.625, rpm: 750, mag: 30, res: 120, reload: 2.9, speed: 5.97, reward: 600, auto: true, head: 4, falloff: 0.84, spread: 0.0105, move: 0.03, air: 0.2, spray: 0.0042, sprayMax: 0.042, kick: 0.008, side: 0.005, draw: 0.5 },
  ump45:  { name: 'UMP-45', slot: 1, price: 1200, team: null, dmg: 35, pen: 0.65, rpm: 666, mag: 25, res: 100, reload: 3.5, speed: 5.84, reward: 600, auto: true, head: 4, falloff: 0.75, spread: 0.013, move: 0.03, air: 0.2, spray: 0.0048, sprayMax: 0.046, kick: 0.0095, side: 0.0055, draw: 0.55 },
  bizon:  { name: 'PP-Bizon', slot: 1, price: 1400, team: null, dmg: 27, pen: 0.575, rpm: 750, mag: 64, res: 120, reload: 2.4, speed: 6.1, reward: 600, auto: true, head: 4, falloff: 0.8, spread: 0.0135, move: 0.03, air: 0.2, spray: 0.0045, sprayMax: 0.048, kick: 0.0075, side: 0.005, draw: 0.5 },
  // ---- rifles / snipers ----
  ssg08:  { name: 'SSG 08', slot: 1, price: 1700, team: null, dmg: 88, pen: 0.85, rpm: 48, mag: 10, res: 90, reload: 3.7, speed: 5.84, scopedSpeed: 5.0, reward: 300, auto: false, bolt: true, head: 4, falloff: 0.99, spread: 0.05, scoped: 0.0012, move: 0.2, air: 0.35, spray: 0, sprayMax: 0, kick: 0.04, side: 0, draw: 0.85, scope: [40] },
  g3sg1:  { name: 'G3SG1', slot: 1, price: 5000, team: 'T', dmg: 80, pen: 0.825, rpm: 240, mag: 20, res: 90, reload: 4.7, speed: 5.46, scopedSpeed: 3.05, reward: 300, auto: false, head: 4, falloff: 0.98, spread: 0.06, scoped: 0.0014, move: 0.22, air: 0.38, spray: 0.003, sprayMax: 0.02, kick: 0.025, side: 0.004, draw: 1.0, scope: [40, 15] },
  scar20: { name: 'SCAR-20', slot: 1, price: 5000, team: 'CT', dmg: 80, pen: 0.825, rpm: 240, mag: 20, res: 90, reload: 3.1, speed: 5.46, scopedSpeed: 3.05, reward: 300, auto: false, head: 4, falloff: 0.98, spread: 0.06, scoped: 0.0014, move: 0.22, air: 0.38, spray: 0.003, sprayMax: 0.02, kick: 0.025, side: 0.004, draw: 1.0, scope: [40, 15] },
  // ---- heavy: shotguns + machine guns (pellets = rays fired per shot) ----
  nova:   { name: 'Nova', slot: 1, price: 1050, team: null, pellets: 9, dmg: 26, pen: 0.5, rpm: 68, mag: 8, res: 32, reload: 3.0, speed: 5.59, reward: 900, auto: false, head: 4, falloff: 0.7, spread: 0.034, move: 0.02, air: 0.12, spray: 0, sprayMax: 0, kick: 0.045, side: 0.008, draw: 0.7 },
  xm1014: { name: 'XM1014', slot: 1, price: 2000, team: null, pellets: 6, dmg: 20, pen: 0.8, rpm: 171, mag: 7, res: 32, reload: 3.0, speed: 5.46, reward: 900, auto: true, head: 4, falloff: 0.7, spread: 0.036, move: 0.02, air: 0.12, spray: 0, sprayMax: 0, kick: 0.032, side: 0.007, draw: 0.7 },
  sawedoff: { name: 'Sawed-Off', slot: 1, price: 1100, team: 'T', pellets: 8, dmg: 32, pen: 0.5, rpm: 71, mag: 7, res: 32, reload: 3.0, speed: 5.33, reward: 900, auto: false, head: 4, falloff: 0.6, spread: 0.058, move: 0.02, air: 0.12, spray: 0, sprayMax: 0, kick: 0.05, side: 0.01, draw: 0.6 },
  mag7:   { name: 'MAG-7', slot: 1, price: 1300, team: 'CT', pellets: 8, dmg: 30, pen: 0.75, rpm: 71, mag: 5, res: 32, reload: 3.2, speed: 5.72, reward: 900, auto: false, head: 4, falloff: 0.68, spread: 0.04, move: 0.02, air: 0.12, spray: 0, sprayMax: 0, kick: 0.05, side: 0.009, draw: 0.7 },
  m249:   { name: 'M249', slot: 1, price: 5200, team: null, dmg: 32, pen: 0.8, rpm: 750, mag: 100, res: 200, reload: 5.7, speed: 4.95, reward: 300, auto: true, head: 4, falloff: 0.97, spread: 0.0055, move: 0.14, air: 0.3, spray: 0.0042, sprayMax: 0.045, kick: 0.013, side: 0.007, draw: 1.1 },
  negev:  { name: 'Negev', slot: 1, price: 1700, team: null, dmg: 35, pen: 0.75, rpm: 800, mag: 150, res: 200, reload: 5.7, speed: 3.81, reward: 300, auto: true, head: 4, falloff: 0.97, spread: 0.009, move: 0.16, air: 0.3, spray: 0.0058, sprayMax: 0.06, kick: 0.014, side: 0.009, draw: 1.1 },
  zeus:   { name: 'Zeus x27', slot: 6, price: 200, team: null, taser: true, range: 4.6, dmg: 500, pen: 1, rpm: 60, mag: 1, res: 0, reload: 0, speed: 6.35, reward: 0, auto: false, head: 1, falloff: 1, spread: 0, move: 0, air: 0, spray: 0, sprayMax: 0, kick: 0.02, side: 0, draw: 0.6 },
  // ---- more utility ----
  decoy:  { name: 'Decoy Grenade', slot: 4, price: 50, team: null, nade: true, max: 1, fuse: 2.0, life: 15, speed: 6.1, reward: 0, rpm: 60, draw: 0.5 },
  molotov: { name: 'Molotov', slot: 4, price: 400, team: 'T', nade: true, fire: true, max: 1, dmg: 8, pen: 1, fuse: 2.2, life: 7, radius: 3.4, speed: 6.1, reward: 300, rpm: 60, draw: 0.5 },
  incendiary: { name: 'Incendiary Grenade', slot: 4, price: 600, team: 'CT', nade: true, fire: true, max: 1, dmg: 8, pen: 1, fuse: 2.2, life: 7, radius: 3.4, speed: 6.1, reward: 300, rpm: 60, draw: 0.5 },
};
export const NADES = ['he', 'flash', 'smoke', 'decoy', 'molotov', 'incendiary'];
export const NADE_LIMIT = 4;
export const WEAPON_KEYS = Object.keys(WEAPONS);
export const GEAR = {
  vest:  { name: 'Kevlar Vest', price: 650 },
  vesthelm: { name: 'Kevlar + Helmet', price: 1000 },
  kit:   { name: 'Defuse Kit', price: 400, team: 'CT' },
};
// CS2-style categories (number keys 1-6 in the menu). `fa` is the Persian label.
export const BUY_MENU = [
  { id: 'pistols', title: 'Pistols', fa: 'تپانچه', items: ['glock', 'usp', 'p2000', 'elite', 'p250', 'tec9', 'fiveseven', 'cz75', 'deagle', 'r8'] },
  { id: 'heavy', title: 'Heavy', fa: 'سنگین', items: ['nova', 'xm1014', 'sawedoff', 'mag7', 'm249', 'negev'] },
  { id: 'smgs', title: 'SMGs', fa: 'مسلسل سبک', items: ['mac10', 'mp9', 'mp7', 'mp5sd', 'ump45', 'p90', 'bizon'] },
  { id: 'rifles', title: 'Rifles', fa: 'تفنگ', items: ['galil', 'famas', 'ak47', 'm4a4', 'm4a1s', 'ssg08', 'sg553', 'aug', 'awp', 'g3sg1', 'scar20'] },
  { id: 'gear', title: 'Gear', fa: 'تجهیزات', items: ['zeus', 'vest', 'vesthelm', 'kit'] },
  { id: 'grenades', title: 'Grenades', fa: 'نارنجک', items: ['decoy', 'molotov', 'incendiary', 'flash', 'smoke', 'he'] },
];
export const defaultPistol = (team) => (team === 'T' ? 'glock' : 'usp');
export const newWeapon = (k) => ({ k, mag: WEAPONS[k].mag || 0, res: WEAPONS[k].res || 0 });
export const newNades = () => { const g = {}; for (const n of NADES) g[n] = 0; return g; };
export const nadeCount = (g) => { if (!g) return 0; let c = 0; for (const n of NADES) c += g[n] || 0; return c; };
export const firstNade = (g, after) => { if (!g) return null; const N = NADES.length, i = NADES.indexOf(after); for (let k = 1; k <= N; k++) { const n = NADES[(i + k + N) % N]; if (g[n] > 0) return n; } return null; };

// Inaccuracy model shared by client prediction and server bots.
export function inaccuracy(w, { speed = 0, grounded = true, crouch = false, shots = 0, scoped = false }) {
  if (!w || w.melee) return 0;
  let s = (scoped && w.scoped) ? w.scoped : w.spread;
  if (crouch) s *= 0.75;
  const maxSp = w.speed || 6;
  const moveFrac = Math.max(0, Math.min(1, (speed - maxSp * 0.34) / (maxSp * 0.66)));
  s += w.move * moveFrac;
  if (!grounded) s += w.air;
  s += Math.min(w.sprayMax, w.spray * Math.max(0, shots - 1));
  return s;
}
export function spreadDir(d, s, rnd = Math.random) {
  if (s <= 0) return d;
  const a = rnd() * Math.PI * 2, r = s * rnd();
  // Build an orthonormal basis around d.
  const up = Math.abs(d[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
  let ux = up[1] * d[2] - up[2] * d[1], uy = up[2] * d[0] - up[0] * d[2], uz = up[0] * d[1] - up[1] * d[0];
  const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
  const vx = d[1] * uz - d[2] * uy, vy = d[2] * ux - d[0] * uz, vz = d[0] * uy - d[1] * ux;
  const ca = Math.cos(a) * r, sa = Math.sin(a) * r;
  const x = d[0] + ux * ca + vx * sa, y = d[1] + uy * ca + vy * sa, z = d[2] + uz * ca + vz * sa;
  const l = Math.hypot(x, y, z); return [x / l, y / l, z / l];
}
// Armor-aware damage (CS formula, simplified).
export function applyArmor(dmg, w, part, armor, helmet) {
  const protectedPart = part === 'head' ? helmet : part !== 'legs';
  if (armor <= 0 || !protectedPart) return { hp: Math.round(dmg), armor: 0 };
  let hp = dmg * w.pen; let ad = (dmg - hp) * 0.5;
  if (ad > armor) { hp = dmg - armor * 2; ad = armor; }
  return { hp: Math.round(hp), armor: Math.round(ad) };
}
export const PART_MULT = { head: 4, chest: 1, stomach: 1.25, legs: 0.75 };
