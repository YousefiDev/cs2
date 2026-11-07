// Counter-Strike: Dust II Online — authoritative game server (Express + Socket.IO).
import express from 'express';
import http from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import crypto from 'crypto';
import fs from 'fs';
import { ServerCore } from './shared/core.js';
import { TICK_RATE } from './shared/constants.js';
import { MAP_DEFS, registerCustomMaps } from './shared/maps.js';
import { dropNav } from './shared/nav.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const ADMIN_KEY_FILE = path.join(root, '.admin-key');
function loadAdminKey(){ if(process.env.ADMIN_KEY) return process.env.ADMIN_KEY; try { if(fs.existsSync(ADMIN_KEY_FILE)) return fs.readFileSync(ADMIN_KEY_FILE,'utf8').trim(); } catch {} const k=crypto.randomBytes(18).toString('hex'); try { fs.writeFileSync(ADMIN_KEY_FILE,k,{mode:0o600}); } catch {} return k; }
const ADMIN_KEY = loadAdminKey();
const app = express();
app.disable('x-powered-by');
app.use('/shared', express.static(path.join(root, 'shared'), { maxAge: 0 }));
// ---- mesh maps (.bin): big files live next to the maps; the map def only references them (def.mesh.url = /mapmesh/<id>)
const MESH_DIR = path.join(root, 'maps-mesh'); fs.mkdirSync(MESH_DIR, { recursive: true });
app.use('/mapmesh', express.static(MESH_DIR, { maxAge: '1h' }));
app.put('/api/maps/mesh/:id/:kind', (req, res) => {
  const key = req.get('x-admin-key') || req.query.key; if (!ADMIN_KEY || key !== ADMIN_KEY) return res.status(401).json({ error: 'کلید مدیر لازم است' });
  const { id, kind } = req.params; if (!/^[a-z0-9_-]{2,32}$/.test(id) || !['json', 'bin'].includes(kind)) return res.status(400).json({ error: 'نام یا نوع فایل نامعتبر' });
  const MAX = 400 * 1024 * 1024, len = +req.get('content-length') || 0; if (len > MAX) return res.status(413).json({ error: 'فایل بزرگ‌تر از ۴۰۰ مگابایت' });
  const tmp = path.join(MESH_DIR, `.${id}.${kind}.part`), out = fs.createWriteStream(tmp); let got = 0, bad = false;
  req.on('data', (c) => { got += c.length; if (got > MAX && !bad) { bad = true; req.destroy(); out.destroy(); fs.rm(tmp, () => {}); } });
  req.pipe(out);
  out.on('finish', () => { if (bad) return; fs.renameSync(tmp, path.join(MESH_DIR, `${id}.${kind}`)); res.json({ ok: true, bytes: got, url: `/mapmesh/${id}` }); });
  out.on('error', () => { if (!res.headersSent) res.status(500).json({ error: 'خطا در ذخیره فایل' }); });
});
app.use('/weapons', express.static(path.join(root, 'public', 'weapons'), { maxAge: '7d' }));
app.use(express.static(path.join(root, 'public'), { maxAge: 0 }));
// ---- Map editor API (same contract as the Cloudflare worker): /api/maps/* ----
const BASE_DEFS = { ...MAP_DEFS };
const CUSTOM_MAPS_FILE = path.join(root, 'maps-custom.json');
let customMaps = {};
try { if (fs.existsSync(CUSTOM_MAPS_FILE)) customMaps = JSON.parse(fs.readFileSync(CUSTOM_MAPS_FILE, 'utf8')) || {}; } catch (e) { console.error('[maps] could not read maps-custom.json:', e.message); }
// maps/*.json (shipped with the project, e.g. maps/dust2_cs.json made by tools/bin2map.mjs) are live without an editor import; maps saved in the editor override them
const MAPS_DIR = path.join(root, 'maps');
const readMapFiles = () => { const out = {}; try { for (const f of fs.readdirSync(MAPS_DIR)) { if (!f.endsWith('.json')) continue; try { const d = JSON.parse(fs.readFileSync(path.join(MAPS_DIR, f), 'utf8')); if (d && /^[a-z0-9_-]{2,32}$/.test(d.id) && Array.isArray(d.size) && Array.isArray(d.areas) && Array.isArray(d.crates) && !BASE_DEFS[d.id]) out[d.id] = d; } catch (e) { console.error('[maps] skipped maps/' + f + ':', e.message); } } } catch (e) { /* no maps dir */ } return out; };
const effectiveMaps = () => ({ ...readMapFiles(), ...customMaps });
const applyCustomMaps = () => { for (const id of registerCustomMaps(effectiveMaps())) dropNav(id); };
applyCustomMaps();
const mapsApi = express.Router();
mapsApi.use(express.json({ limit: '12mb' }));
mapsApi.get('/health', (_req, res) => res.json({ ok: true, service: 'cs2', route: 'local-node', authConfigured: !!ADMIN_KEY }));
mapsApi.post('/auth', (req, res) => { const ok = typeof req.body?.key === 'string' && req.body.key === ADMIN_KEY; res.status(ok ? 200 : 401).json({ ok, error: ok ? null : 'unauthorized' }); });
mapsApi.get('/definitions', (_req, res) => res.json(BASE_DEFS));
mapsApi.get('/list', (_req, res) => res.json(Object.values(MAP_DEFS).map((d) => ({ id: d.id, name: d.name }))));
mapsApi.get('/custom', (_req, res) => res.json(effectiveMaps()));
mapsApi.post('/save', (req, res) => {
  const body = req.body || {};
  if (body.key !== ADMIN_KEY) return res.status(401).json({ ok: false, error: 'unauthorized' });
  if (!body.maps || typeof body.maps !== 'object' || Array.isArray(body.maps)) return res.status(400).json({ ok: false, error: 'invalid_maps' });
  const clean = {};
  for (const [id, def] of Object.entries(body.maps)) {
    if (!/^[a-z0-9_-]{2,32}$/.test(id) || !def || typeof def !== 'object' || def.id !== id || !Array.isArray(def.size) || !Array.isArray(def.areas) || !Array.isArray(def.crates)) return res.status(400).json({ ok: false, error: 'invalid_map_' + id });
    clean[id] = def;
  }
  try { fs.writeFileSync(CUSTOM_MAPS_FILE, JSON.stringify(clean)); } catch (e) { return res.status(500).json({ ok: false, error: 'write_failed' }); }
  customMaps = clean; applyCustomMaps(); res.json({ ok: true, count: Object.keys(clean).length });
});
app.use('/api/maps', mapsApi);
app.get('/health', (_req, res) => res.json({ ok: true, uptime: Math.round(process.uptime()), ...core.stats(), servers: core.list() }));
app.get('/admin', (_req, res) => res.sendFile(path.join(root, 'public', 'admin.html')));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, pingInterval: 5000, pingTimeout: 12000, perMessageDeflate: false, maxHttpBufferSize: 64 * 1024 });
const core = new ServerCore({ dataFile: path.join(root, 'server-data.json') });
if (process.env.DEFAULT_SERVERS !== '0') {
  const made = core.ensureDefaultServers([
    { title: 'Dust II · Public', map: 'dust2', bots: 'fill', difficulty: 'normal', max: 10 },
    { title: 'Mirage · Public', map: 'mirage', bots: 'fill', difficulty: 'normal', max: 10 },
    { title: 'Inferno · Public', map: 'inferno', bots: 'fill', difficulty: 'normal', max: 10 },
  ]);
  if (made) console.log(`  Created ${made} default public servers (disable with DEFAULT_SERVERS=0)`);
}

io.on('connection', (socket) => {
  const client = core.connect(socket.id, (ev, data) => (ev === 'snap' ? socket.volatile.emit(ev, data) : socket.emit(ev, data)), { ip: socket.handshake.address });
  let admin = false;
  socket.on('admin:auth', (key, ack) => {
    admin = typeof key === 'string' && key === ADMIN_KEY;
    if (admin) socket.emit('admin:status', { ok:true });
    if (typeof ack === 'function') ack({ ok: admin, error: admin ? null : 'invalid_admin_key' });
  });
  socket.on('admin:global', (data, ack) => { if (!admin) return ack?.({ok:false,error:'unauthorized'}); ack?.(core.adminGlobal(data?.action, data?.value)); });
  socket.on('admin:moderation', (ack) => { if (!admin) return ack?.({ok:false,error:'unauthorized'}); ack?.({ok:true, ...core.adminModeration()}); });
  socket.on('admin:list', (ack) => { if (!admin) return ack?.({ok:false,error:'unauthorized'}); ack?.({ok:true, rooms:core.adminRooms()}); });
  socket.on('admin:server', (data, ack) => { if (!admin) return ack?.({ok:false,error:'unauthorized'}); const d=data||{}; let r; if(d.action==='create') r=core.adminCreateServer(d.value); else if(d.action==='start') r=core.adminStartServer(d.code); else if(d.action==='stop') r=core.adminStopServer(d.code); else if(d.action==='delete') r=core.adminDeleteServer(d.code); else r={ok:false,error:'bad_action'}; ack?.(r); });
  socket.on('admin:get', (code, ack) => { if (!admin) return ack?.({ok:false,error:'unauthorized'}); ack?.(core.adminGet(code)); });
  socket.on('admin:player', (data, ack) => {
    if (!admin) return ack?.({ok:false,error:'unauthorized'});
    const d=data||{}; const r=core.adminPlayer(d.code,d.id,d.action,d.value); ack?.(r);
    if (r.ok) socket.emit('admin:changed', { code:d.code });
  });
  socket.on('admin:room', (data, ack) => {
    if (!admin) return ack?.({ok:false,error:'unauthorized'});
    const d=data||{}; const r=core.adminRoom(d.code,d.action,d.value); ack?.(r);
    if (r.ok) socket.emit('admin:changed', { code:d.code });
  });
  socket.onAny((ev, ...args) => {
    if (ev.startsWith('admin:')) return;
    const ack = typeof args[args.length - 1] === 'function' ? args.pop() : null; client.handle(ev, args[0], ack);
  });
  socket.on('disconnect', () => client.close());
});
// Drift-corrected fixed-rate loop (setInterval slowly drifts under load and makes the tick rate uneven).
const STEP = 1000 / TICK_RATE; let nextTick = Date.now();
(function loop() { const now = Date.now(); if (now - nextTick > 1000) nextTick = now; core.tick(); nextTick += STEP; setTimeout(loop, Math.max(0, nextTick - Date.now())); })();
function shutdown(sig) {
  console.log(`\n  ${sig}: saving data and closing…`);
  try { core.saveData(); } catch {}
  io.emit('server:closed', { reason: 'shutdown' }); io.close(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGINT', () => shutdown('SIGINT')); process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (e) => console.error('[uncaught]', e)); process.on('unhandledRejection', (e) => console.error('[unhandled]', e));
server.on('error', (e) => { if (e.code === 'EADDRINUSE') { console.error(`\n  Port ${PORT} is already in use. Close the other server or run with PORT=3001.`); process.exit(1); } throw e; });

server.listen(PORT, HOST, () => {
  console.log(`\n  Counter-Strike: Dust II Online is running`);
  console.log(`  Local:   http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) for (const n of list || []) if (n.family === 'IPv4' && !n.internal) console.log(`  Network: http://${n.address}:${PORT}   (share this with friends on your network)`);
  console.log(`  Tailscale: http://<your-tailscale-ip>:${PORT}`);
  console.log(`  Tailscale IP (if installed): run \"tailscale ip -4\"`);
  console.log(`  Admin:   http://localhost:${PORT}/admin`);
  console.log(`  Admin key: ${ADMIN_KEY}`);
  console.log('');
});
