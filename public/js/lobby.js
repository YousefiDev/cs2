// Lobby UI: map thumbnails (drawn from the real map data) and the community-server browser
// with search, map filter, sorting, favourites, a detail panel and quick join.
import { MAP_LIST, getMap } from '/shared/maps.js';
import { WALL } from '/shared/constants.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const MAP_TAGS = { dust2: 'کلاسیک', mirage: 'کاخ و کانکتور', inferno: 'بنانا', warehouse: 'انبار', bazaar: 'بازار', arena: 'آرنا' };
export const mapLabel = (id) => (MAP_LIST.find((m) => m.id === id) || {}).name || String(id || '');

const thumbs = new Map();
// Top-down minimap: floors shaded by height, walls transparent, bomb sites labelled.
export function mapThumb(id) {
  if (thumbs.has(id)) return thumbs.get(id);
  let url = '';
  try {
    const m = getMap(id), c = document.createElement('canvas'); c.width = m.W; c.height = m.H; const x = c.getContext('2d'), img = x.createImageData(m.W, m.H);
    for (let i = 0; i < m.W * m.H; i++) {
      const h = m.heights[i]; let col;
      if (h >= WALL) col = [0, 0, 0, 0];
      else if (m.mat[i] === 4) col = [150, 125, 92, 255];
      else { const v = 120 + m.floor[i] * 24; col = [Math.min(255, v * 1.0), Math.min(255, v * 0.88), Math.min(255, v * 0.68), 255]; if (m.ceil[i] < 1e8) col = [col[0] * 0.66, col[1] * 0.66, col[2] * 0.66, 255]; }
      img.data.set(col, i * 4);
    }
    x.putImageData(img, 0, 0); x.font = 'bold 14px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (const [k, r] of Object.entries(m.def.sites || {})) { x.fillStyle = 'rgba(0,0,0,.55)'; x.beginPath(); x.arc((r[0] + r[2]) / 2, (r[1] + r[3]) / 2, 9, 0, 7); x.fill(); x.fillStyle = '#ff7a5c'; x.fillText(k, (r[0] + r[2]) / 2, (r[1] + r[3]) / 2 + 1); }
    url = c.toDataURL('image/png');
  } catch (e) { url = ''; }
  thumbs.set(id, url); return url;
}

// Map cards for the offline practice picker (these are .seg buttons so main.js's segmented-control wiring applies).
export function buildMapPicker(seg) {
  seg.innerHTML = MAP_LIST.map((m) => `<button data-v="${esc(m.id)}"><img alt="" src="${mapThumb(m.id)}" draggable="false"><b>${esc(m.name.toUpperCase())}</b><small>${esc(MAP_TAGS[m.id] || 'نقشه')}</small></button>`).join('');
}

const FAVS = 'cs-favs';
const loadFavs = () => { try { return new Set(JSON.parse(localStorage.getItem(FAVS) || '[]')); } catch { return new Set(); } };
const diffFa = { easy: 'آسان', normal: 'معمولی', hard: 'سخت' };

export class ServerBrowser {
  constructor({ onJoin }) {
    this.onJoin = onJoin; this.rooms = []; this.sel = null; this.favs = loadFavs(); this.ping = null;
    this.f = { q: '', map: 'all', noFull: false, noEmpty: false, favs: false }; this.sort = { key: 'humans', dir: -1 };
    this.box = $('rooms'); this.detail = $('sv-detail');
    $('sv-search').addEventListener('input', (e) => { this.f.q = e.target.value.trim().toLowerCase(); this.render(); });
    for (const [id, key] of [['sv-nofull', 'noFull'], ['sv-noempty', 'noEmpty'], ['sv-favs', 'favs']]) $(id).addEventListener('change', (e) => { this.f[key] = e.target.checked; this.render(); });
    document.querySelectorAll('.sv-cols [data-sort]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.sort; this.sort = { key: k, dir: this.sort.key === k ? -this.sort.dir : (k === 'title' || k === 'map' ? 1 : -1) }; this.render();
    }));
    $('sv-quick').addEventListener('click', () => this.quickJoin());
    this.box.addEventListener('click', (e) => {
      const fav = e.target.closest('[data-fav]'); if (fav) { e.stopPropagation(); this.toggleFav(fav.dataset.fav); return; }
      const join = e.target.closest('[data-join]'); if (join) { e.stopPropagation(); this.onJoin(join.dataset.join); return; }
      const row = e.target.closest('.room'); if (row) { this.sel = row.dataset.code; this.render(); }
    });
    this.box.addEventListener('dblclick', (e) => { const row = e.target.closest('.room'); if (row) this.onJoin(row.dataset.code); });
    this.detail.addEventListener('click', (e) => { const j = e.target.closest('[data-join]'); if (j) this.onJoin(j.dataset.join); });
  }
  toggleFav(code) { this.favs.has(code) ? this.favs.delete(code) : this.favs.add(code); try { localStorage.setItem(FAVS, JSON.stringify([...this.favs])); } catch {} this.render(); }
  setRooms(list, ping) { this.rooms = Array.isArray(list) ? list : []; if (ping != null) this.ping = ping; this.renderMapChips(); this.render(); }
  setOffline(msg) { this.rooms = []; this.ping = null; this.render(msg); }
  quickJoin() {
    const open = this.rooms.filter((r) => r.humans + 0 < r.max && r.humans >= 0 && r.humans + r.bots <= r.max).sort((a, b) => (b.humans > 0) - (a.humans > 0) || b.humans - a.humans);
    const pick = open.find((r) => r.humans < r.max); if (pick) this.onJoin(pick.code);
  }
  renderMapChips() {
    const maps = [...new Set(this.rooms.map((r) => r.map))]; const el = $('sv-maps'); const sig = maps.join(',') + '|' + this.f.map; if (el._sig === sig) return; el._sig = sig;
    if (this.f.map !== 'all' && !maps.includes(this.f.map)) this.f.map = 'all';
    el.innerHTML = ['all', ...maps].map((m) => `<button type="button" data-map="${esc(m)}" class="${m === this.f.map ? 'on' : ''}">${m === 'all' ? 'همه' : esc(mapLabel(m))}</button>`).join('');
    el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { this.f.map = b.dataset.map; el._sig = ''; this.renderMapChips(); this.render(); }));
  }
  status(r) {
    if (r.phase === 'warmup') return { t: 'گرم‌کردن', c: 'warm' };
    if (r.phase === 'over') return { t: 'پایان بازی', c: 'over' };
    return { t: `راند ${r.round} · ${r.score.CT}–${r.score.T}`, c: 'live' };
  }
  filtered() {
    const f = this.f; const key = this.sort.key, dir = this.sort.dir;
    const val = (r) => key === 'title' ? r.title.toLowerCase() : key === 'map' ? mapLabel(r.map) : key === 'state' ? (r.phase === 'warmup' ? 0 : 1) : r.humans * 100 + r.bots;
    return this.rooms.filter((r) => (!f.q || r.title.toLowerCase().includes(f.q) || r.code.toLowerCase().includes(f.q) || mapLabel(r.map).toLowerCase().includes(f.q))
      && (f.map === 'all' || r.map === f.map) && (!f.noFull || r.humans + r.bots < r.max) && (!f.noEmpty || r.humans > 0) && (!f.favs || this.favs.has(r.code)))
      .sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * dir || (this.favs.has(b.code) - this.favs.has(a.code)); });
  }
  render(offlineMsg) {
    $('sv-count').textContent = this.rooms.length ? `${this.rooms.length}` : '';
    const chip = $('sv-ping'); if (this.ping == null) { chip.textContent = ''; chip.className = 'ping-chip'; } else { chip.textContent = this.ping + ' ms'; chip.className = 'ping-chip ' + (this.ping < 60 ? 'good' : this.ping < 140 ? 'mid' : 'bad'); }
    document.querySelectorAll('.sv-cols [data-sort]').forEach((b) => { b.classList.toggle('on', b.dataset.sort === this.sort.key); b.dataset.dir = b.dataset.sort === this.sort.key ? (this.sort.dir > 0 ? '▲' : '▼') : ''; });
    const list = this.filtered();
    if (!list.length) {
      this.box.innerHTML = `<div class="empty">${esc(offlineMsg || (this.rooms.length ? 'هیچ سروری با این فیلترها پیدا نشد.' : 'هنوز سروری فعال نیست. ادمین باید از پنل /admin سرور بسازد.'))}</div>`; this.detail.hidden = true; return;
    }
    if (!list.some((r) => r.code === this.sel)) this.sel = list[0].code;
    this.box.innerHTML = list.map((r) => {
      const st = this.status(r), total = r.humans + r.bots, full = total >= r.max, fill = Math.min(100, Math.round((total / r.max) * 100)), hfill = Math.min(100, Math.round((r.humans / r.max) * 100));
      return `<div class="room ${r.code === this.sel ? 'sel' : ''} ${full ? 'full' : ''}" data-code="${esc(r.code)}">
        <button class="fav ${this.favs.has(r.code) ? 'on' : ''}" data-fav="${esc(r.code)}" aria-label="علاقه‌مندی">★</button>
        <div class="rn"><div class="rt">${esc(r.title)}</div><div class="rc">${esc(r.code)}</div></div>
        <div class="rm"><img alt="" src="${mapThumb(r.map)}"><span>${esc(mapLabel(r.map))}</span></div>
        <div class="rp"><div class="bar"><i class="b" style="width:${fill}%"></i><i class="h" style="width:${hfill}%"></i></div><span><b>${r.humans}</b> / ${r.max}${r.bots ? ` <small>+${r.bots} bot</small>` : ''}</span></div>
        <div class="rs ${st.c}">${esc(st.t)}</div>
        <button class="join" data-join="${esc(r.code)}" ${full ? 'disabled' : ''}>${full ? 'FULL' : 'JOIN'}</button></div>`;
    }).join('');
    const r = list.find((x) => x.code === this.sel); this.renderDetail(r);
  }
  renderDetail(r) {
    if (!r) { this.detail.hidden = true; return; }
    const st = this.status(r), full = r.humans + r.bots >= r.max, names = (r.names || []).map((n) => `<span>${esc(n)}</span>`).join('') || '<em>هنوز بازیکن انسانی نیست</em>';
    this.detail.hidden = false;
    this.detail.innerHTML = `<img class="dv-map" alt="" src="${mapThumb(r.map)}"><div class="dv-info"><h3>${esc(r.title)} <small dir="ltr">${esc(r.code)}</small></h3>
      <div class="dv-meta"><span>${esc(mapLabel(r.map))}</span><span>${esc(st.t)}</span><span>بات: ${r.botMode === 'none' ? 'ندارد' : esc(diffFa[r.difficulty] || r.difficulty)}</span><span dir="ltr">CT ${r.teams ? r.teams.CT : '–'} · T ${r.teams ? r.teams.T : '–'}</span></div>
      <div class="dv-names">${names}</div></div><button class="join big" data-join="${esc(r.code)}" ${full ? 'disabled' : ''}>${full ? 'FULL' : 'JOIN'}</button>`;
  }
}
