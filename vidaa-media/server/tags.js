'use strict';
// Minimal built-in tag readers (used when ffprobe is not installed).
// Supports ID3v2.3/2.4 (MP3) and FLAC Vorbis comments, including embedded cover art.

const fs = require('fs');

function readBytes(fd, pos, len) {
  const buf = Buffer.alloc(len);
  const n = fs.readSync(fd, buf, 0, len, pos);
  return n < len ? buf.subarray(0, n) : buf;
}

function decodeText(enc, buf) {
  let s;
  if (enc === 0) s = buf.toString('latin1');
  else if (enc === 3) s = buf.toString('utf8');
  else if (enc === 1 || enc === 2) {
    let b = buf, le = enc === 1;
    if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) { le = true; b = b.subarray(2); }
    else if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) { le = false; b = b.subarray(2); }
    if (!le) { b = Buffer.from(b); b.swap16 && b.length % 2 === 0 && b.swap16(); }
    s = b.toString('utf16le');
  } else s = buf.toString('utf8');
  return s.replace(/\u0000+$/, '').split('\u0000')[0].trim();
}

const syncsafe = (b, o) => (b[o] << 21) | (b[o + 1] << 14) | (b[o + 2] << 7) | b[o + 3];

function readId3(file, wantPicture) {
  const fd = fs.openSync(file, 'r');
  try {
    const h = readBytes(fd, 0, 10);
    if (h.length < 10 || h.toString('latin1', 0, 3) !== 'ID3') return null;
    const ver = h[3];
    if (ver < 3) return null;
    const size = Math.min(syncsafe(h, 6), 16 * 1024 * 1024);
    const tag = readBytes(fd, 10, size);
    const out = {};
    let p = 0;
    if (h[5] & 0x40) { // extended header
      const ext = ver === 4 ? syncsafe(tag, 0) : tag.readUInt32BE(0) + 4;
      p += ext;
    }
    const map = { TIT2: 'title', TPE1: 'artist', TPE2: 'album_artist', TALB: 'album', TRCK: 'track', TPOS: 'disc', TYER: 'date', TDRC: 'date', TCON: 'genre', TLAN: 'language' };
    while (p + 10 <= tag.length) {
      const id = tag.toString('latin1', p, p + 4);
      if (!/^[A-Z0-9]{4}$/.test(id)) break;
      const fsz = ver === 4 ? syncsafe(tag, p + 4) : tag.readUInt32BE(p + 4);
      const body = tag.subarray(p + 10, p + 10 + fsz);
      p += 10 + fsz;
      if (map[id] && body.length > 1) out[map[id]] = decodeText(body[0], body.subarray(1));
      else if (id === 'APIC' && wantPicture && !out.picture && body.length > 4) {
        const enc = body[0];
        let i = 1;
        const mimeEnd = body.indexOf(0, i);
        const mime = body.toString('latin1', i, mimeEnd) || 'image/jpeg';
        i = mimeEnd + 2; // skip picture type
        if (enc === 1 || enc === 2) { while (i + 1 < body.length && !(body[i] === 0 && body[i + 1] === 0)) i += 2; i += 2; }
        else { while (i < body.length && body[i] !== 0) i++; i += 1; }
        out.picture = { mime: mime.includes('/') ? mime : 'image/' + mime.toLowerCase(), data: body.subarray(i) };
      }
    }
    if (out.genre) out.genre = out.genre.replace(/^\((\d+)\)$/, '').trim() || undefined;
    return out;
  } finally { fs.closeSync(fd); }
}

function readFlac(file, wantPicture) {
  const fd = fs.openSync(file, 'r');
  try {
    if (readBytes(fd, 0, 4).toString('latin1') !== 'fLaC') return null;
    const out = {};
    let pos = 4, last = false;
    while (!last) {
      const bh = readBytes(fd, pos, 4);
      if (bh.length < 4) break;
      last = (bh[0] & 0x80) !== 0;
      const type = bh[0] & 0x7f;
      const len = (bh[1] << 16) | (bh[2] << 8) | bh[3];
      pos += 4;
      if (type === 4) {
        const b = readBytes(fd, pos, len);
        let i = 0;
        const vlen = b.readUInt32LE(i); i += 4 + vlen;
        const count = b.readUInt32LE(i); i += 4;
        for (let c = 0; c < count && i < b.length; c++) {
          const l = b.readUInt32LE(i); i += 4;
          const kv = b.toString('utf8', i, i + l); i += l;
          const eq = kv.indexOf('=');
          if (eq > 0) {
            const k = kv.slice(0, eq).toLowerCase();
            const v = kv.slice(eq + 1);
            const key = { tracknumber: 'track', albumartist: 'album_artist', discnumber: 'disc' }[k] || k;
            if (!out[key]) out[key] = v;
          }
        }
      } else if (type === 6 && wantPicture && !out.picture) {
        const b = readBytes(fd, pos, len);
        let i = 4;
        const ml = b.readUInt32BE(i); i += 4;
        const mime = b.toString('latin1', i, i + ml); i += ml;
        const dl = b.readUInt32BE(i); i += 4 + dl + 16;
        const pl = b.readUInt32BE(i); i += 4;
        out.picture = { mime, data: b.subarray(i, i + pl) };
      }
      pos += len;
    }
    return out;
  } finally { fs.closeSync(fd); }
}

/** Returns {title, artist, album_artist, album, track, disc, date, genre, language, picture?} or null. */
function readTags(file, wantPicture = false) {
  try {
    const lower = file.toLowerCase();
    if (lower.endsWith('.mp3')) return readId3(file, wantPicture);
    if (lower.endsWith('.flac')) return readFlac(file, wantPicture);
  } catch (e) { /* unreadable tag - fall back to names */ }
  return null;
}

module.exports = { readTags };
