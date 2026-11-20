# Home Cinema for Amazon Fire TV Stick (and Android TV)

The same poster-wall movie and music app as the Hisense VIDAA version, built as a real Android app. On a Fire TV it can do two things the VIDAA TV can't:

- **Play a USB drive plugged straight into the Fire TV.** No computer is needed. The app scans the drive itself and updates when you plug a drive in or take it out.
- **Play almost any video format natively** (MKV, MP4, AVI, TS…) with Android's ExoPlayer. You can pick the **audio language** and **subtitles** from the remote, and Dolby/DTS audio is passed through to your soundbar where the Fire TV supports it.

It can also connect to the **Home Cinema server on your PC** (the `vidaa-media` server) instead. Press **☰ Sources** in the app, or the **Menu** button on the remote, to switch.

The screens are the same as on the VIDAA TV: language filter chips, movie posters with language and 4K/1080p badges, *Continue watching*, TV shows by season, music by album, and folders.

## Which Fire TV devices work?

| Device | Works? |
|---|---|
| Fire TV Stick (2nd gen or later), Stick Lite, Stick 4K, Stick 4K Max (1st & 2nd gen), Fire TV Cube | ✅ These run **Fire OS** (Android-based). Apps can be installed from outside the Amazon Appstore. |
| Fire TV Stick 4K Select (2025) and other **Vega OS** devices | ❌ Not this APK, because Vega OS isn't Android. Use the **Vega version in [`../vega-app`](../vega-app/README.md)** instead. |
| Android TV / Google TV boxes, Chromecast with Google TV, Nvidia Shield | ✅ The same APK works. |

To check yours: **Settings → My Fire TV → About**. Fire OS shows a version like *Fire OS 7.x* or *8.x*.

## Plugging a USB drive into the Fire TV Stick

The Stick has only one port, the one used for power, so you need an **OTG adapter with power pass-through**:
- *micro-USB* models (Stick Lite, Stick 4K, Stick 4K Max 1st gen)
- *USB-C* models (Stick 4K Max 2nd gen)

The adapter takes the power cable on one side and your USB drive on the other. The **Fire TV Cube** has a normal USB port.

- Format the drive as **exFAT** (or FAT32 if your files are under 4 GB). NTFS drives may not be recognized.
- Portable hard disks that draw a lot of power may need their own power supply or a powered hub. USB sticks and SSDs usually work directly.
- The app looks in the whole USB drive, plus the Fire TV's own `Movies`, `Music`, `Download` and `Videos` folders.

The folder layout, `catalog.csv` and `info.json` described in `../vidaa-media/README.md` and `../vidaa-media/ORGANIZING.md` work exactly the same here, so a drive organized with Claude Chat looks the same on both TVs.

## Installing the app (sideloading)

Apps from outside the Amazon Appstore need a one-time setup:

1. **Turn on developer options:** Settings → My Fire TV → About. Select your device name (e.g. *Fire TV Stick 4K*) **7 times** until it says you're a developer.
2. Install **Downloader** (by AFTVnews) from the Amazon Appstore. Search for *Downloader*.
3. Settings → My Fire TV → **Developer options → Install unknown apps** → turn on **Downloader**.
4. Open Downloader and enter the APK address. Choose one:
   - **From your PC's Home Cinema server** (easiest): start the server on your PC, then enter `http://<PC-address>:8080/app.apk`, e.g. `http://192.168.1.20:8080/app.apk`.
   - Or anywhere else you've put `HomeCinema-FireTV.apk` (your own web space, a file-sharing link…).
5. Press **Install**, then **Open**. Allow storage access when asked, so the app can read your USB drive.
6. The app shows up under **Apps** (the three-squares icon). Long-press it and choose *Move to front* to put it on your home row.

Other ways to install: `adb install HomeCinema-FireTV.apk` from a computer (turn on *ADB debugging* in Developer options and run `adb connect <fire-tv-ip>` first), or an app such as *Send Files to TV*.

## Using it

| Remote button | Main screens | During a movie |
|---|---|---|
| ◀ ▲ ▶ ▼ / OK | Move / open | When the controls are hidden: ◀ back 10 s, ▶ forward 30 s, OK pause. When shown: move between buttons, including **audio & subtitle settings** (⚙ and CC buttons) |
| BACK | Close / up a folder / exit the app | Hide the controls, then exit (your position is saved) |
| ⏯ ⏪ ⏩ | Control music | Play/pause and seek |
| ☰ Menu | **Sources**: this Fire TV or your PC server, and *Rescan* | |

Your resume position is saved, and the next episode plays automatically.

## Building it yourself

Needs JDK 17+ and the Android SDK (platform 34, build-tools 34).

```bash
cd firetv-app
echo "sdk.dir=/path/to/android-sdk" > local.properties
gradle testDebugUnitTest assembleRelease
# -> app/build/outputs/apk/release/app-release.apk
```

- The TV screens are **not duplicated**. The build copies `../vidaa-media/web` into the APK, so a UI change in one place updates both the VIDAA and the Fire TV app.
- `MediaNames.kt` is the Kotlin port of the VIDAA server's title and language rules, with unit tests covering the same cases. `Library.kt` scans storage and reads tags with Android's built-in media APIs. `LocalServer.kt` serves the same API as `vidaa-media/server/server.js` on `127.0.0.1:8765`. `PlayerActivity.kt` is the ExoPlayer screen.
- Release builds are signed with the debug key unless you set `HC_KEYSTORE`, `HC_KEYSTORE_PASSWORD`, `HC_KEY_ALIAS` and `HC_KEY_PASSWORD`. Keep using the same key, or Android refuses to install updates over the old version.
- `targetSdk` is 29 on purpose. It keeps classic storage access on Fire OS 8 (Android 11), which is what lets the app read USB drives. Apps from the Play Store or Amazon Appstore must target newer versions and would need the *All files access* permission.
