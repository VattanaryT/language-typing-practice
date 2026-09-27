# Language Typing Practice

Practise typing **Khmer** or **Thai** with real children's stories, from any keyboard. The home page lets you pick a language; each has its own tab (`#km`, `#th`).

| Language | Layouts | Stories |
|---|---|---|
| Khmer | NiDA (the national standard), including AltGr characters | 28 from [Bloom Library](https://bloomlibrary.org/language:km) |
| Thai | Kedmanee, Pattachote | 78 from [Bloom Library](https://bloomlibrary.org/language:th) |

- Your physical keys type the chosen language whatever layout your computer uses (keys are mapped by position, like branah.com). Khmer's third-level characters use the right Alt key (AltGr), and NiDA keys that type a vowel plus a sign (ាំ, ុះ, ...) type both in one press.
- Stories are sorted into 4 levels. Higher levels mean longer phrases and longer passages.
- English titles, and an English translation under each passage, so you can follow along before you read Thai. The translations are **AI-generated** (see below).
- Optional on-screen keyboard that highlights the next key. You can also click or tap it to type.
- Paste your own text, switch between day and night themes, see live chars/min, WPM, and accuracy.
- Keys: `Esc` restarts the passage, `Enter` goes to the next passage once you finish.

It's a static site with no server, accounts, cookies, analytics, or third-party requests. Settings are kept in your browser's `localStorage`, and nothing you type is sent anywhere.

## Run locally

```sh
cd public && python3 -m http.server 8000   # then open http://localhost:8000
```

## Project layout

```
public/            the whole website (deployed as-is)
  index.html  styles.css  app.js
  layouts.js       generated key maps (code -> [plain, shifted, altgr?])
  stories-th.json  generated story sets, one per language
  stories-km.json
  fonts/ fonts.css self-hosted fonts
scripts/
  gen-layouts.py   builds layouts.js from Linux xkb keyboard definitions
  fetch-bloom.py   builds stories-<lang>.json from Bloom Library (CC-licensed books only)
  fetch-fonts.py   downloads the fonts into public/fonts
```

Refresh a language's stories with `python3 scripts/fetch-bloom.py th` (or `km`), then commit `public/stories-<lang>.json`.

## Translations

`data/translations/en.json` maps a hash of each Thai paragraph (first 10 hex characters of its SHA-1) to English. The fetch script merges these into `stories.json`, so re-fetching keeps existing translations. If new stories arrive, it writes the untranslated lines to `data/untranslated-<lang>.tsv`. Add their English to `en.json` with the same keys and run the script again.

These translations were produced by an AI model (Claude), not by a professional translator. They give the gist of each sentence but can miss idioms, wordplay, rhyme and names, and may sometimes be wrong. Where the model wasn't sure of a word, the English says so in brackets. The site says this next to every translation.

A story under a **No Derivatives** licence (`cc-by-nc-nd`) is shown without a translation, because a translation counts as an adaptation, which that licence doesn't allow. Stories under a ShareAlike licence keep that licence on their translations.

## Adding another language

The app is language-neutral; each language is a few pieces of data:

1. **Keyboard layout.** Add an entry to `LAYOUTS` in `scripts/gen-layouts.py`, naming its file in `/usr/share/X11/xkb/symbols/` (for example `la` for Lao), the variant, and how many levels to keep (3 if it uses AltGr). Run the script. You can also write `public/layouts.js` by hand: each physical key code maps to `[plain, shifted, altgr]`.
2. **Stories.** Add an entry to `LANGS` in `scripts/fetch-bloom.py` (script range, words that mark religious texts, author-credit patterns, invisible characters to strip) and run `python3 scripts/fetch-bloom.py <code>`. Translate the lines it lists in `data/untranslated-<code>.tsv` into `data/translations/en.json`.
3. **App.** Add an entry to `LANGS` in `public/app.js` (layouts, combining-mark range, praise words, placeholder text), a tab and a card in `index.html`, and a font in `scripts/fetch-fonts.py`.

Only use sources that are openly licensed. Many story sites (for example khmerstorylovers1.yolasite.com) publish without a licence, which means all rights are reserved; those need the author's permission before they can be included.

## Deploying

A push to `main` publishes `public/` to GitHub Pages through `.github/workflows/pages.yml`. To set this up once, go to the repo's **Settings → Pages → Source** and choose **GitHub Actions**.

## Licences

Code: MIT (see `LICENSE`). Each story, and its translation, keeps its author's Creative Commons licence, which is shown under every passage with a link to the original book. Fonts (Inter, Playfair Display, Sarabun, Noto Sans Khmer) use the SIL Open Font License.
