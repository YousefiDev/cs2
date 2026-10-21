// Rebindable controls (keyboard + mouse buttons). settings.keys = { action: [primary, secondary] } holds only what the player changed.
// A "code" is KeyboardEvent.code ("KeyW", "Space", "ShiftLeft"...) or "Mouse0".."Mouse4" for mouse buttons.
export const GROUPS = [['move', 'حرکت'], ['weapon', 'سلاح'], ['comm', 'بازی و ارتباط']];
export const ACTIONS = [
  { id: 'forward', fa: 'حرکت به جلو', def: ['KeyW', ''], g: 'move' },
  { id: 'back', fa: 'حرکت به عقب', def: ['KeyS', ''], g: 'move' },
  { id: 'left', fa: 'حرکت به چپ', def: ['KeyA', ''], g: 'move' },
  { id: 'right', fa: 'حرکت به راست', def: ['KeyD', ''], g: 'move' },
  { id: 'jump', fa: 'پرش (در حالت تماشا: بازیکن بعدی)', def: ['Space', ''], g: 'move' },
  { id: 'crouch', fa: 'نشستن', def: ['KeyC', 'ControlLeft'], g: 'move' },
  { id: 'walk', fa: 'قدم آهسته (Walk)', def: ['ShiftLeft', ''], g: 'move' },
  { id: 'fire', fa: 'شلیک', def: ['Mouse0', ''], g: 'weapon' },
  { id: 'alt', fa: 'اسکوپ / ضربهٔ دوم چاقو / پرتاب نارنجک نرم', def: ['Mouse2', ''], g: 'weapon' },
  { id: 'reload', fa: 'ریلود', def: ['KeyR', ''], g: 'weapon' },
  { id: 'slot1', fa: 'سلاح اصلی', def: ['Digit1', ''], g: 'weapon' },
  { id: 'slot2', fa: 'پیستول', def: ['Digit2', ''], g: 'weapon' },
  { id: 'slot3', fa: 'چاقو', def: ['Digit3', ''], g: 'weapon' },
  { id: 'slot4', fa: 'نارنجک', def: ['Digit4', ''], g: 'weapon' },
  { id: 'slot5', fa: 'بمب (C4)', def: ['Digit5', ''], g: 'weapon' },
  { id: 'slot6', fa: 'زئوس', def: ['Digit6', ''], g: 'weapon' },
  { id: 'lastWeapon', fa: 'سلاح قبلی', def: ['KeyQ', ''], g: 'weapon' },
  { id: 'drop', fa: 'انداختن سلاح', def: ['KeyG', ''], g: 'weapon' },
  { id: 'use', fa: 'استفاده (کاشتن / خنثی‌کردن بمب)', def: ['KeyE', ''], g: 'comm' },
  { id: 'buy', fa: 'منوی خرید', def: ['KeyB', ''], g: 'comm' },
  { id: 'scoreboard', fa: 'جدول امتیاز (نگه‌دار)', def: ['Tab', ''], g: 'comm' },
  { id: 'voice', fa: 'حرف زدن (وویس چت)', def: ['KeyK', ''], g: 'comm' },
  { id: 'chatAll', fa: 'چت همگانی', def: ['KeyY', ''], g: 'comm' },
  { id: 'chatTeam', fa: 'چت تیمی', def: ['KeyU', ''], g: 'comm' },
  { id: 'spec', fa: 'تغییر دوربین تماشاگر (وقتی مرده‌ای)', def: ['KeyV', ''], g: 'comm' },
  { id: 'team', fa: 'انتخاب تیم', def: ['KeyM', ''], g: 'comm' },
  { id: 'voteYes', fa: 'رأی «بله»', def: ['F3', ''], g: 'comm' },
  { id: 'voteNo', fa: 'رأی «خیر»', def: ['F4', ''], g: 'comm' },
];
const DEF = Object.fromEntries(ACTIONS.map((a) => [a.id, a.def]));
// These can never be bound: they close menus / send chat / belong to the browser.
export const RESERVED = new Set(['Escape', 'Enter', 'NumpadEnter', 'Backspace', 'F5', 'F11', 'F12', 'MetaLeft', 'MetaRight', 'ContextMenu']);

const MOUSE = { Mouse0: 'کلیک چپ', Mouse1: 'کلیک وسط', Mouse2: 'کلیک راست', Mouse3: 'دکمهٔ کناری ۱', Mouse4: 'دکمهٔ کناری ۲' };
export function codeLabel(code) {
  if (!code) return '—';
  if (MOUSE[code]) return MOUSE[code];
  let m = /^Key([A-Z])$/.exec(code); if (m) return m[1];
  m = /^Digit(\d)$/.exec(code); if (m) return m[1];
  m = /^Numpad(\d)$/.exec(code); if (m) return 'Num ' + m[1];
  const names = { ShiftLeft: 'Shift چپ', ShiftRight: 'Shift راست', ControlLeft: 'Ctrl چپ', ControlRight: 'Ctrl راست', AltLeft: 'Alt چپ', AltRight: 'Alt راست', Space: 'Space', Tab: 'Tab', CapsLock: 'Caps Lock',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Insert: 'Insert', Delete: 'Delete', Home: 'Home', End: 'End', PageUp: 'Page Up', PageDown: 'Page Down' };
  return names[code] || code;
}

export class Keybinds {
  constructor(settings, save) { this.s = settings; this.save = save || (() => {}); this.rebuild(); }
  get(id) { const o = this.s.keys && this.s.keys[id], d = DEF[id] || ['', '']; return [(o ? o[0] : d[0]) || '', (o ? o[1] : d[1]) || '']; }
  rebuild() { this.map = {}; for (const a of ACTIONS) for (const c of this.get(a.id)) if (c) (this.map[c] ||= []).push(a.id); }
  actionsFor(code) { return this.map[code] || []; }
  isDown(id, keys) { const [a, b] = this.get(id); return !!((a && keys[a]) || (b && keys[b])); }
  // Binds `code` to slot idx (0 = primary, 1 = secondary). The code is taken away from any other action; returns what was cleared.
  assign(id, idx, code) {
    if (!DEF[id] || RESERVED.has(code)) return { ok: false, error: 'reserved' };
    const cleared = [];
    for (const a of ACTIONS) {
      const cur = this.get(a.id); let changed = false;
      for (let i = 0; i < 2; i++) if (cur[i] === code && !(a.id === id && i === idx)) { cur[i] = ''; changed = true; if (a.id !== id) cleared.push(a.id); }
      if (changed) (this.s.keys ||= {})[a.id] = cur;
    }
    const mine = this.get(id); mine[idx] = code; (this.s.keys ||= {})[id] = mine;
    this.save(); this.rebuild(); return { ok: true, cleared };
  }
  clear(id, idx) { const cur = this.get(id); cur[idx] = ''; (this.s.keys ||= {})[id] = cur; this.save(); this.rebuild(); }
  reset(id) { if (id) { if (this.s.keys) delete this.s.keys[id]; } else this.s.keys = {}; this.save(); this.rebuild(); }
  isDefault(id) { return !(this.s.keys && this.s.keys[id]) || this.get(id).join('|') === DEF[id].join('|'); }
}
