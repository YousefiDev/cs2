// End of match: winner banner + vote for the next map.
// The server sends  mapvote {kind:'start', options, until, winner, score, current}  ->  {kind:'tally', votes}  ->  {kind:'result', map, name, votes}
// and then 'mapchange'. Options come from the server (every map in the list, custom maps included), so new maps appear automatically.
import { mapThumb } from './lobby.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class MapVote {
  constructor(send, serverNow) { this.send = send; this.serverNow = serverNow; this.el = $('mapvote'); this.grid = $('mv-grid'); this.mine = null; this.timer = 0; this.hideT = 0; this.done = false; }

  show(d) {
    clearInterval(this.timer); clearTimeout(this.hideT); this.done = false; this.mine = null;
    const win = d.winner === 'T' ? 'T' : 'CT', mineTeam = d.myTeam === 'T' || d.myTeam === 'CT' ? d.myTeam : null;
    this.el.dataset.win = win;
    $('mv-kicker').textContent = mineTeam ? (mineTeam === win ? 'پیروزی' : 'شکست') : 'پایان بازی';
    $('mv-win').textContent = win === 'T' ? 'تروریست‌ها برنده شدند' : 'ضدتروریست‌ها برنده شدند';
    $('mv-score').innerHTML = `<span class="ct"><small>CT</small><b>${d.score.CT}</b></span><i>:</i><span class="t"><b>${d.score.T}</b><small>T</small></span>`;
    $('mv-result').hidden = true; $('mv-title').hidden = false;
    this.grid.innerHTML = d.options.map((o) => `<button class="mv-opt" data-id="${esc(o.id)}"><img alt="" draggable="false" src="${mapThumb(o.id)}"><span class="mv-name">${esc(String(o.name).toUpperCase())}</span>${o.id === d.current ? '<span class="mv-cur">الان</span>' : ''}<span class="mv-cnt">0</span></button>`).join('');
    for (const b of this.grid.querySelectorAll('.mv-opt')) b.addEventListener('click', () => this.pick(b.dataset.id));
    const total = Math.max(1, (d.until - this.serverNow()) / 1000); this.until = d.until; this.total = total;
    this.el.hidden = false; this.tick(); this.timer = setInterval(() => this.tick(), 200);
  }

  pick(id) { if (this.done) return; this.mine = id; this.send(id); this.mark(); }
  mark() { for (const b of this.grid.querySelectorAll('.mv-opt')) b.classList.toggle('mine', b.dataset.id === this.mine); }

  tally(votes) {
    for (const b of this.grid.querySelectorAll('.mv-opt')) { const n = votes[b.dataset.id] || 0; b.querySelector('.mv-cnt').textContent = n; b.classList.toggle('has', n > 0); }
  }

  tick() {
    const left = Math.max(0, (this.until - this.serverNow()) / 1000);
    $('mv-t').textContent = Math.ceil(left); $('mv-bar').style.width = `${Math.max(0, Math.min(100, (left / this.total) * 100))}%`;
  }

  result(d) {
    this.done = true; clearInterval(this.timer); this.tally(d.votes || {});
    for (const b of this.grid.querySelectorAll('.mv-opt')) { const w = b.dataset.id === d.map; b.classList.toggle('win', w); b.classList.toggle('dim', !w); }
    $('mv-title').hidden = true; $('mv-result').hidden = false; $('mv-result').textContent = `مپ بعدی: ${d.name}`;
    clearTimeout(this.hideT); this.hideT = setTimeout(() => this.hide(), 3200);
  }

  hide() { clearInterval(this.timer); clearTimeout(this.hideT); if (this.el) this.el.hidden = true; }
}
