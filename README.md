# Thai Typing

Practise Thai typing with real children's stories, on the **Kedmanee** or **Pattachote** layout, from any keyboard.

- Your physical keys type Thai whatever layout your computer uses (keys are mapped by position, like branah.com).
- 78 openly licensed stories from [Bloom Library](https://bloomlibrary.org/language:th), sorted into 4 levels. Higher levels mean longer phrases and longer passages.
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
  layouts.js       generated key maps (code -> [plain, shifted])
  stories.json     generated story set
  fonts/ fonts.css self-hosted fonts
scripts/
  gen-layouts.py   builds layouts.js from Linux xkb keyboard definitions
  fetch-bloom.py   builds stories.json from Bloom Library (CC-licensed books only)
  fetch-fonts.py   downloads the fonts into public/fonts
```

Refresh the stories with `python3 scripts/fetch-bloom.py`, then commit `public/stories.json`.

## Translations

`data/translations/en.json` maps a hash of each Thai paragraph (first 10 hex characters of its SHA-1) to English. The fetch script merges these into `stories.json`, so re-fetching keeps existing translations. If new stories arrive, it writes the untranslated lines to `data/untranslated.tsv`. Add their English to `en.json` with the same keys and run the script again.

These translations were produced by an AI model (Claude), not by a professional translator. They give the gist of each sentence but can miss idioms, wordplay, rhyme and names, and may sometimes be wrong. The site says this next to every translation.

A story under a **No Derivatives** licence (`cc-by-nc-nd`) is shown without a translation, because a translation counts as an adaptation, which that licence doesn't allow. Stories under a ShareAlike licence keep that licence on their translations.

## Adapting it to another language

The app itself works for any language. Only the data is Thai-specific:

1. **Keyboard layouts.** Edit `scripts/gen-layouts.py`, point `XKB` at your language's file in `/usr/share/X11/xkb/symbols/` (for example `kh` for Khmer or `la` for Lao), choose the variants, and rerun it. You can also write `public/layouts.js` by hand: each physical key code maps to `[unshifted, shifted]`.
2. **Stories.** In `scripts/fetch-bloom.py`, set `LANG` (Bloom's ISO code), `SCRIPT` (your script's Unicode range), `SKIP_TEXT` and `CREDIT_LINE` (the honorifics your language uses in author credits), then run it. Translate the lines it lists in `data/untranslated.tsv`.
3. **Text.** Update the `COMBINING` regex in `app.js` (marks drawn on a dotted circle), the Thai praise words in `finish()`, `lang="th"` in `index.html`, and the Thai font in `scripts/fetch-fonts.py`.

## Deploying

A push to `main` publishes `public/` to GitHub Pages through `.github/workflows/pages.yml`. To set this up once, go to the repo's **Settings → Pages → Source** and choose **GitHub Actions**.

## Licences

Code: MIT (see `LICENSE`). Each story, and its translation, keeps its author's Creative Commons licence, which is shown under every passage with a link to the original book. Fonts (Inter, Playfair Display, Sarabun) use the SIL Open Font License.
