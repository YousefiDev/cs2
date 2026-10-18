// Transport-agnostic server core: rooms, lobby and routing. Used by server.js (Socket.IO) and the offline mode.
import { GameRoom } from './game.js';
import { MAP_DEFS, MAP_LIST } from './maps.js';
import { RANKS, rankForXp, rankIndex } from './ranks.js';

// The same core runs in Node and in the browser's offline practice mode.
// Static Node imports make every browser import fail before the lobby loads.
const RUNNING_IN_BROWSER = typeof window !== 'undefined';
const RUNNING_IN_NODE = typeof process !== 'undefined' && !!process.versions?.node;
const fsModule = RUNNING_IN_NODE ? await import('node:fs') : null;
const pathModule = RUNNING_IN_NODE ? await import('node:path') : null;
const fs = fsModule?.default || fsModule;
const path = pathModule?.default || pathModule;
const webcrypto = globalThis.crypto || (RUNNING_IN_NODE ? (await import('node:crypto')).webcrypto : null);
// ---- accounts: PBKDF2-SHA256 password hashes, random session tokens (only their SHA-256 is stored) ----
const B64 = (u8) => { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s); };
const UNB64 = (s) => Uint8Array.from(atob(String(s)), (ch) => ch.charCodeAt(0));
const HEX = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');
async function pbkdf2(password, salt, iter) { const key = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']); return new Uint8Array(await webcrypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256)); }
async function sha256hex(s) { return HEX(new Uint8Array(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s))))); }
const eqBytes = (a, b) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i]; return r === 0; };
const USER_RE = /^[\p{L}\p{N}_.\-]{3,16}$/u, RESERVED = new Set(['admin', 'administrator', 'owner', 'moderator', 'server', 'system', 'bot', 'root', 'console']);
const PW_ITER = 100000, SESSION_MS = 30 * 24 * 3600 * 1000;
const CTRL = /[<>\x00-\x1f]/g;
const cleanName = (v) => String(v || '').replace(CTRL, '').trim().slice(0, 16) || 'Player';
const makeCode = () => { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 4; i++) s += c[Math.floor(Math.random() * c.length)]; return s; };
const LIMITS = { st: 70, shot: 25 };

export class ServerCore {
  constructor(opts = {}) {
    this.clients = new Map(); this.rooms = new Map();
    // Keep persistence beside the app even when the server is started from
    // another working directory.
    this.dataFile = opts.dataFile || (RUNNING_IN_BROWSER ? 'cs-dust-online-data' : RUNNING_IN_NODE ? path.join(process.cwd(), 'server-data.json') : 'cs-dust-online-data');
    this.data = { bans: {}, mutes: {}, profiles: {}, permissions: {}, servers: {}, accounts: {}, sessions: {}, nextPid: 1000000000, settings: { weaponLimits: { awp: 0, sg553: 0, aug: 0 } } };
    this.requireLogin = !!opts.requireLogin; this.authFail = new Map(); this.regLog = new Map(); this.userIdx = new Map();
    try {
      const raw = RUNNING_IN_BROWSER ? localStorage.getItem(this.dataFile) : RUNNING_IN_NODE ? (fs.existsSync(this.dataFile) ? fs.readFileSync(this.dataFile, 'utf8') : null) : null;
      if (raw) this.data = { ...this.data, ...JSON.parse(raw) };
      this.data.profiles ||= {}; this.data.permissions ||= {}; this.data.servers ||= {};
    } catch {}
    this.rebuildAccounts();
    this.out = (id, ev, d) => { const c = this.clients.get(id); if (c) c.send(ev, d); };
    this.loadManagedRooms();
  }
  saveData() {
    try {
      // A host-provided persistence hook (Cloudflare Durable Object) always wins, whatever globals the runtime exposes.
      if (typeof this.onSaveData === 'function') { this.onSaveData(this.data); return; }
      const raw = JSON.stringify(this.data, null, 2);
      if (RUNNING_IN_BROWSER) localStorage.setItem(this.dataFile, raw);
      else if (RUNNING_IN_NODE) fs.writeFileSync(this.dataFile, raw);
    } catch (e) {
      console.error('[data]', e && e.message);
    }
  }
  profile(name) { const k=String(name||'').toLowerCase(); return this.data.profiles[k] ||= { xp:0 }; }
  playerProfile(name) { const k=String(name||'').toLowerCase(); const pr=this.profile(k); const xp=Number(pr.xp)||0; const r=rankForXp(xp); return { name:k, xp, rank:r.name, rankTag:r.tag, rankIndex:rankIndex(xp), nextXp:RANKS[rankIndex(xp)+1]?.xp||null }; }
  addXp(name, amount) { const pr=this.profile(name); pr.xp=Math.max(0,Math.round((Number(pr.xp)||0)+(Number(amount)||0))); this.saveData(); return this.playerProfile(name); }
  connect(id, send, meta = {}) {
    const c = { id, send, name: 'Player', acc: null, session: '', room: null, ip: meta.ip || '', offline: !!meta.offline, bucket: {}, bucketAt: Date.now() }; this.clients.set(id, c);
    return { handle: (ev, d, ack) => this.handle(c, ev, d, ack), close: () => this.disconnect(c) };
  }
  disconnect(c) {
    // Online players get a grace period so a flaky mobile connection can resume the same player.
    const r = c.room && this.rooms.get(c.room);
    if (r && !c.offline && c.session) r.markDisconnected(c.id); else this.leave(c);
    c.room = null; this.clients.delete(c.id);
  }
  leave(c) { const r = c.room && this.rooms.get(c.room); if (r) r.removePlayer(c.id); c.room = null; }
  list() { return [...this.rooms.values()].map((r) => r.summary()).sort((a, b) => b.humans - a.humans); }
  makeRoomConfig(d = {}, code = null) { const c = code || makeCode(); return { code:c, title:cleanName(d.title || 'Community Server').slice(0,24), map:MAP_DEFS[d.map] ? d.map : 'dust2', bots:d.bots === 'none' ? 'none' : 'fill', difficulty:['easy','normal','hard'].includes(d.difficulty) ? d.difficulty : 'normal', max:Math.max(2, Math.min(16, Number(d.max)||10)), weaponLimits:{awp:0,sg553:0,aug:0}, enabled:true, createdAt:Date.now() }; }
  bootRoom(cfg) { if (!cfg || !cfg.enabled || this.rooms.has(cfg.code)) return null; try { return this.bootRoomUnsafe(cfg); } catch (e) { console.error('[boot]', cfg.code, cfg.map, e && e.message); if (cfg.map !== 'dust2') { try { return this.bootRoomUnsafe({ ...cfg, map: 'dust2' }); } catch (e2) { console.error('[boot-fallback]', e2 && e2.message); } } return null; } }
  bootRoomUnsafe(cfg) { const room = new GameRoom({ code:cfg.code, map:cfg.map, title:cfg.title, bots:cfg.bots, difficulty:cfg.difficulty, max:cfg.max, weaponLimits:{...(this.data.settings?.weaponLimits||{}), ...(cfg.weaponLimits||{})}, profiles:this.data.profiles, moderation:this.data, saveData:()=>this.saveData(), addXp:(key,n)=>this.addXp(key,n) }, this.out); this.rooms.set(cfg.code, room); return room; }
  loadManagedRooms() { for (const cfg of Object.values(this.data.servers || {})) if (cfg.enabled) this.bootRoom(cfg); }
  ensureDefaultServers(list) {
    // First boot: create public servers so friends can join right away without opening the admin panel.
    if (Object.keys(this.data.servers || {}).length) return 0; let n = 0;
    for (const v of list) { const cfg = this.makeRoomConfig(v); this.data.servers[cfg.code] = cfg; this.bootRoom(cfg); n++; }
    this.saveData(); return n;
  }
  limited(c, ev) {
    const now = Date.now(); if (now - c.bucketAt > 1000) { c.bucket = {}; c.bucketAt = now; }
    const k = LIMITS[ev] ? ev : 'other'; c.bucket[k] = (c.bucket[k] || 0) + 1; return c.bucket[k] > (LIMITS[ev] || 30);
  }
  handle(c, ev, d, ack) {
    const reply = typeof ack === 'function' ? ack : () => {};
    try {
      if (this.limited(c, ev)) return;
      switch (ev) {
        case 'hello': c.name = c.acc ? c.acc.nick : cleanName(d && d.name); if (d && typeof d.session === 'string') c.session = d.session.replace(/[^\w-]/g, '').slice(0, 64); if (this.isBanned(c.name, c.ip, this.keyOfClient(c))) return reply({ ok:false, error:'BANNED' }); return reply({ ok: true, id: c.id, t: Date.now(), maps: MAP_LIST, auth: { required: !!this.requireLogin && !c.offline, account: c.acc ? this.accountView(c.acc) : null } });
        case 'auth:register': case 'auth:login': case 'auth:resume': case 'auth:logout': case 'auth:nick': case 'auth:password': case 'auth:me':
          this.authCall(c, ev, d).then(reply, (e) => { console.error('[auth]', ev, e && e.message); reply({ ok:false, error:'Server error' }); }); return;
        case 'ping': return reply(Date.now());
        case 'rooms': return reply(this.list());
        case 'create': { if (!c.offline) return reply({ ok:false, error:'SERVER_CREATION_DISABLED' }); this.leave(c); if (d && d.name) c.name=cleanName(d.name); let code=makeCode(); while(this.rooms.has(code)) code=makeCode(); const room=new GameRoom({code,map:MAP_DEFS[d?.map]?d.map:'dust2',title:'Practice',bots:'fill',difficulty:d?.difficulty,max:d?.max,profiles:this.data.profiles,moderation:this.data,saveData:()=>this.saveData(),addXp:(name,n)=>this.addXp(name,n)},this.out); this.rooms.set(code,room); c.room=code; room.addHuman(c.id,c.name); return reply({ok:true,code}); }
        case 'join': {
          const code = String(d && d.code || '').trim().toUpperCase(); const room = this.rooms.get(code);
          if (!room) return reply({ ok: false, error: 'Room not found' });
          if (room.humans().length >= room.maxPlayers) return reply({ ok: false, error: 'Room is full' });
          if (!c.offline && this.requireLogin && !c.acc) return reply({ ok:false, error:'LOGIN_REQUIRED' });
          if (c.acc) c.name = c.acc.nick; else if (d && d.name) c.name = cleanName(d.name);
          if (this.isBanned(c.name, c.ip, this.keyOfClient(c))) return reply({ ok:false, error:'BANNED' });
          if (d && typeof d.session === 'string') c.session = d.session.replace(/[^\w-]/g, '').slice(0, 64);
          if (c.room !== code) {
            this.leave(c);
            if (c.acc) this.dropDuplicates(c, room);   // one live player per account (last login wins)
            const prev = (c.session && room.findSession(c.session)) || (c.acc && room.findPid(c.acc.pid));
            if (prev && prev.id !== c.id) {
              const old = this.clients.get(prev.id); if (old) { old.room = null; old.send('server:closed', { code, reason: 'resumed_elsewhere' }); }
              c.room = code; room.resume(prev.id, c.id); return reply({ ok: true, code, resumed: true });
            }
            c.room = code; room.addHuman(c.id, c.name, c.session, this.keyOfClient(c), c.acc ? c.acc.pid : '');
          }
          return reply({ ok: true, code });
        }
        case 'leave': this.leave(c); return reply({ ok: true });
        default: { const r = c.room && this.rooms.get(c.room); if (r) r.handle(c.id, ev, d, reply); }
      }
    } catch (e) { console.error('[core]', ev, e); reply({ ok: false, error: 'Server error' }); }
  }
  adminRooms() { const out=[]; for(const cfg of Object.values(this.data.servers||{})){ const r=this.rooms.get(cfg.code); out.push(r ? {...r.summary(), managed:true, enabled:true} : {code:cfg.code,title:cfg.title,map:cfg.map,max:cfg.max,humans:0,bots:0,phase:'offline',round:0,score:{T:0,CT:0},botMode:cfg.bots,difficulty:cfg.difficulty,managed:true,enabled:false}); } return out.sort((a,b)=>(b.enabled-a.enabled)||(b.humans-a.humans)); }
  adminCreateServer(value) { let cfg=this.makeRoomConfig(value||{}); while(this.data.servers[cfg.code]) cfg=this.makeRoomConfig(value||{}); this.data.servers[cfg.code]=cfg; this.saveData(); const r=this.bootRoom(cfg); return r ? {ok:true,server:r.summary()} : {ok:false,error:'server_create_failed'}; }
  adminStartServer(code) { const cfg=this.data.servers[String(code||'').toUpperCase()]; if(!cfg) return {ok:false,error:'server_not_found'}; cfg.enabled=true; this.saveData(); const r=this.bootRoom(cfg); return {ok:true,server:r?.summary()||this.rooms.get(cfg.code)?.summary()}; }
  adminStopServer(code) { const c=String(code||'').toUpperCase(), cfg=this.data.servers[c]; if(!cfg) return {ok:false,error:'server_not_found'}; const r=this.rooms.get(c); if(r) { for(const p of [...r.humans()]) { const cl=this.clients.get(p.id); if(cl){ cl.room=null; cl.send('server:closed',{code:c}); } } this.rooms.delete(c); } cfg.enabled=false; this.saveData(); return {ok:true}; }
  adminDeleteServer(code) { const c=String(code||'').toUpperCase(); if(!this.data.servers[c]) return {ok:false,error:'server_not_found'}; this.adminStopServer(c); delete this.data.servers[c]; this.saveData(); return {ok:true}; }
  adminGet(code) { const r=this.rooms.get(String(code||'').toUpperCase()); return r ? { ok:true, room:r.summary(), players:r.adminRoster() } : {ok:false,error:'room_not_found'}; }
  adminPlayer(code,id,action,value) {
    const c=String(code||'').toUpperCase(), r=this.rooms.get(c); if(!r) return {ok:false,error:'room_not_found'};
    const who=r.players.get(String(id)), label=who?who.name:String(id), cl0=this.clients.get(String(id));
    if (action==='ban') {   // value: {minutes, reason, ip}   (0 / empty minutes = permanent)
      const v=value||{}; if(!who||who.bot) return {ok:false,error:'cannot_ban_bot'};
      const ip=cl0&&cl0.ip; const res=this.adminGlobal('ban',{name:who.key||who.name,minutes:v.minutes,reason:v.reason});
      if(v.ip&&ip){ this.data.bans['ip:'+ip]={reason:String(v.reason||'Banned by admin').slice(0,120),at:Date.now(),until:Number(v.minutes)>0?Date.now()+Number(v.minutes)*60000:0}; this.saveData(); }
      this.logAdmin(c,`ban ${label}${who.pid?' (#'+who.pid+')':''} ${Number(v.minutes)>0?v.minutes+' min':'permanent'}${v.reason?' - '+String(v.reason).slice(0,60):''}${v.ip?' (+IP)':''}`);
      return res.ok?{ok:true,kicked:true}:res;
    }
    const res=r.adminSet(id,action,value);
    if(res.ok) this.logAdmin(c,`${action} ${label}${value!==undefined&&typeof value!=='object'?' = '+String(value).slice(0,40):''}`);
    if(res.kicked){ const cl=this.clients.get(String(id)); if(cl){ cl.room=null; cl.send('server:closed',{code:c,reason:'kicked'}); } }
    return res;
  }
  // ---- admin activity log (memory only) ----
  logAdmin(code,text){ const l=(this.adminLogs ||= []); l.push({t:Date.now(),code:code||'-',text:String(text).slice(0,200)}); if(l.length>300) l.splice(0,l.length-300); }
  adminLogGet(){ return {ok:true,logs:(this.adminLogs||[]).slice(-150)}; }
  // ---- console: "!hp ali 500", "!slap @t 10", "!map mirage" ... (targets: id, part of a name, @all @t @ct @spec @bots @humans @alive @dead) ----
  adminCommand(code, line) {
    const key=String(code||'').toUpperCase(), r=this.rooms.get(key); if(!r) return {ok:false,error:'room_not_found'};
    const toks=[]; String(line||'').trim().replace(/^[!/]+/,'').replace(/"([^"]*)"|(\S+)/g,(m,q,w)=>{toks.push(q!==undefined?q:w);return '';});
    const cmd=(toks.shift()||'').toLowerCase(); if(!cmd) return {ok:false,error:'empty'};
    this.logAdmin(key,'> '+String(line).trim().slice(0,120));
    const bool=(v)=>!/^(off|0|false|no)$/i.test(String(v===undefined?'on':v));
    const each=(spec,action,value)=>{ const t=r.adminTargets(spec); if(t.error) return {ok:false,error:t.error}; if(!t.list.length) return {ok:false,error:'no_targets'}; let done=0; for(const p of t.list){ const res=this.adminPlayer(key,p.id,action,value); if(res.ok) done++; } return {ok:done>0,msg:`${action}: ${done}/${t.list.length} player(s)`,error:done?undefined:'failed'}; };
    const SIMPLE={hp:()=>['hp',Number(toks[1]??100)],armor:()=>['armor',Number(toks[1]??100)],money:()=>['money',Number(toks[1]??16000)],slap:()=>['slap',Number(toks[1]??5)],
      god:()=>['god',bool(toks[1])],noclip:()=>['noclip',bool(toks[1])],helmet:()=>['helmet',bool(toks[1])],kit:()=>['kit',bool(toks[1])],give:()=>['give',toks[1]],strip:()=>['strip'],refill:()=>['refill'],
      slay:()=>['slay'],kill:()=>['slay'],respawn:()=>['respawn'],swap:()=>['swap'],mute:()=>['mute',true],gag:()=>['mute',true],unmute:()=>['unmute'],ungag:()=>['unmute'],kick:()=>['kick',true],
      team:()=>['team',String(toks[1]||'').toUpperCase()]};
    if(SIMPLE[cmd]){ const [a,v]=SIMPLE[cmd](); if(a==='give'&&!toks[1]) return {ok:false,error:'usage: !give <player> <weapon>'}; if(a==='team'&&!['T','CT','SPEC'].includes(v)) return {ok:false,error:'usage: !team <player> t|ct|spec'}; return each(toks[0],a,v); }
    if(cmd==='tp'||cmd==='goto'){ const dst=r.adminTargets(toks[1]); if(dst.error||dst.list.length!==1) return {ok:false,error:dst.error||'tp needs exactly one destination player'}; return each(toks[0],'tpto',dst.list[0].id); }
    switch(cmd){
      case 'help': return {ok:true,msg:'players, hp, armor, helmet, kit, money, give, strip, refill, slay, slap, god, noclip, respawn, tp, team, swap, mute, unmute, kick, ban, unban, xp, map, maps, restart, newmatch, bots, difficulty, max, say, clean, heal, respawnall, swapteams  |  targets: id, name, @all @t @ct @spec @bots @humans @alive @dead'};
      case 'players': case 'status': return {ok:true,msg:r.list.map(p=>`${p.name}${p.bot?' [bot]':''} ${p.team} hp${Math.round(p.hp)} #${p.id.slice(0,6)}`).join(' | ')||'(empty)'};
      case 'maps': return {ok:true,msg:MAP_LIST.map(m=>m.id).join(', ')};
      case 'say': { const m=toks.join(' '); return m?this.adminRoom(key,'say',m):{ok:false,error:'usage: !say <message>'}; }
      case 'map': return toks[0]?this.adminRoom(key,'map',toks[0]):{ok:false,error:'usage: !map <id>  (see !maps)'};
      case 'restart': case 'newmatch': case 'clean': case 'respawnall': case 'swapteams': return this.adminRoom(key,cmd);
      case 'heal': return toks[0]&&toks[0]!=='all'?each(toks[0],'hp',100):this.adminRoom(key,'healall');
      case 'bots': return this.adminRoom(key,'bots',toks[0]==='none'?'none':'fill');
      case 'difficulty': return this.adminRoom(key,'difficulty',toks[0]);
      case 'max': return this.adminRoom(key,'max',Number(toks[0]));
      case 'ban': { if(!toks[0]) return {ok:false,error:'usage: !ban <player> [minutes] [reason]'}; const t=r.adminTargets(toks[0]); const mins=Number(toks[1]); const hasMin=Number.isFinite(mins)&&toks[1]!==undefined; const reason=toks.slice(hasMin?2:1).join(' ');
        if(!t.error&&t.list.length===1&&!t.list[0].bot) return this.adminPlayer(key,t.list[0].id,'ban',{minutes:hasMin?mins:0,reason}); return this.adminGlobal('ban',{name:toks[0],minutes:hasMin?mins:0,reason}); }
      case 'unban': return toks[0]?this.adminGlobal('unban',{name:toks[0]}):{ok:false,error:'usage: !unban <name>'};
      case 'xp': return toks[0]?this.adminGlobal('xp',{name:toks[0],xp:Number(toks[1])}):{ok:false,error:'usage: !xp <name> <amount>'};
      default: return {ok:false,error:'unknown_command: '+cmd+' (try !help)'};
    }
  }
  // ================= accounts: username + password, every player gets a unique numeric ID =================
  rebuildAccounts() { this.data.accounts ||= {}; this.data.sessions ||= {}; this.userIdx = new Map(); for (const a of Object.values(this.data.accounts)) this.userIdx.set(String(a.username).toLowerCase(), a.pid); }
  newPid() { const d = this.data; let pid; do { d.nextPid = (Number(d.nextPid) || 1000000000) + 1 + Math.floor(Math.random() * 9); pid = String(d.nextPid); } while (d.accounts[pid]); return pid; }
  accountView(a) { const xp = Number(this.data.profiles['#' + a.pid]?.xp) || 0, r = rankForXp(xp); return { pid: a.pid, username: a.username, nick: a.nick, xp, rank: r.name, rankTag: r.tag, createdAt: a.createdAt }; }
  attach(c, a) { c.acc = a; c.name = a.nick; }
  keyOfClient(c) { return c.acc ? '#' + c.acc.pid : String(c.name || '').toLowerCase(); }
  labelFor(key) { const k = String(key); if (k[0] === '#') { const a = this.data.accounts[k.slice(1)]; return a ? `${a.username} (${k})` : k; } return k; }
  // "#1000000012", an account username or a legacy (guest) name  ->  the key bans / mutes / XP / roles are stored under
  resolveKey(s) { const t = String(s || '').trim(); if (!t) return ''; if (t[0] === '#') return t; const pid = this.userIdx.get(t.toLowerCase()); return pid ? '#' + pid : t.toLowerCase(); }
  isOnlinePid(pid) { for (const r of this.rooms.values()) if (r.findPid(pid)) return true; return false; }
  dropDuplicates(c, room) {
    for (const o of this.clients.values()) if (o !== c && o.acc && o.acc.pid === c.acc.pid && o.room && o.room !== room.code) { this.leave(o); o.send('server:closed', { reason: 'logged_in_elsewhere' }); }
    for (const r of this.rooms.values()) if (r !== room) { const q = r.findPid(c.acc.pid); if (q) r.removePlayer(q.id); }
  }
  throttled(k) { const f = this.authFail.get(k); return !!(f && f.until > Date.now()); }
  noteFail(k) { const f = this.authFail.get(k) || { n: 0, until: 0, t: Date.now() }; if (Date.now() - f.t > 600000) { f.n = 0; f.t = Date.now(); } if (++f.n >= 5) { f.until = Date.now() + 60000; f.n = 0; } this.authFail.set(k, f); }
  async newSession(pid) {
    const raw = HEX(webcrypto.getRandomValues(new Uint8Array(32))), h = await sha256hex(raw), now = Date.now(), S = this.data.sessions;
    for (const [k, v] of Object.entries(S)) if (v.exp < now) delete S[k];
    const mine = Object.entries(S).filter(([, v]) => v.pid === pid).sort((a, b) => a[1].exp - b[1].exp); while (mine.length >= 5) delete S[mine.shift()[0]];
    S[h] = { pid, exp: now + SESSION_MS }; return raw;
  }
  async authCall(c, ev, d) {
    switch (ev) {
      case 'auth:register': return this.authRegister(c, d || {});
      case 'auth:login': return this.authLogin(c, d || {});
      case 'auth:resume': return this.authResume(c, d || {});
      case 'auth:logout': { if (d && d.token) { delete this.data.sessions[await sha256hex(d.token)]; this.saveData(); } c.acc = null; return { ok: true }; }
      case 'auth:me': return c.acc ? { ok: true, account: this.accountView(c.acc) } : { ok: false, error: 'LOGIN_REQUIRED' };
      case 'auth:nick': { if (!c.acc) return { ok: false, error: 'LOGIN_REQUIRED' }; const n = cleanName(d && d.nick); if (n === 'Player' && !String(d && d.nick || '').trim()) return { ok: false, error: 'BAD_NICK' }; c.acc.nick = n; if (!c.room) c.name = n; this.saveData(); return { ok: true, account: this.accountView(c.acc) }; }
      case 'auth:password': {
        if (!c.acc) return { ok: false, error: 'LOGIN_REQUIRED' }; const a = c.acc, np = String(d && d.password || ''); if (np.length < 6 || np.length > 64) return { ok: false, error: 'BAD_PASSWORD' };
        const tk = 'pw|' + a.pid; if (this.throttled(tk)) return { ok: false, error: 'TOO_MANY_ATTEMPTS' };
        if (!eqBytes(await pbkdf2(String(d && d.old || '').slice(0, 64), UNB64(a.salt), a.iter), UNB64(a.hash))) { this.noteFail(tk); return { ok: false, error: 'BAD_CREDENTIALS' }; }
        await this.setPassword(a, np); const keep = d && d.token ? await sha256hex(d.token) : ''; for (const [k, v] of Object.entries(this.data.sessions)) if (v.pid === a.pid && k !== keep) delete this.data.sessions[k];
        this.saveData(); return { ok: true };
      }
    }
    return { ok: false, error: 'bad_event' };
  }
  async setPassword(a, pw) { const salt = webcrypto.getRandomValues(new Uint8Array(16)); a.salt = B64(salt); a.iter = PW_ITER; a.hash = B64(await pbkdf2(pw, salt, PW_ITER)); }
  async authRegister(c, d) {
    const user = String(d.username || '').trim(), pw = String(d.password || ''), low = user.toLowerCase();
    if (!USER_RE.test(user)) return { ok: false, error: 'BAD_USERNAME' };
    if (RESERVED.has(low)) return { ok: false, error: 'RESERVED_NAME' };
    if (pw.length < 6 || pw.length > 64) return { ok: false, error: 'BAD_PASSWORD' };
    if (this.userIdx.has(low)) return { ok: false, error: 'USERNAME_TAKEN' };
    const ipk = c.ip || '-', now = Date.now(), log = (this.regLog.get(ipk) || []).filter((t) => now - t < 3600000);
    if (c.ip && log.length >= 5) return { ok: false, error: 'TOO_MANY_ATTEMPTS' };
    log.push(now); this.regLog.set(ipk, log);
    const a = { pid: '', username: user, nick: cleanName(d.nick || user), salt: '', hash: '', iter: PW_ITER, createdAt: now, lastLogin: now };
    await this.setPassword(a, pw);
    if (this.userIdx.has(low)) return { ok: false, error: 'USERNAME_TAKEN' };      // somebody registered the same name while we were hashing
    a.pid = this.newPid(); this.data.accounts[a.pid] = a; this.userIdx.set(low, a.pid);
    const old = this.data.profiles[low]; if (old && !String(low).startsWith('#')) { this.data.profiles['#' + a.pid] = { ...old }; delete this.data.profiles[low]; }   // XP earned before accounts existed under this name moves to the new account
    this.saveData();
    this.attach(c, a); return { ok: true, token: await this.newSession(a.pid), account: this.accountView(a) };
  }
  async authLogin(c, d) {
    const low = String(d.username || '').trim().toLowerCase(), pw = String(d.password || '').slice(0, 64), tk = (c.ip || '-') + '|' + low, ik = 'ip|' + (c.ip || '-');
    if (this.throttled(tk) || this.throttled(ik)) return { ok: false, error: 'TOO_MANY_ATTEMPTS' };
    const pid = this.userIdx.get(low), a = pid && this.data.accounts[pid];
    const got = await pbkdf2(pw, a ? UNB64(a.salt) : new Uint8Array(16), a ? a.iter : PW_ITER);     // same work for unknown users: no timing leak
    if (!a || !eqBytes(got, UNB64(a.hash))) { this.noteFail(tk); this.noteFail(ik); return { ok: false, error: 'BAD_CREDENTIALS' }; }
    if (this.isBanned(a.nick, c.ip, '#' + a.pid)) return { ok: false, error: 'BANNED' };
    this.authFail.delete(tk); a.lastLogin = Date.now(); this.saveData(); this.attach(c, a);
    return { ok: true, token: await this.newSession(a.pid), account: this.accountView(a) };
  }
  async authResume(c, d) {
    const token = String(d.token || ''); if (!/^[0-9a-f]{64}$/.test(token)) return { ok: false, error: 'BAD_TOKEN' };
    const h = await sha256hex(token), s = this.data.sessions[h], now = Date.now(), a = s && this.data.accounts[s.pid];
    if (!s || s.exp < now || !a) { if (s) { delete this.data.sessions[h]; this.saveData(); } return { ok: false, error: 'BAD_TOKEN' }; }
    if (this.isBanned(a.nick, c.ip, '#' + a.pid)) return { ok: false, error: 'BANNED' };
    if (s.exp - now < SESSION_MS * 0.66) { s.exp = now + SESSION_MS; this.saveData(); }
    this.attach(c, a); return { ok: true, account: this.accountView(a) };
  }
  // ---- admin: accounts ----
  adminAccounts() {
    return { ok: true, accounts: Object.values(this.data.accounts).map((a) => ({ pid: a.pid, username: a.username, nick: a.nick, createdAt: a.createdAt, lastLogin: a.lastLogin, xp: Number(this.data.profiles['#' + a.pid]?.xp) || 0, online: this.isOnlinePid(a.pid), banned: !!this.data.bans['#' + a.pid], role: this.data.permissions['#' + a.pid]?.role || '' })).sort((x, y) => y.lastLogin - x.lastLogin) };
  }
  async adminAccount(action, d) {
    const a = this.data.accounts[String(d && d.pid || '')]; if (!a) return { ok: false, error: 'account_not_found' };
    switch (action) {
      case 'resetpw': { const pw = [...webcrypto.getRandomValues(new Uint8Array(10))].map((b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join(''); await this.setPassword(a, pw); for (const [k, v] of Object.entries(this.data.sessions)) if (v.pid === a.pid) delete this.data.sessions[k]; this.saveData(); this.logAdmin('-', `reset password of ${a.username} (#${a.pid})`); return { ok: true, password: pw }; }
      case 'nick': { a.nick = cleanName(d.nick); this.saveData(); this.logAdmin('-', `nick ${a.username} -> ${a.nick}`); return { ok: true }; }
      case 'rename': { const u = String(d.username || '').trim(), low = u.toLowerCase(); if (!USER_RE.test(u) || RESERVED.has(low)) return { ok: false, error: 'BAD_USERNAME' }; const o = this.userIdx.get(low); if (o && o !== a.pid) return { ok: false, error: 'USERNAME_TAKEN' }; this.userIdx.delete(String(a.username).toLowerCase()); a.username = u; this.userIdx.set(low, a.pid); this.saveData(); this.logAdmin('-', `rename #${a.pid} -> ${u}`); return { ok: true }; }
      case 'delete': {
        for (const r of this.rooms.values()) { const p = r.findPid(a.pid); if (p) { const cl = this.clients.get(p.id); r.removePlayer(p.id); if (cl) { cl.room = null; cl.acc = null; cl.send('server:closed', { reason: 'account_deleted' }); } } }
        delete this.data.accounts[a.pid]; this.userIdx.delete(String(a.username).toLowerCase()); for (const [k, v] of Object.entries(this.data.sessions)) if (v.pid === a.pid) delete this.data.sessions[k];
        const key = '#' + a.pid; delete this.data.profiles[key]; delete this.data.bans[key]; delete this.data.mutes[key]; delete this.data.permissions[key];
        this.saveData(); this.logAdmin('-', `delete account ${a.username} (#${a.pid})`); return { ok: true };
      }
    }
    return { ok: false, error: 'bad_action' };
  }
  adminProfiles() { return Object.keys(this.data.profiles).map((key)=>({ ...this.playerProfile(key), key, name:this.labelFor(key) })); }
  adminModeration() { return { permissions:Object.entries(this.data.permissions||{}).map(([key,v])=>({key,name:this.labelFor(key),...v})), profiles: this.adminProfiles(), bans: Object.entries(this.data.bans).map(([key,v]) => ({key,name:this.labelFor(key),...v})), mutes: Object.keys(this.data.mutes).map((key)=>({key,name:this.labelFor(key)})), accounts: Object.keys(this.data.accounts||{}).length }; }
  // key = '#<player id>' for logged-in accounts (then the nickname is NOT used: nicknames can repeat); guests are matched by name
  isBanned(name, ip='', key='') { const now=Date.now(); for(const k of [key && key[0]==='#' ? key : String(name||'').toLowerCase(), ip?'ip:'+ip:null]) { if(!k) continue; const b=this.data.bans[k]; if(!b) continue; if(b.until&&b.until<=now){ delete this.data.bans[k]; this.saveData(); continue; } return true; } return false; }
  adminGlobal(action, value) {
    const d=value||{}; const name=this.resolveKey(d.name);
    if (action==='ban' || action==='unban') { if(!name) return {ok:false,error:'name_required'}; if(action==='ban'){ const mins=Number(d.minutes); this.data.bans[name]={reason:String(d.reason||'Banned by admin').slice(0,120), at:Date.now(), until:mins>0?Date.now()+mins*60000:0}; } else { delete this.data.bans[name]; delete this.data.bans['ip:'+name]; } this.logAdmin('-',`${action} ${this.labelFor(name)}${action==='ban'&&Number(d.minutes)>0?' '+d.minutes+' min':''}`); this.saveData(); for(const r of this.rooms.values()) for(const p of r.list) if(!p.bot && action==='ban' && (p.key===name || (name[0]!=='#' && String(p.name).toLowerCase()===name))) { const cl=this.clients.get(p.id); r.adminSet(p.id,'kick',true); if(cl){ cl.room=null; cl.send('server:closed',{code:r.code,reason:'banned'}); } } return {ok:true}; }
    if (action==='unmute') { if(!name) return {ok:false,error:'name_required'}; delete this.data.mutes[name]; this.logAdmin('-','unmute '+this.labelFor(name)); this.saveData(); return {ok:true}; }
    if (action==='xp') {
      if (!name) return {ok:false,error:'name_required'};
      const xp = Number(d.xp);
      if (!Number.isFinite(xp)) return {ok:false,error:'bad_xp'};
      const profile = this.profile(name);
      profile.xp = Math.round(Math.max(0, Math.min(999999, xp)));
      this.saveData();
      for (const r of this.rooms.values()) r.refreshPlayerProfile(name);
      return {ok:true, profile:this.playerProfile(name)};
    }
    if (action==='permission') {
      if (!name) return {ok:false,error:'name_required'};
      const role = String(d.role || 'none').toLowerCase();
      if (!['owner','admin','moderator','none'].includes(role)) return {ok:false,error:'bad_role'};
      if (role === 'none') delete this.data.permissions[name];
      else this.data.permissions[name] = { role, updatedAt: Date.now() };
      this.saveData();
      return {ok:true};
    }
    return {ok:false,error:'bad_action'};
  }
  adminRoom(code,action,value) {
    const key=String(code||'').toUpperCase(), r=this.rooms.get(key), cfg=this.data.servers[key];
    if (!r) return {ok:false,error:'room_not_found'};
    const result=r.adminRoom(action,value);
    if (result.ok && cfg) {
      cfg.max=r.maxPlayers; cfg.difficulty=r.difficulty; cfg.bots=r.botMode; cfg.weaponLimits={...r.weaponLimits}; cfg.map=r.mapId;
      this.saveData();
    }
    if (result.ok) this.logAdmin(key,`room ${action}${value!==undefined&&typeof value!=='object'?' = '+String(value).slice(0,40):''}`);
    return result;
  }
  tick() { for (const r of this.rooms.values()) { try { if (r.players.size && r.humans().length) r.tick(); else r.last = Date.now(); } catch (e) { console.error('[tick]', r.code, e); } } }
  stats() { let humans = 0, bots = 0; for (const r of this.rooms.values()) for (const p of r.players.values()) p.bot ? bots++ : humans++; return { rooms: this.rooms.size, clients: this.clients.size, humans, bots }; }
}
