'use strict';
// Library scanner: walks media folders/USB drives, reads metadata, groups
// movies, TV shows and music albums, and resolves posters and languages.

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const lang = require('./lang');
const { readTags } = require('./tags');

const VIDEO_EXT = new Set(['.mp4', '.m4v', '.mkv', '.avi', '.mov', '.webm', '.ts', '.m2ts', '.mts', '.wmv', '.mpg', '.mpeg', '.flv', '.3gp', '.vob']);
const AUDIO_EXT = new Set(['.mp3', '.flac', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.wav', '.wma', '.alac', '.aiff', '.aif']);
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp'];
const SUB_EXT = new Set(['.srt', '.vtt']);
const SKIP_DIRS = new Set(['$recycle.bin', 'system volume information', 'node_modules', 'lost+found', '.trash', '.trashes', '.spotlight-v100', '.fseventsd', 'recycler', 'msdownld.tmp', 'windows', 'program files', 'program files (x86)', 'programdata', 'appdata']);
const GENERIC_DIRS = new Set(['movies', 'movie', 'films', 'film', 'videos', 'video', 'downloads', 'download', 'media', 'new', 'hd', '4k', 'uhd', 'collection', 'my movies', 'tv', 'tv shows', 'shows', 'series', 'music', 'songs', 'audio', 'mp3', 'usb', 'others', 'misc', 'dubbed', 'old', 'latest']);
const JUNK = new Set(('1080p 720p 480p 576p 360p 2160p 4k uhd hdr hdr10 bluray brrip bdrip bdremux remux webrip webdl web-dl hdtv dvdrip dvdscr dvd hdrip hdcam camrip predvd tsrip x264 x265 h264 h265 hevc avc xvid divx aac aac2 ac3 eac3 dts dd5 ddp5 ddp atmos truehd 10bit 8bit proper repack extended unrated remastered imax esub esubs untouched amzn yts yify rarbg psa galaxyrg').split(' '));
// Words that are junk only when written in capitals ("Movie DUAL AUDIO") - lowercase they may be part of a title.
const JUNK_CAPS = new Set('web dl blu ray dual multi audio org original line hq dd dv dolby vision sub subs cam ts tc pre nf hs zee5 sunnxt hotstar netflix'.split(' '));

const sha = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);
const isHidden = (n) => n.startsWith('.') || n.startsWith('._');

function exists(p) { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }

// ---------- names & titles ----------

function splitWords(name) {
  let s = name;
  if (!/\s/.test(s) || (s.match(/[._]/g) || []).length > 2) s = s.replace(/[._]+/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

/** "Vikram.2022.Tamil.1080p.WEB-DL.x264" -> {title:"Vikram", year:2022} */
function cleanTitle(raw) {
  let s = splitWords(raw);
  s = s.replace(/\[[^\]]*\]/g, ' ').replace(/\{[^}]*\}/g, ' ');
  const tokens = s.split(' ').filter(Boolean);
  const out = [];
  let year = null;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const bare = t.replace(/[()]/g, '');
    const low = bare.toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (/^(19[2-9]\d|20[0-4]\d)$/.test(bare) && i > 0) { year = Number(bare); break; }
    if (i > 0 && (JUNK.has(low) || /^\d{3,4}p$/.test(low) || /^(x|h)26[45]$/.test(low) || (JUNK_CAPS.has(low) && bare.length > 1 && bare === bare.toUpperCase()))) break;
    if (i > 0 && lang.fromName(bare).size && /^[A-Za-z]{4,}$/.test(bare) && !/^[a-z]/.test(bare[0])) {
      // a language word after the title ("Movie Tamil HDRip") ends the title
      if (i + 1 >= tokens.length || JUNK.has((tokens[i + 1] || '').toLowerCase()) || /^(19|20)\d\d$/.test(tokens[i + 1] || '') || lang.fromName(tokens[i + 1] || '').size) break;
    }
    if (t === '-' && i > 0) { if (out.length) break; continue; }
    out.push(bare);
  }
  let title = out.join(' ').replace(/\s+-\s*$/, '').replace(/[()]/g, '').trim();
  if (!title) title = raw;
  if (title === title.toLowerCase() || title === title.toUpperCase()) title = title.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
  return { title, year };
}

const EP_RE = /(?:^|[ ._\-\[])s(\d{1,2})[ ._-]?e(\d{1,3})|(?:^|[ ._\-\[])(\d{1,2})x(\d{2,3})(?:[ ._\-\]]|$)|(?:^|[ ._-])(?:episode|ep)[ ._-]?(\d{1,3})/i;

function parseEpisode(base) {
  const m = base.match(EP_RE);
  if (!m) return null;
  const season = Number(m[1] || m[3] || 1);
  const episode = Number(m[2] || m[4] || m[5]);
  const before = base.slice(0, m.index);
  const after = base.slice(m.index + m[0].length);
  const epTitle = cleanTitle(after.replace(/^[ ._-]+/, '')).title;
  return { season, episode, show: before.replace(/[ ._-]+$/, ''), epTitle: /^[a-z0-9 '&,!-]{2,}$/i.test(epTitle) && !/^\d+$/.test(epTitle) ? epTitle : '' };
}

// ---------- sidecar metadata: info.json, catalog.csv, .nfo ----------

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, '')); } catch (e) { return null; } }

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => { const o = {}; head.forEach((h, i) => { if (r[i] != null && r[i].trim() !== '') o[h] = r[i].trim(); }); return o; });
}

const normRel = (p) => p.replace(/\\/g, '/').replace(/^\.?\//, '').toLowerCase();

function loadCatalog(root) {
  const byPath = new Map(), byName = new Map();
  const add = (e) => {
    if (!e || !e.path) return;
    const k = normRel(e.path);
    byPath.set(k, e);
    const n = k.split('/').pop();
    byName.set(n, byName.has(n) ? null : e); // null = ambiguous
  };
  for (const f of ['catalog.csv', 'Catalog.csv']) { const p = path.join(root, f); if (exists(p)) { parseCsv(fs.readFileSync(p, 'utf8')).forEach(add); break; } }
  const j = readJson(path.join(root, 'catalog.json'));
  if (Array.isArray(j)) j.forEach(add); else if (j && Array.isArray(j.items)) j.items.forEach(add);
  return {
    size: byPath.size,
    get(rel) {
      const k = normRel(rel);
      if (byPath.has(k)) return byPath.get(k);
      // allow catalog entries that point at the movie's folder
      const dir = k.split('/').slice(0, -1).join('/');
      if (dir && byPath.has(dir)) return Object.assign({ _viaFolder: true }, byPath.get(dir));
      return byName.get(k.split('/').pop()) || null;
    },
  };
}

function readNfo(p) {
  try {
    const x = fs.readFileSync(p, 'utf8');
    const tag = (t) => { const m = x.match(new RegExp('<' + t + '>([\\s\\S]*?)</' + t + '>', 'i')); return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : undefined; };
    if (!/<(movie|tvshow|episodedetails)/i.test(x)) return null;
    return { title: tag('title'), year: tag('year'), plot: tag('plot') || tag('outline'), genre: tag('genre'), language: tag('language') };
  } catch (e) { return null; }
}

function langList(v) {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : String(v).split(/[,;/|+&]/);
  return arr.map(lang.normalize).filter(Boolean);
}

// ---------- ffprobe ----------

function makeProber(opts) {
  let available = null;
  const cacheFile = path.join(opts.cacheDir, 'probe-cache.json');
  let cache = readJson(cacheFile) || {};
  let dirty = false;
  function check() {
    if (available !== null) return Promise.resolve(available);
    return new Promise((res) => execFile(opts.ffprobe, ['-version'], { timeout: 5000 }, (err) => { available = !err; res(available); }));
  }
  function probe(file, st) {
    const key = file;
    const c = cache[key];
    if (c && c.size === st.size && c.mtime === st.mtimeMs) return Promise.resolve(c.data);
    return check().then((ok) => {
      if (!ok) return null;
      return new Promise((res) => {
        execFile(opts.ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { timeout: 30000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
          if (err) return res(null);
          let j; try { j = JSON.parse(stdout); } catch (e) { return res(null); }
          const data = summarizeProbe(j);
          cache[key] = { size: st.size, mtime: st.mtimeMs, data };
          dirty = true;
          res(data);
        });
      });
    });
  }
  function save() { if (dirty) { try { fs.writeFileSync(cacheFile, JSON.stringify(cache)); dirty = false; } catch (e) { /* ignore */ } } }
  return { probe, save, check, get available() { return available; } };
}

function lowerKeys(o) { const r = {}; for (const k in o || {}) r[k.toLowerCase()] = o[k]; return r; }

function summarizeProbe(j) {
  const streams = j.streams || [];
  const fmt = j.format || {};
  const v = streams.find((s) => s.codec_type === 'video' && !(s.disposition && s.disposition.attached_pic));
  const audio = streams.filter((s) => s.codec_type === 'audio').map((s, i) => {
    const t = lowerKeys(s.tags);
    return { index: i, codec: s.codec_name, channels: s.channels, lang: lang.normalize(t.language), title: t.title || '' };
  });
  const subs = streams.filter((s) => s.codec_type === 'subtitle').map((s, i) => {
    const t = lowerKeys(s.tags);
    return { index: i, codec: s.codec_name, lang: lang.normalize(t.language), title: t.title || '', text: ['subrip', 'ass', 'ssa', 'mov_text', 'webvtt', 'text'].includes(s.codec_name) };
  });
  return {
    duration: Number(fmt.duration) || 0,
    format: fmt.format_name || '',
    vcodec: v ? v.codec_name : null,
    width: v ? v.width : 0,
    height: v ? v.height : 0,
    hasCover: streams.some((s) => s.disposition && s.disposition.attached_pic),
    audio,
    subs,
    tags: lowerKeys(fmt.tags),
  };
}

function resolution(w, h) {
  if (!w) return '';
  if (w >= 3200 || h >= 1800) return '4K';
  if (w >= 1800 || h >= 1000) return '1080p';
  if (w >= 1200 || h >= 700) return '720p';
  return 'SD';
}

/** Can a TV browser most likely play this file without remuxing? */
function directPlayable(ext, p) {
  const containerOk = ['.mp4', '.m4v', '.mov', '.webm'].includes(ext);
  if (!p) return containerOk;
  const vOk = !p.vcodec || ['h264', 'hevc', 'vp9', 'av1', 'vp8'].includes(p.vcodec);
  const aOk = !p.audio.length || ['aac', 'mp3', 'ac3', 'eac3', 'opus', 'vorbis'].includes(p.audio[0].codec);
  return containerOk && vOk && aOk;
}

// ---------- the scanner ----------

class Library {
  constructor(opts) {
    this.opts = opts;
    this.prober = makeProber(opts);
    this.empty();
    this.scanning = false;
    this.scanProgress = { files: 0 };
  }

  empty() {
    this.items = new Map();   // id -> movie | episode | track (playable files)
    this.folders = new Map(); // id -> folder node
    this.movies = []; this.shows = []; this.albums = [];
    this.showMap = new Map(); this.albumMap = new Map();
    this.roots = [];
    this.scannedAt = null;
  }

  async scan(roots) {
    if (this.scanning) return this._scanPromise;
    this.scanning = true;
    this.scanProgress = { files: 0, started: Date.now() };
    this._scanPromise = this._scan(roots).finally(() => { this.scanning = false; this.prober.save(); });
    return this._scanPromise;
  }

  async _scan(roots) {
    const next = new Library(this.opts);
    next.prober = this.prober;
    next.scanProgress = this.scanProgress;
    const files = [];
    for (const r of roots) {
      const root = path.resolve(r.path || r);
      let st; try { st = await fsp.stat(root); } catch (e) { continue; }
      if (!st.isDirectory()) continue;
      const rootInfo = { path: root, label: r.label || path.basename(root) || root, usb: !!r.usb, catalog: loadCatalog(root) };
      next.roots.push(rootInfo);
      const fid = next.ensureFolder(root, null, rootInfo.label);
      next.folders.get(fid).root = true;
      await next.walk(root, rootInfo, files, 0, { langs: [], genre: null });
    }
    // probe files with a small worker pool
    let i = 0;
    const work = async () => {
      while (i < files.length) {
        const f = files[i++];
        try { await next.addFile(f); } catch (e) { /* skip unreadable file */ }
        this.scanProgress.files++;
      }
    };
    await Promise.all([work(), work(), work(), work()]);
    next.finish();
    // swap in the new index
    Object.assign(this, { items: next.items, folders: next.folders, movies: next.movies, shows: next.shows, albums: next.albums, showMap: next.showMap, albumMap: next.albumMap, roots: next.roots, scannedAt: Date.now() });
    return this.summary();
  }

  ensureFolder(dir, parentDir, label) {
    const id = sha('d:' + dir);
    if (!this.folders.has(id)) {
      const parentId = parentDir ? sha('d:' + parentDir) : null;
      this.folders.set(id, { id, path: dir, name: label || path.basename(dir), parentId, dirs: [], files: [], count: 0 });
      if (parentId && this.folders.has(parentId)) this.folders.get(parentId).dirs.push(id);
    }
    return id;
  }

  async walk(dir, rootInfo, files, depth, inherited) {
    if (depth > 12) return;
    let entries;
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch (e) { return; }
    const names = entries.map((e) => e.name);
    // folder-level info.json (language/genre are inherited by everything below)
    const info = readJson(path.join(dir, 'info.json')) || readJson(path.join(dir, '.info.json'));
    const folderLangs = langList(info && (info.languages || info.language));
    const nameLangs = depth > 0 ? [...lang.fromName(path.basename(dir))] : [];
    const inh = {
      langs: folderLangs.length ? folderLangs : (nameLangs.length ? nameLangs : inherited.langs),
      genre: (info && info.genre) || inherited.genre,
    };
    const media = [], images = [], subs = [], nfos = [];
    for (const e of entries) {
      if (isHidden(e.name)) continue;
      const full = path.join(dir, e.name);
      const ext = path.extname(e.name).toLowerCase();
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name.toLowerCase())) continue;
        this.ensureFolder(full, dir);
        await this.walk(full, rootInfo, files, depth + 1, inh);
      } else if (VIDEO_EXT.has(ext) || AUDIO_EXT.has(ext)) media.push(e.name);
      else if (IMAGE_EXT.includes(ext)) images.push(e.name);
      else if (SUB_EXT.has(ext)) subs.push(e.name);
      else if (ext === '.nfo') nfos.push(e.name);
    }
    const videos = media.filter((n) => VIDEO_EXT.has(path.extname(n).toLowerCase()) && !/(^|[ ._-])(sample|trailer)([ ._-]|$)/i.test(n));
    const dirCtx = { dir, rootInfo, info, inh, images, subs, nfos, names, videoCount: videos.length, depth };
    for (const n of media) {
      if (/(^|[ ._-])sample([ ._-]|$)/i.test(n)) continue;
      files.push({ file: path.join(dir, n), name: n, ctx: dirCtx });
    }
  }

  findImage(dir, images, bases) {
    const lowerMap = new Map(images.map((n) => [n.toLowerCase(), n]));
    for (const b of bases) for (const ext of IMAGE_EXT) {
      const hit = lowerMap.get((b + ext).toLowerCase());
      if (hit) return path.join(dir, hit);
    }
    return null;
  }

  async addFile({ file, name, ctx }) {
    const st = await fsp.stat(file);
    const ext = path.extname(name).toLowerCase();
    const base = name.slice(0, -ext.length);
    const rel = path.relative(ctx.rootInfo.path, file);
    const id = sha('f:' + file);
    const folderId = sha('d:' + ctx.dir);
    const cat = ctx.rootInfo.catalog.get(rel);
    const fileInfo = ctx.info && ctx.info.files && (ctx.info.files[name] || ctx.info.files[base]);
    const probe = await this.prober.probe(file, st);
    const common = { id, path: file, rel, root: ctx.rootInfo.label, folderId, size: st.size, added: st.mtimeMs, ext };

    if (AUDIO_EXT.has(ext) && !(cat && /movie|video|episode/i.test(cat.type || ''))) {
      return this.addTrack(common, base, ctx, probe, cat, fileInfo);
    }
    const ep = !(cat && /movie/i.test(cat.type || '')) && !(fileInfo && fileInfo.type === 'movie') ? parseEpisode(base) : null;
    if ((cat && /episode|show/i.test(cat.type || '')) || ep) return this.addEpisode(common, base, ctx, probe, cat, fileInfo, ep || { season: 1, episode: 0, show: '' });
    return this.addMovie(common, base, ctx, probe, cat, fileInfo);
  }

  videoLangs(base, ctx, probe, cat, fileInfo, folderSingle, nfo) {
    const explicit = langList((cat && (cat.languages || cat.language)) || (fileInfo && (fileInfo.languages || fileInfo.language)) || (folderSingle && ctx.info && (ctx.info.languages || ctx.info.language)) || (nfo && nfo.language));
    if (explicit.length) return explicit;
    const fromFile = [...lang.fromName(base)];
    if (fromFile.length) return fromFile;
    if (folderSingle) { const f = [...lang.fromName(path.basename(ctx.dir))]; if (f.length) return f; }
    const audio = probe ? [...new Set(probe.audio.map((a) => a.lang).filter(Boolean))] : [];
    if (audio.length) return audio;
    return ctx.inh.langs.slice();
  }

  subtitlesFor(base, ctx, probe, id) {
    const out = [];
    for (const s of ctx.subs) {
      const sb = s.slice(0, -path.extname(s).length);
      if (!sb.toLowerCase().startsWith(base.toLowerCase()) && ctx.videoCount !== 1) continue;
      const sid = sha('s:' + path.join(ctx.dir, s));
      this.items.set(sid, { id: sid, kind: 'subtitle', path: path.join(ctx.dir, s) });
      out.push({ id: sid, lang: lang.fromSubtitleName(sb, base) || 'Subtitles', label: s });
    }
    if (probe) for (const s of probe.subs) if (s.text) out.push({ id: id + '-' + s.index, lang: s.lang || s.title || 'Track ' + (s.index + 1), embedded: s.index });
    return out;
  }

  addMovie(common, base, ctx, probe, cat, fileInfo) {
    const folderName = path.basename(ctx.dir);
    // A folder holding exactly one movie is a "movie folder": its name and images describe the movie.
    const folderSingle = ctx.videoCount === 1 && ctx.depth > 0 && !GENERIC_DIRS.has(folderName.toLowerCase()) && !lang.fromName(folderName).has(folderName.trim()[0].toUpperCase() + folderName.trim().slice(1).toLowerCase());
    const nfoName = ctx.nfos.find((n) => n.toLowerCase() === (base + '.nfo').toLowerCase()) || (folderSingle && ctx.nfos.find((n) => /^movie\.nfo$/i.test(n)));
    const nfo = nfoName ? readNfo(path.join(ctx.dir, nfoName)) : null;
    const fromName = cleanTitle(base);
    const fromFolder = folderSingle ? cleanTitle(folderName) : null;
    const folderInfo = folderSingle ? ctx.info : null;
    const pick = (k) => (cat && cat[k]) || (fileInfo && fileInfo[k]) || (folderInfo && folderInfo[k]) || (nfo && nfo[k]);
    const title = pick('title') || (fromFolder && fromFolder.title.length >= 2 ? fromFolder.title : fromName.title);
    const year = Number(pick('year')) || fromName.year || (fromFolder && fromFolder.year) || (probe && Number(String(probe.tags.date || '').slice(0, 4))) || null;
    const posterRel = pick('poster');
    const poster = (posterRel && [path.resolve(ctx.dir, posterRel), path.resolve(ctx.rootInfo.path, posterRel)].find(exists)) ||
      this.findImage(ctx.dir, ctx.images, [base + '-poster', base + '.poster', base, ...(folderSingle ? ['poster', 'folder', 'cover', 'movie', 'default'] : [])]) ||
      (folderSingle && ctx.images.length === 1 ? path.join(ctx.dir, ctx.images[0]) : null);
    const backdrop = this.findImage(ctx.dir, ctx.images, [base + '-fanart', base + '-backdrop', ...(folderSingle ? ['fanart', 'backdrop', 'background', 'landscape'] : [])]);
    const m = Object.assign(common, {
      kind: 'movie', title, year,
      sortTitle: title.replace(/^(the|a|an)\s+/i, '').toLowerCase(),
      langs: this.videoLangs(base, ctx, probe, cat, fileInfo, folderSingle, nfo),
      genre: pick('genre') || ctx.inh.genre || (probe && probe.tags.genre) || '',
      plot: pick('plot') || pick('description') || '',
      duration: probe ? Math.round(probe.duration) : 0,
      res: probe ? resolution(probe.width, probe.height) : '',
      vcodec: probe ? probe.vcodec : null,
      audio: probe ? probe.audio : [],
      direct: directPlayable(common.ext, probe),
      poster, backdrop,
    });
    m.subs = this.subtitlesFor(base, ctx, probe, m.id);
    this.items.set(m.id, m);
    this.movies.push(m);
    this.folders.get(common.folderId).files.push(m.id);
  }

  addEpisode(common, base, ctx, probe, cat, fileInfo, ep) {
    // show name: from file, else the folder (skipping "Season 1" style folders)
    let showDir = ctx.dir;
    if (/^(season|series|s)[ ._-]?\d+$/i.test(path.basename(showDir)) || /^specials$/i.test(path.basename(showDir))) showDir = path.dirname(showDir);
    const showName = (cat && cat.show) || (ctx.info && ctx.info.show) || (ep.show ? cleanTitle(ep.show).title : cleanTitle(path.basename(showDir)).title);
    const key = showName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    let show = this.showMap.get(key);
    if (!show) {
      let showImages = [];
      try { showImages = fs.readdirSync(showDir).filter((n) => IMAGE_EXT.includes(path.extname(n).toLowerCase())); } catch (e) { /* ignore */ }
      show = { id: sha('show:' + key), kind: 'show', title: showName, sortTitle: showName.replace(/^(the|a|an)\s+/i, '').toLowerCase(), langs: [], episodes: [], added: 0,
        poster: this.findImage(showDir, showImages, ['poster', 'folder', 'cover', 'show']) || this.findImage(ctx.dir, ctx.images, ['poster', 'folder', 'cover']) };
      this.showMap.set(key, show);
      this.shows.push(show);
    }
    const e = Object.assign(common, {
      kind: 'episode', showId: show.id, season: ep.season, episode: ep.episode,
      title: (cat && cat.title) || (fileInfo && fileInfo.title) || ep.epTitle || ('Episode ' + ep.episode),
      langs: this.videoLangs(base, ctx, probe, cat, fileInfo, false, null),
      duration: probe ? Math.round(probe.duration) : 0,
      res: probe ? resolution(probe.width, probe.height) : '',
      vcodec: probe ? probe.vcodec : null,
      audio: probe ? probe.audio : [],
      direct: directPlayable(common.ext, probe),
      poster: this.findImage(ctx.dir, ctx.images, [base, base + '-thumb']),
    });
    e.subs = this.subtitlesFor(base, ctx, probe, e.id);
    this.items.set(e.id, e);
    show.episodes.push(e.id);
    show.added = Math.max(show.added, e.added);
    for (const l of e.langs) if (!show.langs.includes(l)) show.langs.push(l);
    this.folders.get(common.folderId).files.push(e.id);
  }

  addTrack(common, base, ctx, probe, cat, fileInfo) {
    // A catalog row for the album folder describes the album, not each song.
    if (cat && cat._viaFolder) cat = { album: cat.album || cat.title, artist: cat.artist, album_artist: cat.artist, year: cat.year, language: cat.language || cat.languages, genre: cat.genre };
    let t = probe ? probe.tags : null;
    if (!t || (!t.title && !t.album)) t = Object.assign({}, t || {}, readTags(common.path) || {});
    const pick = (k) => (cat && cat[k]) || (fileInfo && fileInfo[k]) || t[k];
    const dirName = path.basename(ctx.dir);
    const parentName = path.basename(path.dirname(ctx.dir));
    const nameMatch = base.match(/^(\d{1,3})[ ._-]+(.*)$/);
    const albumName = pick('album') || (ctx.info && ctx.info.album) || (ctx.depth > 0 ? dirName : 'Unknown Album');
    const albumArtist = (cat && cat.album_artist) || t.album_artist || (ctx.info && ctx.info.artist) || pick('artist') || (ctx.depth > 1 && !GENERIC_DIRS.has(parentName.toLowerCase()) ? parentName : 'Various Artists');
    const key = (albumArtist + '|' + albumName).toLowerCase();
    const langs = langList(pick('language') || (ctx.info && (ctx.info.languages || ctx.info.language)));
    const trackLangs = langs.length ? langs : ([...lang.fromName(albumName)].length ? [...lang.fromName(albumName)] : ctx.inh.langs.slice());
    let album = this.albumMap.get(key);
    if (!album) {
      album = { id: sha('album:' + key), kind: 'album', title: albumName, artist: albumArtist, sortTitle: albumName.toLowerCase(), year: null, genre: '', langs: [], tracks: [], added: 0,
        poster: this.findImage(ctx.dir, ctx.images, ['cover', 'folder', 'front', 'album', 'albumart', 'albumartsmall', 'artwork']) || (ctx.images.length === 1 ? path.join(ctx.dir, ctx.images[0]) : null) };
      this.albumMap.set(key, album);
      this.albums.push(album);
    }
    const tr = Object.assign(common, {
      kind: 'track', albumId: album.id,
      title: pick('title') || (nameMatch ? nameMatch[2] : splitWords(base)),
      artist: pick('artist') || albumArtist,
      track: parseInt(pick('track'), 10) || (nameMatch ? Number(nameMatch[1]) : 0),
      disc: parseInt(pick('disc'), 10) || 1,
      duration: probe ? Math.round(probe.duration) : 0,
      langs: trackLangs,
      hasCover: probe ? probe.hasCover : null,
    });
    const y = parseInt(String(pick('date') || pick('year') || '').slice(0, 4), 10);
    if (y && !album.year) album.year = y;
    if (!album.genre && pick('genre')) album.genre = pick('genre');
    for (const l of trackLangs) if (!album.langs.includes(l)) album.langs.push(l);
    album.added = Math.max(album.added, tr.added);
    album.tracks.push(tr.id);
    this.items.set(tr.id, tr);
    this.folders.get(common.folderId).files.push(tr.id);
  }

  finish() {
    for (const s of this.shows) s.episodes.sort((a, b) => { const x = this.items.get(a), y = this.items.get(b); return x.season - y.season || x.episode - y.episode || x.title.localeCompare(y.title); });
    for (const a of this.albums) a.tracks.sort((p, q) => { const x = this.items.get(p), y = this.items.get(q); return x.disc - y.disc || x.track - y.track || x.title.localeCompare(y.title); });
    const byTitle = (a, b) => a.sortTitle.localeCompare(b.sortTitle, undefined, { numeric: true });
    this.movies.sort(byTitle); this.shows.sort(byTitle); this.albums.sort(byTitle);
    // count media below each folder and drop empty ones
    const count = (id) => {
      const f = this.folders.get(id);
      f.count = f.files.length + f.dirs.reduce((n, d) => n + count(d), 0);
      return f.count;
    };
    for (const f of [...this.folders.values()]) if (f.root) count(f.id);
    for (const f of this.folders.values()) f.dirs = f.dirs.filter((d) => this.folders.get(d).count > 0).sort((a, b) => this.folders.get(a).name.localeCompare(this.folders.get(b).name, undefined, { numeric: true }));
  }

  summary() {
    return { movies: this.movies.length, shows: this.shows.length, episodes: this.shows.reduce((n, s) => n + s.episodes.length, 0), albums: this.albums.length, tracks: this.albums.reduce((n, a) => n + a.tracks.length, 0), roots: this.roots.map((r) => ({ label: r.label, path: r.path, usb: r.usb, catalogEntries: r.catalog.size })) };
  }
}

module.exports = { Library, cleanTitle, parseEpisode, parseCsv, VIDEO_EXT, AUDIO_EXT };
