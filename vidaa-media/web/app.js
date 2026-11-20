/* Home Cinema - TV web app for Hisense VIDAA (works in any browser too).
 * Written in plain ES5 so it runs on older TV browser engines.
 * Navigation: arrow keys / OK / BACK on the remote, or mouse pointer. */
(function () {
  'use strict';

  // ---------------------------------------------------------------- keys
  var K = { LEFT: [37], UP: [38], RIGHT: [39], DOWN: [40], OK: [13, 32], BACK: [8, 27, 461, 10009, 166, 196],
    PLAY: [415, 250], PAUSE: [19], PLAYPAUSE: [179, 463, 10252], STOP: [413, 178], FF: [417, 228], RW: [412, 227],
    NEXT: [176, 425], PREV: [177, 424], RED: [403], GREEN: [404], YELLOW: [405], BLUE: [406], PGUP: [33, 427], PGDN: [34, 428] };
  function keyName(code) { for (var k in K) if (K[k].indexOf(code) >= 0) return k; return null; }

  // ---------------------------------------------------------------- utils
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtTime(s) { s = Math.max(0, Math.floor(s || 0)); var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (x < 10 ? '0' : '') + x; }
  function fmtDur(s) { if (!s) return ''; var h = Math.floor(s / 3600), m = Math.round(s % 3600 / 60); return h ? h + 'h ' + m + 'm' : m + ' min'; }
  function each(list, fn) { for (var i = 0; i < list.length; i++) fn(list[i], i); }
  function qsa(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }
  function hasClass(el, c) { return (' ' + el.className + ' ').indexOf(' ' + c + ' ') >= 0; }
  function addClass(el, c) { if (el && !hasClass(el, c)) el.className = (el.className + ' ' + c).replace(/^\s+/, ''); }
  function rmClass(el, c) { if (el) el.className = (' ' + el.className + ' ').replace(' ' + c + ' ', ' ').replace(/^\s+|\s+$/g, ''); }
  function toggleClass(el, c, on) { if (on) addClass(el, c); else rmClass(el, c); }
  function http(method, url, body, cb) {
    var x = new XMLHttpRequest();
    x.open(method, url, true);
    x.onreadystatechange = function () {
      if (x.readyState !== 4) return;
      var data = null;
      try { data = JSON.parse(x.responseText); } catch (e) { /* not json */ }
      if (cb) cb(x.status >= 200 && x.status < 300 ? null : (x.status || 'network'), data);
    };
    if (body) x.setRequestHeader('Content-Type', 'application/json');
    x.send(body ? JSON.stringify(body) : null);
  }
  var toastTimer;
  function toast(msg, ms) { var t = $('toast'); t.innerHTML = esc(msg); addClass(t, 'on'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { rmClass(t, 'on'); }, ms || 2500); }
  function img(id, v) { return '/img/' + id + (v ? '?v=' + v : ''); }
  function byId(list) { var m = {}; each(list, function (x) { m[x.id] = x; }); return m; }

  // ---------------------------------------------------------------- state
  var S = {
    lib: { movies: [], shows: [], albums: [], languages: [] },
    idx: {}, showIdx: {}, albumIdx: {}, epIdx: {}, trackIdx: {},
    progress: {},
    tab: 'movies',
    lang: {},            // tab -> selected language ('' = all)
    sort: { movies: 'az', shows: 'az', music: 'az' },
    folderId: null, folderStack: [],
    focus: null,
    layer: null,         // 'detail' | 'player' | null
    version: null
  };
  try { var saved = JSON.parse(localStorage.getItem('hc.prefs') || '{}'); if (saved.lang) S.lang = saved.lang; if (saved.sort) S.sort = saved.sort; if (saved.tab) S.tab = saved.tab; } catch (e) { /* storage blocked */ }
  function savePrefs() { try { localStorage.setItem('hc.prefs', JSON.stringify({ lang: S.lang, sort: S.sort, tab: S.tab })); } catch (e) { /* ignore */ } }

  // ---------------------------------------------------------------- focus engine (spatial navigation)
  function scopeEl() {
    if (S.layer === 'player') return $('player');
    if (S.layer === 'detail') return $('detail');
    return $('app');
  }
  function focusables() {
    var scope = scopeEl();
    var list = qsa(scope, '.f');
    if (S.layer === 'detail' && !hasClass($('mini'), 'hidden')) list = list.concat(qsa($('mini'), '.f'));
    var out = [];
    each(list, function (el) { if (el.offsetWidth || el.offsetHeight) { var r = el.getBoundingClientRect(); if (r.width) out.push(el); } });
    return out;
  }
  function setFocus(el, noScroll) {
    if (!el) return;
    if (S.focus && S.focus !== el) rmClass(S.focus, 'focus');
    S.focus = el;
    addClass(el, 'focus');
    if (!noScroll) ensureVisible(el);
    if (el.onfocusin) el.onfocusin();
    onFocusChanged(el);
  }
  function ensureVisible(el) {
    var p = el.parentNode;
    while (p && p !== document.body) {
      if (hasClass(p, 'scroll') || hasClass(p, 'list')) {
        var pr = p.getBoundingClientRect(), r = el.getBoundingClientRect();
        var margin = pr.height * 0.18;
        if (r.top < pr.top + margin) p.scrollTop -= (pr.top + margin - r.top);
        else if (r.bottom > pr.bottom - margin) p.scrollTop += (r.bottom - (pr.bottom - margin));
        if (hasClass(el, 'tile') && el.parentNode && hasClass(el.parentNode, 'grid') && el === el.parentNode.firstChild && p.scrollTop < pr.height) { /* keep header visible */ }
      }
      if (hasClass(p, 'row')) {
        var rr = p.getBoundingClientRect(), er = el.getBoundingClientRect();
        if (er.left < rr.left + 20) p.scrollLeft -= (rr.left + 20 - er.left);
        else if (er.right > rr.right - 40) p.scrollLeft += (er.right - (rr.right - 40));
      }
      p = p.parentNode;
    }
    lazyLoad();
  }
  function move(dir) {
    var cur = S.focus;
    var all = focusables();
    if (!cur || all.indexOf(cur) < 0) { setFocus(defaultFocus() || all[0]); return; }
    // Row jumps on the main screen: tabs -> selected language chip -> grid (and back up).
    if (!S.layer) {
      var activeChip = $('filters').querySelector('.chip.active');
      var inTabs = $('top').contains(cur), inFilters = $('filters').contains(cur);
      if (dir === 'DOWN' && inTabs) { var t1 = activeChip || $('content').querySelector('.f'); if (t1) { setFocus(t1); return t1; } }
      if (dir === 'DOWN' && inFilters) { var t2 = S.lastContentFocus && document.body.contains(S.lastContentFocus) ? S.lastContentFocus : $('content').querySelector('.f'); if (t2) { setFocus(t2); return t2; } }
      if (dir === 'UP' && inFilters) { var t3 = $('tabs').querySelector('.active'); setFocus(t3); return t3; }
    }
    var c = cur.getBoundingClientRect();
    var cx = c.left + c.width / 2, cy = c.top + c.height / 2;
    var best = null, bestScore = Infinity;
    each(all, function (el) {
      if (el === cur) return;
      var r = el.getBoundingClientRect();
      var x = r.left + r.width / 2, y = r.top + r.height / 2, primary, secondary;
      if (dir === 'LEFT') { if (r.right > c.left + 4 && x >= cx) return; primary = cx - x; secondary = overlap(c.top, c.bottom, r.top, r.bottom) ? 0 : Math.abs(cy - y); }
      else if (dir === 'RIGHT') { if (r.left < c.right - 4 && x <= cx) return; primary = x - cx; secondary = overlap(c.top, c.bottom, r.top, r.bottom) ? 0 : Math.abs(cy - y); }
      else if (dir === 'UP') { if (r.bottom > c.top + 4 && y >= cy) return; primary = cy - y; secondary = Math.abs(cx - x); if (overlap(c.left, c.right, r.left, r.right)) secondary *= 0.3; }
      else { if (r.top < c.bottom - 4 && y <= cy) return; primary = y - cy; secondary = Math.abs(cx - x); if (overlap(c.left, c.right, r.left, r.right)) secondary *= 0.3; }
      if (primary <= 0) return;
      var score = primary + secondary * (dir === 'LEFT' || dir === 'RIGHT' ? 4 : 1.6);
      if (score < bestScore) { bestScore = score; best = el; }
    });
    if (!S.layer && dir === 'UP' && best && $('content').contains(cur) && !$('content').contains(best)) {
      best = $('filters').querySelector('.chip.active') || best;
    }
    if (best) setFocus(best);
    return best;
  }
  function overlap(a1, a2, b1, b2) { return Math.min(a2, b2) - Math.max(a1, b1) > 4; }
  function defaultFocus() {
    if (S.layer === 'detail') return $('detail').querySelector('.btn.f') || $('detail').querySelector('.f');
    return $('content').querySelector('.tile.f') || $('content').querySelector('.f') || $('tabs').querySelector('.active');
  }
  function onFocusChanged(el) {
    if ($('content').contains(el)) S.lastContentFocus = el;
    // infinite grid: render more tiles when focus nears the end
    var g = el.parentNode;
    if (g && g.__more && hasClass(el, 'tile')) {
      var kids = g.children, i = Array.prototype.indexOf.call(kids, el);
      if (i > kids.length - 16) g.__more();
    }
  }

  // ---------------------------------------------------------------- lazy images
  var lazyTimer;
  function lazyLoad() {
    clearTimeout(lazyTimer);
    lazyTimer = setTimeout(function () {
      var h = window.innerHeight, w = window.innerWidth;
      each(qsa(document, 'img[data-src]'), function (im) {
        var r = im.getBoundingClientRect();
        if (!r.width && !r.height) return;
        if (r.bottom > -h * 0.5 && r.top < h * 1.8 && r.right > -w * 0.5 && r.left < w * 1.6) {
          im.onload = function () { addClass(im, 'loaded'); };
          im.onerror = function () { im.style.visibility = 'hidden'; };
          im.src = im.getAttribute('data-src');
          im.removeAttribute('data-src');
        }
      });
    }, 60);
  }

  // ---------------------------------------------------------------- data
  function loadLibrary(cb) {
    http('GET', '/api/library', null, function (err, data) {
      if (err || !data) { renderEmpty('Cannot reach the media server', 'Check that the server is running on your computer and the TV is on the same Wi-Fi network.'); setTimeout(function () { loadLibrary(cb); }, 5000); return; }
      S.lib = data;
      S.version = data.version;
      S.idx = byId(data.movies); S.showIdx = byId(data.shows); S.albumIdx = byId(data.albums);
      S.epIdx = {}; S.trackIdx = {};
      each(data.shows, function (s) { each(s.episodes, function (e) { e.show = s; S.epIdx[e.id] = e; }); });
      each(data.albums, function (a) { each(a.tracks, function (t) { t.album = a; S.trackIdx[t.id] = t; }); });
      http('GET', '/api/state', null, function (e2, st) { S.progress = (st && st.progress) || {}; if (cb) cb(); });
    });
  }
  function pollStatus() {
    http('GET', '/api/status', null, function (err, st) {
      if (!err && st && st.version && st.version !== S.version && !st.scanning) {
        var first = !S.version;
        loadLibrary(function () { if (!S.layer) render(true); if (!first) toast('Library updated'); });
      } else if (!err && st && st.scanning && !S.lib.movies.length && !S.lib.albums.length) {
        renderEmpty('Scanning your drives…', st.filesScanned + ' files found so far');
      }
      setTimeout(pollStatus, st && st.scanning ? 2500 : 15000);
    });
  }

  // ---------------------------------------------------------------- main screen
  function setTab(tab) {
    S.tab = tab; savePrefs();
    each(qsa($('tabs'), '.tab'), function (t) { toggleClass(t, 'active', t.getAttribute('data-tab') === tab); });
    $('content').scrollTop = 0;
    render();
  }
  function itemsForTab() {
    if (S.tab === 'movies') return S.lib.movies;
    if (S.tab === 'shows') return S.lib.shows;
    if (S.tab === 'music') return S.lib.albums;
    return [];
  }
  function filtered() {
    var lang = S.lang[S.tab] || '';
    var list = itemsForTab().filter(function (x) { return !lang || (x.langs || []).indexOf(lang) >= 0; });
    var s = S.sort[S.tab] || 'az';
    list = list.slice();
    if (s === 'recent') list.sort(function (a, b) { return (b.added || 0) - (a.added || 0); });
    else if (s === 'year') list.sort(function (a, b) { return (b.year || 0) - (a.year || 0) || (a.title > b.title ? 1 : -1); });
    else if (s === 'artist') list.sort(function (a, b) { return (a.artist || '').toLowerCase() > (b.artist || '').toLowerCase() ? 1 : -1; });
    return list;
  }
  var SORTS = { movies: [['az', 'A–Z'], ['recent', 'Recently added'], ['year', 'Newest first']], shows: [['az', 'A–Z'], ['recent', 'Recently added']], music: [['az', 'Album A–Z'], ['artist', 'Artist'], ['recent', 'Recently added'], ['year', 'Newest first']] };

  function renderFilters() {
    var f = $('filters');
    if (S.tab === 'folders') { f.innerHTML = ''; return; }
    var key = S.tab === 'movies' ? 'movies' : S.tab === 'shows' ? 'shows' : 'albums';
    var langs = S.lib.languages.filter(function (l) { return l[key] > 0; });
    var cur = S.lang[S.tab] || '';
    if (cur && !langs.some(function (l) { return l.name === cur; })) { cur = ''; S.lang[S.tab] = ''; }
    var html = '<div class="chip f' + (cur ? '' : ' active') + '" data-lang="">All languages<span class="n">' + itemsForTab().length + '</span></div>';
    each(langs, function (l) { html += '<div class="chip f' + (cur === l.name ? ' active' : '') + '" data-lang="' + esc(l.name) + '">' + esc(l.name) + '<span class="n">' + l[key] + '</span></div>'; });
    var sorts = SORTS[S.tab], sv = S.sort[S.tab] || 'az', label = sorts[0][1];
    each(sorts, function (s) { if (s[0] === sv) label = s[1]; });
    html += '<span class="sep"></span><div class="chip sort f" data-sort="1">Sort: ' + esc(label) + ' &#9662;</div>';
    f.innerHTML = html;
    each(qsa(f, '.chip'), function (c) {
      c.onclick = function () {
        if (c.getAttribute('data-sort')) {
          var i = 0; each(sorts, function (s, j) { if (s[0] === (S.sort[S.tab] || 'az')) i = j; });
          S.sort[S.tab] = sorts[(i + 1) % sorts.length][0];
        } else S.lang[S.tab] = c.getAttribute('data-lang');
        savePrefs();
        var keep = c.getAttribute('data-sort') ? '[data-sort]' : '[data-lang="' + (S.lang[S.tab] || '') + '"]';
        render();
        setFocus($('filters').querySelector(keep));
      };
    });
  }

  function badges(x, max) {
    var h = '';
    each((x.langs || []).slice(0, max || 2), function (l) { h += '<span class="badge lang">' + esc(l) + '</span>'; });
    return h;
  }
  function progressBar(id, dur) {
    var p = S.progress[id];
    if (!p || !p.dur) return '';
    return '<div class="prog"><i style="width:' + Math.min(100, Math.round(p.pos / p.dur * 100)) + '%"></i></div>';
  }
  function tileHtml(x, kind) {
    var sub = '', extra = '', cls = 'tile f';
    if (kind === 'movie') { sub = [x.year, fmtDur(x.duration)].filter(Boolean).join(' · '); extra = (x.res && x.res !== 'SD' ? '<span class="badge res">' + x.res + '</span>' : '') + progressBar(x.id); }
    else if (kind === 'show') { var seasons = {}; each(x.episodes, function (e) { seasons[e.season] = 1; }); var ns = Object.keys(seasons).length; sub = (ns > 1 ? ns + ' seasons · ' : '') + x.episodes.length + ' episodes'; }
    else if (kind === 'album') { cls += ' square'; sub = x.artist + (x.year ? ' · ' + x.year : ''); extra = '<span class="badge count">' + x.tracks.length + ' songs</span>'; }
    else if (kind === 'episode') { cls += ' wide'; sub = x.show.title + ' · S' + x.season + 'E' + x.episode; extra = progressBar(x.id); }
    return '<div class="' + cls + '" data-id="' + x.id + '" data-kind="' + kind + '"><div class="art"><img data-src="' + img(x.id) + '" alt=""><div class="badges">' + badges(x) + '</div>' + extra + '</div><div class="name">' + esc(kind === 'episode' ? x.title : x.title) + '</div><div class="sub">' + esc(sub) + '</div></div>';
  }
  function bindTiles(container) {
    each(qsa(container, '.tile'), function (t) { if (!t.onclick) t.onclick = function () { openItem(t.getAttribute('data-kind'), t.getAttribute('data-id')); }; });
  }

  function renderGrid(container, list, kind, title) {
    var head = document.createElement('div');
    head.className = 'section-title';
    head.innerHTML = esc(title) + '<span class="count">' + list.length + '</span>';
    container.appendChild(head);
    var grid = document.createElement('div');
    grid.className = 'grid';
    container.appendChild(grid);
    var shown = 0, CHUNK = 42;
    grid.__more = function () {
      if (shown >= list.length) return;
      var html = '';
      for (var i = shown; i < Math.min(list.length, shown + CHUNK); i++) html += tileHtml(list[i], kind);
      shown = Math.min(list.length, shown + CHUNK);
      grid.insertAdjacentHTML('beforeend', html);
      bindTiles(grid);
      lazyLoad();
    };
    grid.__more();
    return grid;
  }

  function continueWatching() {
    var out = [];
    for (var id in S.progress) {
      var p = S.progress[id], x = S.idx[id] || S.epIdx[id];
      if (x && p.pos > 30) out.push({ x: x, at: p.at, kind: S.idx[id] ? 'movie' : 'episode' });
    }
    out.sort(function (a, b) { return b.at - a.at; });
    return out.slice(0, 20);
  }

  function renderEmpty(title, text) {
    $('filters').innerHTML = '';
    $('content').innerHTML = '<div class="empty"><h2>' + esc(title) + '</h2>' + esc(text || '') + '</div>';
  }

  function render(keepFocus) {
    var prevId = keepFocus && S.focus && S.focus.getAttribute ? S.focus.getAttribute('data-id') : null;
    renderFilters();
    var c = $('content');
    c.innerHTML = '';
    if (S.tab === 'folders') return renderFolders();
    var list = filtered();
    var lang = S.lang[S.tab] || '';
    if (!itemsForTab().length) {
      var what = { movies: 'movies', shows: 'TV shows', music: 'music albums' }[S.tab];
      if (S.lib.scanning) renderEmpty('Scanning your drives…', 'Your library will appear here in a moment.');
      else renderEmpty('No ' + what + ' found', 'Plug in your USB drive on the computer running the server, or add folders to config.json. Then press Rescan.');
    } else if (S.tab === 'movies') {
      var cw = continueWatching().filter(function (c2) { return c2.kind === 'movie' && (!lang || c2.x.langs.indexOf(lang) >= 0); });
      if (cw.length) {
        var h = document.createElement('div'); h.className = 'section-title'; h.innerHTML = 'Continue watching'; c.appendChild(h);
        var row = document.createElement('div'); row.className = 'row';
        var html = ''; each(cw, function (c2) { html += tileHtml(c2.x, 'movie'); }); row.innerHTML = html; c.appendChild(row); bindTiles(row);
      }
      renderGrid(c, list, 'movie', (lang ? lang + ' movies' : 'All movies'));
    } else if (S.tab === 'shows') {
      var cwe = continueWatching().filter(function (c2) { return c2.kind === 'episode'; });
      if (cwe.length) {
        var h2 = document.createElement('div'); h2.className = 'section-title'; h2.innerHTML = 'Continue watching'; c.appendChild(h2);
        var row2 = document.createElement('div'); row2.className = 'row';
        var html2 = ''; each(cwe, function (c2) { html2 += tileHtml(c2.x, 'episode'); }); row2.innerHTML = html2; c.appendChild(row2); bindTiles(row2);
      }
      renderGrid(c, list, 'show', lang ? lang + ' shows' : 'All TV shows');
    } else if (S.tab === 'music') {
      renderGrid(c, list, 'album', lang ? lang + ' albums' : 'All albums');
    }
    lazyLoad();
    var target = prevId && c.querySelector('[data-id="' + prevId + '"]');
    if (target) setFocus(target, true);
    else if (!S.focus || !document.body.contains(S.focus) || !keepFocus) setFocus($('tabs').querySelector('.active'), true);
  }

  // ---------------------------------------------------------------- folders
  function renderFolders() {
    var c = $('content');
    c.innerHTML = '<div class="empty">Loading…</div>';
    http('GET', '/api/folder' + (S.folderId ? '?id=' + S.folderId : ''), null, function (err, f) {
      if (S.tab !== 'folders') return;
      if (err || !f) { S.folderId = null; return renderEmpty('Folder not found', 'Press Rescan if a drive was removed.'); }
      var crumbs = S.folderStack.map(function (s) { return esc(s.name); }).concat(['<b>' + esc(f.name) + '</b>']).join(' &rsaquo; ');
      var html = '<div class="breadcrumb">' + (S.folderId ? '&#9664; BACK to go up &nbsp;·&nbsp; ' : '') + crumbs + '</div><div class="grid">';
      each(f.dirs, function (d) { html += '<div class="tile square f" data-folder="' + d.id + '" data-name="' + esc(d.name) + '"><div class="art"><img data-src="' + img(d.id) + '" alt=""><span class="badge count">' + d.count + ' items</span></div><div class="name">' + esc(d.name) + '</div><div class="sub">Folder</div></div>'; });
      each(f.files, function (x) {
        var kind = x.kind === 'track' ? 'track' : x.kind;
        var sub = x.kind === 'track' ? 'Song · ' + fmtTime(x.duration) : [x.year, fmtDur(x.duration), x.res].filter(Boolean).join(' · ');
        html += '<div class="tile' + (x.kind === 'track' ? ' square' : '') + ' f" data-id="' + x.id + '" data-kind="' + kind + '"><div class="art"><img data-src="' + img(x.id) + '" alt=""><div class="badges">' + badges(x) + '</div>' + progressBar(x.id) + '</div><div class="name">' + esc(x.title) + '</div><div class="sub">' + esc(sub) + '</div></div>';
      });
      html += '</div>';
      if (!f.dirs.length && !f.files.length) html = '<div class="empty"><h2>No drives with media</h2>Plug in a USB drive on the server computer or add folders to config.json.</div>';
      c.innerHTML = html;
      each(qsa(c, '[data-folder]'), function (t) { t.onclick = function () { S.folderStack.push({ id: S.folderId, name: f.name }); S.folderId = t.getAttribute('data-folder'); c.scrollTop = 0; renderFolders(); }; });
      bindTiles(c);
      lazyLoad();
      if (!hasClass(S.focus || document.body, 'tab')) setFocus(c.querySelector('.tile') || $('tabs').querySelector('.active'), true);
    });
  }
  function folderUp() {
    if (!S.folderStack.length) return false;
    var prev = S.folderStack.pop();
    S.folderId = prev.id;
    renderFolders();
    return true;
  }

  // ---------------------------------------------------------------- detail screens
  function openItem(kind, id) {
    if (kind === 'movie') return showMovie(S.idx[id]);
    if (kind === 'show') return showShow(S.showIdx[id]);
    if (kind === 'album') return showAlbum(S.albumIdx[id]);
    if (kind === 'episode') { var e = S.epIdx[id]; if (e) { var p = S.progress[id]; playVideo(e, p ? p.pos : 0); } return; }
    if (kind === 'track') { var t = S.trackIdx[id]; if (t) { var a = t.album; playAlbum(a, a.tracks.indexOf(t)); } }
  }
  var detailReturnFocus = null;
  function openDetail(html) {
    detailReturnFocus = S.focus;
    var d = $('detail');
    d.innerHTML = html;
    rmClass(d, 'hidden');
    S.layer = 'detail';
    lazyLoad();
  }
  function closeDetail() {
    addClass($('detail'), 'hidden');
    $('detail').innerHTML = '';
    S.layer = null;
    if (detailReturnFocus && document.body.contains(detailReturnFocus)) setFocus(detailReturnFocus); else setFocus(defaultFocus());
    render(true);
  }
  function langNamesOfAudio(x) { return (x.audio || []).map(function (a, i) { return { index: a.index, label: (a.lang || 'Track ' + (i + 1)) + (a.channels > 2 ? ' ' + (a.channels === 6 ? '5.1' : a.channels === 8 ? '7.1' : a.channels + 'ch') : '') }; }); }

  function showMovie(m) {
    if (!m) return;
    var p = S.progress[m.id];
    var audio = langNamesOfAudio(m);
    var opts = { audio: 0, sub: -1 };
    var meta = [m.year, fmtDur(m.duration), m.res, m.genre].filter(Boolean).map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('');
    var html = '<div class="backdrop" id="bd"></div><div class="dwrap"><div class="dposter"><div class="art"><img src="' + img(m.id) + '" alt=""></div></div><div class="dinfo">' +
      '<div class="dtitle">' + esc(m.title) + '</div><div class="dmeta">' + meta + '</div><div class="dlangs">' + badges(m, 6) + '</div>' +
      (m.plot ? '<div class="dplot">' + esc(m.plot) + '</div>' : '') +
      '<div class="dactions">' +
      (p ? '<div class="btn primary f" id="bResume">&#9654; Resume from ' + fmtTime(p.pos) + '</div><div class="btn f" id="bStart">&#8634; Play from start</div>' : '<div class="btn primary f" id="bStart">&#9654; Play</div>') +
      '</div><div class="dactions">' +
      (audio.length > 1 ? '<div class="btn f" id="bAudio"></div>' : '') +
      (m.subs && m.subs.length ? '<div class="btn f" id="bSubs"></div>' : '') +
      '</div><div class="dmeta" style="margin-top:1rem;font-size:1.05rem">' + esc(m.root || '') + '</div></div></div>';
    openDetail(html);
    if (m.hasBackdrop) { var bi = new Image(); bi.onload = function () { if ($('bd')) $('bd').style.backgroundImage = 'url(' + bi.src + ')'; }; bi.src = img(m.id) + '?v=backdrop'; }
    function labels() {
      if ($('bAudio')) $('bAudio').innerHTML = 'Audio: ' + esc(audio[opts.audio].label) + ' &#9662;';
      if ($('bSubs')) $('bSubs').innerHTML = 'Subtitles: ' + esc(opts.sub < 0 ? 'Off' : m.subs[opts.sub].lang) + ' &#9662;';
    }
    labels();
    if ($('bAudio')) $('bAudio').onclick = function () { opts.audio = (opts.audio + 1) % audio.length; labels(); };
    if ($('bSubs')) $('bSubs').onclick = function () { opts.sub = opts.sub + 1 >= m.subs.length ? -1 : opts.sub + 1; labels(); };
    var go = function (from) { playVideo(m, from, { audio: audio.length ? audio[opts.audio].index : 0, sub: opts.sub }); };
    if ($('bResume')) $('bResume').onclick = function () { go(p.pos); };
    $('bStart').onclick = function () { go(0); };
    setFocus($('bResume') || $('bStart'));
  }

  function showShow(s) {
    if (!s) return;
    var html = '<div class="backdrop" style="background-image:url(' + img(s.id) + ')"></div><div class="dwrap"><div class="dposter"><div class="art"><img src="' + img(s.id) + '" alt=""></div></div><div class="dinfo">' +
      '<div class="dtitle">' + esc(s.title) + '</div><div class="dmeta"><span>' + s.episodes.length + ' episodes</span></div><div class="dlangs">' + badges(s, 6) + '</div><div class="list">';
    var season = null;
    each(s.episodes, function (e) {
      if (e.season !== season) { season = e.season; html += '<div class="season">Season ' + season + '</div>'; }
      var p = S.progress[e.id];
      html += '<div class="lrow f" data-ep="' + e.id + '"><span class="no">' + e.episode + '</span><span class="lt">' + esc(e.title) + '</span>' + (p && p.dur ? '<span class="lp"><i style="width:' + Math.round(p.pos / p.dur * 100) + '%"></i></span>' : '') + '<span class="ls">' + esc(fmtDur(e.duration)) + '</span></div>';
    });
    html += '</div></div></div>';
    openDetail(html);
    each(qsa($('detail'), '[data-ep]'), function (r) { r.onclick = function () { var e = S.epIdx[r.getAttribute('data-ep')]; var p = S.progress[e.id]; playVideo(e, p ? p.pos : 0); }; });
    // focus the first unfinished episode
    var target = null;
    each(s.episodes, function (e) { if (!target && S.progress[e.id]) target = e.id; });
    setFocus((target && $('detail').querySelector('[data-ep="' + target + '"]')) || $('detail').querySelector('.lrow'));
  }

  function showAlbum(a) {
    if (!a) return;
    var html = '<div class="backdrop" style="background-image:url(' + img(a.id) + ');opacity:.2"></div><div class="dwrap"><div class="dposter square"><div class="art"><img src="' + img(a.id) + '" alt=""></div></div><div class="dinfo">' +
      '<div class="dtitle">' + esc(a.title) + '</div><div class="dmeta">' + [a.artist, a.year, a.tracks.length + ' songs', a.genre].filter(Boolean).map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</div><div class="dlangs">' + badges(a, 6) + '</div>' +
      '<div class="dactions"><div class="btn primary f" id="bPlayAll">&#9654; Play album</div><div class="btn f" id="bShuffle">&#8644; Shuffle</div></div><div class="list">';
    var multiDisc = a.tracks.some(function (t) { return t.disc > 1; });
    each(a.tracks, function (t, i) {
      html += '<div class="lrow f' + (Music.current && Music.current.id === t.id ? ' playing' : '') + '" data-tr="' + i + '"><span class="no">' + (multiDisc ? t.disc + '-' : '') + (t.track || i + 1) + '</span><span class="lt">' + esc(t.title) + '</span>' + (t.artist && t.artist !== a.artist ? '<span class="ls">' + esc(t.artist) + '</span>' : '') + '<span class="ls">' + fmtTime(t.duration) + '</span></div>';
    });
    html += '</div></div></div>';
    openDetail(html);
    $('bPlayAll').onclick = function () { playAlbum(a, 0); };
    $('bShuffle').onclick = function () { playAlbum(a, 0, true); };
    each(qsa($('detail'), '[data-tr]'), function (r) { r.onclick = function () { playAlbum(a, Number(r.getAttribute('data-tr'))); }; });
    setFocus($('bPlayAll'));
  }

  // ---------------------------------------------------------------- music player
  var Music = { queue: [], pos: -1, current: null, el: null };
  function playAlbum(a, index, shuffle) {
    var q = a.tracks.slice();
    if (shuffle) { for (var i = q.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = q[i]; q[i] = q[j]; q[j] = t; } index = 0; }
    Music.queue = q;
    playTrack(index);
  }
  function playTrack(i) {
    if (i < 0 || i >= Music.queue.length) { stopMusic(); return; }
    var t = Music.queue[i], au = $('audio');
    Music.pos = i; Music.current = t;
    au.src = '/media/' + t.id;
    au.play();
    rmClass($('mini'), 'hidden');
    $('miniArt').src = img(t.album.id);
    $('miniTitle').innerHTML = esc(t.title);
    $('miniSub').innerHTML = esc((t.artist || t.album.artist) + ' — ' + t.album.title);
    each(qsa($('detail'), '[data-tr]'), function (r) { toggleClass(r, 'playing', Number(r.getAttribute('data-tr')) === t.album.tracks.indexOf(t)); });
  }
  function stopMusic() { var au = $('audio'); au.pause(); au.removeAttribute('src'); try { au.load(); } catch (e) { /* ignore */ } Music.current = null; addClass($('mini'), 'hidden'); if (S.focus && $('mini').contains(S.focus)) setFocus(defaultFocus()); }
  function musicToggle() { var au = $('audio'); if (!Music.current) return; if (au.paused) au.play(); else au.pause(); }
  (function initAudio() {
    var au = $('audio');
    au.addEventListener('ended', function () { playTrack(Music.pos + 1); });
    au.addEventListener('timeupdate', function () { if (au.duration) $('miniBar').style.width = (au.currentTime / au.duration * 100) + '%'; });
    au.addEventListener('play', function () { $('miniPlay').innerHTML = '&#10074;&#10074;'; });
    au.addEventListener('pause', function () { $('miniPlay').innerHTML = '&#9654;'; });
    au.addEventListener('error', function () { if (Music.current) { toast('Cannot play this song format'); setTimeout(function () { playTrack(Music.pos + 1); }, 1500); } });
    $('miniPlay').onclick = musicToggle;
    $('miniNext').onclick = function () { playTrack(Math.min(Music.pos + 1, Music.queue.length - 1)); };
    $('miniPrev').onclick = function () { if (au.currentTime > 5) au.currentTime = 0; else playTrack(Math.max(0, Music.pos - 1)); };
  })();

  // ---------------------------------------------------------------- video player
  var V = { item: null, offset: 0, remux: false, audio: 0, sub: -1, triedRemux: false, seekTarget: null, seekTimer: null, osdTimer: null, saveTimer: null, stallTimer: null };
  var video = $('video');

  function vidTime() { return V.offset + (video.currentTime || 0); }
  function vidDur() { return (V.item && V.item.duration) || (V.remux ? 0 : video.duration) || video.duration || 0; }

  function playVideo(item, from, opts) {
    opts = opts || {};
    if (Music.current) $('audio').pause();
    V.item = item; V.audio = opts.audio || 0; V.sub = opts.sub == null ? -1 : opts.sub; V.triedRemux = false;
    var needRemux = !item.direct || V.audio > 0;
    if (needRemux && !S.lib.ffmpeg) { needRemux = false; if (V.audio > 0) toast('Install ffmpeg on the server to switch audio language'); }
    $('osdTitle').innerHTML = esc(item.show ? item.show.title + ' — S' + item.season + 'E' + item.episode + ' ' + item.title : item.title);
    $('osdInfo').innerHTML = esc([item.year, item.res, (item.langs || []).join(', ')].filter(Boolean).join(' · '));
    rmClass($('player'), 'hidden');
    S.layer = 'player';
    if (S.focus) rmClass(S.focus, 'focus');
    startStream(from || 0, needRemux);
    showOsd();
    clearInterval(V.saveTimer);
    V.saveTimer = setInterval(saveProgress, 10000);
  }

  function startStream(at, remux) {
    var item = V.item;
    V.remux = remux;
    addClass($('spinner'), 'on');
    clearTimeout(V.stallTimer);
    while (video.firstChild) video.removeChild(video.firstChild);
    if (remux) {
      V.offset = Math.max(0, Math.floor(at));
      video.src = '/remux/' + item.id + '?t=' + V.offset + '&a=' + V.audio;
    } else {
      V.offset = 0;
      video.src = '/media/' + item.id;
      if (at > 0) {
        var seekOnce = function () { video.removeEventListener('loadedmetadata', seekOnce); try { video.currentTime = at; } catch (e) { /* ignore */ } };
        video.addEventListener('loadedmetadata', seekOnce);
      }
      // If the TV cannot open the file at all, fall back to the server's remux.
      V.stallTimer = setTimeout(function () { if (video.readyState === 0 && S.lib.ffmpeg && !V.triedRemux) { V.triedRemux = true; startStream(at, true); } }, 12000);
    }
    applySubtitle();
    var pr = video.play();
    if (pr && pr['catch']) pr['catch'](function () { /* autoplay may need a key press */ });
  }

  function applySubtitle() {
    each(qsa(video, 'track'), function (t) { video.removeChild(t); });
    var item = V.item;
    if (V.sub < 0 || !item.subs || !item.subs[V.sub]) return;
    var s = item.subs[V.sub];
    var tr = document.createElement('track');
    tr.kind = 'subtitles'; tr.label = s.lang; tr.srclang = 'xx'; tr['default'] = true;
    tr.src = '/sub/' + s.id + '?offset=' + V.offset;
    video.appendChild(tr);
    setTimeout(function () { if (video.textTracks && video.textTracks[0]) video.textTracks[0].mode = 'showing'; }, 300);
  }

  video.addEventListener('playing', function () { rmClass($('spinner'), 'on'); clearTimeout(V.stallTimer); updateOsd(); });
  video.addEventListener('waiting', function () { addClass($('spinner'), 'on'); });
  video.addEventListener('pause', function () { updateOsd(); showOsd(true); });
  video.addEventListener('timeupdate', function () { if (!hasClass($('osd'), 'off')) updateOsd(); });
  video.addEventListener('progress', updateOsd);
  video.addEventListener('error', function () {
    if (!V.item || S.layer !== 'player') return;
    if (!V.remux && S.lib.ffmpeg && !V.triedRemux) { V.triedRemux = true; toast('Converting for TV playback…'); startStream(vidTime(), true); return; }
    rmClass($('spinner'), 'on');
    toast(S.lib.ffmpeg ? 'This file cannot be played' : 'This format needs ffmpeg on the server', 4000);
  });
  video.addEventListener('ended', function () {
    saveProgress(true);
    var it = V.item;
    if (it && it.show) { // auto-play next episode
      var eps = it.show.episodes, i = eps.indexOf(it);
      if (i >= 0 && i + 1 < eps.length) { toast('Next: ' + eps[i + 1].title); playVideo(eps[i + 1], 0); return; }
    }
    closePlayer();
  });

  function updateOsd() {
    var d = vidDur(), t = V.seekTarget != null ? V.seekTarget : vidTime();
    $('osdCur').innerHTML = fmtTime(t);
    $('osdDur').innerHTML = d ? fmtTime(d) : '--:--';
    $('osdProg').style.width = d ? Math.min(100, t / d * 100) + '%' : '0';
    var b = 0;
    try { if (video.buffered.length) b = V.offset + video.buffered.end(video.buffered.length - 1); } catch (e) { /* ignore */ }
    $('osdBuf').style.width = d ? Math.min(100, b / d * 100) + '%' : '0';
    var sk = $('osdSeek');
    if (V.seekTarget != null && d) { sk.style.display = 'block'; sk.style.left = (V.seekTarget / d * 100) + '%'; } else sk.style.display = 'none';
    $('osdState').innerHTML = V.seekTarget != null ? 'Seek to ' + fmtTime(V.seekTarget) : video.paused ? '&#10074;&#10074; Paused' : '';
  }
  function showOsd(sticky) {
    rmClass($('osd'), 'off');
    updateOsd();
    clearTimeout(V.osdTimer);
    if (!sticky) V.osdTimer = setTimeout(function () { if (!video.paused && V.seekTarget == null) addClass($('osd'), 'off'); }, 4000);
  }
  function seekBy(sec) {
    var d = vidDur();
    var base = V.seekTarget != null ? V.seekTarget : vidTime();
    V.seekTarget = Math.max(0, d ? Math.min(d - 3, base + sec) : base + sec);
    showOsd(true);
    clearTimeout(V.seekTimer);
    V.seekTimer = setTimeout(commitSeek, 900);
  }
  function commitSeek() {
    var t = V.seekTarget;
    V.seekTarget = null;
    if (t == null) return;
    if (V.remux) startStream(t, true);
    else { try { video.currentTime = t; } catch (e) { /* ignore */ } video.play(); }
    showOsd();
  }
  function togglePause() { if (video.paused) video.play(); else video.pause(); showOsd(!video.paused ? false : true); }
  function cycleSubs() {
    var subs = V.item.subs || [];
    if (!subs.length) { toast('No subtitles for this video'); return; }
    V.sub = V.sub + 1 >= subs.length ? -1 : V.sub + 1;
    applySubtitle();
    toast('Subtitles: ' + (V.sub < 0 ? 'Off' : subs[V.sub].lang));
  }
  function cycleAudio() {
    var a = V.item.audio || [];
    if (a.length < 2) { toast('Only one audio language' + (a[0] && a[0].lang ? ': ' + a[0].lang : '')); return; }
    if (!S.lib.ffmpeg) { toast('Install ffmpeg on the server to switch audio language'); return; }
    var i = 0; each(a, function (x, j) { if (x.index === V.audio) i = j; });
    V.audio = a[(i + 1) % a.length].index;
    var label = a[(i + 1) % a.length].lang || 'Track ' + ((i + 1) % a.length + 1);
    toast('Audio: ' + label);
    startStream(vidTime(), true);
  }
  function saveProgress(done) {
    if (!V.item) return;
    var pos = vidTime(), dur = vidDur();
    if (!dur || pos < 1) return;
    http('POST', '/api/progress', { id: V.item.id, pos: pos, dur: dur, done: !!done });
    if (done || pos > dur * 0.94) delete S.progress[V.item.id];
    else if (pos > 30) S.progress[V.item.id] = { pos: Math.round(pos), dur: Math.round(dur), at: Date.now() };
  }
  function closePlayer() {
    saveProgress();
    clearInterval(V.saveTimer); clearTimeout(V.stallTimer); clearTimeout(V.seekTimer);
    video.pause();
    video.removeAttribute('src');
    try { video.load(); } catch (e) { /* ignore */ }
    addClass($('player'), 'hidden');
    rmClass($('spinner'), 'on');
    var item = V.item;
    V.item = null; V.seekTarget = null;
    // return to the detail screen (refresh it so the Resume button is current)
    if (item && S.idx[item.id] && !$('detail').innerHTML) { S.layer = null; render(true); return; }
    S.layer = $('detail').innerHTML ? 'detail' : null;
    if (S.layer === 'detail' && item) {
      var rf = detailReturnFocus;
      if (S.idx[item.id]) showMovie(S.idx[item.id]); else if (item.show) showShow(item.show);
      detailReturnFocus = rf;
    } else render(true);
  }
  function playerKey(k) {
    if (k === 'BACK' || k === 'STOP') { if (V.seekTarget != null) { V.seekTarget = null; clearTimeout(V.seekTimer); showOsd(); return; } closePlayer(); return; }
    if (k === 'OK' || k === 'PLAYPAUSE') { if (V.seekTarget != null) { clearTimeout(V.seekTimer); commitSeek(); } else togglePause(); return; }
    if (k === 'PLAY') { video.play(); showOsd(); return; }
    if (k === 'PAUSE') { video.pause(); return; }
    if (k === 'LEFT' || k === 'RW') return seekBy(k === 'RW' ? -60 : -10);
    if (k === 'RIGHT' || k === 'FF') return seekBy(k === 'FF' ? 60 : 30);
    if (k === 'UP' || k === 'RED') return cycleSubs();
    if (k === 'DOWN' || k === 'GREEN') return cycleAudio();
    if (k === 'NEXT' || k === 'PREV') { var it = V.item; if (it && it.show) { var eps = it.show.episodes, i = eps.indexOf(it) + (k === 'NEXT' ? 1 : -1); if (eps[i]) { saveProgress(); playVideo(eps[i], 0); } } return; }
    showOsd();
  }

  // ---------------------------------------------------------------- global key handling
  function back() {
    if (S.layer === 'detail') { closeDetail(); return true; }
    if (S.tab === 'folders' && S.focus && !hasClass(S.focus, 'tab') && folderUp()) return true;
    var activeTab = $('tabs').querySelector('.active');
    if (S.focus !== activeTab) { $('content').scrollTop = 0; setFocus(activeTab); return true; }
    // Already on the tabs: leave the app. Installed VIDAA apps run full-screen without
    // a browser bar and must close themselves; in a normal browser tab this is ignored.
    stopMusic();
    try { window.close(); } catch (e) { /* not allowed */ }
    return false;
  }

  document.addEventListener('keydown', function (e) {
    var k = keyName(e.keyCode);
    if (!k) return;
    e.preventDefault();
    if (S.layer === 'player') { playerKey(k); return; }
    switch (k) {
      case 'LEFT': case 'RIGHT': case 'UP': case 'DOWN': move(k); break;
      case 'OK': if (S.focus && S.focus.onclick) S.focus.onclick(); break;
      case 'BACK': back(); break;
      case 'PLAYPAUSE': case 'PLAY': case 'PAUSE': musicToggle(); break;
      case 'STOP': stopMusic(); break;
      case 'NEXT': case 'FF': if (Music.current) $('miniNext').onclick(); break;
      case 'PREV': case 'RW': if (Music.current) $('miniPrev').onclick(); break;
      case 'PGDN': for (var i = 0; i < 3; i++) move('DOWN'); break;
      case 'PGUP': for (var j = 0; j < 3; j++) move('UP'); break;
      case 'RED': setTabAndFocus('movies'); break;
      case 'GREEN': setTabAndFocus('shows'); break;
      case 'YELLOW': setTabAndFocus('music'); break;
      case 'BLUE': setTabAndFocus('folders'); break;
    }
  }, true);
  function setTabAndFocus(t) { if (S.layer === 'detail') closeDetail(); setTab(t); setFocus($('tabs').querySelector('.active')); }

  // Some TV browsers send BACK as browser history navigation instead of a key.
  try {
    history.pushState({ hc: 1 }, '');
    window.addEventListener('popstate', function () {
      if (S.layer === 'player') playerKey('BACK'); else back();
      history.pushState({ hc: 1 }, '');
    });
  } catch (e) { /* ignore */ }

  // mouse / magic-remote pointer support
  document.addEventListener('mouseover', function (e) {
    var t = e.target;
    while (t && t !== document.body && !(t.className && hasClass(t, 'f'))) t = t.parentNode;
    if (t && t !== document.body && t !== S.focus) setFocus(t, true);
  });
  $('content').addEventListener('scroll', lazyLoad);
  document.addEventListener('wheel', function (e) { var c = S.layer === 'detail' ? $('detail').querySelector('.list') : $('content'); if (c) { c.scrollTop += e.deltaY; lazyLoad(); } }, { passive: true });
  $('player').addEventListener('click', function () { togglePause(); });
  $('player').addEventListener('mousemove', function () { showOsd(); });

  // tabs & header
  each(qsa($('tabs'), '.tab'), function (t) {
    t.onclick = function () { setTab(t.getAttribute('data-tab')); setFocus(t); };
  });
  $('rescanBtn').onclick = function () { http('POST', '/api/rescan', null, function () { toast('Rescanning drives… the library refreshes automatically'); }); };
  function clock() { var d = new Date(), h = d.getHours(), m = d.getMinutes(); $('clock').innerHTML = (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m; }
  setInterval(clock, 15000); clock();

  // ---------------------------------------------------------------- start
  renderEmpty('Loading your library…', '');
  loadLibrary(function () {
    if (S.tab === 'music' && !S.lib.albums.length && S.lib.movies.length) S.tab = 'movies';
    setTab(S.tab);
    setFocus($('content').querySelector('.tile') || $('tabs').querySelector('.active'));
    pollStatus();
  });
})();
