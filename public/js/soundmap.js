// Sound name -> files, all relative to /audio/cs2/ (i.e. public/audio/cs2/).
// Every path below comes from your dir.txt listing. The audio files themselves are NOT in the project zip;
// if a file is missing the game just falls back to the built-in synthesized sound, so nothing breaks.
//   flat files  : ak47_1.ogg, reload_ak47.ogg, ...        (a .wav sibling is tried automatically if .ogg can't decode, e.g. old Safari)
//   real source : source-real/weapons/<weapon>/...         (weapons, grenades, knife, taser, fx)
//   real source : source/player, source/physics, source/items
// To change a sound, edit only this file.

const W = 'source-real/weapons/';
const P = 'source/player/';
const PH = 'source/physics/';
const range = (pre, a, b, ext = 'wav', pad = 2) =>
  Array.from({ length: b - a + 1 }, (_, i) => `${pre}${String(a + i).padStart(pad, '0')}.${ext}`);
const flat = (name, n = 3) => range(`${name}_`, 1, n, 'ogg', 1);   // ak47_1.ogg, ak47_2.ogg, ...

export const SAMPLE_DEFS = {
  // ---------- UI / feedback (loaded first) ----------
  ui: ['ui_1.ogg', 'ui_2.ogg'],
  money: ['money.ogg'],
  hit_head: ['hit_head_1.ogg', 'hit_head_2.ogg'],
  hit_body: ['hit_body_1.ogg', 'hit_body_2.ogg'],
  hurt: ['hurt_1.ogg', 'hurt_2.ogg', 'hurt_3.ogg', 'hurt_4.ogg'],
  draw: ['draw_1.ogg', 'draw_2.ogg'],
  dry: ['dry_1.ogg', 'dry_2.ogg'],
  pickup_weapon: ['pickup_weapon_1.ogg', 'pickup_weapon_2.ogg'],
  pickup_grenade: ['grenade_pickup_1.ogg', 'grenade_pickup_2.ogg', 'grenade_pickup_3.ogg'],
  defuser_equip: ['defuser_equip.ogg'],
  zoom: [`${W}awp/zoom.wav`],
  zoom_out: [`${W}weapon_zoom_out_02.wav`, `${W}weapon_zoom_out_03.wav`],

  // ---------- gunshots: flat ogg where you have them ----------
  aug: flat('aug'), famas: flat('famas'), m4a1s: flat('m4a1s'), m4a4: flat('m4a4'), mp9: flat('mp9'), usp: flat('usp'),
  // these 8 had glitchy/cut-off flat .ogg files -> use the original extracted recordings instead
  ak47: range(`${W}ak47/ak47_`, 1, 4), awp: range(`${W}awp/awp_`, 1, 2), deagle: range(`${W}deagle/deagle_`, 1, 2),
  galil: range(`${W}galilar/galil_`, 1, 4), glock: range(`${W}glock18/glock_`, 1, 2), mac10: range(`${W}mac10/mac10_`, 1, 2),
  p90: range(`${W}p90/p90_`, 1, 2), sg553: range(`${W}sg556/sg556_`, 1, 4),
  // ---------- gunshots: weapons that only exist in source-real ----------
  p2000: range(`${W}hkp2000/hkp2000_`, 1, 3),
  elite: range(`${W}elite/elites_`, 1, 4),
  p250: [`${W}p250/p250_01.wav`],
  tec9: [`${W}tec9/tec9_02.wav`],
  fiveseven: [`${W}fiveseven/fiveseven_01.wav`],
  cz75: range(`${W}cz75a/cz75_`, 1, 3),
  r8: [`${W}revolver/revolver-1_01.wav`],
  mp7: range(`${W}mp7/mp7_`, 1, 4),
  mp5sd: [`${W}mp5/mp5_01.wav`],
  ump45: [`${W}ump45/ump45_02.wav`],
  bizon: range(`${W}bizon/bizon_`, 1, 2),
  ssg08: [`${W}ssg08/ssg08_01.wav`],
  g3sg1: range(`${W}g3sg1/g3sg1_`, 1, 3),
  scar20: range(`${W}scar20/scar20_`, 1, 3),
  nova: [`${W}nova/nova-1.wav`],
  xm1014: [`${W}xm1014/xm1014-1.wav`],
  sawedoff: [`${W}sawedoff/sawedoff-1.wav`],
  mag7: range(`${W}mag7/mag7_`, 1, 2),
  m249: range(`${W}m249/m249_`, 1, 3),
  negev: range(`${W}negev/negev_`, 1, 2),
  zeus: [`${W}taser/taser_shoot.wav`],
  // knife swing (hits are handled by knife_hit below)
  knife: [`source/weapons/knife/knife_slash1.wav`, `source/weapons/knife/knife_slash2.wav`],

  // ---------- full reload recordings you already have as flat files ----------
  reload: ['reload_generic.ogg'],
  reload_aug: ['reload_aug.ogg'], reload_famas: ['reload_famas.ogg'], reload_m4a1s: ['reload_m4a1s.ogg'],
  reload_m4a4: ['reload_m4a4.ogg'], reload_mp9: ['reload_mp9.ogg'], reload_usp: ['reload_usp.ogg'],

  // ---------- grenades ----------
  throw_he: [`${W}hegrenade/grenade_throw.wav`],
  throw_flash: [`${W}flashbang/grenade_throw.wav`],
  throw_smoke: [`${W}smokegrenade/grenade_throw.wav`],
  throw_decoy: [`${W}decoy/grenade_throw.wav`],
  throw_molotov: [`${W}molotov/grenade_throw.wav`, ...range(`${W}molotov/molotov_throw_`, 1, 3, 'mp3')],
  throw_incendiary: [`${W}incgrenade/inc_grenade_throw.wav`],
  nade_throw: ['nade_throw_1.ogg', 'nade_throw_2.ogg'],
  he: [`${W}hegrenade/hegrenade_detonate_02.wav`, `${W}hegrenade/hegrenade_detonate_03.wav`],
  he_far: range(`${W}hegrenade/hegrenade_distant_detonate_`, 1, 3),
  flash: [`${W}flashbang/flashbang_explode1.wav`, `${W}flashbang/flashbang_explode2.wav`],
  flash_far: [`${W}flashbang/flashbang_explode1_distant.wav`, `${W}flashbang/flashbang_explode2_distant.wav`],
  ring: [`${W}flashbang/explosion_ring.wav`],
  smoke: [`${W}smokegrenade/can_01.wav`, `${W}smokegrenade/can_02.wav`],
  smoke_emit: [`${W}smokegrenade/smoke_emit.wav`],
  smoke_far: [`${W}smokegrenade/sg_explode_distant.wav`],
  molotov: range(`${W}molotov/molotov_detonate_`, 1, 3, 'wav', 1),
  molotov_far: range(`${W}molotov/molotov_detonate_`, 1, 3, 'wav', 1).map((f) => f.replace('.wav', '_distant.wav')),
  molotov_smash: range(`${W}molotov/molotov_smash_`, 1, 4),
  incendiary: range(`${W}incgrenade/inc_grenade_detonate_`, 1, 3, 'wav', 1),
  incendiary_far: range(`${W}incgrenade/inc_grenade_detonate_`, 1, 3, 'wav', 1).map((f) => f.replace('.wav', '_distant.wav')),
  incendiary_pop: [`${W}incgrenade/inc_grenade_pop_03.wav`],
  fire_ignite: [`${W}molotov/fire_ignite_1.wav`, `${W}molotov/fire_ignite_2.wav`, `${W}molotov/fire_ignite_4.wav`, `${W}molotov/fire_ignite_5.wav`],
  fire_loop: [`${W}molotov/fire_loop_1.wav`],
  fire_end: [`${W}molotov/fire_loop_fadeout_01.wav`, `${W}molotov/molotov_extinguish.wav`],

  // ---------- bomb ----------
  c4_beep: ['c4_beep.ogg'], c4_beep_fast: ['c4_beep_fast.ogg'], c4_plant: ['c4_plant.ogg'], c4_planted: ['c4_planted.ogg'],
  c4_defuse: ['c4_defuse.ogg'], c4_defused: ['c4_defused.ogg'], c4_explode: ['c4_explode.ogg'],

  // ---------- impacts / bodies ----------
  bullet_wall: range(`${PH}concrete/concrete_impact_bullet`, 1, 7, 'wav', 1),
  bullet_flesh: range(`${PH}flesh/flesh_impact_bullet`, 1, 5, 'wav', 1),
  knife_hit: [...range(`${W}knife/knife_hit_light_flesh_`, 1, 6, 'mp3'), `${W}knife/knife_hit1.wav`, `${W}knife/knife_hit2.wav`],
  knife_wall: range(`${PH}weapons/weapon_knife_impact_`, 1, 5),
  nearmiss: [...range(`${W}fx/nearmiss/bulletby_subsonic_`, 1, 7), ...range(`${W}fx/nearmiss/bulletby_supersonic_crack_`, 1, 7)],
  death: range(`${P}death`, 1, 6, 'wav', 1),
  kill_head: range(`${P}headshot_noarmor_`, 1, 5),
  kill_body: [`${P}bodyshot_kill_01.wav`],
};

// Weapons that have no single "reload_<weapon>" recording: the reload is built from the real part sounds.
// [fraction of the reload time, file]
export const RELOAD_PARTS = {
  // the 8 guns whose flat reload_*.ogg was glitchy: built from the real part sounds, timed to each gun's reload time
  ak47: [[0.15, `${W}ak47/ak47_clipout_01.wav`], [0.5, `${W}ak47/ak47_addammo_02.wav`], [0.76, `${W}ak47/ak47_boltpull_01.wav`]],
  awp: [[0.12, `${W}awp/awp_clipout.mp3`], [0.42, `${W}awp/awp_clipin.mp3`], [0.5, `${W}awp/awp_cliphit.mp3`], [0.72, `${W}awp/awp_boltback.wav`], [0.83, `${W}awp/awp_boltforward.wav`]],
  deagle: [[0.15, `${W}deagle/de_clipout.wav`], [0.5, `${W}deagle/de_clipin.mp3`], [0.72, `${W}deagle/de_slideback.wav`], [0.82, `${W}deagle/de_slideforward.wav`]],
  galil: [[0.15, `${W}galilar/galil_clipout.mp3`], [0.5, `${W}galilar/galil_clipin.wav`], [0.72, `${W}galilar/galil_boltback.wav`], [0.83, `${W}galilar/galil_boltforward.wav`]],
  glock: [[0.15, `${W}glock18/glock_clipout.wav`], [0.5, `${W}glock18/glock_clipin.wav`], [0.7, `${W}glock18/glock_slideback.wav`], [0.8, `${W}glock18/glock_sliderelease.wav`]],
  mac10: [[0.15, `${W}mac10/mac10_clipout.wav`], [0.5, `${W}mac10/mac10_clipin.mp3`], [0.72, `${W}mac10/mac10_boltback.wav`], [0.83, `${W}mac10/mac10_boltforward.wav`]],
  p90: [[0.08, `${W}p90/p90_cliprelease.wav`], [0.2, `${W}p90/p90_clipout.wav`], [0.5, `${W}p90/p90_clipin.wav`], [0.57, `${W}p90/p90_cliphit.wav`], [0.76, `${W}p90/p90_boltback.wav`], [0.86, `${W}p90/p90_boltforward.wav`]],
  sg553: [[0.15, `${W}sg556/sg556_clipout.mp3`], [0.48, `${W}sg556/sg556_clipin.wav`], [0.55, `${W}sg556/sg556_cliphit.wav`], [0.73, `${W}sg556/sg556_boltback.mp3`], [0.84, `${W}sg556/sg556_boltforward.wav`]],
  p2000: [[0.2, `${W}hkp2000/hkp2000_clipout.wav`], [0.55, `${W}hkp2000/hkp2000_clipin.mp3`], [0.8, `${W}hkp2000/hkp2000_sliderelease.wav`]],
  elite: [[0.15, `${W}elite/elite_clipout.wav`], [0.4, `${W}elite/elite_leftclipin.wav`], [0.6, `${W}elite/elite_rightclipin.wav`], [0.85, `${W}elite/elite_sliderelease.wav`]],
  p250: [[0.2, `${W}p250/p250_clipout.wav`], [0.55, `${W}p250/p250_clipin.mp3`], [0.8, `${W}p250/p250_sliderelease.wav`]],
  tec9: [[0.2, `${W}tec9/tec9_clipout.wav`], [0.55, `${W}tec9/tec9_clipin.mp3`], [0.75, `${W}tec9/tec9_boltpull.wav`], [0.88, `${W}tec9/tec9_boltrelease.wav`]],
  fiveseven: [[0.2, `${W}fiveseven/fiveseven_clipout.wav`], [0.55, `${W}fiveseven/fiveseven_clipin.mp3`], [0.8, `${W}fiveseven/fiveseven_sliderelease.mp3`]],
  cz75: [[0.25, `${W}cz75a/cz75_addammo_01.mp3`], [0.55, `${W}cz75a/cz75_clipin_01.mp3`]],
  r8: [[0.15, `${W}revolver/revolver_clipout.wav`], [0.5, `${W}revolver/revolver_clipin.wav`], [0.82, `${W}revolver/revolver_siderelease.wav`]],
  mp7: [[0.2, `${W}mp7/mp7_clipout.wav`], [0.55, `${W}mp7/mp7_clipin.mp3`], [0.78, `${W}mp7/mp7_slideback.wav`], [0.88, `${W}mp7/mp7_slideforward.wav`]],
  mp5sd: [[0.2, `${W}mp5/mp5_clipout.mp3`], [0.55, `${W}mp5/mp5_clipin.mp3`], [0.78, `${W}mp5/mp5_slideback.mp3`], [0.88, `${W}mp5/mp5_slideforward.wav`]],
  ump45: [[0.2, `${W}ump45/ump45_clipout.wav`], [0.55, `${W}ump45/ump45_clipin.mp3`], [0.78, `${W}ump45/ump45_boltback.wav`], [0.88, `${W}ump45/ump45_boltforward.wav`]],
  bizon: [[0.2, `${W}bizon/bizon_clipout.wav`], [0.55, `${W}bizon/bizon_clipin.mp3`], [0.78, `${W}bizon/bizon_boltback.wav`], [0.88, `${W}bizon/bizon_boltforward.wav`]],
  ssg08: [[0.1, `${W}ssg08/ssg08_boltback.mp3`], [0.3, `${W}ssg08/ssg08_clipout.mp3`], [0.55, `${W}ssg08/ssg08_clipin.mp3`], [0.85, `${W}ssg08/ssg08_boltforward.mp3`]],
  g3sg1: [[0.2, `${W}g3sg1/g3sg1_clipout.mp3`], [0.55, `${W}g3sg1/g3sg1_clipin.mp3`], [0.78, `${W}g3sg1/g3sg1_slideback.wav`], [0.88, `${W}g3sg1/g3sg1_slideforward.wav`]],
  scar20: [[0.2, `${W}scar20/scar20_clipout.mp3`], [0.55, `${W}scar20/scar20_clipin.wav`], [0.78, `${W}scar20/scar20_boltback.mp3`], [0.88, `${W}scar20/scar20_boltforward.mp3`]],
  mag7: [[0.2, `${W}mag7/mag7_clipout.wav`], [0.55, `${W}mag7/mag7_clipin.mp3`], [0.78, `${W}mag7/mag7_pump_back.mp3`], [0.88, `${W}mag7/mag7_pump_forward.wav`]],
  nova: [[0.1, `${W}nova/nova_insertshell_01.mp3`], [0.25, `${W}nova/nova_insertshell_02.mp3`], [0.4, `${W}nova/nova_insertshell_03.mp3`], [0.55, `${W}nova/nova_insertshell_04.wav`], [0.7, `${W}nova/nova_insertshell_01.mp3`], [0.88, `${W}nova/nova_pump.mp3`]],
  xm1014: [[0.1, `${W}xm1014/xm1014_insertshell_01.mp3`], [0.28, `${W}xm1014/xm1014_insertshell_02.mp3`], [0.46, `${W}xm1014/xm1014_insertshell_03.mp3`], [0.64, `${W}xm1014/xm1014_insertshell_01.mp3`], [0.88, `${W}xm1014/xm1014_catch_03.mp3`]],
  sawedoff: [[0.1, `${W}sawedoff/sawedoff_insertshell_01.wav`], [0.3, `${W}sawedoff/sawedoff_insertshell_02.wav`], [0.5, `${W}sawedoff/sawedoff_insertshell_03.wav`], [0.7, `${W}sawedoff/sawedoff_insertshell_01.wav`], [0.88, `${W}sawedoff/sawedoff_pump.wav`]],
  m249: [[0.1, `${W}m249/m249_coverup.wav`], [0.3, `${W}m249/m249_boxout.wav`], [0.55, `${W}m249/m249_boxin.wav`], [0.7, `${W}m249/m249_chain.wav`], [0.88, `${W}m249/m249_coverdown.wav`]],
  negev: [[0.1, `${W}negev/negev_coverup.wav`], [0.3, `${W}negev/negev_boxout.wav`], [0.55, `${W}negev/negev_boxin.wav`], [0.7, `${W}negev/negev_chain.wav`], [0.88, `${W}negev/negev_coverdown.wav`]],
};
for (const [k, parts] of Object.entries(RELOAD_PARTS)) parts.forEach(([, f], i) => { SAMPLE_DEFS[`rl_${k}_${i}`] = [f]; });

// Draw (pull out) sounds. "draw_<weapon>"; anything not listed falls back to the generic "draw".
const DRAW = {
  ak47: 'ak47/ak47_draw.wav', awp: 'awp/awp_draw.wav', aug: 'aug/aug_draw.mp3', bizon: 'bizon/bizon_draw.wav', deagle: 'deagle/de_draw.wav',
  elite: 'elite/elite_draw.mp3', famas: 'famas/famas_draw.wav', fiveseven: 'fiveseven/fiveseven_draw.wav', g3sg1: 'g3sg1/g3sg1_draw.mp3',
  galil: 'galilar/galil_draw.mp3', glock: 'glock18/glock_draw.wav', m249: 'm249/m249_draw.wav', m4a1s: 'm4a1/m4a1_draw.mp3', m4a4: 'm4a1/m4a1_draw.mp3',
  mac10: 'mac10/mac10_draw.wav', mag7: 'mag7/mag7_draw.mp3', mp5sd: 'mp5/mp5_draw.wav', mp7: 'mp7/mp7_draw.wav', mp9: 'mp9/mp9_draw.wav',
  negev: 'negev/negev_draw.wav', nova: 'nova/nova_draw.mp3', p250: 'p250/p250_draw.wav', p90: 'p90/p90_draw.mp3', r8: 'revolver/revolver_draw.wav',
  sawedoff: 'sawedoff/sawedoff_draw.wav', scar20: 'scar20/scar20_draw.mp3', sg553: 'sg556/sg556_draw.mp3', ssg08: 'ssg08/ssg08_draw.mp3',
  tec9: 'tec9/tec9_draw.mp3', ump45: 'ump45/ump45_draw.mp3', usp: 'usp/usp_draw.wav', p2000: 'hkp2000/hkp2000_draw.wav', xm1014: 'xm1014/xm1014_draw.mp3',
  zeus: 'taser/taser_draw.wav', he: 'hegrenade/he_draw.wav', flash: 'flashbang/flashbang_draw.wav', smoke: 'smokegrenade/smokegrenade_draw.wav',
  molotov: 'molotov/molotov_draw.wav', incendiary: 'incgrenade/inc_grenade_draw.wav', decoy: 'decoy/decoy_draw.wav', c4: 'c4/c4_draw.wav',
};
for (const [k, f] of Object.entries(DRAW)) SAMPLE_DEFS[`draw_${k}`] = [W + f];
SAMPLE_DEFS.draw_knife = [`${W}knife/knife_deploy1.wav`];
