// CS2-style pause menu behaviour: live match info, arrow-key navigation, two-step "leave" confirmation.
const TEAM = { T: ['تروریست', 't'], CT: ['ضدتروریست', 'ct'], SPEC: ['تماشاگر', ''] };
const MODE = { comp: 'COMPETITIVE', dm: 'TEAM DEATHMATCH' };

export function initPauseMenu(game) {
  const $ = (id) => document.getElementById(id), root = $('pause'); if (!root) return;
  const items = () => [...root.querySelectorAll('.pz-item')].filter((b) => b.offsetParent !== null);
  let timer = 0, armTimer = 0; const leave = $('p-leave'), leaveTxt = leave.querySelector('em');

  function fill() {
    const g = game, room = g.room || {}, sc = g.score || { T: 0, CT: 0 }, team = TEAM[g.team] || ['—', ''];
    $('pz-map').textContent = (g.map && g.map.name) || room.mapName || room.map || '—';
    $('pz-mode').textContent = MODE[g.mode] || String(g.mode || 'MATCH').toUpperCase();
    $('pz-st').textContent = sc.T ?? 0; $('pz-sct').textContent = sc.CT ?? 0;
    $('pz-round').textContent = g.mode === 'dm' ? 'تا رسیدن به سقف کشته‌ها' : g.round ? `راند ${g.round}` : 'گرم‌کردن';
    $('pz-title').textContent = room.title || (g.net && g.net.offline ? 'تمرین آفلاین' : '—');
    const n = (g.roster || []).length; $('pz-players').textContent = room.max && !(g.net && g.net.offline) && n <= room.max ? `${n} / ${room.max}` : String(n);
    const t = $('pz-team'); t.textContent = team[0]; t.className = team[1];
  }
  function disarm() { clearTimeout(armTimer); leave.classList.remove('armed'); if (leaveTxt) leaveTxt.textContent = 'خروج از سرور'; }
  // first click on "leave" only arms it; the second one (within 3 s) goes through to the real handler in main.js
  root.addEventListener('click', (e) => {
    const b = e.target.closest('#p-leave'); if (!b) return;
    if (!b.classList.contains('armed')) { e.stopImmediatePropagation(); e.preventDefault(); b.classList.add('armed'); if (leaveTxt) leaveTxt.textContent = 'مطمئنی؟ دوباره بزن'; clearTimeout(armTimer); armTimer = setTimeout(disarm, 3000); }
    else disarm();
  }, true);
  new MutationObserver(() => {
    clearInterval(timer);
    if (root.hidden) { disarm(); return; }
    fill(); timer = setInterval(fill, 800); disarm();
    if (!matchMedia('(pointer:coarse)').matches) setTimeout(() => $('p-resume').focus({ preventScroll: true }), 30);
  }).observe(root, { attributes: true, attributeFilter: ['hidden'] });
  addEventListener('keydown', (e) => {
    if (root.hidden || (e.code !== 'ArrowDown' && e.code !== 'ArrowUp')) return;
    const list = items(); if (!list.length) return; e.preventDefault(); e.stopPropagation();
    const i = list.indexOf(document.activeElement), d = e.code === 'ArrowDown' ? 1 : -1;
    list[(i + d + list.length) % list.length].focus({ preventScroll: true });
  }, true);
}
