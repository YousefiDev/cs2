// node examples/make-harbor.mjs  ->  examples/harbor.json  (import it in the map editor with "⬆ JSON")
// A full showcase map built only from the new engine features: night theme, materials, roofs, stairs, ramps, blocks, decals, props, lamps.
import fs from 'fs';
const W = 144, H = 112, d = { id: 'harbor', name: 'Harbor Night (نمونه)', size: [W, H], theme: { preset: 'night', horizon: 'city', wallStyle: ['concrete', 'metal'], haze: '#222c44', fogNear: 60, fogFar: 300 }, areas: [], ramps: [], roofs: [], crates: [], doors: [], lamps: [], props: [], decals: [], wallZones: [], sites: {}, spawns: { T: [], CT: [] }, yaw: { T: -0.785, CT: 2.356 } };
const area = (x0, z0, x1, z1, h = 0, mat = 9) => d.areas.push([x0, z0, x1, z1, h, mat]);
const ASPH = 12, CONC = 9, PLANK = 5, METAL = 10;
// --- walkable network (everything else stays solid = buildings)
area(6, 84, 34, 106, 0, CONC);                 // T plaza
area(34, 86, 132, 98, 0, ASPH);                // south road (long dock route)
area(58, 30, 72, 98, 0, ASPH);                 // mid road
area(10, 30, 138, 42, 0, ASPH);                // north road
area(108, 6, 138, 30, 0, CONC);                // CT plaza
area(58, 44, 100, 72, 0, CONC);                // central yard
area(8, 44, 46, 80, 0, CONC);                  // warehouse (site B)
area(46, 56, 58, 66, 0, METAL);                // warehouse east gate
area(18, 42, 28, 44, 0, CONC);  // warehouse north door (the south side stays closed so T has to rotate)
area(100, 52, 134, 86, 0, PLANK);              // dock (site A)
area(118, 42, 130, 52, 0, CONC);               // A short alley
area(100, 56, 110, 66, 0, CONC);               // yard -> dock link
// --- raised dock platform with stairs on the west side and a ramp on the east
area(112, 58, 128, 76, 1.2, PLANK);
for (let k = 0; k < 3; k++) area(108 + k + 1 - 1, 64, 109 + k, 70, 0.3 * (k + 1), PLANK);
area(111, 64, 112, 70, 1.2, PLANK);
d.ramps.push([128, 58, 132, 76, 1.2, 0, 'x', PLANK]);
for (let k = 0; k < 3; k++) area(116 + k * 1, 76, 117 + k, 80, 0.4 * (k + 1), PLANK);   // south stairs (small)
// --- wall heights: tall warehouse, lower dock-side walls
d.wallZones.push([4, 40, 50, 84, 9.5], [98, 48, 136, 90, 7]);
// --- roofs: the whole warehouse, a parking shelter on the T plaza
d.roofs.push([8, 44, 46, 80, 5.5], [6, 98, 22, 106, 3.8]);
// --- blocks (solid): containers, crates, cars, barriers
const cont = (x, z, w, dd, h, c) => d.crates.push([x, z, w, dd, h, 'cont', c]);
cont(104, 70, 6, 3, 2.6, '#b5412f'); cont(104, 74, 6, 3, 5.2, '#2f6fa3'); cont(120, 80, 6, 3, 2.6, '#d49a2a'); cont(124, 54, 3, 6, 2.6, '#3d7a4a');
cont(62, 48, 6, 3, 2.6, '#b5412f'); cont(76, 56, 3, 6, 5.2, '#2f6fa3'); cont(86, 64, 6, 3, 2.6, '#d49a2a'); cont(70, 66, 6, 3, 2.6, '#7a3d7a');
cont(40, 90, 6, 3, 2.6, '#3d7a4a'); cont(92, 94, 6, 3, 2.6, '#b5412f'); cont(24, 32, 6, 3, 2.6, '#2f6fa3'); cont(96, 34, 6, 3, 2.6, '#d49a2a');
for (const [x, z] of [[14, 50], [20, 62], [34, 56], [28, 74], [38, 48]]) d.crates.push([x, z, 2, 2, 1.2, 'crate']);
for (const [x, z] of [[18, 52], [30, 52], [18, 70], [30, 70], [40, 62], [40, 72]]) d.crates.push([x, z, 1, 1, 5, 'pillar']);
d.crates.push([48, 88, 4, 2, 1.5, 'car'], [84, 96, 4, 2, 1.5, 'car', '#2c2f33'], [112, 88, 4, 2, 1.5, 'car', '#c79a2e'], [14, 100, 2, 4, 1.5, 'car'], [36, 34, 4, 2, 1.5, 'car', '#d8d8d2']);
for (let x = 64; x < 96; x += 6) d.crates.push([x, 46 + (x % 12 ? 0 : 1), 3, 1, 1.0, 'jersey']);
d.crates.push([112, 14, 5, 1, 1.0, 'sandbags'], [126, 20, 1, 5, 1.0, 'sandbags'], [112, 24, 5, 1, 1.0, 'sandbags']);
d.crates.push([60, 72, 2, 1, 1.4, 'dumpster'], [118, 46, 1, 1, 1.0, 'barrel'], [120, 47, 1, 1, 1.0, 'barrel'], [12, 90, 3, 1, 0.9, 'bench'], [26, 90, 3, 1, 0.9, 'bench'], [110, 10, 2, 1, 1.0, 'planter']);
// --- floor paint
for (let x = 38; x < 128; x += 8) d.decals.push([x, 91, x + 4, 92, '#e8d36a']);
for (let z = 34; z < 96; z += 8) d.decals.push([64, z, 65, z + 4, '#e8d36a']);
for (const r of [[112, 57, 128, 58], [112, 76, 128, 77], [111, 58, 112, 76]]) d.decals.push([...r, '#f0c020']);
d.decals.push([8, 82, 34, 83, '#f0c020'], [12, 104, 22, 105, '#ffffff']);
// --- lamps + props
for (let x = 40; x < 130; x += 14) { d.lamps.push([x, 87, 3.9, '#ffd9a0', 1, 14], [x + 7, 97, 3.9, '#ffd9a0', 1, 14]); d.props.push(['lamppost', x, 87.2, 0, 1], ['lamppost', x + 7, 97.5, 0, 1]); }
for (let z = 34; z < 96; z += 14) d.props.push(['lamppost', 59.5, z, 0, 1]);
for (const [x, z] of [[16, 56], [36, 66], [26, 46]]) d.lamps.push([x, z, 4.4, '#ffe3b0', 1.2, 14]);
for (const [x, z] of [[10, 88], [28, 88], [20, 102], [112, 10], [132, 10], [120, 24], [26, 36], [100, 36]]) { d.lamps.push([x, z, 4.4, '#ffd9a0', 1.2, 15]); d.props.push(['lamppost', x, z - 0.4, 0, 1]); }
d.lamps.push([120, 14, 4.4, '#ffd9a0', 1, 14], [120, 66, 4.4, '#ffb070', 1.4, 15], [80, 58, 4.4, '#ffd9a0', 1, 14]);
for (let x = 100; x < 134; x += 4) d.props.push(['fence', x + 2, 85.6, 0, 4]);
d.props.push(['tire', 124, 52, 0, 1], ['tire', 124.7, 52.4, 0, 1], ['rubble', 86, 40, 0, 1.2], ['rubble', 14, 86, 0, 1], ['rubble', 66, 92, 0, 1], ['pipe', 10.5, 46, 0, 8], ['pipe', 10.5, 76, 0, 8], ['acunit', 44.2, 80.5, 0, 1]);
d.props.push(['sign', 118, 56, 0, 1], ['sign', 20, 54, 0, 1], ['flag', 124, 8, 0, 1, '#2f6fa3'], ['flag', 10, 86, 0, 1, '#b33a3a'], ['antenna', 134, 8, 0, 1], ['bush', 112, 31, 0, 1], ['bush', 136, 31, 0, 1], ['hay', 96, 90, 0, 1]);
// --- gameplay data
for (let i = 0; i < 10; i++) { d.spawns.T.push([9 + (i % 5) * 2, 90 + Math.floor(i / 5) * 3]); d.spawns.CT.push([114 + (i % 5) * 2, 10 + Math.floor(i / 5) * 3]); }
d.sites.A = [108, 56, 130, 78]; d.sites.B = [12, 48, 36, 74];
d.callouts = [['Dock', 100, 52, 134, 86], ['Warehouse', 8, 44, 46, 80], ['Mid Yard', 58, 44, 100, 72], ['South Road', 34, 86, 132, 98], ['North Road', 10, 30, 138, 42], ['Mid Road', 58, 30, 72, 98], ['T Plaza', 6, 84, 34, 106], ['CT Plaza', 108, 6, 138, 30], ['A Site', 108, 56, 130, 78], ['B Site', 12, 48, 36, 74], ['A Alley', 118, 42, 130, 52]];
d.buy = { T: [6, 84, 34, 106], CT: [108, 6, 138, 30] };
fs.writeFileSync(new URL('./harbor.json', import.meta.url), JSON.stringify(d));
console.log('wrote examples/harbor.json');
