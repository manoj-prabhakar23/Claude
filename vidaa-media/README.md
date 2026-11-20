# Home Cinema for Hisense VIDAA TV

Watch the **movies** (and TV shows and music) on your own hard drive or USB stick on your Hisense VIDAA TV. Instead of the TV's file list, you get a poster wall:

- **Movies**: poster tiles with title, year, **language badges** (Tamil, Hindi, English…), 4K/1080p badge, *Continue watching*, resume where you stopped, subtitles, and audio-language switching for dual-audio movies.
- **Filter by language** with one press (`All · Tamil 25 · Hindi 26 · English 26 …`). Sort by A–Z, recently added, or newest.
- **TV shows**: episodes grouped by show and season, with auto-play of the next episode.
- **Music by album**: album cover tiles, track list, *Play album* / *Shuffle*, and a mini player that keeps playing while you browse.
- **Folders** view for browsing the drive as it is.
- Made for the **TV remote**: arrows, OK, BACK, Play/Pause, FF/RW and the colored buttons (🔴 Movies, 🟢 TV Shows, 🟡 Music, 🔵 Folders).

> **Also on Amazon Fire TV Stick / Android TV:** see [`../firetv-app`](../firetv-app/README.md). That version can play a USB drive plugged straight into the Fire TV, and it plays MKV files with audio-language switching without needing ffmpeg. A ready-built APK is included in `dist/HomeCinema-FireTV.apk`, and this server also hands it out at `http://<this-pc>:8080/app.apk` for easy install with the Downloader app.

## How it works (and why there are two parts)

VIDAA doesn't let third-party apps read a USB drive that's plugged into the TV itself. So the app has two parts:

```
 [ Drive / USB stick ]──plugged into──[ PC, laptop, Raspberry Pi or NAS ]
                                         runs: Home Cinema server (this project)
                                                   │  Wi-Fi / LAN
                                                   ▼
                                     [ Hisense VIDAA TV ] opens the app in its browser
```

The server scans your folders, works out titles, years, languages, posters and albums, and streams the files to the TV. Plug a USB stick into that computer and it's **detected automatically**. The library updates by itself within about 10 seconds.

## Setup (about 10 minutes)

### 1. On the computer that has your drive / USB

1. Install **Node.js 18 or newer** from <https://nodejs.org>.
2. *(Recommended)* Install **ffmpeg**. It adds poster images taken from the video, plays MKV/AVI files the TV can't open directly, lets you switch audio language, and reads embedded subtitles.
   - Windows: `winget install ffmpeg`
   - macOS: `brew install ffmpeg`
   - Raspberry Pi / Linux: `sudo apt install ffmpeg`
3. Copy this `vidaa-media` folder to the computer.
4. Copy `config.example.json` to `config.json` and list your movie and music folders:
   ```json
   { "port": 8080, "roots": ["D:\\Movies", "D:\\Music"], "autoUsb": true }
   ```
   USB sticks and external drives are added automatically when `autoUsb` is `true`. On Windows that means every drive letter except C:, so leave `roots` empty if your movies are only on USB.
5. Start it:
   - **Windows:** double-click `start-windows.bat`
   - **macOS / Linux / Pi:** `./start.sh`

   It prints the address to open, e.g. `http://192.168.1.20:8080`.
6. If Windows asks about the firewall, allow access on **Private networks**.

### 2. On the Hisense VIDAA TV

1. Make sure the TV is on the **same Wi-Fi / network** as the computer.
2. Open the TV's **Browser** app (on the VIDAA home screen, under Apps).
3. Type the address the server printed (e.g. `http://192.168.1.20:8080`).
4. **Bookmark it**, or add it to the home screen if your model's browser offers that, so it opens with one click next time.

> **Tip:** give the computer a fixed IP address in your router settings (often called "DHCP reservation") so the bookmark keeps working.

### Optional: a Home Cinema icon on the VIDAA home screen (unofficial)

Hisense has no official way to add your own app to the home screen. The VIDAA App Store only accepts apps from approved partners. The community has found two unofficial methods. Neither is supported by Hisense, and which one works depends on your TV's firmware:

- **Older firmware (about 2022):** open the TV Browser and type `hisense://debug`. If an install page appears, enter the name `Home Cinema`, the server address (e.g. `http://192.168.1.20:8080`) and the icon `http://192.168.1.20:8080/icon.png`, then press Install.
- **Newer firmware (2024 onwards):** the debug page is blocked. Install works only through the TV's hidden `Hisense_installApp()` function, which the TV allows only on pages from `vidaahub.com`. Community tools such as [vidaa-appstore](https://github.com/trialuser/vidaa-appstore) and [vidaa-custom-app](https://github.com/arashbehmand/vidaa-custom-app) run a small local server that pretends to be that site. You temporarily point the TV's DNS at it, install, then set the DNS back and restart the TV.

Notes:
- The community examples install public `https://` web addresses. Whether a home address like `http://192.168.1.20:8080` is accepted hasn't been confirmed. If it isn't, the Browser bookmark is the fallback.
- Give the server computer a fixed IP address, or the icon stops working when the IP changes.
- Pressing **BACK** on the main screen closes the app, as installed VIDAA apps must.
- These tools change your TV's network settings. Read their code, use them only on your own home network, and accept that a firmware update may remove the icon or block the method.

### Can the TV's own USB port be used?

Not by this app, and not by any third-party VIDAA app as far as we can tell. VIDAA gives apps **no documented way to read a USB drive plugged into the TV**. The TV's built-in **Media** player can still play that drive, just without posters, language filters or albums.

To keep the setup "plug the drive in near the TV and forget it", you can use either of these:

- **Raspberry Pi behind the TV (recommended):** plug the USB drive into a Raspberry Pi 4/5 (or any small always-on computer), run `./start.sh` on it, and make it start at boot. Use a powered USB hub or a self-powered drive for 2.5"/3.5" hard disks.
- **Router with a USB port:** many routers share a plugged-in drive as a network folder. Map or mount that folder on the computer running the server and add it to `roots` in `config.json`.

### Using it with the remote

| Button | Main screens | While a movie plays |
|---|---|---|
| ◀ ▲ ▶ ▼ | Move between tiles | ◀ back 10 s, ▶ forward 30 s (press several times to jump further) · ▲ subtitles · ▼ audio language |
| OK | Open / play | Pause / resume |
| BACK | Close / go up a folder / back to the tabs | Exit (your position is saved) |
| ⏯ ⏩ ⏪ ⏭ | Control music | Play/pause, ±1 min, next episode |
| 🔴 🟢 🟡 🔵 | Movies · TV Shows · Music · Folders | |
| CH+ / CH− | Page up / down in the grid | |

## Getting good posters and languages

The app figures things out by itself from what is already on your drive:

| What | Where it comes from (first match wins) |
|---|---|
| **Title & year** | `catalog.csv` → `info.json` → Kodi `.nfo` → folder name (if the folder holds one movie) → cleaned file name. `Vikram.2022.Tamil.1080p.WEB-DL.x264.mkv` → **Vikram (2022)** |
| **Language** | `catalog.csv` / `info.json` → language in the file name (`Tamil`, `[TAM]`, `.HIN.`) → movie folder name → audio track language inside the file → parent folder (`Movies/Tamil/…`) |
| **Poster** | `Movie-poster.jpg` / `Movie.jpg` next to the file → `poster.jpg` / `folder.jpg` / `cover.jpg` in the movie folder → a frame taken from the video (ffmpeg) → a colored tile with initials |
| **Background** | `fanart.jpg` / `backdrop.jpg` → a frame from the video |
| **Subtitles** | `Movie.en.srt`, `Movie.Tamil.srt`, `.vtt` next to the file, plus text subtitles inside MKV files |
| **Albums** | Song tags (album, artist, track no.) → folder names `Artist/Album/01 Song.mp3` |
| **Album cover** | `cover.jpg` / `folder.jpg` / `front.jpg` → artwork inside the MP3/FLAC |

The best layout (works great with this app, Kodi, Plex and Jellyfin):

```
Movies/
  Tamil/
    Vikram (2022)/
      Vikram (2022).mkv
      poster.jpg
      Vikram (2022).en.srt
  English/
    Inception (2010)/
      Inception (2010).mp4
      poster.jpg
TV Shows/
  Kitchen Diaries/
    Season 1/
      Kitchen Diaries S01E01.mp4
Music/
  A R Rahman/
    Roja (1992)/
      cover.jpg
      01 Kadhal Rojave.mp3
```

To organize a big collection with **Claude Chat**, see **[ORGANIZING.md](ORGANIZING.md)**. It covers exporting your library as a spreadsheet, having Claude fix titles, languages and albums, and putting the result back as a `catalog.csv` on the drive. You don't have to rename a single file.

## Video formats

- **Plays directly:** MP4 / M4V / MOV / WebM with H.264 or HEVC video and AAC/MP3/AC3 audio.
- **MKV, AVI, WMV, TS…:** the server converts them on the fly into a format the TV accepts (ffmpeg needed). H.264/HEVC video is copied without re-encoding, so it uses very little CPU. Other video codecs are re-encoded, which needs a reasonably fast computer.
- **Dual-audio movies:** choose the audio language on the movie page, or press ▼ during playback.

## Troubleshooting

| Problem | Fix |
|---|---|
| TV shows "Cannot reach the media server" | Same Wi-Fi? Is the server window still open? Allow Node.js through the firewall. Try the address in a phone browser too. |
| USB stick doesn't show up | Wait about 10 s, or press **Rescan**. On Windows it must have a drive letter. On Linux/Pi it must be mounted (most desktops do this automatically). |
| No posters, only colored tiles | Install ffmpeg (for video frames), or add `poster.jpg` files / a `catalog.csv` with a `poster` column. |
| A movie won't play | Install ffmpeg so the server can convert it. Very old formats (RealMedia etc.) aren't supported. |
| Wrong title or language | Add a line to `catalog.csv` on the drive (see ORGANIZING.md), then press **Rescan**. |

## For the technically curious

- `server/`: Node.js, **no npm packages needed**. `scanner.js` (library and metadata), `tags.js` (built-in MP3/FLAC tag reader), `lang.js` (language detection), `server.js` (HTTP, streaming with range requests, remux, subtitles to WebVTT, artwork).
- `web/`: the TV app: plain HTML/CSS/ES5 JavaScript with spatial (D-pad) navigation, lazy-loaded posters and incremental grid rendering, so it stays fast on TV browsers with thousands of movies.
- Run options: `node server/server.js [folders…] [--port 8080] [--config path] [--no-usb]`
- API: `GET /api/library`, `GET /api/folder?id=`, `GET /api/catalog.csv`, `POST /api/rescan`, `GET /media/:id` (direct stream), `GET /remux/:id?t=&a=` (converted stream).
- Resume positions are stored in `data/state.json`. Generated thumbnails and the probe cache are in `cache/` (safe to delete).
- The server is meant for your **home network only**. Don't expose port 8080 to the internet.
