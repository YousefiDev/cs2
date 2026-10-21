// Voice chat client. Microphone -> 16 kHz frames (60 ms) -> ADPCM -> WebSocket -> server -> listeners -> jitter-buffered playback.
// The server decides who may hear whom (team / dead-talk / all / off) and drops frames from muted players.
import { encodeFrame, decodeFrame, toB64, fromB64, Framer, rms, VOICE_RATE } from './voicecodec.js';

const WORKLET = `class VCCap extends AudioWorkletProcessor { process(inputs) { const ch = inputs[0] && inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true; } } registerProcessor('vc-cap', VCCap);`;
const $ = (id) => document.getElementById(id);

export class VoiceChat {
  // send(event, data) -> network; settings = the shared settings object; nameOf(playerId) -> {pid, name} | null
  constructor({ send, settings, nameOf, onState, onError }) {
    this.send = send; this.settings = settings; this.nameOf = nameOf || (() => null); this.onState = onState; this.onError = onError;
    this.ctx = null; this.stream = null; this.opening = null; this.framer = null; this.spk = new Map();
    this.inRoom = false; this.tx = false; this.pressing = false; this.pttHeld = false; this.toggled = false; this.micMuted = false; this.testing = false;
    this.hang = 0; this.tail = 0; this.level = 0; this.seq = 0; this.prev = null; this.error = ''; this.sig = '';
    this.timer = setInterval(() => this.tick(), 120);
  }
  get enabled() { return this.settings.voiceOn !== false && !this.unavailable; }
  get mode() { return this.settings.voiceMode || 'ptt'; }

  // ---------- audio plumbing ----------
  getCtx() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    try { this.ctx = new AC({ sampleRate: VOICE_RATE, latencyHint: 'interactive' }); } catch { try { this.ctx = new AC(); } catch { return null; } }
    this.mst = this.ctx.createGain(); this.mst.connect(this.ctx.destination); this.applySettings();
    return this.ctx;
  }
  applySettings() {
    if (this.mst) this.mst.gain.value = Math.max(0, +this.settings.voiceVol >= 0 ? +this.settings.voiceVol : 1);
    if (this.micGain) this.micGain.gain.value = Math.max(0, +this.settings.voiceMic >= 0 ? +this.settings.voiceMic : 1);
    this.emit();
  }
  async openMic() {
    if (this.stream) return true;
    if (this.opening) return this.opening;
    this.opening = (async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { this.error = 'unsupported'; return false; }
      const ctx = this.getCtx(); if (!ctx) { this.error = 'unsupported'; return false; }
      try { await ctx.resume(); } catch {}
      const dev = this.settings.voiceDev;
      let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: dev ? { exact: dev } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } }); }
      catch (e) { this.error = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'denied' : 'unavailable'; return false; }
      this.stream = stream; this.error = '';
      this.framer = new Framer(ctx.sampleRate);
      const src = ctx.createMediaStreamSource(stream); this.micGain = ctx.createGain(); this.sink = ctx.createGain(); this.sink.gain.value = 0; this.sink.connect(ctx.destination);
      let node = null;
      if (ctx.audioWorklet) {
        try {
          if (!this.wl) { const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' })); try { await ctx.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); } this.wl = true; }
          node = new AudioWorkletNode(ctx, 'vc-cap', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 }); node.port.onmessage = (e) => this.feed(e.data);
        } catch { node = null; }
      }
      if (!node) { node = ctx.createScriptProcessor(2048, 1, 1); node.onaudioprocess = (e) => this.feed(e.inputBuffer.getChannelData(0)); }
      src.connect(this.micGain); this.micGain.connect(node); node.connect(this.sink); this.src = src; this.node = node; this.applySettings();
      stream.getAudioTracks().forEach((t) => { t.onended = () => this.closeMic(); });
      return true;
    })().finally(() => { this.opening = null; });
    return this.opening;
  }
  closeMic() {
    try { this.node && this.node.disconnect(); this.src && this.src.disconnect(); this.micGain && this.micGain.disconnect(); } catch {}
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = this.node = this.src = this.micGain = null; this.tx = false; this.level = 0; this.emit();
  }
  async devices() { try { return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput'); } catch { return []; } }

  // ---------- room lifecycle ----------
  setRoom(active, offline = false) {
    this.unavailable = !!offline; this.inRoom = !!active && !offline;
    if (!this.inRoom) { this.pressing = this.pttHeld = this.toggled = false; this.tx = false; for (const s of this.spk.values()) { try { s.g.disconnect(); } catch {} } this.spk.clear(); if (!this.testing) this.closeMic(); }
    this.emit();
  }

  // ---------- talking ----------
  // One entry point for the key / the mobile button: hold (ptt), switch (toggle) or mute-the-open-mic (open).
  async press() {
    if (!this.enabled || !this.inRoom) return; this.pressing = true;
    const ok = await this.openMic();
    if (!ok) { this.pressing = false; this.emit(); this.onError && this.onError(this.error); return; }
    if (this.mode === 'ptt') { if (this.pressing) this.pttHeld = true; } else if (this.mode === 'toggle') this.toggled = !this.toggled; else this.micMuted = !this.micMuted;
    this.emit();
  }
  release() { this.pressing = false; if (this.mode === 'ptt') { this.pttHeld = false; this.tail = performance.now() + 220; this.emit(); } }
  // Open-mic mode needs the permission before the first word: ask on the first click / key after joining.
  arm() {
    if (this.armed || !this.enabled) return; this.armed = true;
    const go = () => { removeEventListener('pointerdown', go, true); removeEventListener('keydown', go, true); this.armed = false; if (this.inRoom && this.mode === 'open') this.openMic().then(() => this.emit()); };
    addEventListener('pointerdown', go, true); addEventListener('keydown', go, true);
  }
  thr() { return Math.pow(10, (this.settings.voiceSens !== undefined ? +this.settings.voiceSens : -42) / 20); }
  feed(f32) { if (!this.framer) return; for (const fr of this.framer.push(f32)) this.onFrame16(fr); }
  onFrame16(fr) {
    const lvl = rms(fr); this.level = Math.max(lvl, this.level * 0.88);
    const now = performance.now(); let want = false;
    if (this.enabled && this.inRoom) {
      if (this.mode === 'ptt') want = this.pttHeld || now < this.tail;
      else if (this.mode === 'toggle') want = this.toggled;
      else if (!this.micMuted) { if (lvl > this.thr()) this.hang = now + 400; want = now < this.hang; }
    }
    if (want) { if (!this.tx) { this.tx = true; if (this.prev) this.sendFrame(this.prev); this.emit(); } this.sendFrame(fr); }
    else if (this.tx) { this.tx = false; this.emit(); }
    this.prev = fr;
  }
  sendFrame(fr) { this.seq = (this.seq + 1) & 0xffff; this.send('voice', { s: this.seq, d: toB64(encodeFrame(fr)) }); }

  // ---------- listening ----------
  keyOf(info) { return info ? (info.pid ? 'p' + info.pid : 'n' + String(info.name || '').toLowerCase()) : ''; }
  isMuted(info) { return !!(this.settings.voiceMuted && this.settings.voiceMuted[this.keyOf(info)]); }
  volFor(info) { const v = this.settings.voiceVols && this.settings.voiceVols[this.keyOf(info)]; return v === undefined ? 1 : +v; }
  onVoice(m) {
    if (!this.enabled || !m || typeof m.d !== 'string') return;
    const info = this.nameOf(m.f); if (this.isMuted(info)) return;
    let pcm; try { pcm = decodeFrame(fromB64(m.d)); } catch { return; }
    const ctx = this.getCtx(); if (!ctx) return; if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    let sp = this.spk.get(m.f); if (!sp) { const g = ctx.createGain(); g.connect(this.mst); sp = { g, next: 0, last: 0 }; this.spk.set(m.f, sp); }
    sp.g.gain.value = this.volFor(info);
    const buf = ctx.createBuffer(1, pcm.length, VOICE_RATE); buf.copyToChannel(pcm, 0);
    const src = ctx.createBufferSource(); src.buffer = buf; src.connect(sp.g);
    const t = ctx.currentTime; if (sp.next < t + 0.01 || sp.next > t + 0.7) sp.next = t + 0.1;     // (re)start with a 100 ms jitter buffer; skip ahead if we fell far behind
    src.start(sp.next); sp.next += buf.duration; sp.last = performance.now();
  }

  // ---------- UI state ----------
  uiState() {
    if (!this.enabled || !this.inRoom) return 'off';
    if (this.error === 'denied' || this.error === 'unavailable' || this.error === 'unsupported') return 'denied';
    if (this.tx) return 'tx';
    if (this.mode === 'open' && this.micMuted) return 'muted';
    if (this.mode === 'toggle' && this.toggled) return 'on';
    return 'idle';
  }
  emit() { this.onState && this.onState(this.uiState()); }
  tick() {
    const now = performance.now(), list = [];
    if (this.tx) list.push({ id: 'me', name: 'شما', me: true });
    for (const [id, s] of this.spk) if (now - s.last < 450) { const info = this.nameOf(id); list.push({ id, name: (info && info.name) || '…' }); }
    const sig = list.map((x) => x.id).join(',');
    if (sig !== this.sig) {
      this.sig = sig; const el = $('voicelist');
      if (el) el.innerHTML = list.map((x) => `<div class="vc-item${x.me ? ' me' : ''}"><i></i>${String(x.name).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))}</div>`).join('');
    }
  }
}
