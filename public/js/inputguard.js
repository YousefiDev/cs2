// Keeps browser shortcuts and gestures away from the game page.
//
// What a web page CAN do: cancel the default action of almost every key / mouse button / wheel / gesture, ask for
// confirmation before the tab is closed or reloaded, and - inside real fullscreen, Chromium browsers only - use the
// Keyboard Lock API so that even Ctrl+W, Ctrl+T, Ctrl+N, Ctrl+Tab, Alt+F4-style combos are delivered to the page.
// What it CANNOT do: stop Ctrl+W / Ctrl+T / Ctrl+N / Ctrl+Tab outside fullscreen (browsers reserve them). For those the
// "leave site?" prompt protects the match, and F11 is taken over so the game enters *API* fullscreen (native F11 does not
// enable the Keyboard Lock API).
//
// The listeners never stopPropagation: the game's own handlers still receive every event.
const FKEYS = Array.from({ length: 12 }, (_, i) => 'F' + (i + 1));
// codes that must reach the game while it is fullscreen (Escape is deliberately NOT locked: it leaves pointer lock / pauses the game)
const LOCK_CODES = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => 'Key' + c), ...Array.from({ length: 10 }, (_, i) => 'Digit' + i), ...FKEYS.filter((k) => k !== 'F11'),
  'Tab', 'Space', 'Backspace', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'PageUp', 'PageDown', 'Home', 'End', 'Insert', 'Delete', 'Backquote', 'Minus', 'Equal', 'Slash', 'Quote', 'Semicolon', 'Comma', 'Period', 'BracketLeft', 'BracketRight', 'Backslash', 'ContextMenu',
];
const NAV_CODES = new Set(['Tab', 'Space', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', 'Insert', 'ContextMenu', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight']);
const QUICKFIND = new Set(['Slash', 'Quote']);   // Firefox "quick find" opens on / and ' when no field has focus

export function installInputGuard({ inMatch, isEditable, isTouch = () => false, onHint } = {}) {
  const st = { locked: false, hinted: false, fs: false };
  const menuOpen = () => !!document.querySelector('.overlay:not([hidden]), #pause:not([hidden]), #settings:not([hidden]), #teamsel:not([hidden])');
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;

  // ---------------- fullscreen + keyboard lock ----------------
  async function lockKeys() {
    try { await navigator.keyboard?.lock?.(LOCK_CODES); st.locked = !!navigator.keyboard?.lock; } catch (e) { st.locked = false; }
  }
  function onFsChange() {
    st.fs = !!fsEl();
    if (st.fs) lockKeys(); else { try { navigator.keyboard?.unlock?.(); } catch (e) { /* unsupported */ } st.locked = false; }
  }
  document.addEventListener('fullscreenchange', onFsChange); document.addEventListener('webkitfullscreenchange', onFsChange);
  async function toggleFullscreen() {
    const d = document.documentElement;
    try {
      if (fsEl()) { await (document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen()); return; }
      await (d.requestFullscreen ? d.requestFullscreen({ navigationUI: 'hide' }) : d.webkitRequestFullscreen());
    } catch (e) { /* denied */ }
  }
  if (fsEl()) onFsChange();

  // ---------------- keyboard ----------------
  function onKey(e) {
    if (e.code === 'F11') { e.preventDefault(); if (e.type === 'keydown' && !e.repeat && !isTouch()) toggleFullscreen(); return; }   // our fullscreen = Keyboard Lock capable
    if (!inMatch()) return;
    const editable = isEditable(e.target), mod = e.ctrlKey || e.metaKey, menu = menuOpen();
    if (editable) { // typing (chat, name, ...): keep normal editing, still refuse everything that would leave or change the page
      if (FKEYS.includes(e.code) || (mod && (e.key || '').length === 1 && 'SPDGJLORHFUBEKNWT'.includes((e.key || '').toUpperCase()) && (e.key || '').length === 1 && !'ACVXZY'.includes((e.key || '').toUpperCase())) || e.code === 'AltLeft' || e.code === 'AltRight') e.preventDefault();
      return;
    }
    if (FKEYS.includes(e.code) || mod || e.altKey || QUICKFIND.has(e.code)) { e.preventDefault(); return; }   // Ctrl/Alt/Meta combos, F1-F12, quick-find, zoom, find, save, print, reload ...
    if (NAV_CODES.has(e.code) && !(menu && (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Backspace'))) e.preventDefault();   // scrolling / focus / history keys (menus keep their keyboard navigation)
  }
  addEventListener('keydown', onKey, true); addEventListener('keyup', onKey, true);

  // ---------------- mouse: middle-click autoscroll, back/forward buttons, context menu, drag/select ----------------
  const onMouse = (e) => { if (inMatch() && (e.button === 1 || e.button === 3 || e.button === 4) && !isEditable(e.target)) e.preventDefault(); };
  addEventListener('mousedown', onMouse, true); addEventListener('mouseup', onMouse, true); addEventListener('auxclick', onMouse, true);
  addEventListener('contextmenu', (e) => { if (!isEditable(e.target)) e.preventDefault(); }, true);
  addEventListener('dragstart', (e) => { if (!isEditable(e.target)) e.preventDefault(); }, true);
  addEventListener('selectstart', (e) => { if (inMatch() && !isEditable(e.target)) e.preventDefault(); }, true);
  // browser zoom by Ctrl+wheel / trackpad pinch (always on this page)
  addEventListener('wheel', (e) => { if (e.ctrlKey || e.metaKey) e.preventDefault(); }, { passive: false, capture: true });

  // ---------------- touch / gestures ----------------
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) addEventListener(t, (e) => e.preventDefault());   // Safari pinch-zoom
  addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });          // two-finger zoom
  let lastTap = 0; addEventListener('touchend', (e) => { const n = Date.now(); if (n - lastTap < 350 && !isEditable(e.target)) e.preventDefault(); lastTap = n; }, { passive: false });   // double-tap zoom

  // ---------------- leaving the match by accident: Ctrl+W, F5, swipe/Back, closing the window ----------------
  addEventListener('beforeunload', (e) => { if (!inMatch()) return; e.preventDefault(); e.returnValue = ''; return ''; });
  history.replaceState({ cs: 0 }, '', location.href); history.pushState({ cs: 1 }, '', location.href);
  addEventListener('popstate', () => { if (inMatch()) history.pushState({ cs: 1 }, '', location.href); });   // during a match the Back button / Alt+Left / Backspace / swipe-back stay in the game

  // ---------------- one-time tip: without fullscreen the browser still owns Ctrl+W / Ctrl+T / Ctrl+N ----------------
  const tip = setInterval(() => {
    if (!inMatch() || isTouch() || fsEl() || st.hinted) return; st.hinted = true; clearInterval(tip);
    onHint?.('نکته: با F11 بازی را تمام‌صفحه کن تا Ctrl+W، Ctrl+T، Ctrl+عدد و بقیهٔ میان‌برهای مرورگر هم قفل شوند.');
  }, 1500);
  return { state: st, toggleFullscreen, lockKeys };
}
