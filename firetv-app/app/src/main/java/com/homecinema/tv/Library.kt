package com.homecinema.tv

import android.content.Context
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.os.Build
import android.os.Environment
import android.os.storage.StorageManager
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/**
 * Scans the Fire TV's own storage and plugged-in USB drives into movies, TV shows and
 * music albums. Mirrors vidaa-media/server/scanner.js (same ids, same JSON shape), so the
 * shared TV web UI works unchanged against either server.
 */
class Library(private val ctx: Context) {

    data class Root(val dir: File, val label: String, val usb: Boolean)
    data class Audio(val index: Int, val lang: String?, val codec: String?, val channels: Int)
    data class Sub(val id: String, val lang: String, val label: String, val file: File?)

    class Item(val id: String, val kind: String, val file: File, val rel: String, val root: String, val folderId: String, val size: Long, val added: Long) {
        var title = ""; var year: Int? = null; var langs: MutableList<String> = ArrayList(); var genre = ""; var plot = ""
        var duration = 0; var res = ""; var audio: List<Audio> = emptyList(); var subs: List<Sub> = emptyList()
        var poster: File? = null; var backdrop: File? = null
        var showId: String? = null; var season = 0; var episode = 0
        var albumId: String? = null; var artist = ""; var track = 0; var disc = 1
    }
    class Show(val id: String, val title: String) { val langs = ArrayList<String>(); val episodes = ArrayList<String>(); var added = 0L; var poster: File? = null }
    class Album(val id: String, val title: String, val artist: String) { var year: Int? = null; var genre = ""; val langs = ArrayList<String>(); val tracks = ArrayList<String>(); var added = 0L; var poster: File? = null }
    class Folder(val id: String, val dir: File, val name: String, val parentId: String?) { val dirs = ArrayList<String>(); val files = ArrayList<String>(); var count = 0; var root = false }

    class Index {
        val items = HashMap<String, Item>()
        val subs = HashMap<String, Sub>()
        val folders = LinkedHashMap<String, Folder>()
        val movies = ArrayList<Item>()
        val shows = ArrayList<Show>()
        val albums = ArrayList<Album>()
        val showMap = HashMap<String, Show>()
        val albumMap = HashMap<String, Album>()
        val roots = ArrayList<Root>()
        var catalogs = HashMap<String, Catalog>()
    }

    @Volatile var index = Index(); private set
    @Volatile var scannedAt: Long = 0; private set
    @Volatile var scanning = false; private set
    val filesScanned = AtomicInteger(0)

    // ---------------------------------------------------------------- roots (USB + internal)

    fun detectRoots(): List<Root> {
        val out = ArrayList<Root>()
        val sm = ctx.getSystemService(Context.STORAGE_SERVICE) as StorageManager
        val seen = HashSet<String>()
        // Removable drives: Fire OS mounts USB sticks/disks under /storage/<UUID>
        File("/storage").listFiles()?.sortedBy { it.name }?.forEach { d ->
            if (d.name == "emulated" || d.name == "self" || !d.isDirectory || !d.canRead()) return@forEach
            val label = try {
                if (Build.VERSION.SDK_INT >= 24) sm.getStorageVolume(d)?.getDescription(ctx) ?: "USB drive" else "USB drive"
            } catch (e: Exception) { "USB drive" }
            if (seen.add(d.canonicalPath)) out.add(Root(d, if (out.any { it.label == label }) "$label (${d.name})" else label, true))
        }
        // Internal storage folders (sideloaded files, downloads)
        val ext = Environment.getExternalStorageDirectory()
        for (name in listOf("Movies", "Music", "Download", "Video", "Videos", "TV Shows")) {
            val d = File(ext, name)
            if (d.isDirectory && d.canRead() && (d.list()?.isNotEmpty() == true) && seen.add(d.canonicalPath)) out.add(Root(d, "This device · $name", false))
        }
        return out
    }

    fun rootsKey(): String = detectRoots().joinToString("|") { it.dir.path }

    // ---------------------------------------------------------------- scan

    @Synchronized
    fun scan() {
        if (scanning) return
        scanning = true
        filesScanned.set(0)
        try {
            val idx = Index()
            val files = ArrayList<Pending>()
            for (r in detectRoots()) {
                idx.roots.add(r)
                idx.catalogs[r.label] = Catalog.load(r.dir)
                val fid = ensureFolder(idx, r.dir, null, r.label)
                idx.folders[fid]!!.root = true
                walk(idx, r.dir, r, files, 0, Inherited(emptyList(), null))
            }
            val pool = Executors.newFixedThreadPool(3)
            for (p in files) pool.execute {
                try { addFile(idx, p) } catch (e: Throwable) { /* unreadable file */ }
                filesScanned.incrementAndGet()
            }
            pool.shutdown()
            pool.awaitTermination(2, TimeUnit.HOURS)
            finish(idx)
            probeCache.save()
            index = idx
            scannedAt = System.currentTimeMillis()
        } finally { scanning = false }
    }

    data class Inherited(val langs: List<String>, val genre: String?)
    class DirCtx(val dir: File, val root: Root, val info: JSONObject?, val inh: Inherited, val images: List<String>, val subs: List<String>, val nfos: List<String>, val videoCount: Int, val depth: Int)
    class Pending(val file: File, val name: String, val ctx: DirCtx)

    private fun ensureFolder(idx: Index, dir: File, parent: File?, label: String? = null): String {
        val id = sha("d:" + dir.path)
        if (!idx.folders.containsKey(id)) {
            val pid = parent?.let { sha("d:" + it.path) }
            idx.folders[id] = Folder(id, dir, label ?: dir.name, pid)
            pid?.let { idx.folders[it]?.dirs?.add(id) }
        }
        return id
    }

    private fun walk(idx: Index, dir: File, root: Root, files: MutableList<Pending>, depth: Int, inherited: Inherited) {
        if (depth > 12) return
        val entries = dir.listFiles() ?: return
        val info = readJson(File(dir, "info.json")) ?: readJson(File(dir, ".info.json"))
        val folderLangs = MediaNames.langList(info?.optAny("languages") ?: info?.optAny("language"))
        val nameLangs = if (depth > 0) MediaNames.langsFromName(dir.name).toList() else emptyList()
        val inh = Inherited(if (folderLangs.isNotEmpty()) folderLangs else if (nameLangs.isNotEmpty()) nameLangs else inherited.langs, info?.optStringOrNull("genre") ?: inherited.genre)
        val media = ArrayList<String>(); val images = ArrayList<String>(); val subs = ArrayList<String>(); val nfos = ArrayList<String>()
        for (f in entries.sortedBy { it.name.lowercase() }) {
            val n = f.name
            if (n.startsWith(".")) continue
            val ext = n.substringAfterLast('.', "").lowercase()
            if (f.isDirectory) {
                if (n.lowercase() in SKIP_DIRS) continue
                ensureFolder(idx, f, dir)
                walk(idx, f, root, files, depth + 1, inh)
            } else if (ext in VIDEO_EXT || ext in AUDIO_EXT) media.add(n)
            else if (ext in IMAGE_EXT) images.add(n)
            else if (ext == "srt" || ext == "vtt") subs.add(n)
            else if (ext == "nfo") nfos.add(n)
        }
        val sample = Regex("(^|[ ._-])(sample|trailer)([ ._-]|$)", RegexOption.IGNORE_CASE)
        val videoCount = media.count { it.substringAfterLast('.').lowercase() in VIDEO_EXT && !sample.containsMatchIn(it) }
        val c = DirCtx(dir, root, info, inh, images, subs, nfos, videoCount, depth)
        for (n in media) if (!Regex("(^|[ ._-])sample([ ._-]|$)", RegexOption.IGNORE_CASE).containsMatchIn(n)) files.add(Pending(File(dir, n), n, c))
    }

    private fun findImage(dir: File, images: List<String>, bases: List<String>): File? {
        val lower = images.associateBy { it.lowercase() }
        for (b in bases) for (e in IMAGE_EXT) lower["${b.lowercase()}.$e"]?.let { return File(dir, it) }
        return null
    }

    private fun addFile(idx: Index, p: Pending) {
        val f = p.file
        val ext = p.name.substringAfterLast('.').lowercase()
        val base = p.name.substringBeforeLast('.')
        val rel = f.path.removePrefix(p.ctx.root.dir.path).trimStart('/')
        val id = sha("f:" + f.path)
        val folderId = sha("d:" + p.ctx.dir.path)
        val cat = idx.catalogs[p.ctx.root.label]?.get(rel)
        val fileInfo = p.ctx.info?.optJSONObject("files")?.let { it.optJSONObject(p.name) ?: it.optJSONObject(base) }
        val probe = probeCache.get(f, ext in VIDEO_EXT)
        val item = Item(id, "", f, rel, p.ctx.root.label, folderId, f.length(), f.lastModified())
        val type = cat?.get("type")?.lowercase() ?: ""
        synchronized(idx) {
            if (ext in AUDIO_EXT && !type.contains(Regex("movie|video|episode"))) addTrack(idx, item, base, p.ctx, probe, cat, fileInfo)
            else {
                val ep = if (!type.contains("movie") && fileInfo?.optString("type") != "movie") MediaNames.parseEpisode(base) else null
                if (type.contains(Regex("episode|show")) || ep != null) addEpisode(idx, item, base, p.ctx, probe, cat, fileInfo, ep ?: MediaNames.Episode(1, 0, "", ""))
                else addMovie(idx, item, base, p.ctx, probe, cat, fileInfo)
            }
        }
    }

    private fun videoLangs(base: String, c: DirCtx, probe: Probe?, cat: Map<String, String>?, fileInfo: JSONObject?, folderSingle: Boolean, nfo: Map<String, String>?): MutableList<String> {
        val explicit = MediaNames.langList(cat?.get("languages") ?: cat?.get("language") ?: fileInfo?.optAny("languages") ?: fileInfo?.optAny("language")
            ?: (if (folderSingle) c.info?.optAny("languages") ?: c.info?.optAny("language") else null) ?: nfo?.get("language"))
        if (explicit.isNotEmpty()) return explicit.toMutableList()
        MediaNames.langsFromName(base).let { if (it.isNotEmpty()) return it.toMutableList() }
        if (folderSingle) MediaNames.langsFromName(c.dir.name).let { if (it.isNotEmpty()) return it.toMutableList() }
        val audio = probe?.audio?.mapNotNull { it.lang }?.distinct() ?: emptyList()
        if (audio.isNotEmpty()) return audio.toMutableList()
        return c.inh.langs.toMutableList()
    }

    private fun subtitlesFor(idx: Index, base: String, c: DirCtx): List<Sub> {
        val out = ArrayList<Sub>()
        for (s in c.subs) {
            val sb = s.substringBeforeLast('.')
            if (!sb.lowercase().startsWith(base.lowercase()) && c.videoCount != 1) continue
            val file = File(c.dir, s)
            val sub = Sub(sha("s:" + file.path), MediaNames.langFromSubtitleName(sb, base) ?: "Subtitles", s, file)
            idx.subs[sub.id] = sub
            out.add(sub)
        }
        return out
    }

    private fun addMovie(idx: Index, m: Item, base: String, c: DirCtx, probe: Probe?, cat: Map<String, String>?, fileInfo: JSONObject?) {
        val folderName = c.dir.name
        val folderSingle = c.videoCount == 1 && c.depth > 0 && folderName.lowercase() !in MediaNames.GENERIC_DIRS &&
            MediaNames.normalizeLang(folderName.trim()) == null
        val nfoName = c.nfos.firstOrNull { it.equals("$base.nfo", true) } ?: if (folderSingle) c.nfos.firstOrNull { it.equals("movie.nfo", true) } else null
        val nfo = nfoName?.let { readNfo(File(c.dir, it)) }
        val fromName = MediaNames.cleanTitle(base)
        val fromFolder = if (folderSingle) MediaNames.cleanTitle(folderName) else null
        val folderInfo = if (folderSingle) c.info else null
        fun pick(k: String): String? = cat?.get(k) ?: fileInfo?.optStringOrNull(k) ?: folderInfo?.optStringOrNull(k) ?: nfo?.get(k)
        m.title = pick("title") ?: if (fromFolder != null && fromFolder.title.length >= 2) fromFolder.title else fromName.title
        m.year = pick("year")?.toIntOrNull() ?: fromName.year ?: fromFolder?.year ?: probe?.year
        m.langs = videoLangs(base, c, probe, cat, fileInfo, folderSingle, nfo)
        m.genre = pick("genre") ?: c.inh.genre ?: probe?.genre ?: ""
        m.plot = pick("plot") ?: pick("description") ?: ""
        m.duration = probe?.duration ?: 0
        m.res = probe?.let { MediaNames.resolution(it.width, it.height) } ?: ""
        m.audio = probe?.audio ?: emptyList()
        val posterRel = pick("poster")
        m.poster = posterRel?.let { r -> listOf(File(c.dir, r), File(c.root.dir, r)).firstOrNull { it.isFile } }
            ?: findImage(c.dir, c.images, listOf("$base-poster", "$base.poster", base) + if (folderSingle) listOf("poster", "folder", "cover", "movie", "default") else emptyList())
            ?: if (folderSingle && c.images.size == 1) File(c.dir, c.images[0]) else null
        m.backdrop = findImage(c.dir, c.images, listOf("$base-fanart", "$base-backdrop") + if (folderSingle) listOf("fanart", "backdrop", "background", "landscape") else emptyList())
        m.subs = subtitlesFor(idx, base, c)
        val movie = Item(m.id, "movie", m.file, m.rel, m.root, m.folderId, m.size, m.added).also { copy(m, it) }
        idx.items[movie.id] = movie
        idx.movies.add(movie)
        idx.folders[m.folderId]?.files?.add(movie.id)
    }

    private fun addEpisode(idx: Index, e0: Item, base: String, c: DirCtx, probe: Probe?, cat: Map<String, String>?, fileInfo: JSONObject?, ep: MediaNames.Episode) {
        var showDir = c.dir
        if (Regex("^(season|series|s)[ ._-]?\\d+$|^specials$", RegexOption.IGNORE_CASE).matches(showDir.name)) showDir = showDir.parentFile ?: showDir
        val showName = cat?.get("show") ?: c.info?.optStringOrNull("show") ?: if (ep.show.isNotEmpty()) MediaNames.cleanTitle(ep.show).title else MediaNames.cleanTitle(showDir.name).title
        val key = showName.lowercase().replace(Regex("[^a-z0-9]+"), " ").trim()
        val show = idx.showMap.getOrPut(key) {
            val imgs = showDir.list()?.filter { it.substringAfterLast('.').lowercase() in IMAGE_EXT } ?: emptyList()
            Show(sha("show:$key"), showName).also {
                it.poster = findImage(showDir, imgs, listOf("poster", "folder", "cover", "show")) ?: findImage(c.dir, c.images, listOf("poster", "folder", "cover"))
                idx.shows.add(it)
            }
        }
        val e = Item(e0.id, "episode", e0.file, e0.rel, e0.root, e0.folderId, e0.size, e0.added)
        e.showId = show.id; e.season = ep.season; e.episode = ep.episode
        e.title = cat?.get("title") ?: fileInfo?.optStringOrNull("title") ?: ep.epTitle.ifEmpty { "Episode ${ep.episode}" }
        e.langs = videoLangs(base, c, probe, cat, fileInfo, false, null)
        e.duration = probe?.duration ?: 0
        e.res = probe?.let { MediaNames.resolution(it.width, it.height) } ?: ""
        e.audio = probe?.audio ?: emptyList()
        e.poster = findImage(c.dir, c.images, listOf(base, "$base-thumb"))
        e.subs = subtitlesFor(idx, base, c)
        idx.items[e.id] = e
        show.episodes.add(e.id)
        show.added = maxOf(show.added, e.added)
        for (l in e.langs) if (l !in show.langs) show.langs.add(l)
        idx.folders[e.folderId]?.files?.add(e.id)
    }

    private fun addTrack(idx: Index, t0: Item, base: String, c: DirCtx, probe: Probe?, cat0: Map<String, String>?, fileInfo: JSONObject?) {
        // A catalog row for the album folder describes the album, not each song.
        val cat = if (cat0 != null && cat0["_viaFolder"] == "1") mapOf("album" to (cat0["album"] ?: cat0["title"]), "artist" to cat0["artist"], "album_artist" to cat0["artist"],
            "year" to cat0["year"], "language" to (cat0["language"] ?: cat0["languages"]), "genre" to cat0["genre"]).filterValues { it != null }.mapValues { it.value!! } else cat0
        fun pick(k: String): String? = cat?.get(k) ?: fileInfo?.optStringOrNull(k) ?: probe?.tags?.get(k)
        val dirName = c.dir.name
        val parentName = c.dir.parentFile?.name ?: ""
        val nameMatch = Regex("^(\\d{1,3})[ ._-]+(.*)$").find(base)
        val albumName = pick("album") ?: c.info?.optStringOrNull("album") ?: if (c.depth > 0) dirName else "Unknown Album"
        val albumArtist = cat?.get("album_artist") ?: probe?.tags?.get("album_artist") ?: c.info?.optStringOrNull("artist") ?: pick("artist")
            ?: if (c.depth > 1 && parentName.lowercase() !in MediaNames.GENERIC_DIRS) parentName else "Various Artists"
        val key = "$albumArtist|$albumName".lowercase()
        val explicit = MediaNames.langList(pick("language") ?: c.info?.optAny("languages") ?: c.info?.optAny("language"))
        val langs = explicit.ifEmpty { MediaNames.langsFromName(albumName).toList().ifEmpty { c.inh.langs } }
        val album = idx.albumMap.getOrPut(key) {
            Album(sha("album:$key"), albumName, albumArtist).also {
                it.poster = findImage(c.dir, c.images, listOf("cover", "folder", "front", "album", "albumart", "albumartsmall", "artwork")) ?: if (c.images.size == 1) File(c.dir, c.images[0]) else null
                idx.albums.add(it)
            }
        }
        val t = Item(t0.id, "track", t0.file, t0.rel, t0.root, t0.folderId, t0.size, t0.added)
        t.albumId = album.id
        t.title = pick("title") ?: nameMatch?.groupValues?.get(2) ?: MediaNames.splitWords(base)
        t.artist = pick("artist") ?: albumArtist
        t.track = pick("track")?.substringBefore('/')?.trim()?.toIntOrNull() ?: nameMatch?.groupValues?.get(1)?.toIntOrNull() ?: 0
        t.disc = pick("disc")?.substringBefore('/')?.trim()?.toIntOrNull() ?: 1
        t.duration = probe?.duration ?: 0
        t.langs = langs.toMutableList()
        val y = (pick("year") ?: pick("date"))?.take(4)?.toIntOrNull()
        if (y != null && album.year == null) album.year = y
        if (album.genre.isEmpty()) pick("genre")?.let { album.genre = it }
        for (l in langs) if (l !in album.langs) album.langs.add(l)
        album.added = maxOf(album.added, t.added)
        album.tracks.add(t.id)
        idx.items[t.id] = t
        idx.folders[t.folderId]?.files?.add(t.id)
    }

    private fun copy(from: Item, to: Item) {
        to.title = from.title; to.year = from.year; to.langs = from.langs; to.genre = from.genre; to.plot = from.plot; to.duration = from.duration
        to.res = from.res; to.audio = from.audio; to.subs = from.subs; to.poster = from.poster; to.backdrop = from.backdrop
    }

    private fun finish(idx: Index) {
        val nat = Comparator<String> { a, b -> naturalCompare(a, b) }
        idx.shows.forEach { s -> s.episodes.sortWith(compareBy<String>({ idx.items[it]!!.season }, { idx.items[it]!!.episode }).thenBy(nat) { idx.items[it]!!.title }) }
        idx.albums.forEach { a -> a.tracks.sortWith(compareBy<String>({ idx.items[it]!!.disc }, { idx.items[it]!!.track }).thenBy(nat) { idx.items[it]!!.title }) }
        idx.movies.sortWith(compareBy(nat) { MediaNames.sortKey(it.title) })
        idx.shows.sortWith(compareBy(nat) { MediaNames.sortKey(it.title) })
        idx.albums.sortWith(compareBy(nat) { it.title.lowercase() })
        fun count(id: String): Int { val f = idx.folders[id]!!; f.count = f.files.size + f.dirs.sumOf { count(it) }; return f.count }
        idx.folders.values.filter { it.root }.forEach { count(it.id) }
        idx.folders.values.forEach { f -> f.dirs.retainAll { (idx.folders[it]?.count ?: 0) > 0 }; f.dirs.sortWith(compareBy(nat) { idx.folders[it]!!.name }) }
    }

    // ---------------------------------------------------------------- media probing (cached)

    class Probe(val duration: Int, val width: Int, val height: Int, val audio: List<Audio>, val tags: Map<String, String>) {
        val year get() = tags["year"]?.take(4)?.toIntOrNull()
        val genre get() = tags["genre"]
        fun toJson(): JSONObject = JSONObject().put("d", duration).put("w", width).put("h", height)
            .put("a", JSONArray(audio.map { JSONObject().put("i", it.index).put("l", it.lang ?: "").put("c", it.codec ?: "").put("n", it.channels) }))
            .put("t", JSONObject(tags as Map<*, *>))
        companion object {
            fun fromJson(o: JSONObject): Probe {
                val a = o.optJSONArray("a") ?: JSONArray()
                val audio = (0 until a.length()).map { val x = a.getJSONObject(it); Audio(x.optInt("i"), x.optString("l").ifEmpty { null }, x.optString("c").ifEmpty { null }, x.optInt("n")) }
                val t = o.optJSONObject("t") ?: JSONObject()
                val tags = HashMap<String, String>(); t.keys().forEach { tags[it] = t.getString(it) }
                return Probe(o.optInt("d"), o.optInt("w"), o.optInt("h"), audio, tags)
            }
        }
    }

    private val probeCache = ProbeCache(File(ctx.filesDir, "probe-cache.json"))

    inner class ProbeCache(private val file: File) {
        private val map: MutableMap<String, JSONObject> = HashMap()
        @Volatile private var dirty = false
        init { readJson(file)?.let { o -> o.keys().forEach { k -> o.optJSONObject(k)?.let { map[k] = it } } } }

        fun get(f: File, video: Boolean): Probe? {
            val key = f.path
            synchronized(map) {
                map[key]?.let { c -> if (c.optLong("s") == f.length() && c.optLong("m") == f.lastModified()) return Probe.fromJson(c.getJSONObject("p")) }
            }
            val p = probe(f, video) ?: return null
            synchronized(map) { map[key] = JSONObject().put("s", f.length()).put("m", f.lastModified()).put("p", p.toJson()); dirty = true }
            return p
        }

        fun save() { if (!dirty) return; synchronized(map) { try { file.writeText(JSONObject(map as Map<*, *>).toString()); dirty = false } catch (e: Exception) { } } }
    }

    private fun probe(f: File, video: Boolean): Probe? {
        val r = MediaMetadataRetriever()
        try {
            r.setDataSource(f.path)
            fun m(k: Int) = r.extractMetadata(k)?.trim()?.ifEmpty { null }
            val tags = HashMap<String, String>()
            m(MediaMetadataRetriever.METADATA_KEY_TITLE)?.let { tags["title"] = it }
            m(MediaMetadataRetriever.METADATA_KEY_ALBUM)?.let { tags["album"] = it }
            m(MediaMetadataRetriever.METADATA_KEY_ARTIST)?.let { tags["artist"] = it }
            m(MediaMetadataRetriever.METADATA_KEY_ALBUMARTIST)?.let { tags["album_artist"] = it }
            m(MediaMetadataRetriever.METADATA_KEY_CD_TRACK_NUMBER)?.let { tags["track"] = it }
            m(MediaMetadataRetriever.METADATA_KEY_DISC_NUMBER)?.let { tags["disc"] = it }
            (m(MediaMetadataRetriever.METADATA_KEY_YEAR) ?: m(MediaMetadataRetriever.METADATA_KEY_DATE))?.let { tags["year"] = it }
            m(MediaMetadataRetriever.METADATA_KEY_GENRE)?.let { tags["genre"] = it.replace(Regex("^\\(\\d+\\)$"), "") }
            val dur = (m(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L) / 1000
            val w = m(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
            val h = m(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0
            val audio = if (video) audioTracks(f) else emptyList()
            return Probe(dur.toInt(), w, h, audio, tags)
        } catch (e: Throwable) {
            return null
        } finally { try { r.release() } catch (e: Throwable) { } }
    }

    private fun audioTracks(f: File): List<Audio> {
        val ex = MediaExtractor()
        return try {
            ex.setDataSource(f.path)
            var n = 0
            (0 until ex.trackCount).mapNotNull { i ->
                val fmt = ex.getTrackFormat(i)
                val mime = fmt.getString(MediaFormat.KEY_MIME) ?: return@mapNotNull null
                if (!mime.startsWith("audio/")) return@mapNotNull null
                val lang = if (fmt.containsKey(MediaFormat.KEY_LANGUAGE)) MediaNames.normalizeLang(fmt.getString(MediaFormat.KEY_LANGUAGE)) else null
                val ch = if (fmt.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) fmt.getInteger(MediaFormat.KEY_CHANNEL_COUNT) else 2
                Audio(n++, lang, mime.removePrefix("audio/"), ch)
            }
        } catch (e: Throwable) { emptyList() } finally { ex.release() }
    }

    // ---------------------------------------------------------------- catalog.csv / catalog.json / .nfo

    class Catalog(private val byPath: Map<String, Map<String, String>>, private val byName: Map<String, Map<String, String>?>) {
        val size get() = byPath.size
        fun get(rel: String): Map<String, String>? {
            val k = norm(rel)
            byPath[k]?.let { return it }
            val dir = k.substringBeforeLast('/', "")
            if (dir.isNotEmpty()) byPath[dir]?.let { return it + ("_viaFolder" to "1") }
            return byName[k.substringAfterLast('/')]
        }
        companion object {
            fun norm(p: String) = p.replace('\\', '/').removePrefix("./").trimStart('/').lowercase()
            fun load(root: File): Catalog {
                val byPath = HashMap<String, Map<String, String>>()
                val byName = HashMap<String, Map<String, String>?>()
                fun add(e: Map<String, String>) {
                    val p = e["path"] ?: return
                    val k = norm(p); byPath[k] = e
                    val n = k.substringAfterLast('/')
                    byName[n] = if (byName.containsKey(n)) null else e
                }
                listOf("catalog.csv", "Catalog.csv").map { File(root, it) }.firstOrNull { it.isFile }?.let { f ->
                    try { MediaNames.parseCsv(f.readText()).forEach(::add) } catch (e: Exception) { }
                }
                File(root, "catalog.json").takeIf { it.isFile }?.let { f ->
                    try {
                        val txt = f.readText().trim()
                        val arr = if (txt.startsWith("[")) JSONArray(txt) else JSONObject(txt).optJSONArray("items") ?: JSONArray()
                        for (i in 0 until arr.length()) { val o = arr.getJSONObject(i); val m = HashMap<String, String>(); o.keys().forEach { m[it.lowercase()] = o.get(it).toString() }; add(m) }
                    } catch (e: Exception) { }
                }
                return Catalog(byPath, byName)
            }
        }
    }

    private fun readNfo(f: File): Map<String, String>? = try {
        val x = f.readText()
        if (!Regex("<(movie|tvshow|episodedetails)", RegexOption.IGNORE_CASE).containsMatchIn(x)) null
        else {
            fun tag(t: String) = Regex("<$t>([\\s\\S]*?)</$t>", RegexOption.IGNORE_CASE).find(x)?.groupValues?.get(1)?.replace(Regex("<!\\[CDATA\\[|]]>"), "")?.trim()?.ifEmpty { null }
            listOf("title" to tag("title"), "year" to tag("year"), "plot" to (tag("plot") ?: tag("outline")), "genre" to tag("genre"), "language" to tag("language"))
                .filter { it.second != null }.associate { it.first to it.second!! }
        }
    } catch (e: Exception) { null }

    companion object {
        val VIDEO_EXT = setOf("mp4", "m4v", "mkv", "avi", "mov", "webm", "ts", "m2ts", "mts", "wmv", "mpg", "mpeg", "flv", "3gp", "vob")
        val AUDIO_EXT = setOf("mp3", "flac", "m4a", "aac", "ogg", "oga", "opus", "wav", "wma", "alac", "aiff", "aif")
        val IMAGE_EXT = listOf("jpg", "jpeg", "png", "webp")
        val SKIP_DIRS = setOf("\$recycle.bin", "system volume information", "lost+found", ".trash", ".trashes", "android", "lost.dir", "recycler", "msdownld.tmp", "windows", "program files", "program files (x86)", "programdata", "appdata")

        fun sha(s: String): String = MessageDigest.getInstance("SHA-1").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }.substring(0, 16)

        fun readJson(f: File): JSONObject? = try { if (f.isFile) JSONObject(f.readText().removePrefix("﻿")) else null } catch (e: Exception) { null }

        fun naturalCompare(a: String, b: String): Int {
            val re = Regex("(\\d+)|(\\D+)")
            val x = re.findAll(a.lowercase()).map { it.value }.toList()
            val y = re.findAll(b.lowercase()).map { it.value }.toList()
            for (i in 0 until minOf(x.size, y.size)) {
                val p = x[i]; val q = y[i]
                val c = if (p[0].isDigit() && q[0].isDigit()) (p.toBigInteger().compareTo(q.toBigInteger())) else p.compareTo(q)
                if (c != 0) return c
            }
            return x.size - y.size
        }
    }
}

// JSON helpers: values in info.json may be strings, numbers or arrays.
fun JSONObject.optStringOrNull(k: String): String? = if (has(k) && !isNull(k)) opt(k).let { if (it is JSONArray) (0 until it.length()).joinToString(", ") { i -> it.get(i).toString() } else it.toString() }.ifBlank { null } else null
fun JSONObject.optAny(k: String): String? = optStringOrNull(k)
