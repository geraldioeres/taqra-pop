# Taqra Pop

A small floating Quran reader for Windows. It shows one ayah at a time in a window that stays on top of your other apps, so you can recite while you work.

## Run

```bash
npm install
npm start
```

Build an installer and a portable `.exe` into `dist/`:

```bash
npm run dist
```

## Features

- Frameless, resizable window that stays on top of other windows (toggle with 📌). It remembers its position, size and opacity.
- Uthmani Arabic text in the Amiri Quran font. The Bismillah appears as a header above ayah 1, and each ayah ends with its number marker.
- Optional translation: Indonesian (Kemenag), English (Sahih), Malay, Urdu, Turkish or French.
- Per-ayah recitation from 8 reciters, with repeat (×1, 2, 3, 5, 10, ∞), an option to move to the next ayah automatically, and a volume slider with mute.
- Go-to panel: click the surah name, or press `G`, to search surahs and pick an ayah. You can also jump to any page of the Madani mushaf (1–604) by pressing `P`.
- Reading pointer: over the Arabic text the cursor becomes a pen (or a dot), and the word under it is highlighted so you can follow along as you recite. Click a word to leave a marker that keeps your place, even after a restart; moving to another ayah clears it. Each part can be turned off in Settings.
- Mistake notes: right-click a word (or drag across several first) to record a mistake with a type (Makhraj, Tajwid, Mad, Harakat, Hafalan, Other) and a note. Press `N` to review, filter and mark mistakes as fixed, or start Practice to go through only the ayahs with open mistakes. Notes are stored in `mistake-notes.json` in the app's data folder, and Export/Import makes backups.
- Resumes where you left off, and counts how many ayahs you read today.
- Dark, light and sepia themes, adjustable font sizes, and an option to hide the controls until you hover over the window.
- ✕ closes the app. To tuck it away without closing, use Ctrl+Alt+Q or the tray icon.

## Shortcuts

| Global (works from any app) | |
|---|---|
| Ctrl+Alt+Q | Show / hide |
| Ctrl+Alt+→ / ← | Next / previous ayah |
| Ctrl+Alt+P | Play / pause recitation |

In the window: ←/→ for previous/next ayah, Space to play/pause, `M` to mute, `T` to show or hide the translation, `G` to go to a surah/ayah, `P` to go to a page, `N` for mistake notes, Esc to close a panel. Ctrl+Enter saves a note.

## Data

The text, translations and audio come from [alquran.cloud](https://alquran.cloud) and `cdn.islamic.network`. Saad Al-Ghamdi and the teaching recitations (Husary Muallim, Minshawi Teacher) come from [everyayah.com](https://everyayah.com). Al-Ghamdi is only available there at 40 kbps. Under Settings you can pick slow reciters (Ibrahim Al-Akhdar and the Husary and Minshawi Mujawwad recitations) and set the recitation speed from 0.5× to 1.25× without changing the pitch. Each surah is downloaded the first time you open it and then cached, so text works offline after that. Audio is streamed and always needs a connection.
