// Account UI: username + password login, registration, nickname/password change and the account bar in the lobby.
// Every account gets a unique numeric player ID from the server. The login stays valid through a session token
// (kept in localStorage); the password itself is never stored in the browser.
const $ = (id) => document.getElementById(id);
const TOKEN_KEY = 'cs-token';

const ERR = {
  BAD_USERNAME: 'نام کاربری باید ۳ تا ۱۶ کاراکتر باشد (حرف، عدد و _ . -)',
  RESERVED_NAME: 'این نام کاربری مجاز نیست',
  BAD_PASSWORD: 'رمز عبور باید حداقل ۶ و حداکثر ۶۴ کاراکتر باشد',
  USERNAME_TAKEN: 'این نام کاربری قبلاً گرفته شده است',
  BAD_CREDENTIALS: 'نام کاربری یا رمز عبور اشتباه است',
  TOO_MANY_ATTEMPTS: 'تلاش بیش از حد؛ یک دقیقه صبر کن',
  BANNED: 'این حساب مسدود شده است',
  BAD_NICK: 'نام نمایشی نامعتبر است',
  disconnected: 'اتصال به سرور برقرار نیست',
  'Server error': 'خطای سرور؛ دوباره تلاش کن',
};
export const authError = (e) => ERR[e] || 'خطا؛ دوباره تلاش کن';

export class AuthUI {
  constructor({ call, onChange }) {
    this.call = call; this.onChange = onChange || (() => {});
    this.account = null; this.required = false; this.known = false; this.mode = 'login'; this.busy = false;
    try { this.token = localStorage.getItem(TOKEN_KEY) || ''; } catch { this.token = ''; }
    this.box = $('authbox');
    for (const b of document.querySelectorAll('#au-tabs button')) b.addEventListener('click', () => this.setMode(b.dataset.m));
    $('au-go').addEventListener('click', () => this.submit());
    $('au-close').addEventListener('click', () => this.close());
    for (const id of ['au-user', 'au-nick', 'au-pass', 'au-pass2', 'au-old']) $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') this.submit(); });
    $('acct-login').addEventListener('click', () => this.open('login'));
    $('acct-nick-btn').addEventListener('click', () => this.open('nick'));
    $('acct-pw-btn').addEventListener('click', () => this.open('password'));
    $('acct-out').addEventListener('click', () => this.logout());
    this.render();
  }

  setRequired(v) { this.required = !!v; this.known = true; this.render(); }
  setAccount(a) { this.account = a || null; this.render(); this.onChange(this.account); }

  async resume() {
    if (!this.token) return false;
    const r = await this.call('auth:resume', { token: this.token });
    if (r && r.ok) { this.setAccount(r.account); return true; }
    if (r && (r.error === 'BAD_TOKEN' || r.error === 'BANNED')) this.forget();       // a dead token: do not keep trying it
    this.setAccount(null); return false;
  }
  forget() { this.token = ''; try { localStorage.removeItem(TOKEN_KEY); } catch {} }
  async logout() {
    const t = this.token; this.forget(); if (t) await this.call('auth:logout', { token: t });
    this.setAccount(null);
  }

  // ---- modal ----
  open(mode = 'login') { this.setMode(mode); $('au-msg').textContent = ''; this.box.hidden = false; setTimeout(() => ($(mode === 'password' ? 'au-old' : mode === 'nick' ? 'au-nick' : 'au-user')).focus(), 30); }
  close() { this.box.hidden = true; for (const id of ['au-pass', 'au-pass2', 'au-old']) $(id).value = ''; }
  setMode(m) {
    this.mode = m;
    for (const b of document.querySelectorAll('#au-tabs button')) b.classList.toggle('on', b.dataset.m === m);
    $('au-tabs').hidden = m === 'nick' || m === 'password';
    const show = { user: m === 'login' || m === 'register', nick: m === 'register' || m === 'nick', pass: m === 'login' || m === 'register', pass2: m === 'register', old: m === 'password', newp: m === 'password' };
    for (const [k, v] of Object.entries(show)) { const row = document.querySelector(`[data-row="${k}"]`); if (row) row.hidden = !v; }
    $('au-title').textContent = { login: 'ورود به حساب', register: 'ساخت حساب جدید', nick: 'تغییر نام نمایشی', password: 'تغییر رمز عبور' }[m];
    $('au-go').textContent = { login: 'ورود', register: 'ثبت‌نام', nick: 'ذخیره', password: 'تغییر رمز' }[m];
    $('au-note').hidden = m !== 'register';
    if (m === 'nick' && this.account) $('au-nick').value = this.account.nick;
    $('au-pass').autocomplete = m === 'login' ? 'current-password' : 'new-password';
  }
  async submit() {
    if (this.busy) return; const m = this.mode, msg = $('au-msg'); msg.textContent = ''; msg.className = '';
    const user = $('au-user').value.trim(), pass = $('au-pass').value, nick = $('au-nick').value.trim();
    let ev, data;
    if (m === 'login') { if (!user || !pass) { msg.textContent = 'نام کاربری و رمز عبور را وارد کن'; return; } ev = 'auth:login'; data = { username: user, password: pass }; }
    else if (m === 'register') {
      if (!user || !pass) { msg.textContent = 'نام کاربری و رمز عبور را وارد کن'; return; }
      if (pass !== $('au-pass2').value) { msg.textContent = 'تکرار رمز عبور یکسان نیست'; return; }
      ev = 'auth:register'; data = { username: user, password: pass, nick: nick || user };
    } else if (m === 'nick') { if (!nick) { msg.textContent = 'یک نام وارد کن'; return; } ev = 'auth:nick'; data = { nick }; }
    else { const np = $('au-newpass').value; if (!$('au-old').value || !np) { msg.textContent = 'رمز فعلی و رمز جدید را وارد کن'; return; } ev = 'auth:password'; data = { old: $('au-old').value, password: np, token: this.token }; }
    this.busy = true; $('au-go').disabled = true;
    let r; try { r = await this.call(ev, data); } finally { this.busy = false; $('au-go').disabled = false; }
    if (!r || !r.ok) { msg.textContent = authError(r && r.error); return; }
    if (r.token) { this.token = r.token; try { localStorage.setItem(TOKEN_KEY, r.token); } catch {} }
    if (r.account) this.setAccount(r.account);
    if (m === 'password') { $('au-newpass').value = ''; msg.className = 'ok'; msg.textContent = 'رمز عبور تغییر کرد'; setTimeout(() => this.close(), 900); return; }
    this.close();
  }

  // ---- lobby account bar ----
  render() {
    const a = this.account;
    $('acct').hidden = !this.known && !a;
    $('acct-in').hidden = !a; $('acct-out-box').hidden = !!a;
    if (a) { $('acct-nick').textContent = a.nick; $('acct-id').textContent = `ID ${a.pid}`; $('acct-rank').textContent = a.rankTag || ''; $('acct-user').textContent = `@${a.username}`; }
    // a logged-in account has its own nickname, so the plain "player name" field is not needed
    const nameField = document.querySelector('label.field:has(#name)'); if (nameField) nameField.hidden = !!a || this.required;
    $('acct-hint').textContent = this.required ? 'برای ورود به سرورها باید وارد حساب کاربری شوی.' : 'ورود اختیاری است؛ با حساب، XP و رنک تو به نامت وابسته نمی‌ماند.';
  }
}
