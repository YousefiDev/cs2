// Mobile layer: fullscreen start gate + drag/resize/opacity UI editor for touch controls.
// Layout is stored as viewport fractions so it survives rotation and different phones.
const $ = (id) => document.getElementById(id);

// Bump LAYOUT_V when the default layout is redesigned: older saved layouts are then replaced by the new defaults.
const LAYOUT_V = 3;
export const CONTROLS = [
  { id: 't-stick', name: 'جوی‌استیک حرکت', x: 0.135, y: 0.74 },
  { id: 't-fire', name: 'شلیک', x: 0.89, y: 0.70 },
  { id: 't-fire2', name: 'ضربهٔ دوم چاقو', x: 0.76, y: 0.88 },
  { id: 't-jump', name: 'پرش', x: 0.93, y: 0.44 },
  { id: 't-crouch', name: 'نشستن', x: 0.89, y: 0.90 },
  { id: 't-scope', name: 'اسکوپ', x: 0.79, y: 0.50 },
  { id: 't-reload', name: 'ریلود', x: 0.77, y: 0.70 },
  { id: 't-use', name: 'کاشت / خنثی‌سازی بمب', x: 0.67, y: 0.70 },
  { id: 't-slots', name: 'نوار سلاح‌ها (لمس: انتخاب · نگه‌داشتن: انداختن)', x: 0.50, y: 0.79 },
  { id: 't-score', name: 'جدول امتیاز', x: 0.795, y: 0.09 },
  { id: 't-buy', name: 'خرید', x: 0.855, y: 0.09 },
  { id: 't-chat', name: 'چت', x: 0.915, y: 0.09 },
  { id: 't-pause', name: 'منو', x: 0.972, y: 0.09 },
];
const DEF = Object.fromEntries(CONTROLS.map((c) => [c.id, { x: c.x, y: c.y, s: 1, o: 0.9, h: !!c.hidden }]));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function normalizeLayout(raw) {
  const fresh = !raw || raw._v !== LAYOUT_V, out = { _v: LAYOUT_V };
  for (const c of CONTROLS) {
    const d = DEF[c.id], v = !fresh && typeof raw[c.id] === 'object' && raw[c.id] ? raw[c.id] : {};
    const ok = Number.isFinite(v.x) && Number.isFinite(v.y);
    out[c.id] = { x: ok ? clamp(v.x, 0.02, 0.98) : d.x, y: ok ? clamp(v.y, 0.03, 0.97) : d.y, s: clamp(Number(v.s) || d.s, 0.6, 1.8), o: clamp(Number(v.o) || d.o, 0.2, 1), h: typeof v.h === 'boolean' ? v.h : d.h };
  }
  return out;
}

// Controls are placed as fractions of the SAFE area (so nothing hides under a notch or the home bar).
let probe = null;
export function safeArea() {
  if (!probe) { probe = document.createElement('div'); probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:var(--st,0px) var(--sr,0px) var(--sb,0px) var(--sl,0px)'; document.body.appendChild(probe); }
  const c = getComputedStyle(probe), l = parseFloat(c.paddingLeft) || 0, r = parseFloat(c.paddingRight) || 0, t = parseFloat(c.paddingTop) || 0, b = parseFloat(c.paddingBottom) || 0;
  return { x: l, y: t, w: Math.max(100, innerWidth - l - r), h: Math.max(100, innerHeight - t - b) };
}

export function applyLayout(layout, editing = false) {
  const A = safeArea();
  for (const c of CONTROLS) {
    const el = $(c.id); if (!el) continue; const v = layout[c.id];
    Object.assign(el.style, { left: (A.x + v.x * A.w) + 'px', top: (A.y + v.y * A.h) + 'px', right: 'auto', bottom: 'auto', transform: `translate(-50%,-50%) scale(${v.s})`, opacity: editing && v.h ? 0.35 : v.o });
    el.hidden = !editing && v.h; el.classList.toggle('ghost-hidden', editing && v.h);
  }
}

// ------------------------------------------------------------------ UI editor
export class TouchEditor {
  constructor({ getLayout, setLayout, onOpen, onClose }) {
    Object.assign(this, { getLayout, setLayout, onOpen, onClose });
    this.active = false; this.sel = null; this.draft = null; this.snap = true;
    this.bar = $('ui-editor'); this.drag = null;
    $('ue-size').addEventListener('input', (e) => this.patch({ s: +e.target.value }));
    $('ue-opacity').addEventListener('input', (e) => this.patch({ o: +e.target.value }));
    $('ue-hide').addEventListener('click', () => { if (this.sel) this.patch({ h: !this.draft[this.sel].h }); });
    $('ue-snap').addEventListener('click', () => { this.snap = !this.snap; this.syncBar(); });
    $('ue-reset').addEventListener('click', () => { this.draft = normalizeLayout({}); this.render(); });
    $('ue-cancel').addEventListener('click', () => this.close(false));
    $('ue-save').addEventListener('click', () => this.close(true));
    for (const c of CONTROLS) {
      const el = $(c.id); if (!el) continue;
      el.addEventListener('pointerdown', (e) => this.down(e, c.id), true);
    }
    addEventListener('pointermove', (e) => this.move(e), { passive: false });
    addEventListener('pointerup', () => { this.drag = null; });
    addEventListener('pointercancel', () => { this.drag = null; });
  }
  open() {
    this.active = true; this.draft = normalizeLayout(this.getLayout()); this.sel = 't-fire';
    $('touch').hidden = false; $('touch').classList.add('editing'); this.bar.hidden = false; document.body.classList.add('ui-editing');
    this.render(); this.onOpen && this.onOpen();
  }
  close(save) {
    if (!this.active) return; this.active = false; this.drag = null;
    if (save) this.setLayout(this.draft);
    $('touch').classList.remove('editing'); this.bar.hidden = true; document.body.classList.remove('ui-editing');
    for (const c of CONTROLS) $(c.id)?.classList.remove('ue-sel');
    applyLayout(normalizeLayout(this.getLayout())); this.onClose && this.onClose(save);
  }
  down(e, id) {
    if (!this.active) return; e.preventDefault(); e.stopPropagation();
    this.sel = id; const v = this.draft[id];
    this.drag = { id, px: e.clientX, py: e.clientY, x: v.x, y: v.y };
    try { e.target.setPointerCapture?.(e.pointerId); } catch {}
    this.render();
  }
  move(e) {
    if (!this.active || !this.drag) return; e.preventDefault();
    const d = this.drag, A = safeArea(); let x = d.x + (e.clientX - d.px) / A.w, y = d.y + (e.clientY - d.py) / A.h;
    if (this.snap) { x = Math.round(x * 80) / 80; y = Math.round(y * 50) / 50; }
    this.draft[d.id].x = clamp(x, 0.02, 0.98); this.draft[d.id].y = clamp(y, 0.03, 0.97); applyLayout(this.draft, true);
  }
  patch(p) { if (!this.sel) return; Object.assign(this.draft[this.sel], p); this.render(); }
  render() {
    applyLayout(this.draft, true);
    for (const c of CONTROLS) $(c.id)?.classList.toggle('ue-sel', c.id === this.sel);
    this.syncBar();
  }
  syncBar() {
    const c = CONTROLS.find((q) => q.id === this.sel), v = this.sel && this.draft[this.sel];
    $('ue-name').textContent = c ? c.name : 'یک دکمه را انتخاب کن';
    if (v) { $('ue-size').value = v.s; $('ue-opacity').value = v.o; $('ue-size-v').textContent = Math.round(v.s * 100) + '%'; $('ue-opacity-v').textContent = Math.round(v.o * 100) + '%'; $('ue-hide').textContent = v.h ? 'نمایش دکمه' : 'مخفی کردن'; }
    $('ue-snap').classList.toggle('on', this.snap);
  }
}

// ------------------------------------------------------------------ fullscreen gate
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
const canFullscreen = () => !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
const standalone = () => matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches || navigator.standalone;
export async function goFullscreen() {
  const d = document.documentElement;
  try { if (!fsEl()) await (d.requestFullscreen ? d.requestFullscreen({ navigationUI: 'hide' }) : d.webkitRequestFullscreen()); } catch {}
  try { await screen.orientation?.lock?.('landscape'); } catch {}
}
export function setupGate({ touch, onEnter }) {
  const gate = $('gate'); if (!gate) return;
  if (!touch || standalone()) { gate.remove(); onEnter && onEnter(); return; }
  gate.hidden = false; document.body.classList.add('gated');
  let entered = false;
  $('gate-btn').addEventListener('click', async () => {
    await goFullscreen(); gate.hidden = true; document.body.classList.remove('gated');
    if (!entered) { entered = true; onEnter && onEnter(); }
  });
  if (!canFullscreen()) $('gate-sub').textContent = 'برای تمام‌صفحهٔ کامل در iPhone، بازی را با Add to Home Screen نصب کن.';
  // Leaving fullscreen (back gesture, notification…) brings the single button back.
  const onFs = () => { if (entered && canFullscreen() && !fsEl()) { gate.hidden = false; document.body.classList.add('gated'); } };
  document.addEventListener('fullscreenchange', onFs); document.addEventListener('webkitfullscreenchange', onFs);
}
