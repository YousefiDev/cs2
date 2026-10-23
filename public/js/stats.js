// Statistics + leaderboard window (lobby). The server keeps the numbers per account (kills, deaths, headshots, wins ...);
// this only displays them. Board: top players by kills / K-D / wins / XP, with the viewer's own position.
import { WEAPONS } from '/shared/weapons.js';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BY = { k: 'کشتن', kd: 'K/D', win: 'برد', xp: 'XP' };
const NOTE = { kd: 'برای ورود به جدول K/D حداقل ۲۰ کشتن لازم است.', win: 'فقط بازیکن‌هایی که حداقل یک مسابقه را تمام کرده‌اند.', k: '', xp: '' };

export class StatsUI {
  constructor({ call, account, openLogin }) {
    this.call = call; this.account = account || (() => null); this.openLogin = openLogin || (() => {});
    this.tab = 'board'; this.by = 'k'; this.box = $('statsbox');
    $('st-close').addEventListener('click', () => this.close());
    this.box.addEventListener('click', (e) => { if (e.target === this.box) this.close(); });
    for (const b of document.querySelectorAll('#st-tabs button')) b.addEventListener('click', () => this.setTab(b.dataset.t));
    for (const b of document.querySelectorAll('#st-sort button')) b.addEventListener('click', () => { this.by = b.dataset.by; this.loadBoard(); });
  }
  open(tab = 'board') { this.box.hidden = false; this.setTab(tab); }
  close() { this.box.hidden = true; }
  setTab(t) {
    this.tab = t;
    for (const b of document.querySelectorAll('#st-tabs button')) b.classList.toggle('on', b.dataset.t === t);
    $('st-board').hidden = t !== 'board'; $('st-mine').hidden = t !== 'me';
    if (t === 'board') this.loadBoard(); else this.loadMine();
  }

  async loadBoard() {
    for (const b of document.querySelectorAll('#st-sort button')) b.classList.toggle('on', b.dataset.by === this.by);
    $('st-rows').innerHTML = '<tr><td colspan="8" class="st-empty">در حال بارگذاری…</td></tr>';
    const r = await this.call('stats:board', { by: this.by, limit: 50 });
    if (!r || !r.ok) { $('st-rows').innerHTML = '<tr><td colspan="8" class="st-empty">اتصال به سرور برقرار نیست</td></tr>'; return; }
    const me = this.account(), mine = me ? me.pid : '';
    $('st-note').textContent = NOTE[this.by] || '';
    const row = (x, you) => `<tr class="${x.pid === mine ? 'you' : ''}${you ? ' st-sticky' : ''}"><td class="num">${x.pos}</td><td class="nm">${esc(x.nick)}<small dir="ltr">ID ${esc(x.pid)}</small></td><td><span class="rk">${esc(x.tag || '')}</span></td><td class="num${this.by === 'k' ? ' hl' : ''}">${x.k}</td><td class="num hide-s">${x.d}</td><td class="num${this.by === 'kd' ? ' hl' : ''}">${x.kd.toFixed(2)}</td><td class="num hide-s">${x.hsp}%</td><td class="num${this.by === 'win' ? ' hl' : this.by === 'xp' ? '' : ''}">${this.by === 'xp' ? x.xp : `${x.win}/${x.m}`}</td></tr>`;
    $('st-rows').innerHTML = r.rows.length ? r.rows.map((x) => row(x)).join('') : '<tr><td colspan="8" class="st-empty">هنوز کسی در این جدول نیست. اولین نفر باش!</td></tr>';
    const th = $('st-last-th'); if (th) th.textContent = this.by === 'xp' ? 'XP' : 'برد/بازی';
    const meEl = $('st-me-row');
    if (r.me && r.me.pos > r.rows.length) meEl.innerHTML = `<table class="st-table"><tbody>${row(r.me, true)}</tbody></table>`; else meEl.innerHTML = '';
    if (!me) $('st-note').textContent = ($('st-note').textContent + ' برای دیدن رتبه‌ی خودت وارد حساب شو.').trim();
  }

  async loadMine() {
    const box = $('st-mine-body');
    if (!this.account()) { box.innerHTML = '<div class="st-login"><p>برای دیدن آمار شخصی‌ات باید وارد حساب کاربری شوی.</p><button id="st-login" class="cta">ورود / ثبت‌نام</button></div>'; $('st-login').onclick = () => { this.close(); this.openLogin(); }; return; }
    box.innerHTML = '<p class="st-empty">در حال بارگذاری…</p>';
    const r = await this.call('stats:me');
    if (!r || !r.ok) { box.innerHTML = '<p class="st-empty">آمار در دسترس نیست</p>'; return; }
    const s = r.stats, p = r.pos, fmt = (n) => (n ? '#' + n : '—');
    const card = (label, val, sub = '') => `<div class="st-card"><small>${label}</small><b dir="ltr">${val}</b>${sub ? `<em>${sub}</em>` : ''}</div>`;
    const max = Math.max(1, ...r.weapons.map((w) => w.n));
    box.innerHTML = `<div class="st-head"><b>${esc(r.account.nick)}</b><span class="rk">${esc(r.account.rankTag || '')}</span><small dir="ltr">ID ${esc(r.account.pid)} · ${r.account.xp} XP</small></div>
      <div class="st-cards">${card('K/D', s.kd.toFixed(2), 'رتبه ' + fmt(p.kd))}${card('کشتن', s.k, 'رتبه ' + fmt(p.k))}${card('مرگ', s.d)}${card('هدشات', s.hsp + '%', s.hs + ' هدشات')}
        ${card('کمک‌کشتن', s.a)}${card('کشتن از پشت دیوار', s.wb)}${card('مسابقه', s.m)}${card('درصد برد', s.wr + '%', `${s.win} برد · ${s.loss} باخت · ${s.dr} مساوی`)}</div>
      <div class="st-pos">رتبه‌ی تو: کشتن ${fmt(p.k)} · K/D ${fmt(p.kd)} · برد ${fmt(p.win)} · XP ${fmt(p.xp)}</div>
      <h3 class="vc-h">سلاح‌های محبوب</h3>
      <div class="st-weapons">${r.weapons.length ? r.weapons.map((w) => `<div class="st-w"><span>${esc((WEAPONS[w.k] && WEAPONS[w.k].name) || w.k)}</span><i style="width:${Math.round((w.n / max) * 100)}%"></i><b>${w.n}</b></div>`).join('') : '<p class="st-empty">هنوز کشتنی ثبت نشده. برو بازی!</p>'}</div>`;
  }
}
