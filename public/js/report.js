// "Report a player" window (opened from the pause menu). Reports go to the admin panel; anti-cheat alerts arrive there automatically.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ERR = {
  LOGIN_REQUIRED: 'برای گزارش‌دادن باید وارد حساب کاربری شوی',
  TOO_MANY_REPORTS: 'در هر ساعت حداکثر ۵ گزارش می‌توانی بدهی',
  ALREADY_REPORTED: 'این بازیکن را همین چند دقیقهٔ پیش گزارش کرده‌ای',
  bad_target: 'بازیکن پیدا نشد (شاید از سرور رفته باشد)',
  not_in_room: 'برای گزارش باید داخل یک سرور باشی',
  disconnected: 'اتصال به سرور برقرار نیست',
};
export class ReportUI {
  constructor({ call, roster, meId, onClose }) {
    this.call = call; this.roster = roster; this.meId = meId; this.onClose = onClose || (() => {}); this.box = $('reportbox'); this.busy = false;
    $('rp-close').addEventListener('click', () => this.close());
    $('rp-go').addEventListener('click', () => this.send());
    this.box.addEventListener('click', (e) => { if (e.target === this.box) this.close(); });
  }
  open() {
    const me = this.meId(), list = (this.roster() || []).filter((p) => !p.bot && p.id !== me), sel = $('rp-target');
    sel.innerHTML = list.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}${p.pid ? ' · ID ' + esc(p.pid) : ''}${p.team === 'T' || p.team === 'CT' ? ' (' + p.team + ')' : ''}</option>`).join('');
    $('rp-note').value = ''; $('rp-msg').textContent = list.length ? '' : 'بازیکن انسانی دیگری در این سرور نیست'; $('rp-msg').className = 'au-msg'; $('rp-go').disabled = !list.length;
    this.box.hidden = false;
  }
  close() { this.box.hidden = true; this.onClose(); }
  async send() {
    if (this.busy) return; const msg = $('rp-msg'); this.busy = true; $('rp-go').disabled = true; msg.className = 'au-msg'; msg.textContent = '';
    let r; try { r = await this.call('report', { id: $('rp-target').value, reason: $('rp-reason').value, note: $('rp-note').value }); } finally { this.busy = false; $('rp-go').disabled = false; }
    if (r && r.ok) { msg.className = 'au-msg ok'; msg.textContent = 'گزارش ثبت شد؛ ممنون! ادمین‌ها بررسی می‌کنند'; setTimeout(() => this.close(), 1100); return; }
    msg.textContent = ERR[r && r.error] || 'ارسال گزارش ناموفق بود';
  }
}
