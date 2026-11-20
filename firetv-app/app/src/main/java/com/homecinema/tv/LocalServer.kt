package com.homecinema.tv

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import fi.iki.elonen.NanoHTTPD
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.security.MessageDigest
import kotlin.concurrent.thread

/**
 * In-app web server on 127.0.0.1 that speaks the same API as vidaa-media/server/server.js,
 * so the shared TV web UI (bundled under assets/web) runs unchanged on the Fire TV.
 */
class LocalServer(private val ctx: Context, val lib: Library, port: Int) : NanoHTTPD("127.0.0.1", port) {

    private val stateFile = File(ctx.filesDir, "state.json")
    private val state: JSONObject = Library.readJson(stateFile)?.also { if (!it.has("progress")) it.put("progress", JSONObject()) } ?: JSONObject().put("progress", JSONObject())
    private val imgDir = File(ctx.cacheDir, "img").apply { mkdirs() }

    fun rescanAsync() { if (!lib.scanning) thread(name = "scan") { try { lib.scan() } catch (e: Throwable) { } } }

    override fun serve(s: IHTTPSession): Response {
        val uri = s.uri
        return try {
            when {
                uri == "/api/library" -> json(libraryPayload())
                uri == "/api/status" -> json(JSONObject().put("scanning", lib.scanning).put("filesScanned", lib.filesScanned.get()).put("version", if (lib.scannedAt > 0) lib.scannedAt else JSONObject.NULL).put("ffmpeg", false))
                uri == "/api/folder" -> folderPayload(s.parms["id"])?.let { json(it) } ?: newFixedLengthResponse(Response.Status.NOT_FOUND, "application/json", "{}")
                uri == "/api/state" -> json(synchronized(state) { JSONObject(state.toString()) })
                uri == "/api/progress" && s.method == Method.POST -> { saveProgress(readBody(s)); json(JSONObject().put("ok", true)) }
                uri == "/api/rescan" && s.method == Method.POST -> { rescanAsync(); json(JSONObject().put("ok", true)) }
                uri == "/api/catalog.csv" -> newFixedLengthResponse(Response.Status.OK, "text/csv; charset=utf-8", "﻿" + catalogCsv(s.parms["root"])).also { it.addHeader("Content-Disposition", "attachment; filename=\"catalog.csv\"") }
                uri.startsWith("/media/") -> lib.index.items[uri.removePrefix("/media/").take(16)]?.let { serveFile(s, it.file, mimeOf(it.file.name)) } ?: notFound()
                uri.startsWith("/img/") -> serveImage(s, uri.removePrefix("/img/").take(16), s.parms["v"])
                uri.startsWith("/sub/") -> serveSub(uri.removePrefix("/sub/"), s.parms["offset"]?.toDoubleOrNull() ?: 0.0)
                else -> serveAsset(if (uri == "/") "index.html" else uri.trimStart('/'))
            }
        } catch (e: Throwable) {
            newFixedLengthResponse(Response.Status.INTERNAL_ERROR, MIME_PLAINTEXT, "Server error")
        }
    }

    // ---------------------------------------------------------------- payloads

    private fun libraryPayload(): JSONObject {
        val idx = lib.index
        val counts = LinkedHashMap<String, IntArray>()
        fun bump(ls: List<String>, k: Int) { for (l in ls) counts.getOrPut(l) { IntArray(3) }[k]++ }
        fun subsJson(subs: List<Library.Sub>) = JSONArray(subs.map { JSONObject().put("id", it.id).put("lang", it.lang).put("label", it.label) })
        fun audioJson(a: List<Library.Audio>) = JSONArray(a.map { JSONObject().put("index", it.index).put("lang", it.lang ?: JSONObject.NULL).put("codec", it.codec ?: "").put("channels", it.channels).put("title", "") })
        val movies = JSONArray(idx.movies.map { m ->
            bump(m.langs, 0)
            JSONObject().put("id", m.id).put("title", m.title).put("year", m.year ?: JSONObject.NULL).put("langs", JSONArray(m.langs)).put("genre", m.genre).put("plot", m.plot)
                .put("res", m.res).put("duration", m.duration).put("added", m.added).put("direct", true).put("audio", audioJson(m.audio)).put("subs", subsJson(m.subs))
                .put("folderId", m.folderId).put("root", m.root).put("hasBackdrop", true)
        })
        val shows = JSONArray(idx.shows.map { s ->
            bump(s.langs, 1)
            JSONObject().put("id", s.id).put("title", s.title).put("langs", JSONArray(s.langs)).put("added", s.added).put("episodes", JSONArray(s.episodes.map { id ->
                val e = idx.items[id]!!
                JSONObject().put("id", id).put("season", e.season).put("episode", e.episode).put("title", e.title).put("duration", e.duration).put("res", e.res).put("direct", true)
                    .put("langs", JSONArray(e.langs)).put("audio", audioJson(e.audio)).put("subs", subsJson(e.subs))
            }))
        })
        val albums = JSONArray(idx.albums.map { a ->
            bump(a.langs, 2)
            JSONObject().put("id", a.id).put("title", a.title).put("artist", a.artist).put("year", a.year ?: JSONObject.NULL).put("genre", a.genre).put("langs", JSONArray(a.langs)).put("added", a.added)
                .put("tracks", JSONArray(a.tracks.map { id -> val t = idx.items[id]!!; JSONObject().put("id", id).put("title", t.title).put("artist", t.artist).put("track", t.track).put("disc", t.disc).put("duration", t.duration) }))
        })
        val languages = JSONArray(counts.entries.sortedByDescending { it.value.sum() }.map { JSONObject().put("name", it.key).put("movies", it.value[0]).put("shows", it.value[1]).put("albums", it.value[2]) })
        val roots = JSONArray(idx.roots.map { r -> JSONObject().put("label", r.label).put("path", r.dir.path).put("usb", r.usb).put("catalogEntries", idx.catalogs[r.label]?.size ?: 0) })
        return JSONObject().put("version", if (lib.scannedAt > 0) lib.scannedAt else JSONObject.NULL).put("scanning", lib.scanning).put("movies", movies).put("shows", shows)
            .put("albums", albums).put("languages", languages).put("roots", roots).put("ffmpeg", false).put("native", true)
    }

    private fun folderPayload(id: String?): JSONObject? {
        val idx = lib.index
        if (id.isNullOrEmpty()) {
            val roots = idx.folders.values.filter { it.root && it.count > 0 }
            return JSONObject().put("id", JSONObject.NULL).put("name", "All drives").put("parentId", JSONObject.NULL).put("files", JSONArray())
                .put("dirs", JSONArray(roots.map { JSONObject().put("id", it.id).put("name", it.name).put("count", it.count) }))
        }
        val f = idx.folders[id] ?: return null
        return JSONObject().put("id", f.id).put("name", f.name).put("parentId", if (f.root) JSONObject.NULL else f.parentId).put("path", f.dir.path)
            .put("dirs", JSONArray(f.dirs.map { d -> val x = idx.folders[d]!!; JSONObject().put("id", x.id).put("name", x.name).put("count", x.count) }))
            .put("files", JSONArray(f.files.mapNotNull { fid ->
                val x = idx.items[fid] ?: return@mapNotNull null
                JSONObject().put("id", x.id).put("kind", x.kind).put("title", if (x.kind == "episode") "S${x.season}E${x.episode} ${x.title}" else x.title)
                    .put("year", x.year ?: JSONObject.NULL).put("langs", JSONArray(x.langs)).put("res", x.res).put("duration", x.duration)
                    .put("albumId", x.albumId ?: JSONObject.NULL).put("showId", x.showId ?: JSONObject.NULL).put("name", x.file.name)
            }))
    }

    private fun catalogCsv(rootLabel: String?): String {
        val idx = lib.index
        val sb = StringBuilder("root,path,type,title,year,language,genre,show,season,episode,album,artist,track,has_poster,plot\r\n")
        for (it in idx.items.values.sortedBy { it.rel }) {
            if (rootLabel != null && it.root != rootLabel) continue
            val show = it.showId?.let { s -> idx.shows.firstOrNull { x -> x.id == s } }
            val album = it.albumId?.let { a -> idx.albums.firstOrNull { x -> x.id == a } }
            val row = listOf(it.root, it.rel, it.kind, it.title, it.year ?: album?.year ?: "", it.langs, it.genre.ifEmpty { album?.genre ?: "" }, show?.title ?: "",
                if (it.season > 0) it.season else "", if (it.kind == "episode") it.episode else "", album?.title ?: "", it.artist, if (it.track > 0) it.track else "",
                if (it.kind == "track") (if (album?.poster != null) "yes" else "") else (if (it.poster != null) "yes" else "no"), it.plot)
            sb.append(row.joinToString(",") { v -> MediaNames.csvCell(v) }).append("\r\n")
        }
        return sb.toString()
    }

    private fun saveProgress(b: JSONObject) {
        val id = b.optString("id")
        if (!lib.index.items.containsKey(id)) return
        val pos = b.optDouble("pos", 0.0); val dur = b.optDouble("dur", 0.0)
        synchronized(state) {
            val p = state.getJSONObject("progress")
            if (b.optBoolean("done") || (dur > 0 && pos > dur * 0.94)) p.remove(id)
            else if (pos > 30) p.put(id, JSONObject().put("pos", pos.toLong()).put("dur", dur.toLong()).put("at", System.currentTimeMillis()))
            try { stateFile.writeText(state.toString()) } catch (e: Exception) { }
        }
    }

    private fun readBody(s: IHTTPSession): JSONObject {
        val len = s.headers["content-length"]?.toIntOrNull() ?: 0
        if (len <= 0 || len > 100_000) return JSONObject()
        val buf = ByteArray(len)
        var read = 0
        while (read < len) { val n = s.inputStream.read(buf, read, len - read); if (n < 0) break; read += n }
        return try { JSONObject(String(buf, 0, read)) } catch (e: Exception) { JSONObject() }
    }

    // ---------------------------------------------------------------- files

    private fun json(o: JSONObject) = newFixedLengthResponse(Response.Status.OK, "application/json; charset=utf-8", o.toString()).also { it.addHeader("Cache-Control", "no-store") }
    private fun notFound() = newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "Not found")

    private fun serveFile(s: IHTTPSession, f: File, mime: String, cache: String = "no-cache"): Response {
        if (!f.isFile) return notFound()
        val size = f.length()
        val range = s.headers["range"]
        val res: Response
        val m = range?.let { Regex("bytes=(\\d*)-(\\d*)").find(it) }
        if (m != null) {
            var start = m.groupValues[1].toLongOrNull() ?: 0L
            var end = m.groupValues[2].toLongOrNull() ?: (size - 1)
            if (m.groupValues[1].isEmpty() && m.groupValues[2].isNotEmpty()) { start = maxOf(0, size - m.groupValues[2].toLong()); end = size - 1 }
            if (start >= size || end >= size || start > end) {
                return newFixedLengthResponse(Response.Status.RANGE_NOT_SATISFIABLE, MIME_PLAINTEXT, "").also { it.addHeader("Content-Range", "bytes */$size") }
            }
            val fis = FileInputStream(f); fis.skip(start)
            res = newFixedLengthResponse(Response.Status.PARTIAL_CONTENT, mime, fis, end - start + 1)
            res.addHeader("Content-Range", "bytes $start-$end/$size")
        } else res = newFixedLengthResponse(Response.Status.OK, mime, FileInputStream(f), size)
        res.addHeader("Accept-Ranges", "bytes")
        res.addHeader("Cache-Control", cache)
        return res
    }

    private fun serveAsset(path: String): Response {
        if (path.contains("..")) return notFound()
        return try {
            val bytes = ctx.assets.open("web/$path").use { it.readBytes() }
            newFixedLengthResponse(Response.Status.OK, mimeOf(path), ByteArrayInputStream(bytes), bytes.size.toLong()).also { it.addHeader("Cache-Control", "no-cache") }
        } catch (e: Exception) { notFound() }
    }

    // ---------------------------------------------------------------- artwork

    private fun serveImage(s: IHTTPSession, id: String, variant: String?): Response {
        val idx = lib.index
        val cache = "max-age=86400"
        idx.folders[id]?.let { return svg(it.name, "folder") }
        val album = idx.albums.firstOrNull { it.id == id } ?: idx.items[id]?.takeIf { it.kind == "track" }?.let { t -> idx.albums.firstOrNull { it.id == t.albumId } }
        if (album != null) return albumCover(album)?.let { serveFile(s, it, mimeOf(it.name), cache) } ?: svg(album.title, "album")
        idx.shows.firstOrNull { it.id == id }?.let { sh ->
            sh.poster?.let { return serveFile(s, it, mimeOf(it.name), cache) }
            val ep = sh.episodes.firstOrNull()?.let { idx.items[it] }
            return ep?.let { videoFrame(it, false) }?.let { serveFile(s, it, "image/jpeg", cache) } ?: svg(sh.title, "movie")
        }
        val it = idx.items[id] ?: return svg("?", "movie")
        if (variant == "backdrop") {
            it.backdrop?.let { b -> return serveFile(s, b, mimeOf(b.name), cache) }
            return videoFrame(it, true)?.let { f -> serveFile(s, f, "image/jpeg", cache) } ?: notFound()
        }
        it.poster?.let { p -> return serveFile(s, p, mimeOf(p.name), cache) }
        return videoFrame(it, false)?.let { f -> serveFile(s, f, "image/jpeg", cache) } ?: svg(it.title, "movie")
    }

    private val imgLock = Any()

    private fun videoFrame(item: Library.Item, large: Boolean): File? {
        val out = File(imgDir, "${item.id}-${if (large) "large" else "small"}.jpg")
        val fail = File(out.path + ".fail")
        if (out.isFile) return out
        if (fail.exists()) return null
        synchronized(imgLock) {
            if (out.isFile) return out
            val r = MediaMetadataRetriever()
            try {
                r.setDataSource(item.file.path)
                val t = if (item.duration > 0) maxOf(5, item.duration / 5).toLong() else 60L
                val bmp = r.getFrameAtTime(t * 1_000_000, MediaMetadataRetriever.OPTION_CLOSEST_SYNC) ?: r.frameAtTime
                if (bmp == null) { fail.createNewFile(); return null }
                writeJpeg(scale(bmp, if (large) 1280 else 480), out)
                return out
            } catch (e: Throwable) { fail.createNewFile(); return null } finally { try { r.release() } catch (e: Throwable) { } }
        }
    }

    private fun albumCover(a: Library.Album): File? {
        a.poster?.let { return it }
        val out = File(imgDir, "${a.id}-cover.jpg")
        val fail = File(out.path + ".fail")
        if (out.isFile) return out
        if (fail.exists()) return null
        synchronized(imgLock) {
            for (tid in a.tracks.take(5)) {
                val t = lib.index.items[tid] ?: continue
                val r = MediaMetadataRetriever()
                try {
                    r.setDataSource(t.file.path)
                    val pic = r.embeddedPicture ?: continue
                    val bmp = BitmapFactory.decodeByteArray(pic, 0, pic.size) ?: continue
                    writeJpeg(scale(bmp, 500), out)
                    return out
                } catch (e: Throwable) { } finally { try { r.release() } catch (e: Throwable) { } }
            }
            fail.createNewFile()
            return null
        }
    }

    private fun scale(b: Bitmap, w: Int): Bitmap = if (b.width <= w) b else Bitmap.createScaledBitmap(b, w, (b.height.toLong() * w / b.width).toInt().coerceAtLeast(1), true)
    private fun writeJpeg(b: Bitmap, f: File) { val tmp = File(f.path + ".tmp"); FileOutputStream(tmp).use { b.compress(Bitmap.CompressFormat.JPEG, 82, it) }; tmp.renameTo(f) }

    private fun svg(title: String, kind: String): Response {
        val h = MessageDigest.getInstance("MD5").digest(title.toByteArray()).let { ((it[0].toInt() and 0xff) shl 16) or ((it[1].toInt() and 0xff) shl 8) or (it[2].toInt() and 0xff) }
        val hue = h % 360
        val words = title.replace(Regex("[^\\p{L}\\p{N} ]"), " ").split(Regex("\\s+")).filter { it.isNotEmpty() }
        val initials = (if (words.size > 1) "${words[0][0]}${words[1][0]}" else (words.firstOrNull() ?: "?").take(2)).uppercase().replace(Regex("[<&>]"), "")
        val square = kind == "album" || kind == "folder"
        val w = 400; val ht = if (square) 400 else 600
        val icon = if (kind == "folder") "<path d=\"M110 150h70l25 25h85a15 15 0 0 1 15 15v120a15 15 0 0 1-15 15H110a15 15 0 0 1-15-15V165a15 15 0 0 1 15-15z\" fill=\"rgba(255,255,255,.85)\"/>"
        else "<text x=\"50%\" y=\"${if (kind == "album") 58 else 54}%\" font-family=\"Arial,Helvetica,sans-serif\" font-size=\"${if (kind == "album") 130 else 150}\" font-weight=\"700\" fill=\"rgba(255,255,255,.92)\" text-anchor=\"middle\" dominant-baseline=\"middle\">$initials</text>"
        val body = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"$w\" height=\"$ht\" viewBox=\"0 0 $w $ht\"><defs><linearGradient id=\"g\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"hsl($hue,55%,42%)\"/><stop offset=\"1\" stop-color=\"hsl(${(hue + 40) % 360},60%,18%)\"/></linearGradient></defs><rect width=\"100%\" height=\"100%\" fill=\"url(#g)\"/>$icon</svg>"
        return newFixedLengthResponse(Response.Status.OK, "image/svg+xml", body).also { it.addHeader("Cache-Control", "max-age=300") }
    }

    // ---------------------------------------------------------------- subtitles

    private fun serveSub(id: String, offset: Double): Response {
        val sub = lib.index.subs[id.take(16)] ?: return notFound()
        val f = sub.file ?: return notFound()
        val bytes = f.readBytes()
        val utf = String(bytes, Charsets.UTF_8)
        val text = if (utf.contains('�')) String(bytes, Charsets.ISO_8859_1) else utf
        return newFixedLengthResponse(Response.Status.OK, "text/vtt; charset=utf-8", Subtitles.srtToVtt(text, offset))
    }

    companion object {
        fun mimeOf(name: String): String = when (name.substringAfterLast('.').lowercase()) {
            "html" -> "text/html; charset=utf-8"; "js" -> "application/javascript; charset=utf-8"; "css" -> "text/css; charset=utf-8"
            "json" -> "application/json"; "svg" -> "image/svg+xml"; "png" -> "image/png"; "jpg", "jpeg" -> "image/jpeg"; "webp" -> "image/webp"
            "mp4", "m4v" -> "video/mp4"; "mkv" -> "video/x-matroska"; "webm" -> "video/webm"; "mov" -> "video/quicktime"; "avi" -> "video/x-msvideo"
            "ts", "m2ts", "mts" -> "video/mp2t"; "mpg", "mpeg", "vob" -> "video/mpeg"; "wmv" -> "video/x-ms-wmv"; "flv" -> "video/x-flv"; "3gp" -> "video/3gpp"
            "mp3" -> "audio/mpeg"; "flac" -> "audio/flac"; "m4a", "alac" -> "audio/mp4"; "aac" -> "audio/aac"; "ogg", "oga", "opus" -> "audio/ogg"
            "wav" -> "audio/wav"; "wma" -> "audio/x-ms-wma"; "aiff", "aif" -> "audio/aiff"
            else -> "application/octet-stream"
        }
    }
}

object Subtitles {
    private fun toSeconds(ts: String): Double { val p = ts.replace(',', '.').split(':'); return p[0].toDouble() * 3600 + p[1].toDouble() * 60 + p[2].toDouble() }
    private fun fmt(s: Double): String { val h = (s / 3600).toInt(); val m = ((s % 3600) / 60).toInt(); val sec = s % 60; return "%02d:%02d:%06.3f".format(java.util.Locale.US, h, m, sec) }

    /** SRT (or VTT) text -> WebVTT, shifting cues back by [offset] seconds. */
    fun srtToVtt(text: String, offset: Double): String {
        val body = text.removePrefix("﻿").replace("\r", "").replace(Regex("^WEBVTT[^\\n]*\\n"), "")
        val out = StringBuilder("WEBVTT\n\n")
        val re = Regex("((?:\\d{1,2}:)?\\d{2}:\\d{2}[.,]\\d{1,3})\\s*-->\\s*((?:\\d{1,2}:)?\\d{2}:\\d{2}[.,]\\d{1,3})")
        for (block in body.split(Regex("\\n{2,}"))) {
            val lines = block.split('\n').filterIndexed { i, l -> !(i == 0 && l.trim().matches(Regex("\\d+"))) }
            val ti = lines.indexOfFirst { it.contains("-->") }
            if (ti < 0) continue
            val m = re.find(lines[ti]) ?: continue
            fun fix(t: String) = if (t.split(':').size == 2) "00:$t" else t
            val a = toSeconds(fix(m.groupValues[1])) - offset
            val b = toSeconds(fix(m.groupValues[2])) - offset
            if (b <= 0) continue
            out.append(fmt(maxOf(0.0, a))).append(" --> ").append(fmt(b)).append('\n')
            lines.drop(ti + 1).forEach { out.append(it.replace(Regex("\\{\\\\[^}]*}"), "")).append('\n') }
            out.append('\n')
        }
        return out.toString()
    }
}
