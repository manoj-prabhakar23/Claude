# Organizing your movies with Claude Chat

The TV app already guesses titles, years, languages and albums from file names. For a big, messy collection, you can make it accurate with Claude Chat in three steps, **without renaming or moving any files**.

```
 ① Export        ② Fix in Claude Chat            ③ Put back
 catalog.csv ──► "clean up titles, years,  ──► catalog.csv saved on the
 from the app     languages, albums"            drive → press Rescan
```

Because `catalog.csv` lives **on the drive itself**, the corrections travel with your USB stick. They work on any computer running the server.

## ① Export what the app found

With the server running, open this address on your computer (not the TV):

```
http://localhost:8080/api/catalog.csv
```

This downloads a spreadsheet with one row per movie, episode and song:

| root | path | type | title | year | language | genre | show | season | episode | album | artist | track | has_poster | plot |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

`path` is the file's location **relative to the drive / folder root** (`root`). If you have several drives, export one at a time with `?root=<name>`, for example `http://localhost:8080/api/catalog.csv?root=USB1`.

## ② Fix it in Claude Chat

Create a Claude **Project** (for example "Movie Library"), upload the exported `catalog.csv`, and use this prompt:

> I have a media library exported as catalog.csv for my Home Cinema TV app. Please return a corrected **catalog.csv** with exactly these columns:
> `path,type,title,year,language,genre,plot,show,season,episode,album,artist,poster`
>
> Rules:
> 1. **Never change `path`.** It's how the app matches each row to a file.
> 2. `title`: the proper movie title, without year, quality, codec, website or uploader tags.
> 3. `year`: the original release year (4 digits) if you're confident. Otherwise leave it empty.
> 4. `language`: the movie's **spoken language(s)** as English names, comma-separated for dual audio (e.g. `Tamil` or `Telugu, Hindi`). Use the file name, folder and title as clues. If unsure, keep the current value.
> 5. `genre`: 1–3 genres, comma-separated. `plot`: one or two sentences, only for titles you know. Otherwise leave it empty.
> 6. For TV episodes, fill `show`, `season`, `episode` and the episode `title`.
> 7. For songs, fill `album`, `artist` and `language`. Group songs that clearly belong to the same album under one album name.
> 8. Leave `poster` empty unless I tell you about image files.
> 9. Add a column `note` for any row you're unsure about, and list those rows separately after the file.
>
> Output the full CSV as a downloadable file.

Tips:
- For very large libraries (thousands of rows), work in batches: "here are rows 1–500", and so on.
- You only need to keep rows you actually want to change. Rows that aren't in the catalog fall back to automatic detection.
- You can also ask Claude: *"Which movies are missing posters?"* (`has_poster = no`), *"Find duplicates"*, or *"Suggest a folder structure"*.

## ③ Put it back

Save the corrected file as **`catalog.csv` in the top folder of that drive / root**. For example, `E:\catalog.csv` for a USB stick, or `D:\Movies\catalog.csv` if `D:\Movies` is a root in `config.json`. Then press **Rescan** on the TV (or wait for the automatic rescan).

### catalog.csv reference

| Column | Meaning |
|---|---|
| `path` *(required)* | File path relative to the root, using `/`. A **folder** path also works: the row then applies to the movie in that folder, or to every song in an album folder. |
| `type` | `movie`, `episode` or `album`/`track`. Optional: use it to force a file to count as a movie or an episode. |
| `title`, `year`, `genre`, `plot` | Shown on tiles and on the movie page. |
| `language` | One or more languages: `Tamil`, `Telugu, Hindi`, `ta`, `hin`… (names or ISO codes). |
| `show`, `season`, `episode` | Group episodes into a TV show. |
| `album`, `artist` | Group songs into albums. |
| `poster` | Image path, relative to the movie's folder or to the root (e.g. `posters/vikram.jpg`). |

`catalog.json` also works (a list of objects with the same fields) if you prefer JSON.

## Alternative: `info.json` per folder

To describe a single folder, put an `info.json` in it:

```json
{ "title": "Vikram", "year": 2022, "language": "Tamil", "genre": "Action", "plot": "…", "poster": "poster.jpg" }
```

- In a **movie folder** (one movie inside), all fields apply to that movie.
- In any other folder, `language` and `genre` apply to **everything below it**. For example, `Movies/Tamil Dubbed/info.json` containing `{"language": "Tamil"}` tags the whole folder.
- `"files": { "file name.mkv": { "title": "…" } }` sets details per file.

## Optional: rename the files themselves

If you'd rather clean up the files on disk (which also helps Kodi, Plex and Jellyfin), ask Claude in the same project:

> Using the corrected catalog, write a **PowerShell** script (Windows) / **bash** script (Mac/Linux) that moves each movie into `Movies/<Language>/<Title> (<Year>)/<Title> (<Year>).<ext>` and its subtitles alongside it. Start with a dry run that only prints the changes, and write an undo log.

Run the dry run first and check it. Back up anything irreplaceable before running scripts that move files. After renaming, export a fresh catalog from the app, because the old `path` values no longer match.
