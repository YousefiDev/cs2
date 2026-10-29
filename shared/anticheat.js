// Basic server-side anti-cheat. It never bans anybody by itself: it counts suspicious events and, when a limit is reached,
// files a report for the admins (with the evidence) - so a lag spike can never get an honest player punished.
import { forward } from './constants.js';
const WINDOW = 20000;                                              // events older than this are forgotten
const LIMITS = { speed: 6, wall: 8, fly: 4, snap: 4 };           // events of one kind inside WINDOW that raise an alert
const NOT_RIFLE = new Set(['awp', 'ssg08', 'scar20', 'g3sg1', 'zeus', 'knife', 'he', 'flash', 'smoke', 'molotov', 'incendiary', 'decoy', 'c4']);
export const AC_LABEL = { speed: 'Speed hack / teleport', wall: 'Walking through walls', fly: 'Flying', snap: 'Instant aim jump before a headshot', aim: 'Unusual headshot ratio' };

export class AntiCheat {
  constructor(onAlert) { this.onAlert = onAlert; }
  st(p) { return (p.ac ||= { ev: [], flags: [], aim: [], k: 0, hs: 0, alerted: {} }); }
  raise(p, kind, detail, value) {
    const s = this.st(p); s.alerted[kind] = Date.now(); s.flags.push({ kind, detail: String(detail).slice(0, 90), t: Date.now() }); if (s.flags.length > 20) s.flags.shift();
    this.onAlert(p, kind, detail, value);
  }
  record(p, kind, w = 1, detail = '') {
    if (!p || p.bot || p.god || p.noclip) return;                  // admins testing with god / noclip are not cheaters
    const s = this.st(p), now = Date.now(); s.ev.push({ t: now, kind, w }); s.ev = s.ev.filter((e) => now - e.t < WINDOW);
    const sum = s.ev.reduce((a, e) => a + (e.kind === kind ? e.w : 0), 0);
    if (sum >= LIMITS[kind] && now - (s.alerted[kind] || 0) > 300000) this.raise(p, kind, detail || AC_LABEL[kind], sum);
  }
  // view-direction history from the movement packets (last 300 ms)
  aim(p, now) { const s = this.st(p); s.aim.push({ t: now, yaw: p.yaw, pitch: p.pitch }); while (s.aim.length && now - s.aim[0].t > 300) s.aim.shift(); }
  // biggest turn of the view (degrees) between two neighbouring samples during the last `ms`
  snap(p, now, ms = 150) {
    const a = this.st(p).aim.filter((x) => now - x.t <= ms); let best = 0;
    for (let i = 1; i < a.length; i++) {
      const u = forward(a[i - 1].yaw, a[i - 1].pitch), v = forward(a[i].yaw, a[i].pitch), dot = Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]));
      best = Math.max(best, Math.acos(dot) * 180 / Math.PI);
    }
    return best;
  }
  // headshot ratio with rifles / SMGs / pistols over a match: 85% of 20+ kills is far beyond what humans do
  kill(p, hs, weapon) {
    if (!p || p.bot || NOT_RIFLE.has(weapon)) return; const s = this.st(p); s.k++; if (hs) s.hs++;
    if (s.k >= 20 && s.hs / s.k >= 0.85 && !s.alerted.aim) this.raise(p, 'aim', `${s.hs} headshots in ${s.k} kills (${Math.round(100 * s.hs / s.k)}%)`, s.hs / s.k);
  }
  newMatch(p) { if (p.ac) { p.ac.k = 0; p.ac.hs = 0; delete p.ac.alerted.aim; } }
}
