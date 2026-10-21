// Voice codec: 16 kHz mono IMA-ADPCM (4 bits / sample = 64 kbit/s). Every frame carries its own predictor + step index,
// so a lost or late frame never damages the next one. Pure functions (no DOM), used by voice.js.
export const VOICE_RATE = 16000;
export const FRAME = 960;                       // 60 ms per frame
const STEP = [7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767];
const IDX = [-1, -1, -1, -1, 2, 4, 6, 8];
const clamp16 = (v) => (v > 32767 ? 32767 : v < -32768 ? -32768 : v);

// Float32 [-1,1] -> bytes: [pred lo, pred hi, index, count lo, count hi, nibbles...]
export function encodeFrame(f32) {
  const n = f32.length, out = new Uint8Array(5 + (n >> 1) + 1);
  let pred = clamp16(Math.round(f32[0] * 32767)), index = 0;
  out[0] = pred & 255; out[1] = (pred >> 8) & 255; out[2] = 0; out[3] = n & 255; out[4] = (n >> 8) & 255;
  let pos = 5, hi = false, cur = 0;
  for (let i = 1; i < n; i++) {
    const sample = clamp16(Math.round(f32[i] * 32767));
    let diff = sample - pred; const sign = diff < 0 ? 8 : 0; if (sign) diff = -diff;
    const step = STEP[index]; let delta = 0, tmp = step;
    if (diff >= tmp) { delta |= 4; diff -= tmp; } tmp >>= 1;
    if (diff >= tmp) { delta |= 2; diff -= tmp; } tmp >>= 1;
    if (diff >= tmp) delta |= 1;
    let vp = step >> 3; if (delta & 4) vp += step; if (delta & 2) vp += step >> 1; if (delta & 1) vp += step >> 2;
    pred = clamp16(sign ? pred - vp : pred + vp);
    index += IDX[delta]; if (index < 0) index = 0; else if (index > 88) index = 88;
    const nib = delta | sign;
    if (!hi) { cur = nib; hi = true; } else { out[pos++] = cur | (nib << 4); hi = false; }
  }
  if (hi) out[pos++] = cur;
  return out.subarray(0, pos);
}

export function decodeFrame(u8) {
  if (u8.length < 5) throw new Error('short frame');
  let pred = (u8[0] | (u8[1] << 8)) << 16 >> 16, index = Math.min(88, u8[2]);
  const n = u8[3] | (u8[4] << 8); if (n < 1 || n > 4096) throw new Error('bad frame length');
  const out = new Float32Array(n); out[0] = pred / 32768;
  let pos = 5, hi = false, cur = 0;
  for (let i = 1; i < n; i++) {
    let nib; if (!hi) { if (pos >= u8.length) { out.fill(0, i); break; } cur = u8[pos++]; nib = cur & 15; hi = true; } else { nib = cur >> 4; hi = false; }
    const step = STEP[index], delta = nib & 7; let vp = step >> 3; if (delta & 4) vp += step; if (delta & 2) vp += step >> 1; if (delta & 1) vp += step >> 2;
    pred = clamp16(nib & 8 ? pred - vp : pred + vp);
    index += IDX[delta]; if (index < 0) index = 0; else if (index > 88) index = 88;
    out[i] = pred / 32768;
  }
  return out;
}

export function toB64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
export function fromB64(str) { const s = atob(str), u8 = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i); return u8; }

// Linear resampler for devices that do not give us 16 kHz. push() returns complete FRAME-sized chunks.
export class Framer {
  constructor(inRate, frame = FRAME) { this.ratio = inRate / VOICE_RATE; this.frame = frame; this.pos = 0; this.prev = 0; this.buf = new Float32Array(frame); this.n = 0; }
  push(inp) {
    const out = [];
    if (this.ratio === 1) { for (let i = 0; i < inp.length; i++) { this.buf[this.n++] = inp[i]; if (this.n === this.frame) { out.push(this.buf.slice(0)); this.n = 0; } } return out; }
    // pos = fractional read position in the input stream (relative to the start of this chunk; -1 = the carried sample)
    for (; this.pos < inp.length - 1 + 1e-9; this.pos += this.ratio) {
      const i = Math.floor(this.pos), f = this.pos - i, a = i < 0 ? this.prev : inp[i], b = inp[i + 1] === undefined ? a : inp[i + 1];
      this.buf[this.n++] = a + (b - a) * f;
      if (this.n === this.frame) { out.push(this.buf.slice(0)); this.n = 0; }
    }
    this.pos -= inp.length; this.prev = inp[inp.length - 1];
    return out;
  }
}
export const rms = (f) => { let s = 0; for (let i = 0; i < f.length; i++) s += f[i] * f[i]; return Math.sqrt(s / f.length); };
