package com.homecinema.tv

/**
 * Pure name/language logic (no Android classes, so it is unit-tested on the JVM).
 * Kotlin port of vidaa-media/server/lang.js and the title helpers in scanner.js —
 * keep both in step so the TV app and the Fire TV app name things the same way.
 */
object MediaNames {

    private val LANGS: Map<String, List<String>> = linkedMapOf(
        "English" to listOf("en", "eng", "english"),
        "Tamil" to listOf("ta", "tam", "tamil"),
        "Telugu" to listOf("te", "tel", "telugu"),
        "Hindi" to listOf("hi", "hin", "hindi", "bollywood"),
        "Malayalam" to listOf("ml", "mal", "malayalam"),
        "Kannada" to listOf("kn", "kan", "kannada"),
        "Bengali" to listOf("bn", "ben", "bengali", "bangla"),
        "Marathi" to listOf("mr", "mar", "marathi"),
        "Gujarati" to listOf("gu", "guj", "gujarati"),
        "Punjabi" to listOf("pa", "pan", "punjabi"),
        "Urdu" to listOf("ur", "urd", "urdu"),
        "Sinhala" to listOf("si", "sin", "sinhala", "sinhalese"),
        "French" to listOf("fr", "fre", "fra", "french", "francais"),
        "Spanish" to listOf("es", "spa", "spanish", "espanol", "castellano", "latino"),
        "German" to listOf("de", "ger", "deu", "german", "deutsch"),
        "Italian" to listOf("it", "ita", "italian"),
        "Portuguese" to listOf("pt", "por", "portuguese"),
        "Russian" to listOf("ru", "rus", "russian"),
        "Arabic" to listOf("ar", "ara", "arabic"),
        "Japanese" to listOf("ja", "jpn", "japanese"),
        "Korean" to listOf("ko", "kor", "korean"),
        "Chinese" to listOf("zh", "chi", "zho", "chinese", "mandarin", "cantonese"),
        "Thai" to listOf("th", "tha", "thai"),
        "Turkish" to listOf("tr", "tur", "turkish"),
        "Dutch" to listOf("nl", "dut", "nld", "dutch"),
        "Swedish" to listOf("sv", "swe", "swedish"),
        "Polish" to listOf("pl", "pol", "polish"),
        "Indonesian" to listOf("id", "ind", "indonesian"),
        "Malay" to listOf("ms", "may", "msa", "malay"),
        "Vietnamese" to listOf("vi", "vie", "vietnamese"),
        "Persian" to listOf("fa", "per", "fas", "persian", "farsi"),
        "Hebrew" to listOf("he", "heb", "hebrew"),
        "Greek" to listOf("el", "gre", "ell", "greek"),
    )
    private val CODE_TO_NAME = HashMap<String, String>()
    private val WORD_TO_NAME = HashMap<String, String>()
    private val NAME_TO_ISO = HashMap<String, String>()

    init {
        for ((name, codes) in LANGS) {
            for (c in codes) {
                CODE_TO_NAME[c] = name
                if (c.length > 3) WORD_TO_NAME[c] = name
            }
            WORD_TO_NAME[name.lowercase()] = name
            NAME_TO_ISO[name] = codes[0]
        }
    }

    /** "tam", "ta", "Tamil", "en-US" -> display name, or null. */
    fun normalizeLang(value: String?): String? {
        if (value == null) return null
        val v = value.trim().lowercase()
        if (v.isEmpty() || v in setOf("und", "unknown", "mis", "zxx")) return null
        CODE_TO_NAME[v]?.let { return it }
        WORD_TO_NAME[v]?.let { return it }
        val base = v.split('-', '_')[0]
        CODE_TO_NAME[base]?.let { return it }
        if (Regex("^[a-z]{4,}$").matches(v)) return v.replaceFirstChar { it.uppercase() }
        return null
    }

    fun isoCode(name: String?): String? = name?.let { NAME_TO_ISO[it] }

    private val NOT_LANG_CAPS = setOf("the", "and", "avi", "mkv", "mp4", "dts", "aac")

    /** Language names mentioned in a file or folder name (whole words, [TAM], .HIN.). */
    fun langsFromName(name: String?): LinkedHashSet<String> {
        val found = LinkedHashSet<String>()
        if (name.isNullOrEmpty()) return found
        val lower = name.lowercase()
        for (w in lower.split(Regex("[^a-z]+"))) if (w.isNotEmpty()) WORD_TO_NAME[w]?.let { found.add(it) }
        for (m in Regex("[\\[(]([a-z]{2,3}(?:[ ,+&/-]+[a-z]{2,3})*)[\\])]").findAll(lower)) {
            for (code in m.groupValues[1].split(Regex("[ ,+&/-]+"))) if (code.length == 3) CODE_TO_NAME[code]?.let { found.add(it) }
        }
        for (m in Regex("(?:^|[ ._-])([A-Z]{3})(?=$|[ ._-])").findAll(name)) {
            val code = m.groupValues[1].lowercase()
            if (code !in NOT_LANG_CAPS) CODE_TO_NAME[code]?.let { found.add(it) }
        }
        return found
    }

    /** "Movie.en.srt" / "Movie.Tamil.srt" -> language name. */
    fun langFromSubtitleName(subBase: String, videoBase: String?): String? {
        var rest = subBase
        if (videoBase != null && subBase.lowercase().startsWith(videoBase.lowercase())) rest = subBase.substring(videoBase.length)
        for (part in rest.split(Regex("[._ -]+")).reversed()) {
            val n = normalizeLang(part) ?: continue
            if (part.length <= 3 && CODE_TO_NAME[part.lowercase()] == null) continue
            return n
        }
        return null
    }

    fun langList(v: String?): List<String> =
        if (v.isNullOrBlank()) emptyList() else v.split(Regex("[,;/|+&]")).mapNotNull { normalizeLang(it) }.distinct()

    // ---------------------------------------------------------------- titles

    private val JUNK = ("1080p 720p 480p 576p 360p 2160p 4k uhd hdr hdr10 bluray brrip bdrip bdremux remux webrip webdl web-dl hdtv dvdrip dvdscr dvd hdrip hdcam camrip predvd tsrip " +
        "x264 x265 h264 h265 hevc avc xvid divx aac aac2 ac3 eac3 dts dd5 ddp5 ddp atmos truehd 10bit 8bit proper repack extended unrated remastered imax esub esubs untouched amzn yts yify rarbg psa galaxyrg").split(" ").toSet()
    private val JUNK_CAPS = "web dl blu ray dual multi audio org original line hq dd dv dolby vision sub subs cam ts tc pre nf hs zee5 sunnxt hotstar netflix".split(" ").toSet()
    val GENERIC_DIRS = setOf("movies", "movie", "films", "film", "videos", "video", "downloads", "download", "media", "new", "hd", "4k", "uhd", "collection", "my movies",
        "tv", "tv shows", "shows", "series", "music", "songs", "audio", "mp3", "usb", "others", "misc", "dubbed", "old", "latest")

    fun splitWords(name: String): String {
        var s = name
        if (!s.contains(Regex("\\s")) || s.count { it == '.' || it == '_' } > 2) s = s.replace(Regex("[._]+"), " ")
        return s.replace(Regex("\\s+"), " ").trim()
    }

    data class Title(val title: String, val year: Int?)

    /** "Vikram.2022.Tamil.1080p.WEB-DL.x264" -> Title("Vikram", 2022) */
    fun cleanTitle(raw: String): Title {
        val s = splitWords(raw).replace(Regex("\\[[^\\]]*]"), " ").replace(Regex("\\{[^}]*}"), " ")
        val tokens = s.split(" ").filter { it.isNotEmpty() }
        val out = ArrayList<String>()
        var year: Int? = null
        val yearRe = Regex("^(19[2-9]\\d|20[0-4]\\d)$")
        for (i in tokens.indices) {
            val t = tokens[i]
            val bare = t.replace(Regex("[()]"), "")
            val low = bare.lowercase().replace(Regex("[^a-z0-9-]"), "")
            if (i > 0 && yearRe.matches(bare)) { year = bare.toInt(); break }
            if (i > 0 && (low in JUNK || Regex("^\\d{3,4}p$").matches(low) || Regex("^(x|h)26[45]$").matches(low) ||
                    (low in JUNK_CAPS && bare.length > 1 && bare == bare.uppercase()))) break
            if (i > 0 && langsFromName(bare).isNotEmpty() && Regex("^[A-Za-z]{4,}$").matches(bare) && !bare[0].isLowerCase()) {
                val next = tokens.getOrNull(i + 1)
                if (next == null || next.lowercase() in JUNK || Regex("^(19|20)\\d\\d$").matches(next) || langsFromName(next).isNotEmpty()) break
            }
            if (t == "-" && i > 0) { if (out.isNotEmpty()) break; continue }
            out.add(bare)
        }
        var title = out.joinToString(" ").replace(Regex("\\s+-\\s*$"), "").replace(Regex("[()]"), "").trim()
        if (title.isEmpty()) title = raw
        if (title == title.lowercase() || title == title.uppercase()) {
            title = title.split(" ").joinToString(" ") { w -> w.lowercase().replaceFirstChar { it.uppercase() } }
        }
        return Title(title, year)
    }

    data class Episode(val season: Int, val episode: Int, val show: String, val epTitle: String)

    private val EP_RE = Regex("(?:^|[ ._\\-\\[])s(\\d{1,2})[ ._-]?e(\\d{1,3})|(?:^|[ ._\\-\\[])(\\d{1,2})x(\\d{2,3})(?:[ ._\\-\\]]|$)|(?:^|[ ._-])(?:episode|ep)[ ._-]?(\\d{1,3})", RegexOption.IGNORE_CASE)

    fun parseEpisode(base: String): Episode? {
        val m = EP_RE.find(base) ?: return null
        val g = m.groupValues
        val season = (g[1].ifEmpty { g[3] }.ifEmpty { "1" }).toInt()
        val episode = g[2].ifEmpty { g[4] }.ifEmpty { g[5] }.toInt()
        val before = base.substring(0, m.range.first)
        val after = base.substring(m.range.last + 1).trimStart(' ', '.', '_', '-')
        val ept = cleanTitle(after).title
        val epTitle = if (after.isNotEmpty() && Regex("^[a-z0-9 '&,!-]{2,}$", RegexOption.IGNORE_CASE).matches(ept) && !Regex("^\\d+$").matches(ept)) ept else ""
        return Episode(season, episode, before.trimEnd(' ', '.', '_', '-'), epTitle)
    }

    fun sortKey(title: String) = title.replace(Regex("^(the|a|an)\\s+", RegexOption.IGNORE_CASE), "").lowercase()

    // ---------------------------------------------------------------- CSV

    fun parseCsv(text: String): List<Map<String, String>> {
        val rows = ArrayList<List<String>>()
        var row = ArrayList<String>()
        val field = StringBuilder()
        var q = false
        val t = text.removePrefix("﻿")
        var i = 0
        fun endRow() { row.add(field.toString()); field.setLength(0); if (row.any { it.isNotBlank() }) rows.add(row); row = ArrayList() }
        while (i < t.length) {
            val c = t[i]
            if (q) {
                if (c == '"' && i + 1 < t.length && t[i + 1] == '"') { field.append('"'); i++ }
                else if (c == '"') q = false
                else field.append(c)
            } else when (c) {
                '"' -> q = true
                ',' -> { row.add(field.toString()); field.setLength(0) }
                '\r' -> { if (i + 1 < t.length && t[i + 1] == '\n') i++; endRow() }
                '\n' -> endRow()
                else -> field.append(c)
            }
            i++
        }
        endRow()
        if (rows.isEmpty()) return emptyList()
        val head = rows[0].map { it.trim().lowercase() }
        return rows.drop(1).map { r ->
            val m = HashMap<String, String>()
            head.forEachIndexed { idx, h -> val v = r.getOrNull(idx)?.trim(); if (!v.isNullOrEmpty()) m[h] = v }
            m
        }
    }

    fun csvCell(v: Any?): String {
        val s = when (v) { null -> ""; is List<*> -> v.joinToString(", "); else -> v.toString() }
        return if (s.contains(Regex("[\",\\n\\r]"))) "\"" + s.replace("\"", "\"\"") + "\"" else s
    }

    fun resolution(w: Int, h: Int): String = when {
        w <= 0 -> ""
        w >= 3200 || h >= 1800 -> "4K"
        w >= 1800 || h >= 1000 -> "1080p"
        w >= 1200 || h >= 700 -> "720p"
        else -> "SD"
    }
}
