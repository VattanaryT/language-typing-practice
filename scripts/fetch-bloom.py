"""Build public/stories-<lang>.json from openly licensed books on Bloom Library.

Runs at build time, not in the browser: visitors never contact Bloom (no
third-party requests, no CORS), and we only ship books whose license we checked.

Kept: Creative Commons licenses (attribution is shown in the app for every
story). Skipped: all-rights-reserved/custom licenses, drafts, games/quizzes,
sign-language books, religious texts, and books with too little prose.

Translations: English for each paragraph is looked up in
data/translations/en.json, keyed by a hash of the source text (see para_key), so
re-fetching keeps existing translations and only new text needs translating.
They are AI-generated. A story under a "No Derivatives" (-nd) license ships
without them, because a translation is an adaptation that license forbids.

Usage: python3 scripts/fetch-bloom.py <lang>      (a key of LANGS: th, km)
"""
from collections import Counter
import hashlib, json, re, sys, time, urllib.parse, urllib.request, pathlib
from html.parser import HTMLParser
import xml.etree.ElementTree as ET

# --- Per-language settings. To add a language, add an entry here. ---
#   script:     regex for the language's letters (lines without them are skipped)
#   skip_text:  books mentioning any of these are skipped (religious texts), to
#               keep the set to general stories
#   credit:     author/illustrator credit lines (real people's names, not story)
#   credit_list: a line listing several people, which is credits at any length
#   clean:      extra characters to strip from the text
#   max_books:  how many books to take from Bloom's listing
LANGS = {
    "th": dict(
        name="Thai",
        script=re.compile(r"[\u0E00-\u0E7F]"),
        skip_text=("พระเยซู", "อธิษฐาน", "พระคัมภีร์", "คริสต", "พระวิญญาณ", "พระเจ้าตรัส",
                   "อดัม", "โนอาห์", "อับราฮัม", "อับราม"),
        credit=re.compile(
            r"^([๐-๙0-9]+\.\s*)?(ด\.ญ\.|ด\.ช\.|เด็กหญิง|เด็กชาย|นางสาว|น\.ส\.|นาง|นาย)\S*\s.*"
            r"(ครู|นักเรียน|ผู้อำนวยการ|เจ้าหน้าที่|โรงเรียน|ศศช|ตัวแทน)|^([๐-๙0-9]+\.\s*)?(ด\.ญ\.|ด\.ช\.|นางสาว|นาย|นาง)\S+\s+\S+$"
            r"|^(ผู้แต่ง|ผู้จัดทำ|คณะผู้จัดทำ|เค้าโครงเรื่อง|ที่ปรึกษา|เรียบเรียงและภาพ)|^ที่มา\s*:|^(คุณ)?ครูและนักเรียน|^โรงเรียน\S*$"),
        credit_list=re.compile(r"(ด\.[ญช]\..*){2,}"),
        clean="",
        max_books=80,
    ),
    "km": dict(
        name="Khmer",
        script=re.compile(r"[\u1780-\u17FF]"),
        skip_text=("ព្រះយេស៊ូ", "ព្រះគម្ពីរ", "អធិស្ឋាន", "គ្រីស្ទ", "ព្រះវិញ្ញាណ", "ព្រះជាម្ចាស់", "ព្រះអម្ចាស់"),
        credit=re.compile(
            r"^(អ្នកនិពន្ធ|អ្នកគូរ|គំនូរ|រូបភាព|អ្នករៀបរៀង|រៀបរៀង|អ្នកបកប្រែ|បកប្រែ|កែសម្រួល|អ្នកកែសម្រួល|ផលិតដោយ|ឧបត្ថម្ភដោយ)\s*[:៖]"
            r"|^(លោកស្រី|លោក|អ្នកស្រី|កញ្ញា)\s*\S+(\s+\S+)?$"),
        credit_list=re.compile(r"((លោកស្រី|លោក|កញ្ញា|អ្នកស្រី)\s*\S+.*){3,}"),
        clean="\u200b",  # Khmer text carries zero-width spaces between words
        max_books=200,
    ),
}
LANG = sys.argv[1] if len(sys.argv) > 1 else "th"
if LANG not in LANGS:
    sys.exit(f"usage: fetch-bloom.py <{'|'.join(LANGS)}>")
CFG = LANGS[LANG]
SCRIPT = CFG["script"]
TRANSLATIONS = pathlib.Path("data/translations/en.json")
DERIVATIVES_OK = {"cc-by", "cc-by-sa", "cc-by-nc", "cc-by-nc-sa", "cc0"}

API = f"https://api.bloomlibrary.org/v1/books?lang={LANG}&limit=1000"
BUCKET = "https://s3.amazonaws.com/BloomLibraryBooks"
OK_LICENSES = {"cc-by", "cc-by-sa", "cc-by-nc", "cc-by-nc-sa", "cc-by-nd", "cc-by-nc-nd", "cc0"}
SKIP_WORDS = ("Bible", "sign", "quiz", "game", "activity")
MAX = CFG["max_books"]
OUT = pathlib.Path(f"public/stories-{LANG}.json")
MIN_CHARS = 150  # below this a "book" is usually a cover plus a label or two


def is_credit(p):
    return bool((len(p) < 90 and CFG["credit"].search(p)) or CFG["credit_list"].search(p) or p.startswith("ที่มา"))


def tidy(text):
    """Collapse whitespace and drop language-specific invisible characters."""
    for ch in CFG["clean"]:
        text = text.replace(ch, "")
    return re.sub(r"\s+", " ", text).strip()


def para_key(text):
    return hashlib.sha1(text.encode()).hexdigest()[:10]


def get(url, as_json=False):
    req = urllib.request.Request(url, headers={"User-Agent": "thai-typing-practice (build script)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read()
    return json.loads(data) if as_json else data.decode("utf-8", "replace")


class BookText(HTMLParser):
    """Collect the target language's text from content pages (not front/back matter)."""

    def __init__(self):
        super().__init__()
        self.stack = []  # per open div: (is_content_page, is_thai_editable)
        self.page_ok = False
        self.grab = 0
        self.paras, self.cur = [], []

    def handle_starttag(self, tag, attrs):
        if tag == "br" and self.grab:
            self.cur.append(" ")
        if tag not in ("div", "p"):
            return
        a = dict(attrs)
        cls = a.get("class", "") or ""
        page = "bloom-page" in cls.split()
        if page:
            self.page_ok = not any(m in cls for m in ("frontMatter", "backMatter", "bloom-interactive-page", "credits", "titlePage", "cover"))
        editable = tag == "div" and "bloom-editable" in cls and a.get("lang") == LANG and self.page_ok
        self.stack.append((tag, editable))
        if editable:
            self.grab += 1
        if tag == "p" and self.grab:
            self.flush()

    def handle_endtag(self, tag):
        if tag not in ("div", "p"):
            return
        while self.stack:
            t, editable = self.stack.pop()
            if editable:
                self.grab -= 1
                self.flush()
            if t == tag:
                break
        if tag == "p" and self.grab:
            self.flush()

    def handle_data(self, data):
        if self.grab:
            self.cur.append(data)

    def flush(self):
        text = tidy("".join(self.cur))
        if text and SCRIPT.search(text):
            self.paras.append(text)
        self.cur = []


def list_keys(prefix):
    xml = get(f"{BUCKET}?prefix={urllib.parse.quote(prefix)}")
    ns = {"s": "http://s3.amazonaws.com/doc/2006-03-01/"}
    return [k.text for k in ET.fromstring(xml).findall(".//s:Key", ns)]


def difficulty(paras):
    """Score a story from the text itself. Bloom's own level tags are sparse
    and often wrong (a 20k-character novella tagged level 1), so we use average
    phrase length -- Thai has no spaces between words, so a space-separated
    chunk is roughly a phrase, and longer chunks mean longer unbroken runs to
    type and denser vocabulary."""
    chunks = [c for p in paras for c in p.split(" ") if c]
    return sum(map(len, chunks)) / max(len(chunks), 1)


def main():
    books = get(API, as_json=True)["results"]
    print(f"{len(books)} {CFG['name']} books listed")
    out = []
    for b in books:
        if len(out) >= MAX:
            break
        title = next((tidy(t["title"]) for t in b.get("titles", []) if t["lang"] == LANG), None)
        tags = " ".join(b.get("tags", []))
        if not title or b.get("draft") or not b.get("inCirculation", True):
            continue
        if re.match(r"^\d+\s*\.", title):  # numbered series ("02. ...") are Bible-for-Children lessons
            continue
        if any(w.lower() in (tags + " " + " ".join(b.get("features", []))).lower() for w in SKIP_WORDS):
            continue
        base = b["baseUrl"]
        try:
            meta = get(base + "meta.json", as_json=True)
            lic = (meta.get("license") or "").lower()
            if lic not in OK_LICENSES or meta.get("draft"):
                continue
            if any(d.get("isoCode") != LANG for d in meta.get("languageDescriptors", [])):
                continue  # bilingual / sign-language books: text mixing makes poor typing drills
            prefix = urllib.parse.unquote_plus(base.split("BloomLibraryBooks/")[1])
            htm = [k for k in list_keys(prefix) if k.endswith(".htm")]
            if not htm:
                continue
            parser = BookText()
            parser.feed(get(f"{BUCKET}/{urllib.parse.quote(htm[0])}"))
        except Exception as e:  # one bad book shouldn't kill the build
            print("  skip", title, e)
            continue
        paras = list(dict.fromkeys(p for p in parser.paras if p != title and not is_credit(p)))
        if any(w in p for p in paras + [title] for w in CFG["skip_text"]):
            continue
        if sum(len(p) for p in paras) < MIN_CHARS:
            continue
        out.append({
            "id": b["id"],
            "title": title,
            "paragraphs": paras,
            "license": lic,
            "copyright": meta.get("copyright") or "",
            "credits": re.sub(r"\s+", " ", meta.get("credits") or "").strip()[:300],
            "source": f"https://bloomlibrary.org/book/{b['id']}",
        })
        print(f"  + {lic:12} {title}")
        time.sleep(0.2)  # be polite to Bloom's servers

    # Series often share a "note to parents" page; a paragraph that shows up in
    # several books is boilerplate, not story.
    # The same book is often uploaded several times, with titles that differ
    # only in spacing or punctuation. Keep the fullest copy of each, matching on
    # the title's letters or on the whole text (not just the opening, since
    # books in one series often share a foreword).
    out.sort(key=lambda s: -sum(len(p) for p in s["paragraphs"]))
    seen_keys, unique = set(), []
    for s in out:
        keys = {"t:" + re.sub(r"[\s.,!?:;៖។…\"'()]", "", s["title"]), "p:" + "|".join(s["paragraphs"])}
        if keys & seen_keys:
            print("  duplicate:", s["title"])
            continue
        seen_keys |= keys
        unique.append(s)
    out = unique
    seen = Counter(p for s in out for p in set(s["paragraphs"]))
    kept = []
    for s in out:
        s["paragraphs"] = [p for p in s["paragraphs"] if seen[p] < 2]
        if sum(len(p) for p in s["paragraphs"]) >= MIN_CHARS:
            kept.append(s)
    # Levels 1-4 are quartiles of the difficulty score, so each level has
    # roughly the same number of stories to choose from.
    kept.sort(key=lambda s: difficulty(s["paragraphs"]))
    for i, s in enumerate(kept):
        s["level"] = 1 + i * 4 // len(kept)
    out = kept

    tr = json.loads(TRANSLATIONS.read_text()) if TRANSLATIONS.exists() else {}
    missing = []
    for s in out:
        s["title_en"] = tr.get(para_key(s["title"]))
        if s["license"] in DERIVATIVES_OK:
            s["paragraphs_en"] = [tr.get(para_key(p)) for p in s["paragraphs"]]
            missing += [(s["title"], p) for p, e in zip(s["paragraphs"], s["paragraphs_en"]) if e is None]
        else:
            s["paragraphs_en"] = None
        if s["title_en"] is None:
            missing.append((s["title"], s["title"]))
    todo = pathlib.Path(f"data/untranslated-{LANG}.tsv")
    if missing:
        todo.write_text("".join(f"{para_key(p)}\t{t}\t{p}\n" for t, p in missing))
        print(f"{len(missing)} paragraphs/titles have no translation yet -> {todo}")
    else:
        todo.unlink(missing_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print(f"wrote {len(out)} stories to {OUT}")


if __name__ == "__main__":
    main()
