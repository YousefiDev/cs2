// npm run mapcheck [maps-custom.json]   — builds every map (built-in + custom file) and prints problems.
import fs from 'fs';
import { MAP_DEFS, registerCustomMaps, getMap } from '../shared/maps.js';
import { validateMap } from '../shared/mapkit.js';
const file = process.argv[2] || new URL('../maps-custom.json', import.meta.url).pathname;
if (fs.existsSync(file)) { const c = JSON.parse(fs.readFileSync(file, 'utf8')); console.log('custom maps registered:', registerCustomMaps(c).join(', ') || '(none)'); }
let bad = 0;
for (const id of Object.keys(MAP_DEFS)) {
  let m; try { m = getMap(id); } catch (e) { console.log(`✗ ${id}: cannot build (${e.message})`); bad++; continue; }
  const v = validateMap(m), err = v.filter((x) => x.level === 'error'), warn = v.filter((x) => x.level === 'warn');
  console.log(`${err.length ? '✗' : '✓'} ${id} (${m.W}×${m.H})${warn.length ? '  ' + warn.length + ' warning(s)' : ''}`);
  for (const x of [...err, ...warn]) console.log(`    ${x.level === 'error' ? 'ERROR' : 'warn '} ${x.msg}${x.at ? ` @(${x.at.map((n) => Math.round(n))})` : ''}`);
  bad += err.length ? 1 : 0;
}
process.exit(bad ? 1 : 0);
