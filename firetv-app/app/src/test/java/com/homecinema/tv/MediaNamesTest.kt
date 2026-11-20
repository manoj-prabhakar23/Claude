package com.homecinema.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Same cases the VIDAA (Node.js) scanner was checked against, so both apps agree. */
class MediaNamesTest {
    @Test fun cleansSceneNames() {
        assertEquals(MediaNames.Title("Vikram", 2022), MediaNames.cleanTitle("Vikram.2022.1080p.WEB-DL.x264"))
        assertEquals(MediaNames.Title("The Silent Harbor", 2019), MediaNames.cleanTitle("The.Silent.Harbor.2019.720p.BluRay"))
        assertEquals(MediaNames.Title("Moon Garden", 2021), MediaNames.cleanTitle("Moon Garden (2021) [ENG]"))
        assertEquals(MediaNames.Title("Dil Ki Raah", 2018), MediaNames.cleanTitle("Dil Ki Raah 2018 Hindi HDRip"))
        assertEquals(MediaNames.Title("Sooryudu", 2020), MediaNames.cleanTitle("Sooryudu.2020.Dual.Audio"))
        assertEquals(MediaNames.Title("Vikram", 2022), MediaNames.cleanTitle("Vikram (2022)"))
        assertEquals("2012", MediaNames.cleanTitle("2012.2009.1080p").title)
        assertEquals(MediaNames.Title("English Vinglish", 2012), MediaNames.cleanTitle("English Vinglish (2012)"))
    }

    @Test fun detectsLanguages() {
        assertEquals(setOf("Hindi"), MediaNames.langsFromName("Dil Ki Raah 2018 Hindi HDRip"))
        assertEquals(setOf("English"), MediaNames.langsFromName("Moon Garden (2021) [ENG]"))
        assertEquals(setOf("Tamil"), MediaNames.langsFromName("Movie.2019.TAM.1080p"))
        assertEquals(setOf("Telugu", "Hindi"), MediaNames.langsFromName("Film [tel+hin]"))
        assertEquals(emptySet<String>(), MediaNames.langsFromName("The.Matrix.1999.AAC"))
        assertEquals("Tamil", MediaNames.normalizeLang("tam"))
        assertEquals("English", MediaNames.normalizeLang("en-US"))
        assertNull(MediaNames.normalizeLang("und"))
        assertEquals(listOf("Telugu", "Hindi"), MediaNames.langList("Telugu, Hindi"))
        assertEquals("ta", MediaNames.isoCode("Tamil"))
        assertEquals("English", MediaNames.langFromSubtitleName("The.Silent.Harbor.2019.720p.BluRay.en", "The.Silent.Harbor.2019.720p.BluRay"))
        assertEquals("Tamil", MediaNames.langFromSubtitleName("Movie.Tamil", "Movie"))
    }

    @Test fun parsesEpisodes() {
        val e = MediaNames.parseEpisode("Kitchen.Diaries.S01E01.Pilot")!!
        assertEquals(1, e.season); assertEquals(1, e.episode); assertEquals("Kitchen.Diaries", e.show); assertEquals("Pilot", e.epTitle)
        val e2 = MediaNames.parseEpisode("Show Name 2x05")!!
        assertEquals(2, e2.season); assertEquals(5, e2.episode)
        assertNull(MediaNames.parseEpisode("Vikram.2022.1080p"))
    }

    @Test fun parsesCsvWithQuotes() {
        val rows = MediaNames.parseCsv("﻿path,title,plot\r\na/b.mkv,Vikram,\"A spy, a \"\"hunt\"\"\"\r\n\r\nc.mp4,X,\n")
        assertEquals(2, rows.size)
        assertEquals("A spy, a \"hunt\"", rows[0]["plot"])
        assertEquals("c.mp4", rows[1]["path"])
    }

    @Test fun naturalSort() {
        val l = listOf("Film 10", "Film 2", "Film 1").sortedWith { a, b -> Library.naturalCompare(a, b) }
        assertEquals(listOf("Film 1", "Film 2", "Film 10"), l)
    }

    @Test fun srtToVtt() {
        val v = Subtitles.srtToVtt("1\n00:00:01,000 --> 00:00:05,000\nHello\n\n", 2.0)
        assertEquals("WEBVTT\n\n00:00:00.000 --> 00:00:03.000\nHello\n\n", v)
    }
}
