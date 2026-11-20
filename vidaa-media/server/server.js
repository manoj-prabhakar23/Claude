#!/usr/bin/env node
'use strict';
// VIDAA Media - home media server + TV web app.
// Run on the PC / laptop / Raspberry Pi / NAS where your drive or USB stick is plugged in,
// then open http://<this-computer-ip>:8080 on the Hisense TV.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const url = require('url');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const { Library } = require('./scanner');
const { readTags } = require('./tags');

// ---------- configuration ----------
const args = process.argv.slice(2);
const argVal = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const APP_DIR = path.resolve(__dirname, '..');
const cfgPath = argVal('--config') || (fs.existsSync(path.join(APP_DIR, 'config.json')) ? path.join(APP_DIR, 'config.json') : null);
const fileCfg = cfgPath ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : {};
const cliRoots = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const cfg = Object.assign({ port: 8080, roots: [], autoUsb: true, rescanMinutes: 30, ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', cacheDir: path.join(APP_DIR, 'cache'), dataDir: path.join(APP_DIR, 'data') }, fileCfg);
if (cliRoots.length) cfg.roots = cliRoots;
if (argVal('--port')) cfg.port = Number(argVal('--port'));
if (args.includes('--no-usb')) cfg.autoUsb = false;
cfg.cacheDir = path.resolve(cfgPath ? path.dirname(cfgPath) : APP_DIR, cfg.cacheDir);
cfg.dataDir = path.resolve(cfgPath ? path.dirname(cfgPath) : APP_DIR, cfg.dataDir);
for (const d of [cfg.cacheDir, cfg.dataDir, path.join(cfg.cacheDir, 'img'), path.join(cfg.cacheDir, 'subs')]) fs.mkdirSync(d, { recursive: true });

const WEB_DIR = path.join(APP_DIR, 'web');
const lib = new Library({ cacheDir: cfg.cacheDir, ffprobe: cfg.ffprobe });
let ffmpegOk = false;
execFile(cfg.ffmpeg, ['-version'], { timeout: 5000 }, (err) => { ffmpegOk = !err; });

// ---------- USB / removable drive detection ----------
function listDirs(p) { try { return fs.readdirSync(p, { withFileTypes: true }).filter((e) => e.isDirectory() || e.isSymbolicLink()).map((e) => path.join(p, e.name)); } catch (e) { return []; } }

function detectUsbDrives() {
  const found = [];
  if (process.platform === 'win32') {
    const sys = (process.env.SystemDrive || 'C:').toUpperCase()[0];
    for (let c = 68; c <= 90; c++) { // D: .. Z:
      const L = String.fromCharCode(c);
      if (L === sys) continue;
      const p = L + ':\\';
      try { fs.readdirSync(p); found.push({ path: p, label: 'Drive ' + L, usb: true }); } catch (e) { /* not present */ }
    }
  } else if (process.platform === 'darwin') {
    const rootReal = fs.realpathSync("/");
    for (const v of listDirs('/Volumes')) {
      try { if (fs.realpathSync(v) === rootReal) continue; } catch (e) { continue; }
      found.push({ path: v, label: path.basename(v), usb: true });
    }
  } else {
    const user = os.userInfo().username;
    const bases = ['/media/' + user, '/run/media/' + user, '/media', '/mnt'];
    const seen = new Set();
    for (const b of bases) for (const d of listDirs(b)) {
      if (seen.has(d) || bases.includes(d)) continue;
      // only real mounts (device differs from parent) so empty mount points are skipped
      try { if (fs.statSync(d).dev === fs.statSync(path.dirname(d)).dev) continue; } catch (e) { continue; }
      seen.add(d);
      found.push({ path: d, label: path.basename(d), usb: true });
    }
  }
  return found;
}

function currentRoots() {
  const roots = cfg.roots.map((r) => (typeof r === 'string' ? { path: r } : r));
  if (cfg.autoUsb) {
    const configured = new Set(roots.map((r) => path.resolve(r.path)));
    for (const u of detectUsbDrives()) if (![...configured].some((c) => c === path.resolve(u.path) || c.startsWith(path.resolve(u.path) + path.sep))) roots.push(u);
  }
  return roots;
}

let lastRootKey = '';
async function rescan(reason) {
  const roots = currentRoots();
  lastRootKey = roots.map((r) => r.path).sort().join('|');
  console.log(`[scan] ${reason}: ${roots.map((r) => r.path).join(', ') || '(no folders configured)'}`);
  const t0 = Date.now();
  const s = await lib.scan(roots);
  console.log(`[scan] done in ${((Date.now() - t0) / 1000).toFixed(1)}s - ${s.movies} movies, ${s.shows} shows (${s.episodes} episodes), ${s.albums} albums (${s.tracks} tracks)`);
}
// Watch for USB drives being plugged in / removed.
setInterval(() => {
  if (lib.scanning) return;
  const key = currentRoots().map((r) => r.path).sort().join('|');
  if (key !== lastRootKey) rescan('drives changed').catch(console.error);
}, 10000);
if (cfg.rescanMinutes > 0) setInterval(() => { if (!lib.scanning) rescan('scheduled').catch(console.error); }, cfg.rescanMinutes * 60000);

// ---------- persistent state (resume positions) ----------
const statePath = path.join(cfg.dataDir, 'state.json');
let state = { progress: {} };
try { state = Object.assign(state, JSON.parse(fs.readFileSync(statePath, 'utf8'))); } catch (e) { /* first run */ }
let saveTimer = null;
function saveState() { clearTimeout(saveTimer); saveTimer = setTimeout(() => fs.writeFile(statePath, JSON.stringify(state), () => {}), 1000); }

// ---------- helpers ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska', '.webm': 'video/webm', '.avi': 'video/x-msvideo', '.ts': 'video/mp2t', '.m2ts': 'video/mp2t', '.mts': 'video/mp2t', '.wmv': 'video/x-ms-wmv', '.mpg': 'video/mpeg', '.mpeg': 'video/mpeg', '.flv': 'video/x-flv', '.3gp': 'video/3gpp', '.vob': 'video/mpeg',
  '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg', '.wav': 'audio/wav', '.wma': 'audio/x-ms-wma', '.aiff': 'audio/aiff', '.aif': 'audio/aiff' };

function send(res, code, body, type, extra) {
  res.writeHead(code, Object.assign({ 'Content-Type': type || 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' }, extra || {}));
  res.end(body);
}
const json = (res, obj, code) => send(res, code || 200, JSON.stringify(obj), 'application/json; charset=utf-8', { 'Cache-Control': 'no-store' });

function serveFile(req, res, file, type, cache) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found');
    const headers = { 'Content-Type': type || MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*', 'Cache-Control': cache || 'no-cache' };
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      let start = m && m[1] ? parseInt(m[1], 10) : 0;
      let end = m && m[2] ? parseInt(m[2], 10) : st.size - 1;
      if (m && !m[1] && m[2]) { start = Math.max(0, st.size - parseInt(m[2], 10)); end = st.size - 1; }
      if (start >= st.size || end >= st.size || start > end) return send(res, 416, '', null, { 'Content-Range': `bytes */${st.size}` });
      res.writeHead(206, Object.assign(headers, { 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 }));
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res);
    } else {
      res.writeHead(200, Object.assign(headers, { 'Content-Length': st.size }));
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
    }
  });
}

function readBody(req) {
  return new Promise((resolve) => { let b = ''; req.on('data', (c) => { b += c; if (b.length > 1e5) req.destroy(); }); req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch (e) { resolve({}); } }); });
}

// Placeholder artwork: a colored tile with the title's initials.
function placeholderSvg(title, kind) {
  const h = parseInt(crypto.createHash('md5').update(title || '?').digest('hex').slice(0, 6), 16);
  const hue = h % 360;
  const words = String(title || '?').replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  const initials = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '?').slice(0, 2)).toUpperCase();
  const [w, hgt] = kind === 'album' || kind === 'folder' ? [400, 400] : [400, 600];
  const icon = kind === 'folder'
    ? `<path d="M110 150h70l25 25h85a15 15 0 0 1 15 15v120a15 15 0 0 1-15 15H110a15 15 0 0 1-15-15V165a15 15 0 0 1 15-15z" fill="rgba(255,255,255,.85)"/>`
    : `<text x="50%" y="${kind === 'album' ? 58 : 54}%" font-family="Arial,Helvetica,sans-serif" font-size="${kind === 'album' ? 130 : 150}" font-weight="700" fill="rgba(255,255,255,.92)" text-anchor="middle" dominant-baseline="middle">${initials.replace(/[<&>]/g, '')}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hgt}" viewBox="0 0 ${w} ${hgt}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},55%,42%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},60%,18%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/>${icon}</svg>`;
}

// ffmpeg jobs (thumbnails / cover extraction), max 2 at once, de-duplicated.
const jobs = new Map();
let running = 0;
const queue = [];
function ffmpegJob(key, argsList, outFile) {
  if (fs.existsSync(outFile)) return Promise.resolve(true);
  if (jobs.has(key)) return jobs.get(key);
  const p = new Promise((resolve) => {
    const run = () => {
      running++;
      const tmp = outFile + '.tmp.jpg';
      execFile(cfg.ffmpeg, [...argsList, '-y', tmp], { timeout: 30000 }, (err) => {
        running--;
        if (!err && fs.existsSync(tmp) && fs.statSync(tmp).size > 0) { fs.renameSync(tmp, outFile); resolve(true); }
        else { try { fs.unlinkSync(tmp); } catch (e) { /* ignore */ } fs.writeFileSync(outFile + '.fail', ''); resolve(false); }
        jobs.delete(key);
        if (queue.length) queue.shift()();
      });
    };
    if (fs.existsSync(outFile + '.fail')) return resolve(false);
    if (running < 2) run(); else queue.push(run);
  });
  jobs.set(key, p);
  return p;
}

async function videoFrame(item, size) {
  if (!ffmpegOk) return null;
  const out = path.join(cfg.cacheDir, 'img', `${item.id}-${size}.jpg`);
  const t = item.duration ? Math.max(5, Math.round(item.duration * 0.2)) : 60;
  const w = size === 'large' ? 1280 : 480;
  const ok = await ffmpegJob(out, ['-v', 'error', '-ss', String(t), '-i', item.path, '-frames:v', '1', '-vf', `scale=${w}:-2`, '-q:v', '4'], out);
  return ok ? out : null;
}

async function albumCover(album) {
  if (album.poster) return album.poster;
  const out = path.join(cfg.cacheDir, 'img', `${album.id}-cover.jpg`);
  if (fs.existsSync(out)) return out;
  if (fs.existsSync(out + '.fail')) return null;
  for (const tid of album.tracks.slice(0, 5)) {
    const t = lib.items.get(tid);
    const tags = readTags(t.path, true);
    if (tags && tags.picture && tags.picture.data.length > 100) { fs.writeFileSync(out, tags.picture.data); return out; }
  }
  if (ffmpegOk) {
    const t = album.tracks.map((id) => lib.items.get(id)).find((x) => x.hasCover !== false) || lib.items.get(album.tracks[0]);
    if (await ffmpegJob(out, ['-v', 'error', '-i', t.path, '-an', '-frames:v', '1', '-vf', 'scale=500:-2', '-q:v', '3'], out)) return out;
  }
  fs.writeFileSync(out + '.fail', '');
  return null;
}

async function serveImage(req, res, id, variant) {
  const sendPh = (title, kind) => send(res, 200, placeholderSvg(title, kind), 'image/svg+xml', { 'Cache-Control': 'max-age=300' });
  const imgCache = 'max-age=86400';
  const it = lib.items.get(id) || lib.shows.find((s) => s.id === id) || lib.albums.find((a) => a.id === id) || lib.folders.get(id);
  if (!it) return sendPh('?', 'movie');
  if (lib.folders.get(id)) {
    const f = lib.folders.get(id);
    return sendPh(f.name, 'folder');
  }
  if (it.kind === 'album' || it.kind === 'track') {
    const album = it.kind === 'album' ? it : lib.albums.find((a) => a.id === it.albumId);
    const c = album && await albumCover(album);
    return c ? serveFile(req, res, c, null, imgCache) : sendPh(album ? album.title : it.title, 'album');
  }
  if (it.kind === 'show') {
    if (it.poster) return serveFile(req, res, it.poster, null, imgCache);
    const ep = lib.items.get(it.episodes[0]);
    const f = ep && await videoFrame(ep, 'small');
    return f ? serveFile(req, res, f, null, imgCache) : sendPh(it.title, 'movie');
  }
  if (it.kind === 'movie' || it.kind === 'episode') {
    if (variant === 'backdrop') {
      if (it.backdrop) return serveFile(req, res, it.backdrop, null, imgCache);
      const f = await videoFrame(it, 'large');
      return f ? serveFile(req, res, f, null, imgCache) : send(res, 404, '');
    }
    if (it.poster) return serveFile(req, res, it.poster, null, imgCache);
    const f = await videoFrame(it, 'small');
    return f ? serveFile(req, res, f, null, imgCache) : sendPh(it.title, 'movie');
  }
  sendPh(it.title || '?', 'movie');
}

// ---------- subtitles -> WebVTT ----------
function toSeconds(ts) { const m = ts.replace(',', '.').split(':'); return Number(m[0]) * 3600 + Number(m[1]) * 60 + Number(m[2]); }
function fmtTs(s) { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = (s % 60).toFixed(3); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${sec.padStart(6, '0')}`; }
function srtToVtt(text, offset) {
  const body = text.replace(/^﻿/, '').replace(/\r/g, '').replace(/^WEBVTT[^\n]*\n/, '');
  const out = ['WEBVTT', ''];
  for (const block of body.split(/\n{2,}/)) {
    const lines = block.split('\n').filter((l, i) => !(i === 0 && /^\d+$/.test(l.trim())));
    const ti = lines.findIndex((l) => l.includes('-->'));
    if (ti < 0) continue;
    const m = lines[ti].match(/(\d{1,2}:\d{2}:\d{2}[.,]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[.,]\d{1,3})/) || lines[ti].match(/((?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{1,3})/);
    if (!m) continue;
    const fix = (t) => (t.split(':').length === 2 ? '00:' + t : t);
    const a = toSeconds(fix(m[1])) - offset, b = toSeconds(fix(m[2])) - offset;
    if (b <= 0) continue;
    out.push(`${fmtTs(Math.max(0, a))} --> ${fmtTs(b)}`, ...lines.slice(ti + 1).map((l) => l.replace(/\{\\[^}]*\}/g, '')), '');
  }
  return out.join('\n');
}
function readTextAuto(file) {
  const buf = fs.readFileSync(file);
  const utf = buf.toString('utf8');
  return utf.includes('�') ? buf.toString('latin1') : utf;
}

async function serveSubtitle(req, res, sid, offset) {
  const vtt = (text) => send(res, 200, srtToVtt(text, offset), 'text/vtt; charset=utf-8', { 'Cache-Control': 'no-cache' });
  const item = lib.items.get(sid);
  if (item && item.kind === 'subtitle') return vtt(readTextAuto(item.path));
  const m = /^([0-9a-f]{16})-(\d+)$/.exec(sid);
  const video = m && lib.items.get(m[1]);
  if (!video || !ffmpegOk) return send(res, 404, 'No subtitle');
  const out = path.join(cfg.cacheDir, 'subs', `${sid}.vtt`);
  if (!fs.existsSync(out)) {
    await new Promise((resolve) => execFile(cfg.ffmpeg, ['-v', 'error', '-i', video.path, '-map', `0:s:${m[2]}`, '-f', 'webvtt', '-y', out], { timeout: 120000 }, resolve));
  }
  if (!fs.existsSync(out)) return send(res, 404, 'Subtitle extraction failed');
  vtt(fs.readFileSync(out, 'utf8'));
}

// ---------- on-the-fly remux (MKV/AVI/... -> fragmented MP4 the TV browser can play) ----------
function serveRemux(req, res, item, t, audioIndex) {
  if (!ffmpegOk) return send(res, 501, 'ffmpeg is not installed on the server');
  const copyVideo = ['h264', 'hevc'].includes(item.vcodec);
  const a = [];
  if (t > 0) a.push('-ss', String(t));
  a.push('-v', 'error', '-i', item.path, '-map', '0:v:0?', '-map', `0:a:${audioIndex || 0}?`, '-sn', '-dn');
  if (copyVideo) a.push('-c:v', 'copy'); else a.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p');
  if (item.vcodec === 'hevc') a.push('-tag:v', 'hvc1');
  a.push('-c:a', 'aac', '-ac', '2', '-b:a', '192k', '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', 'pipe:1');
  const ff = spawn(cfg.ffmpeg, a, { stdio: ['ignore', 'pipe', 'pipe'] });
  res.writeHead(200, { 'Content-Type': 'video/mp4', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
  ff.stdout.pipe(res);
  ff.stderr.on('data', (d) => process.env.DEBUG && process.stderr.write(d));
  const kill = () => { try { ff.kill('SIGKILL'); } catch (e) { /* gone */ } };
  req.on('close', kill);
  res.on('close', kill);
  ff.on('close', () => res.end());
}

// ---------- API payloads ----------
const pickLangs = (x) => x.langs || [];
function libraryPayload() {
  const langCount = {};
  const bump = (ls, k) => { for (const l of ls) { langCount[l] = langCount[l] || { movies: 0, shows: 0, albums: 0 }; langCount[l][k]++; } };
  const movies = lib.movies.map((m) => { bump(m.langs, 'movies'); return { id: m.id, title: m.title, year: m.year, langs: m.langs, genre: m.genre, plot: m.plot, res: m.res, duration: m.duration, added: m.added, direct: m.direct, audio: m.audio.map((x) => ({ index: x.index, lang: x.lang, codec: x.codec, channels: x.channels, title: x.title })), subs: m.subs, folderId: m.folderId, root: m.root, hasBackdrop: !!m.backdrop || ffmpegOk }; });
  const shows = lib.shows.map((s) => { bump(s.langs, 'shows'); return { id: s.id, title: s.title, langs: s.langs, added: s.added, episodes: s.episodes.map((id) => { const e = lib.items.get(id); return { id, season: e.season, episode: e.episode, title: e.title, duration: e.duration, res: e.res, direct: e.direct, langs: e.langs, audio: e.audio.map((x) => ({ index: x.index, lang: x.lang, codec: x.codec })), subs: e.subs }; }) }; });
  const albums = lib.albums.map((a) => { bump(a.langs, 'albums'); return { id: a.id, title: a.title, artist: a.artist, year: a.year, genre: a.genre, langs: a.langs, added: a.added, tracks: a.tracks.map((id) => { const t = lib.items.get(id); return { id, title: t.title, artist: t.artist, track: t.track, disc: t.disc, duration: t.duration }; }) }; });
  const languages = Object.keys(langCount).sort((a, b) => (langCount[b].movies + langCount[b].shows + langCount[b].albums) - (langCount[a].movies + langCount[a].shows + langCount[a].albums)).map((name) => Object.assign({ name }, langCount[name]));
  return { version: lib.scannedAt, scanning: lib.scanning, movies, shows, albums, languages, roots: lib.summary().roots, ffmpeg: ffmpegOk };
}

function folderPayload(id) {
  if (!id) {
    const roots = [...lib.folders.values()].filter((f) => f.root && f.count > 0);
    return { id: null, name: 'All drives', parentId: null, dirs: roots.map((f) => ({ id: f.id, name: f.name, count: f.count })), files: [] };
  }
  const f = lib.folders.get(id);
  if (!f) return null;
  return {
    id: f.id, name: f.name, parentId: f.root ? null : f.parentId, path: f.path,
    dirs: f.dirs.map((d) => { const x = lib.folders.get(d); return { id: x.id, name: x.name, count: x.count }; }),
    files: f.files.map((fid) => { const x = lib.items.get(fid); return { id: x.id, kind: x.kind, title: x.kind === 'episode' ? `S${x.season}E${x.episode} ${x.title}` : x.title, year: x.year, langs: x.langs, res: x.res, duration: x.duration, albumId: x.albumId, showId: x.showId, name: path.basename(x.path) }; }),
  };
}

function csvCell(v) { const s = v == null ? '' : Array.isArray(v) ? v.join(', ') : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function catalogCsv(rootLabel) {
  const head = ['root', 'path', 'type', 'title', 'year', 'language', 'genre', 'show', 'season', 'episode', 'album', 'artist', 'track', 'has_poster', 'plot'];
  const rows = [head.join(',')];
  for (const it of lib.items.values()) {
    if (!['movie', 'episode', 'track'].includes(it.kind)) continue;
    if (rootLabel && it.root !== rootLabel) continue;
    const show = it.kind === 'episode' ? lib.shows.find((s) => s.id === it.showId) : null;
    const album = it.kind === 'track' ? lib.albums.find((a) => a.id === it.albumId) : null;
    rows.push([it.root, it.rel.replace(/\\/g, '/'), it.kind, it.title, it.year || (album && album.year) || '', it.langs, it.genre || (album && album.genre) || '', show ? show.title : '', it.season || '', it.episode || '', album ? album.title : '', it.artist || '', it.track || '', it.kind === 'track' ? (album && album.poster ? 'yes' : '') : (it.poster ? 'yes' : 'no'), it.plot || ''].map(csvCell).join(','));
  }
  return rows.join('\r\n') + '\r\n';
}

// ---------- router ----------
const server = http.createServer(async (req, res) => {
  const u = url.parse(req.url, true);
  const p = decodeURIComponent(u.pathname);
  try {
    if (req.method === 'OPTIONS') return send(res, 204, '', null, { 'Access-Control-Allow-Methods': 'GET,POST', 'Access-Control-Allow-Headers': 'Content-Type' });
    if (p === '/api/library') return json(res, libraryPayload());
    if (p === '/api/status') return json(res, { scanning: lib.scanning, filesScanned: lib.scanProgress.files, version: lib.scannedAt, ffmpeg: ffmpegOk, ffprobe: lib.prober.available, summary: lib.summary() });
    if (p === '/api/folder') { const f = folderPayload(u.query.id); return f ? json(res, f) : json(res, { error: 'not found' }, 404); }
    if (p === '/api/state') return json(res, state);
    if (p === '/api/progress' && req.method === 'POST') {
      const b = await readBody(req);
      if (b.id && lib.items.has(b.id)) {
        if (b.done || (b.dur && b.pos > b.dur * 0.94)) delete state.progress[b.id];
        else if (b.pos > 30) state.progress[b.id] = { pos: Math.round(b.pos), dur: Math.round(b.dur || 0), at: Date.now() };
        saveState();
      }
      return json(res, { ok: true });
    }
    if (p === '/api/rescan' && req.method === 'POST') { rescan('requested from TV').catch(console.error); return json(res, { ok: true }); }
    if (p === '/api/catalog.csv') return send(res, 200, '﻿' + catalogCsv(u.query.root), 'text/csv; charset=utf-8', { 'Content-Disposition': 'attachment; filename="catalog.csv"' });

    let m;
    if ((m = /^\/media\/([0-9a-f]{16})/.exec(p))) {
      const it = lib.items.get(m[1]);
      if (!it || it.kind === 'subtitle') return send(res, 404, 'Not found');
      return serveFile(req, res, it.path);
    }
    if ((m = /^\/remux\/([0-9a-f]{16})/.exec(p))) {
      const it = lib.items.get(m[1]);
      if (!it || !(it.kind === 'movie' || it.kind === 'episode')) return send(res, 404, 'Not found');
      return serveRemux(req, res, it, Math.max(0, Number(u.query.t) || 0), Math.max(0, parseInt(u.query.a, 10) || 0));
    }
    if ((m = /^\/img\/([0-9a-f]{16})/.exec(p))) return serveImage(req, res, m[1], u.query.v);
    if ((m = /^\/sub\/([0-9a-f]{16}(?:-\d+)?)/.exec(p))) return serveSubtitle(req, res, m[1], Number(u.query.offset) || 0);

    // static web app
    const rel = p === '/' ? 'index.html' : p.replace(/^\/+/, '');
    const file = path.normalize(path.join(WEB_DIR, rel));
    if (!file.startsWith(WEB_DIR)) return send(res, 403, 'Forbidden');
    return serveFile(req, res, file, null, 'no-cache');
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, 'Server error');
  }
});

server.listen(cfg.port, '0.0.0.0', () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log('\n  VIDAA Media server is running.');
  console.log('  On your Hisense TV, open the browser and go to:');
  for (const ip of ips) console.log(`     http://${ip}:${cfg.port}`);
  if (!ips.length) console.log(`     http://localhost:${cfg.port}`);
  console.log('');
  rescan('startup').catch(console.error);
});
