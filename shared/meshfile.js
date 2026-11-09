// Helpers for mesh-map files (cs-map-bin): single-file container, split parts for static hosting, a tiny store-only ZIP writer.
//
// Container ("self-contained .bin"):  <geometry data as written by map2json>  <manifest JSON>  <u32 json length, little endian>  'CSMB'
// The geometry offsets in the manifest are relative to the start of the file, so appending the manifest changes nothing else.
export const PART_SIZE = 20 * 1024 * 1024;   // Cloudflare static assets accept files up to 25 MiB

const MAGIC = [0x43, 0x53, 0x4d, 0x42];   // 'CSMB'
export function unpackContainer(ab) {      // ArrayBuffer -> manifest object, or null when the file has no embedded manifest
  const n = ab.byteLength; if (n < 16) return null; const u8 = new Uint8Array(ab, n - 8, 8);
  if (MAGIC.some((c, i) => u8[4 + i] !== c)) return null;
  const len = new DataView(ab, n - 8, 4).getUint32(0, true); if (!len || len > n - 8) return null;
  try { return JSON.parse(new TextDecoder().decode(new Uint8Array(ab, n - 8 - len, len))); } catch (e) { return null; }
}
export function packContainer(manifest, ab) {   // -> Uint8Array
  const j = new TextEncoder().encode(JSON.stringify(manifest)), out = new Uint8Array(ab.byteLength + j.length + 8);
  out.set(new Uint8Array(ab), 0); out.set(j, ab.byteLength); new DataView(out.buffer).setUint32(ab.byteLength + j.length, j.length, true); out.set(MAGIC, ab.byteLength + j.length + 4); return out;
}
// manifest for hosting: no colliders (only the baker needs them), and the number of .bin.<n> parts
export function slimManifest(manifest, bytes) { const m = { ...manifest }; delete m.colliders; m.bytes = bytes; m.parts = Math.max(1, Math.ceil(bytes / PART_SIZE)); return m; }

// store-only ZIP (no compression; the mesh is already dense)
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export function makeZip(entries) {   // [{ name, data: Uint8Array }] -> Uint8Array
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  for (const e of entries) {
    const name = enc.encode(e.name), crc = crc32(e.data), h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint32(14, crc, true); h.setUint32(18, e.data.length, true); h.setUint32(22, e.data.length, true); h.setUint16(26, name.length, true);
    parts.push(new Uint8Array(h.buffer), name, e.data);
    const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint32(16, crc, true); c.setUint32(20, e.data.length, true); c.setUint32(24, e.data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), name); off += 30 + name.length + e.data.length;
  }
  const cdLen = central.reduce((n, a) => n + a.length, 0), end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true); end.setUint32(12, cdLen, true); end.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)], out = new Uint8Array(all.reduce((n, a) => n + a.length, 0)); let o = 0; for (const a of all) { out.set(a, o); o += a.length; } return out;
}
