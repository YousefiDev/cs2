// CS2-style main menu: top-bar tabs, promo cards, party slots, friends rail (invites come later) and a 3D soldier.
import * as THREE from 'three';
import { makeSoldier, setRigWeapon, animateRig } from './models.js';
import { MAP_LIST } from '/shared/maps.js';
import { mapThumb, mapLabel, MAP_TAGS } from './lobby.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const VIEWS = ['play', 'servers', 'practice', 'controls'];

export function initLobbyMenu({ renderer, getQuality }) {
  const root = $('lobby'); if (!root) return {};
  let view = 'play', side = localStorage.getItem('cs-lobby-side') === 'T' ? 'T' : 'CT';

  // ---------------------------------------------------------------- views
  function setView(v) {
    if (v === 'stats') { $('open-stats').click(); return; }
    if (!VIEWS.includes(v)) v = 'play'; view = v; root.dataset.view = v;
    root.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== v; });
    root.querySelectorAll('.cm-nav button').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
    root.classList.remove('rail-open');
    if (v === 'servers') requestAnimationFrame(() => $('sv-search')?.focus({ preventScroll: true }));
  }
  root.querySelectorAll('.cm-nav button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  root.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.go)));
  $('cm-home').addEventListener('click', () => setView('play'));
  $('cm-stats').addEventListener('click', () => $('open-stats').click());
  $('cm-to-practice').addEventListener('click', () => setView('practice'));
  $('cm-to-servers').addEventListener('click', () => setView('servers'));
  $('cm-friends-btn').addEventListener('click', () => root.classList.toggle('rail-open'));
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || root.hidden || view === 'play') return;
    if (document.querySelector('.overlay:not([hidden])')) return; setView('play');
  });

  // ---------------------------------------------------------------- left cards
  const cards = $('cm-cards');
  const selMap = () => (root.querySelector('.seg.maps button.on') || {}).dataset?.v || (MAP_LIST[0] || {}).id;
  function art(id) { const u = mapThumb(id); return u ? `style="background-image:url('${u}')"` : ''; }
  function buildCards() {
    const m = selMap(), other = (MAP_LIST.find((x) => x.id !== m) || MAP_LIST[0] || {}).id;
    const count = ($('sv-count') && $('sv-count').textContent.trim()) || '';
    cards.innerHTML = `
      <button class="cm-card" data-act="practice"><div class="art" ${art(m)}></div><span class="tag">OFFLINE</span><div class="txt"><b>Practice vs Bots</b><small>تمرین روی ${esc(mapLabel(m))} · ${esc(MAP_TAGS[m] || '')}</small></div></button>
      <button class="cm-card" data-act="servers"><div class="art" ${art(other)}></div><span class="tag live">LIVE</span><div class="txt"><b>Community Servers</b><small>${count ? 'سرور آنلاین: ' + esc(count) : 'ورود به سرورهای آنلاین'}</small></div></button>
      <button class="cm-card maps" data-act="practice"><div class="grid">${MAP_LIST.slice(0, 6).map((x) => `<i ${art(x.id)} title="${esc(x.name)}"></i>`).join('')}</div><div class="txt"><b>Map Pool</b><small>${MAP_LIST.length} نقشه</small></div></button>
      <button class="cm-card trophy" data-act="stats"><div class="art"></div><span class="tag">TOP</span><div class="txt"><b>Leaderboards</b><small>آمار، رنک و برترین‌ها</small></div></button>`;
    cards.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.act)));
  }
  new MutationObserver(() => requestAnimationFrame(buildCards)).observe($('sv-count') || root, { childList: true, characterData: true, subtree: true });
  root.addEventListener('click', (e) => { if (e.target.closest('.seg.maps')) requestAnimationFrame(buildCards); });
  setTimeout(buildCards, 0); setTimeout(buildCards, 800);

  // ---------------------------------------------------------------- party row
  const party = $('cm-party');
  const nameNow = () => ($('acct-in') && !$('acct-in').hidden && $('acct-nick').textContent.trim()) || ($('name') && $('name').value.trim()) || 'Player';
  function renderParty() {
    const rk = ($('acct-rank') && $('acct-rank').textContent.trim()) || '';
    const n = nameNow();
    const empty = '<button class="slot empty" disabled title="دعوت دوست — به‌زودی"><div class="av">＋</div><small>INVITE</small></button>';
    party.innerHTML = empty + empty + `<div class="slot me"><div class="av">${esc(n.slice(0, 1).toUpperCase())}</div>${rk ? `<span class="rk">${esc(rk)}</span>` : ''}<small>${esc(n)}</small></div>` + empty + empty;
  }
  renderParty(); ['name'].forEach((id) => $(id) && $(id).addEventListener('input', renderParty));
  new MutationObserver(renderParty).observe($('acct') || root, { childList: true, characterData: true, subtree: true, attributes: true });

  // ---------------------------------------------------------------- friends rail (data hook for later)
  const frList = $('cm-fr-list');
  function setFriends(list = []) {
    $('cm-fr-count').textContent = list.length; $('cm-friends-dot').hidden = !list.some((f) => f.invite);
    if (!list.length) { frList.innerHTML = '<div class="empty"><b>هنوز دوستی اضافه نشده</b>بعداً می‌توانی دوستانت را دعوت کنی و با هم وارد یک سرور شوی.</div>'; return; }
    const order = { ingame: 0, online: 1, offline: 2 }; list = [...list].sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));
    frList.innerHTML = list.map((f) => `<div class="fr ${esc(f.status)}"><div class="av">${esc((f.name || '?').slice(0, 1).toUpperCase())}<i></i></div><div class="nm"><b>${esc(f.name)}</b><small>${esc(f.note || ({ ingame: 'در بازی', online: 'آنلاین', offline: 'آفلاین' }[f.status] || ''))}</small></div></div>`).join('');
  }
  setFriends([]);

  // ---------------------------------------------------------------- side switch + 3D soldier
  const slot = root.querySelector('.cm-hero .cm-char') || (() => { const d = document.createElement('div'); d.className = 'cm-char'; d.id = 'cm-char'; root.querySelector('.cm-hero').insertBefore(d, root.querySelector('.cm-actions')); return d; })();
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(26, 1, 0.1, 40), pivot = new THREE.Group();
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a2a18, 1.05));
  const key = new THREE.DirectionalLight(0xffe2b8, 2.6); key.position.set(-2.4, 3.2, 3.4); scene.add(key);
  const rim = new THREE.DirectionalLight(0x7fb0ff, 1.7); rim.position.set(3, 2.2, -2.8); scene.add(rim);
  scene.add(pivot); let rig = null, t = 0, px = 0, targetPx = 0;
  function buildRig() {
    if (rig) { pivot.remove(rig.root); rig = null; }
    rig = makeSoldier(side); setRigWeapon(rig, 'usp'); rig.root.rotation.y = Math.PI; pivot.add(rig.root);
    rig.root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  }
  buildRig();
  $('cm-side').querySelectorAll('button').forEach((b) => { b.classList.toggle('on', b.dataset.side === side); b.addEventListener('click', () => { side = b.dataset.side; localStorage.setItem('cs-lobby-side', side); $('cm-side').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); buildRig(); }); });
  addEventListener('pointermove', (e) => { targetPx = (e.clientX / innerWidth - 0.5) * 2; }, { passive: true });

  // rendered by main.js after the world, inside the rectangle of .cm-char (so the page layout decides where the soldier stands)
  function renderChar(dt) {
    if (root.hidden || view !== 'play' || getQuality() === 'low') return;
    const r = slot.getBoundingClientRect(); if (r.width < 40 || r.height < 60) return;
    t += dt; px += (targetPx - px) * Math.min(1, dt * 3);
    animateRig(rig, { speed: 0, crouch: false, air: false, pitch: 0.12 + Math.sin(t * 1.2) * 0.02, dt, alive: true });
    pivot.rotation.y = px * 0.35 + Math.sin(t * 0.5) * 0.06; pivot.position.y = Math.sin(t * 1.3) * 0.006;
    const H = innerHeight, y = H - r.bottom; cam.aspect = r.width / r.height; cam.position.set(0, 1.05, 5.6 * Math.max(1, 0.92 / Math.min(1, cam.aspect * 1.6))); cam.lookAt(0, 0.93, 0); cam.updateProjectionMatrix();
    renderer.clearDepth(); renderer.setScissorTest(true); renderer.setViewport(r.left, y, r.width, r.height); renderer.setScissor(r.left, y, r.width, r.height);
    renderer.render(scene, cam); renderer.setScissorTest(false); renderer.setViewport(0, 0, innerWidth, innerHeight);
  }
  setView('play');
  return { setView, renderChar, setFriends, getView: () => view };
}
