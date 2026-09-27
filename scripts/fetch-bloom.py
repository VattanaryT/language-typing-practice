"""Build public/stories.json from openly licensed Thai books on Bloom Library.

Runs at build time, not in the browser: visitors never contact Bloom (no
third-party requests, no CORS), and we only ship books whose license we checked.

Kept: Creative Commons licenses (attribution is shown in the app for every
story). Skipped: all-rights-reserved/custom licenses, drafts, games/quizzes,
sign-language books, and books with too little Thai prose to type.

Usage: python3 scripts/fetch-bloom.py [max_books]
"""
from collections import Counter
import json, re, sys, time, urllib.parse, urllib.request, pathlib
from html.parser import HTMLParser
import xml.etree.ElementTree as ET

# --- Adapting to another language: change LANG (a Bloom ISO code such as "km",
# "lo", "my") and SCRIPT (the Unicode block of its letters). ---
LANG = "th"
SCRIPT = re.compile(r"[\u0E00-\u0E7F]")  # Thai block
# Books mentioning any of these are skipped, to keep the set to general stories.
SKIP_TEXT = ("พระเยซู", "อธิษฐาน", "พระคัมภีร์", "คริสต", "พระวิญญาณ")

API = f"https://api.bloomlibrary.org/v1/books?lang={LANG}&limit=500"
BUCKET = "https://s3.amazonaws.com/BloomLibraryBooks"
OK_LICENSES = {"cc-by", "cc-by-sa", "cc-by-nc", "cc-by-nc-sa", "cc-by-nd", "cc-by-nc-nd", "cc0"}
SKIP_WORDS = ("Bible", "sign", "quiz", "game", "activity")
MAX = int(sys.argv[1]) if len(sys.argv) > 1 else 80
THAI = re.compile(r"[฀-๿]")


def get(url, as_json=False):
    req = urllib.request.Request(url, headers={"User-Agent": "thai-typing-practice (build script)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read()
    return json.loads(data) if as_json else data.decode("utf-8", "replace")


class BookText(HTMLParser):
    """Collect Thai text from content pages (not front/back matter)."""

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
        text = re.sub(r"\s+", " ", "".join(self.cur)).strip()
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
    print(f"{len(books)} Thai books listed")
    out = []
    for b in books:
        if len(out) >= MAX:
            break
        title = next((t["title"].strip() for t in b.get("titles", []) if t["lang"] == LANG), None)
        tags = " ".join(b.get("tags", []))
        if not title or b.get("draft") or not b.get("inCirculation", True):
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
        paras = list(dict.fromkeys(p for p in parser.paras if p != title))  # dedupe, keep order
        if any(w in p for p in paras for w in SKIP_TEXT):
            continue
        if sum(len(p) for p in paras) < 60:
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
    out = list({s["title"]: s for s in out}.values())  # same book uploaded twice
    seen = Counter(p for s in out for p in set(s["paragraphs"]))
    kept = []
    for s in out:
        s["paragraphs"] = [p for p in s["paragraphs"] if seen[p] < 2]
        if sum(len(p) for p in s["paragraphs"]) >= 60:
            kept.append(s)
    # Levels 1-4 are quartiles of the difficulty score, so each level has
    # roughly the same number of stories to choose from.
    kept.sort(key=lambda s: difficulty(s["paragraphs"]))
    for i, s in enumerate(kept):
        s["level"] = 1 + i * 4 // len(kept)
    out = kept
    pathlib.Path("public/stories.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print(f"wrote {len(out)} stories to public/stories.json")


if __name__ == "__main__":
    main()
