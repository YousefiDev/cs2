#!/usr/bin/env node
// Mesh map (.json + .bin from map2json.js) -> playable map for this game.
//
//   node tools/bin2map.mjs dust2.json --id dust2_bin --install
//       bakes a playable map (maps/dust2_bin.json) and copies the mesh to maps-mesh/ (the server serves it at /mapmesh/<id>)
//   node tools/bin2map.mjs dust2.json --id dust2_cs --attach maps/dust2_cs.json --offset 50,3.2,101 --install
//       keeps an existing hand-made map (its physics grid) and only gives it the real mesh as its look
//
// options:  --bin <file.bin>   (default: the .bin next to the json)   --scale <n>  (default: auto; 39.37 when the file is 0.0254x too small)
//           --name "Title"     --out <file.json>   --install   (copy mesh files to maps-mesh/)
// Then import the map JSON in /map-editor.html (⬆ JSON) and press save, or let the server load maps-custom.json.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { bakeMesh, guessScale, readManifest } = await import('../shared/meshbake.js');
const { buildMap } = await import('../shared/maps.js');
const { autoGameplay, validateMap } = await import('../shared/mapkit.js');

const args = process.argv.slice(2), opt = {}; let input = null;
for (let i = 0; i < args.length; i++) { const a = args[i]; if (a.startsWith('--')) { const k = a.slice(2); opt[k] = ['install'].includes(k) ? true : args[++i]; } else input = a; }
if (!input) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 14).map((l) => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(1); }
const manifest = JSON.parse(fs.readFileSync(input, 'utf8')); readManifest(manifest);
const binPath = opt.bin || path.join(path.dirname(input), manifest.bin || path.basename(input).replace(/\.json$/i, '.bin'));
if (!fs.existsSync(binPath)) { console.error('bin file not found:', binPath); process.exit(1); }
const id = (opt.id || path.basename(binPath).replace(/\.bin$/i, '')).toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 32);
const scale = opt.scale ? parseFloat(opt.scale) : guessScale(manifest);
const install = () => {
  const dir = path.join(root, 'maps-mesh'); fs.mkdirSync(dir, { recursive: true });
  const slim = { ...manifest }; delete slim.colliders; fs.writeFileSync(path.join(dir, id + '.json'), JSON.stringify(slim)); fs.copyFileSync(binPath, path.join(dir, id + '.bin'));
  console.log('mesh installed: maps-mesh/' + id + '.json + .bin  ->  served at /mapmesh/' + id);
};

if (opt.attach) { // existing map: only add the mesh reference
  const def = JSON.parse(fs.readFileSync(opt.attach, 'utf8')); const [ox, oy, oz] = (opt.offset || '0,0,0').split(',').map(Number);
  def.mesh = { url: '/mapmesh/' + id, scale, ox, oy, oz }; fs.writeFileSync(opt.attach, JSON.stringify(def));
  console.log('attached mesh to', opt.attach, JSON.stringify(def.mesh)); if (opt.install) install(); process.exit(0);
}

const b = fs.readFileSync(binPath), bin = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
let last = ''; const t0 = Date.now();
const { def, log, stats } = await bakeMesh(manifest, bin, { id, name: opt.name, scale, meshUrl: '/mapmesh/' + id, onProgress: (l) => { if (l !== last) { last = l; process.stdout.write(`  ${l}…\n`); } } });
const mm = buildMap(def); autoGameplay(mm, true); for (const k of ['routes', 'holds', 'buy', 'callouts']) if (mm.def[k]) def[k] = mm.def[k];
console.log(log.join('\n')); console.log(`baked in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
for (const r of validateMap(buildMap(def))) console.log(' ', r.level.padEnd(5), r.msg);
const out = opt.out || path.join(root, 'maps', id + '.json'); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(def));
console.log('map written:', path.relative(root, out), `(${Math.round(JSON.stringify(def).length / 1024)} KB)`); if (opt.install) install();
