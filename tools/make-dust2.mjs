// node tools/make-dust2.mjs   ->  writes shared/dust2.js (then `npm run sync`)
// A from-scratch re-creation of the Dust II layout (T spawn south, CT spawn north, A site north-east, B site north-west),
// authored on a 152x152 m grid with the engine's own features: heights, ramps, roofs, doors, blocks, props, decals.
import fs from 'fs';
const W = 152, H = 152, SAND = 1, TILE = 2, TUN = 3, PLANK = 5, DARK = 6, COB = 7;
const d = { id: 'dust2', name: 'Dust II', size: [W, H], cs2: true,
  theme: { preset: 'desert', sky: '#86bfe8', haze: '#e9d2a6', sun: '#fff0d2', wall: '#d9b67f', wall2: '#cfa46c', plaster: '#dfc496', floor: '#ccad80', trim: '#b98f5a', shutter: '#3a7fa8', wallStyle: ['blocks', 'plaster'], horizon: 'dunes' },
  skyline: { min: 6.5, range: 3.2, edge: 10 },
  areas: [], ramps: [], roofs: [], crates: [], doors: [], lamps: [], props: [], decals: [], wallZones: [], sites: {}, spawns: { T: [], CT: [] }, yaw: { T: 0, CT: Math.PI } };
const R = (x0, z0, x1, z1, h = 0, mat = SAND) => d.areas.push([x0, z0, x1, z1, h, mat]);
const ramp = (x0, z0, x1, z1, h0, h1, axis, mat = SAND) => d.ramps.push([x0, z0, x1, z1, h0, h1, axis, mat]);
const roof = (x0, z0, x1, z1, c) => d.roofs.push([x0, z0, x1, z1, c]);
const box = (x, z, w, dd, h, kind = 'crate', color) => d.crates.push(color ? [x, z, w, dd, h, kind, color] : [x, z, w, dd, h, kind]);
const zone = (x0, z0, x1, z1, h) => d.wallZones.push([x0, z0, x1, z1, h]);
const prop = (...a) => d.props.push(a);
// open double doors lying against the jambs of a doorway (blue leaves, like the real map)
const doorsZ = (x, z0, x1, h = 3.3) => { d.doors.push([x, z0, x + 0.1, z0 + 2.8, h], [x1 - 0.1, z0, x1, z0 + 2.8, h]); };      // doorway runs along z, leaves on both jambs
const doorsX = (z, x0, z1, h = 3.3) => { d.doors.push([x0, z, x0 + 2.8, z + 0.1, h], [x0, z1 - 0.1, x0 + 2.8, z1, h]); };      // doorway runs along x

// ============================================================ T SIDE (south)
R(58, 128, 102, 146, 0, SAND);                     // T spawn
R(74, 114, 90, 128, 0, SAND);                      // T ramp up to Top Mid
R(62, 98, 102, 114, 0, COB);                       // Top Mid plaza
R(36, 128, 58, 142, 0, SAND);                      // west alley to Outside Tunnels
R(102, 132, 124, 142, 0, SAND);                    // east alley to Outside Long
// ============================================================ MID
R(74, 50, 90, 98, 0, SAND);                        // Mid corridor
R(78, 40, 84, 50, 0, COB);                         // Mid Doors neck
doorsZ(78, 41, 84); roof(78, 40, 84, 46, 3.6);
box(80, 72, 3, 3, 1.1, 'crate');                   // Xbox
box(76, 60, 2, 2, 1.1, 'crate'); box(86, 84, 2, 2, 1.2, 'crate');
// Suicide: west nook that runs up to the tunnels
R(52, 96, 62, 108, 0, DARK); R(54, 84, 62, 96, 0, DARK); R(38, 80, 56, 90, 0, DARK);
roof(54, 84, 62, 96, 3.4); roof(38, 80, 56, 90, 3.4);
// ============================================================ TUNNELS (west)
R(24, 116, 60, 134, 0, SAND);                      // Outside Tunnels plaza
R(28, 72, 36, 116, 0, TUN);                        // Lower Tunnels
R(38, 86, 46, 116, 1.6, TUN);                      // Upper Tunnels (raised)
ramp(38, 112, 46, 118, 0, 1.6, 'z', TUN);          // stairs-ramp up from the plaza into Upper Tunnels
roof(26, 76, 48, 112, 3.9);
R(24, 56, 50, 72, 0, TUN);                         // tunnel exit under B
ramp(38, 72, 46, 86, 0.0, 1.6, 'z', TUN);          // placeholder so upper tunnels climb out toward B (replaced below)
d.ramps.pop();
R(38, 72, 46, 86, 1.6, TUN); ramp(38, 66, 46, 72, 0, 1.6, 'z', TUN);   // Upper Tunnels exit ramp down into B
// ============================================================ B SITE (north-west)
R(12, 16, 58, 56, 0, SAND);                        // B pit
R(12, 44, 30, 58, 1.4, PLANK);                     // B Plat (raised, above the tunnel exit)
R(30, 48, 32, 56, 0.7, PLANK);                     // plat steps
R(12, 34, 22, 44, 1.4, PLANK);                     // Back Plat
R(6, 20, 12, 34, 0, DARK);                         // Closet
R(10, 26, 14, 30, 0, DARK);                        // closet doorway
box(28, 30, 6, 6, 2.6, 'crate'); box(34, 36, 3, 3, 1.3, 'crate'); box(22, 22, 3, 3, 1.3, 'crate'); box(46, 42, 3, 3, 1.3, 'crate'); box(46, 18, 4, 3, 1.3, 'crate');
box(14, 46, 3, 3, 1.3, 'crate'); box(24, 52, 2, 2, 1.1, 'crate');
// B Doors (to CT Mid) + B Window (jump-through ledge to Mid)
R(58, 18, 70, 28, 0, COB); doorsX(18, 58, 28); roof(58, 18, 66, 28, 3.5);
R(58, 50, 62, 56, 1.25, PLANK);                    // B Window sill
R(62, 50, 74, 56, 0, DARK);                        // window gutter into Mid
// ============================================================ CT SIDE (north)
R(66, 6, 102, 28, 0, SAND);                        // CT spawn
R(62, 28, 98, 44, 0, SAND);                        // CT Mid
R(70, 44, 78, 50, 0, SAND); R(84, 44, 92, 50, 0, SAND);   // CT Mid shoulders around the doors
box(74, 14, 3, 3, 1.2, 'crate'); box(94, 20, 3, 3, 1.2, 'crate'); box(70, 34, 2, 2, 1.1, 'crate');
d.crates.push([86, 8, 5, 1, 1.0, 'sandbags'], [72, 22, 1, 5, 1.0, 'sandbags']);
// ============================================================ A SITE (north-east)
R(104, 12, 142, 48, 2.0, SAND);                    // A platform
R(108, 34, 128, 42, 2.0, TILE);                    // A default area
box(106, 14, 3, 3, 1.3, 'crate'); box(106, 17, 3, 3, 2.6, 'crate');            // Goose
box(118, 24, 4, 4, 2.6, 'crate'); box(122, 30, 3, 3, 1.3, 'crate'); box(112, 38, 3, 3, 1.3, 'crate'); box(130, 20, 3, 3, 1.3, 'crate');
d.crates.push([128, 36, 2, 4, 1.5, 'car', '#d8d8d2']);                         // the car
// Catwalk / Short A
R(90, 50, 104, 62, 0, SAND); ramp(90, 50, 104, 62, 0, 2.0, 'x', SAND);
R(96, 42, 104, 50, 2.0, SAND);                      // top of short
// CT -> A ramp
ramp(98, 28, 106, 38, 0, 2.0, 'x', SAND);
// A Ramp from Long
R(118, 48, 136, 70, 0, SAND); ramp(118, 48, 136, 70, 2.0, 0, 'z', SAND);
// ============================================================ LONG A (east)
R(104, 116, 134, 142, 0, SAND);                    // Outside Long
R(121, 108, 127, 116, 0, COB); doorsZ(121, 109, 127, 3.4); roof(121, 108, 127, 114, 4.0);   // Long Doors
R(116, 70, 132, 108, 0, SAND);                     // Long A corridor
R(104, 84, 112, 100, -1.2, SAND); ramp(112, 88, 116, 98, -1.2, 0, 'x', SAND);   // the Pit
d.crates.push([128, 84, 3, 6, 2.6, 'cont', '#2f6fa3'], [116, 100, 3, 3, 1.3, 'crate'], [124, 120, 3, 3, 1.3, 'crate'], [108, 124, 3, 3, 1.3, 'crate']);
// ============================================================ interior walls: chokepoints, pillars and corners (carved back into solid)
const Wl = (x0, z0, x1, z1) => d.areas.push([x0, z0, x1, z1, 99, 0]);
Wl(36, 128, 58, 132);                                  // narrower west alley
Wl(70, 132, 72, 136); Wl(88, 132, 90, 136);            // T spawn pillars
Wl(68, 104, 72, 108); Wl(92, 102, 96, 106); Wl(79, 106, 85, 110);   // Top Mid cover
Wl(74, 50, 76, 98); Wl(88, 50, 90, 98);                // Mid is 12 wide
Wl(66, 6, 70, 18); Wl(66, 28, 70, 29); Wl(84, 16, 86, 20); Wl(62, 38, 70, 44);          // CT spawn / CT Mid shape
Wl(44, 28, 46, 36); Wl(36, 16, 42, 22); Wl(50, 46, 56, 50); Wl(20, 30, 22, 33);   // B site cover
Wl(120, 16, 122, 24); Wl(138, 30, 142, 38);           // A site: Ninja wall, east nook
Wl(124, 98, 128, 102);                                 // Long Corner
Wl(112, 120, 116, 126);                                // Outside Long pillar
d.crates.push([112, 44, 10, 1, 1.0, 'ledge'], [136, 44, 6, 1, 1.0, 'ledge'], [20, 54, 8, 1, 1.0, 'ledge']);
// ============================================================ wall heights
zone(112, 66, 138, 112, 9);                        // Long A walls
zone(20, 66, 50, 118, 6.5);                        // tunnel walls
zone(60, 40, 94, 100, 8);                          // Mid walls
// ============================================================ props / lamps
for (const [x, z, s] of [[84, 124, 1.1], [68, 124, 1], [96, 124, 1.05]]) prop('palm', x, z, 0.6, s);
prop('awning', 66, 100, 0, 3); prop('awning', 98, 100, 0, 3); prop('awning', 80, 52, 0, 3);
prop('wires', 82, 90, 0.2, 1); prop('wires', 80, 60, 0.1, 1);
prop('barrel', 106, 18, 0, 1, '#2f6fa3'); prop('barrel', 107, 18.8, 0, 1); prop('tire', 36, 130, 0, 1); prop('tire', 36.7, 130.4, 0, 1);
prop('rubble', 50, 120, 0, 1); prop('rubble', 112, 128, 0, 1); prop('sign', 60, 104, 0.2, 1); prop('flag', 80, 134, 0, 1, '#b33a3a'); prop('flag', 80, 12, 0, 1, '#2f6fa3');
prop('fence', 124, 14, 0, 4); prop('fence', 132, 14, 0, 4); prop('pipe', 14, 18, 0, 8); prop('hay', 46, 124, 0, 1);
for (const [x, z] of [[80, 136], [80, 104], [80, 20], [120, 128], [40, 124], [124, 56], [34, 90], [124, 90]]) d.lamps.push([x, z, 4.0, '#ffd9a0', 0.9, 13]);
// ============================================================ gameplay data
for (let i = 0; i < 10; i++) { d.spawns.T.push([66 + (i % 5) * 6, 134 + Math.floor(i / 5) * 4]); d.spawns.CT.push([72 + (i % 5) * 4, 9 + Math.floor(i / 5) * 3]); }
d.sites.A = [108, 18, 138, 46]; d.sites.B = [14, 28, 52, 56];
d.buy = { T: [58, 128, 102, 146], CT: [66, 6, 102, 28] };
d.holds = {
  A: [[126, 38, 124, 62], [108, 19, 118, 40], [128, 46, 124, 70], [102, 46, 94, 56], [112, 40, 100, 52]],
  B: [[54, 44, 60, 54], [24, 50, 30, 70], [54, 22, 44, 30], [32, 40, 34, 66], [16, 24, 30, 44]],
  MID: [[80, 36, 82, 62], [86, 42, 84, 60]],
};
d.callouts = [['T Spawn', 58, 128, 102, 146], ['Top Mid', 62, 98, 102, 114], ['Mid', 74, 50, 90, 98], ['Mid Doors', 78, 40, 84, 50], ['CT Mid', 62, 28, 98, 44], ['CT Spawn', 66, 6, 102, 28],
  ['Suicide', 52, 84, 62, 108], ['Outside Tunnels', 24, 116, 60, 134], ['Lower Tunnels', 28, 72, 36, 116], ['Upper Tunnels', 38, 72, 46, 116], ['B Tunnels', 24, 56, 50, 72],
  ['B Site', 14, 20, 52, 54], ['B Plat', 12, 44, 30, 58], ['B Doors', 58, 18, 70, 28], ['B Window', 58, 50, 74, 56], ['Closet', 6, 20, 14, 34],
  ['A Site', 108, 16, 138, 46], ['Goose', 104, 12, 114, 24], ['Short', 90, 50, 104, 62], ['A Ramp', 118, 48, 136, 70], ['Long A', 116, 70, 132, 108], ['Pit', 104, 84, 116, 100],
  ['Long Doors', 121, 108, 127, 116], ['Outside Long', 104, 116, 134, 142]];
fs.writeFileSync(new URL('../shared/dust2.js', import.meta.url), '// generated by tools/make-dust2.mjs — edit the generator, not this file\nexport const DUST2 = ' + JSON.stringify(d) + ';\n');
console.log('wrote shared/dust2.js', d.areas.length, 'areas', d.ramps.length, 'ramps', d.crates.length, 'blocks');
