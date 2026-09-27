import { LAYOUTS } from "./layouts.js";

// Everything language-specific lives here. Adding a language means adding an
// entry, a layout in scripts/gen-layouts.py and a story file from
// scripts/fetch-bloom.py.
const LANGS = {
  th: {
    name: "Thai",
    native: "ไทย",
    subtitle: "ฝึกพิมพ์ภาษาไทย",
    layouts: [
      ["kedmanee", "Kedmanee"],
      ["pattachote", "Pattachote"],
    ],
    // Vowel/tone marks drawn above or below a consonant: shown on a dotted
    // circle (◌) so a lone mark is visible on keys and in the "next" hint.
    combining: /[ัิ-ฺ็-๎]/,
    praise: ["เยี่ยมมาก!", "ดีมาก!", "สู้ ๆ!"],
    placeholder: "วางข้อความภาษาไทยที่นี่…",
    fallback: "สวัสดีครับ ยินดีต้อนรับ",
    bloom: "https://bloomlibrary.org/language:th",
  },
  km: {
    name: "Khmer",
    native: "ខ្មែរ",
    subtitle: "ហាត់វាយអក្សរខ្មែរ",
    layouts: [["nida", "NiDA (standard)"]],
    combining: /[ា-៓៝]/,
    praise: ["ល្អណាស់!", "ល្អ!", "ព្យាយាមទៀត!"],
    placeholder: "បិទភ្ជាប់អត្ថបទខ្មែរនៅទីនេះ…",
    fallback: "សួស្តី",
    bloom: "https://bloomlibrary.org/language:km",
  },
};

// Target passage length (characters) per level. Stories are also bucketed by
// difficulty at build time (scripts/fetch-bloom.py), so a level changes both
// which stories you see and how much you type before a break.
const PASSAGE_LEN = { 1: 70, 2: 140, 3: 240, 4: 360 };
const LICENSES = {
  "cc-by": ["CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/"],
  "cc-by-sa": ["CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/"],
  "cc-by-nc": ["CC BY-NC 4.0", "https://creativecommons.org/licenses/by-nc/4.0/"],
  "cc-by-nc-sa": ["CC BY-NC-SA 4.0", "https://creativecommons.org/licenses/by-nc-sa/4.0/"],
  "cc-by-nd": ["CC BY-ND 4.0", "https://creativecommons.org/licenses/by-nd/4.0/"],
  "cc-by-nc-nd": ["CC BY-NC-ND 4.0", "https://creativecommons.org/licenses/by-nc-nd/4.0/"],
  cc0: ["CC0", "https://creativecommons.org/publicdomain/zero/1.0/"],
};
// Key levels: 0 plain, 1 Shift, 2 AltGr (right Alt; Khmer uses it).
const LEVEL_PREFIX = ["", "Shift + ", "AltGr + "];

// Physical key rows, in "u" widths. Codes match KeyboardEvent.code, which is
// the key's position regardless of the OS layout -- that's what lets anyone
// type Thai or Khmer here from a US/UK/any keyboard.
const ROWS = [
  ["Backquote", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0", "Minus", "Equal", { mod: "Backspace", label: "⌫", w: 2 }],
  [{ mod: "Tab", label: "Tab", w: 1.5 }, "KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO", "KeyP", "BracketLeft", "BracketRight", { code: "Backslash", w: 1.5 }],
  [{ mod: "CapsLock", label: "Caps", w: 1.75 }, "KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL", "Semicolon", "Quote", { mod: "Enter", label: "Enter", w: 2.25 }],
  [{ mod: "ShiftLeft", label: "Shift", w: 2.25 }, "KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma", "Period", "Slash", { mod: "ShiftRight", label: "Shift", w: 2.75 }],
  [{ mod: "Space", label: "Space", w: 6.25 }],
];
// US characters per physical key: labels on the on-screen keys, and a fallback
// for phones with a Latin soft keyboard (typing "f" gives the letter on F).
const US = {
  Backquote: "`~", Digit1: "1!", Digit2: "2@", Digit3: "3#", Digit4: "4$", Digit5: "5%", Digit6: "6^", Digit7: "7&", Digit8: "8*", Digit9: "9(", Digit0: "0)", Minus: "-_", Equal: "=+",
  BracketLeft: "[{", BracketRight: "]}", Backslash: "\\|", Semicolon: ";:", Quote: "'\"", Comma: ",<", Period: ".>", Slash: "/?",
};
for (const c of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") US["Key" + c] = c.toLowerCase() + c;

const $ = (id) => document.getElementById(id);
const store = {
  get(k) {
    try { return localStorage.getItem(k); } catch { return null; }
  },
  set(k, v) {
    try { localStorage.setItem(k, v); } catch {}
  },
};
// Per-language settings. Thai used unprefixed keys before Khmer existed, so
// fall back to those to keep returning visitors' choices.
const langKey = (name) => `tt_${state.lang}_${name}`;
const langGet = (name) => store.get(langKey(name)) ?? (state.lang === "th" ? store.get(`tt_${name}`) : null);

const state = {
  lang: null, // null = home page
  layout: "",
  level: 1,
  showKeyboard: store.get("tt_keyboard") === "1",
  showTranslation: store.get("tt_translation") !== "0",
  stories: [],
  storyCache: {},
  story: null, // current story object, or null for own text
  customText: "",
  passages: [],
  pIndex: 0,
  // current passage
  target: "",
  status: [], // per UTF-16 unit: 0 untyped, 1 correct, 2 wrong, 3 skipped (not typeable on this layout)
  clusters: [], // [{start, end, el}]
  pos: 0,
  keystrokes: 0,
  correctKeys: 0,
  startedAt: 0,
  endedAt: 0,
  shiftLatch: false,
  altLatch: false,
};
let timer = 0;
let graphemes, words;
const L = () => LANGS[state.lang];

// ---------- text preparation ----------

function normalize(text) {
  return text
    .replace(/[​-‍﻿]/g, "") // zero-width spaces are common in Thai and Khmer text
    .replace(/ํา/g, "ำ") // Thai nikhahit + sara aa, typed as one key: sara am
    .replace(/[\s ]+/g, " ")
    .trim();
}

// Break long text at word boundaries (neither Thai nor Khmer puts spaces
// between words; the browser's dictionary segmenter finds them).
function splitLong(text, len) {
  const out = [];
  let cur = "";
  for (const { segment } of words.segment(text)) {
    if (cur.length >= len && segment.trim()) {
      out.push(cur.trim());
      cur = "";
    }
    cur += segment;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// Each passage remembers which source paragraphs it came from, so the
// translation panel can show the matching English.
function makePassages(paragraphs, len) {
  const out = [];
  let cur = { text: "", paras: [] };
  paragraphs.forEach((raw, i) => {
    const para = normalize(raw);
    if (!para) return;
    const pieces = para.length > len * 1.4 ? splitLong(para, len) : [para];
    for (const piece of pieces) {
      if (cur.text && cur.text.length + 1 + piece.length > len * 1.3) {
        out.push(cur);
        cur = { text: piece, paras: [i], partial: pieces.length > 1 };
      } else {
        cur.text = cur.text ? cur.text + " " + piece : piece;
        if (cur.paras.at(-1) !== i) cur.paras.push(i);
        if (pieces.length > 1) cur.partial = true;
      }
    }
  });
  if (cur.text) out.push(cur);
  return out;
}

// ---------- layout helpers ----------

function layoutMap() {
  return LAYOUTS[state.layout];
}
const hasAltGr = () => Object.values(layoutMap()).some((k) => k.length > 2);

// char -> { code, level } for the "next key" hint and keyboard highlight.
// Keys that type two characters at once (Khmer ាំ etc.) are skipped here:
// each of their characters also has a key of its own.
function reverseMap() {
  const rev = { " ": { code: "Space", level: 0 } };
  for (let level = 0; level < 3; level++) {
    for (const [code, chars] of Object.entries(layoutMap())) {
      const ch = chars[level];
      if (ch && ch.length === 1 && !(ch in rev)) rev[ch] = { code, level };
    }
  }
  return rev;
}
let REV = {};

const typeable = (ch) => ch in REV;
const show = (ch) => (ch && L().combining.test(ch) ? "◌" + ch : ch ?? "");
const keyName = (code) => (code === "Space" ? "Space" : US[code][0].toUpperCase());

// ---------- passage lifecycle ----------

function buildPassages() {
  const len = PASSAGE_LEN[state.level];
  const paras = state.story ? state.story.paragraphs : [state.customText];
  state.passages = makePassages(paras, len);
  if (!state.passages.length) state.passages = [{ text: "", paras: [] }];
}

function loadPassage(index) {
  state.pIndex = Math.max(0, Math.min(index, state.passages.length - 1));
  state.target = state.passages[state.pIndex].text;
  state.status = new Array(state.target.length).fill(0);
  state.pos = 0;
  state.keystrokes = state.correctKeys = 0;
  state.startedAt = state.endedAt = 0;
  clearInterval(timer);

  const box = $("passage");
  box.textContent = "";
  state.clusters = [];
  for (const { segment, index: start } of graphemes.segment(state.target)) {
    const el = document.createElement("span");
    el.textContent = segment; // textContent, never innerHTML: pasted text can't inject markup
    box.appendChild(el);
    state.clusters.push({ start, end: start + segment.length, el });
  }
  skipUntypeable();
  if (state.story) store.set("tt_pos_" + state.story.id, String(state.pIndex));

  $("result").hidden = true;
  $("passage-count").textContent = state.passages.length > 1 ? `Passage ${state.pIndex + 1} of ${state.passages.length}` : "";
  $("prev-passage").disabled = state.pIndex === 0;
  $("next-passage").disabled = state.pIndex >= state.passages.length - 1 && !state.story;
  renderAttribution();
  renderTranslation();
  renderStats();
  paint();
}

function skipUntypeable() {
  while (state.pos < state.target.length && !typeable(state.target[state.pos])) {
    state.status[state.pos] = 3;
    state.pos++;
  }
}

// One key press. Usually one character, but some Khmer keys type two.
function type(text) {
  if (!text) return;
  for (const ch of text) typeChar(ch);
  renderStats();
  paint();
}

function typeChar(ch) {
  if (state.endedAt || state.pos >= state.target.length) return;
  if (!state.startedAt) {
    state.startedAt = performance.now();
    timer = setInterval(renderStats, 250);
  }
  state.keystrokes++;
  const ok = ch === state.target[state.pos];
  state.status[state.pos] = ok ? 1 : 2;
  if (ok) state.correctKeys++;
  state.pos++;
  skipUntypeable();
  if (state.pos >= state.target.length) finish();
}

function backspace() {
  if (state.endedAt || state.pos === 0) return;
  let p = state.pos - 1;
  while (p > 0 && state.status[p] === 3) p--;
  if (state.status[p] === 3) return; // only skipped characters behind us
  state.status[p] = 0;
  state.pos = p;
  paint();
}

function finish() {
  state.endedAt = performance.now();
  clearInterval(timer);
  renderStats();
  const s = stats();
  const [great, good, keepGoing] = L().praise;
  const r = $("result-text");
  r.textContent = "";
  const cheer = document.createElement("span");
  cheer.lang = state.lang;
  cheer.textContent = (s.acc >= 98 ? great : s.acc >= 90 ? good : keepGoing) + " ";
  r.append(cheer, `${s.cpm} chars/min · ${s.acc}% accuracy · ${s.time}`);
  $("result").hidden = false;
}

function nextPassage() {
  if (state.pIndex < state.passages.length - 1) loadPassage(state.pIndex + 1);
  else if (state.story) pickStory(randomStory().id); // finished the story: move on to another
}

// ---------- rendering ----------

function paint() {
  const { status, pos } = state;
  for (const c of state.clusters) {
    let cls = "";
    if (c.end <= pos) {
      let bad = false, skipped = true;
      for (let i = c.start; i < c.end; i++) {
        if (status[i] === 2) bad = true;
        if (status[i] !== 3) skipped = false;
      }
      cls = bad ? "bad" : skipped ? "skip" : "ok";
    } else if (c.start <= pos && pos < c.end) {
      cls = "cur";
    }
    if (c.el.className !== cls) c.el.className = cls;
  }
  const cur = state.clusters.find((c) => c.start <= pos && pos < c.end);
  if (cur && document.activeElement === $("capture")) cur.el.scrollIntoView({ block: "nearest" });
  renderHint();
}

function renderHint() {
  const ch = state.endedAt ? "" : state.target[state.pos] ?? "";
  const k = REV[ch];
  $("next-char").textContent = ch === " " ? "␣" : show(ch);
  $("next-key").textContent = k ? LEVEL_PREFIX[k.level] + keyName(k.code) : "";
  document.querySelectorAll(".key.target").forEach((el) => el.classList.remove("target"));
  if (k && state.showKeyboard) {
    document.querySelector(`.key[data-code="${k.code}"]`)?.classList.add("target");
    if (k.level === 1) document.querySelectorAll('.key[data-mod^="Shift"]').forEach((el) => el.classList.add("target"));
    if (k.level === 2) document.querySelector('.key[data-mod="AltGr"]')?.classList.add("target");
  }
}

function stats() {
  const end = state.endedAt || performance.now();
  const ms = state.startedAt ? end - state.startedAt : 0;
  const correct = state.status.filter((s) => s === 1).length;
  const cpm = ms > 1000 ? Math.round(correct / (ms / 60000)) : 0;
  const acc = state.keystrokes ? Math.round((state.correctKeys / state.keystrokes) * 100) : 100;
  const sec = Math.floor(ms / 1000);
  return { cpm, wpm: Math.round(cpm / 5), acc, time: `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}` };
}

function renderStats() {
  const s = stats();
  $("stat-cpm").textContent = s.cpm;
  $("stat-wpm").textContent = s.wpm;
  $("stat-acc").textContent = s.acc + "%";
  $("stat-time").textContent = s.time;
}

function link(text, href) {
  const a = document.createElement("a");
  a.href = href;
  a.textContent = text;
  a.rel = "noopener";
  a.target = "_blank";
  return a;
}

function renderAttribution() {
  const el = $("attribution");
  el.textContent = "";
  const s = state.story;
  if (!s) {
    el.textContent = "Your own text — not saved or sent anywhere.";
    return;
  }
  const [licName, licUrl] = LICENSES[s.license] || [s.license, null];
  const title = document.createElement("span");
  title.lang = state.lang;
  title.textContent = `“${s.title}”`;
  el.append(title, ` — ${s.copyright || "Bloom Library author"}. `);
  el.append(licUrl ? link(licName, licUrl) : licName, " · ", link("Read the illustrated book on Bloom Library", s.source));
}

// English for the paragraphs in the current passage. Hidden for your own text;
// a "No Derivatives" story explains why it has none (a translation is an
// adaptation that license forbids, so the build ships none for it).
function renderTranslation() {
  const panel = $("translation");
  const s = state.story;
  panel.hidden = !s;
  if (!s) return;
  const body = $("translation-text");
  const on = state.showTranslation;
  $("translation-toggle").textContent = on ? "Hide" : "Show";
  $("translation-toggle").setAttribute("aria-expanded", String(on));
  body.hidden = !on;
  panel.classList.toggle("collapsed", !on); // a hidden translation gives its column back to the passage
  $("translation-note").hidden = !on;
  if (!on) return;
  body.textContent = "";
  if (!s.paragraphs_en) {
    body.className = "translation-text muted";
    body.textContent = `No English for this story: its author's licence (No Derivatives) doesn't allow translations. Stories marked “${L().name} only” in the list are like this.`;
    return;
  }
  body.className = "translation-text";
  const passage = state.passages[state.pIndex];
  const lines = passage.paras.map((i) => s.paragraphs_en[i]).filter(Boolean);
  body.textContent = lines.length ? lines.join(" ") : "No translation for this passage yet.";
  if (lines.length && passage.partial) {
    const note = document.createElement("span");
    note.className = "partial-note";
    note.textContent = "This passage is part of a longer sentence or paragraph; the English covers all of it.";
    body.append(note);
  }
}

// ---------- keyboard ----------

function renderKeyboard() {
  const kb = $("keyboard");
  kb.textContent = "";
  const map = layoutMap();
  const rows = ROWS.map((r) => [...r]);
  if (hasAltGr()) rows[4].push({ mod: "AltGr", label: "AltGr", w: 1.75 });
  for (const row of rows) {
    const r = document.createElement("div");
    r.className = "kb-row";
    for (const k of row) {
      const spec = typeof k === "string" ? { code: k } : k;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "key";
      b.tabIndex = -1;
      if (spec.w) b.style.setProperty("--w", spec.w);
      if (spec.mod) {
        b.classList.add("mod");
        b.dataset.mod = spec.mod;
        b.dataset.code = spec.mod;
        b.textContent = spec.label;
      } else {
        const [plain, shifted, altgr] = map[spec.code];
        b.dataset.code = spec.code;
        b.lang = state.lang;
        b.setAttribute("aria-label", [plain, shifted && `shift ${shifted}`, altgr && `altgr ${altgr}`].filter(Boolean).join(", "));
        for (const [cls, text] of [["latin", US[spec.code][0].toUpperCase()], ["shift", show(shifted)], ["main", show(plain)], ["alt", show(altgr)]]) {
          if (!text) continue;
          const s = document.createElement("span");
          s.className = cls;
          s.textContent = text;
          b.appendChild(s);
        }
      }
      r.appendChild(b);
    }
    kb.appendChild(r);
  }
  syncMods();
  renderHint();
}

// Shift and AltGr work as one-shot latches on the on-screen keyboard, and
// light up while held on a physical one.
let physShift = false;
let physAltGr = false;
function syncMods() {
  const kb = $("keyboard");
  kb.classList.toggle("shifted", state.shiftLatch || physShift);
  kb.classList.toggle("altgr", state.altLatch || physAltGr);
  document.querySelectorAll('.key[data-mod^="Shift"]').forEach((el) => el.classList.toggle("latched", state.shiftLatch));
  document.querySelector('.key[data-mod="AltGr"]')?.classList.toggle("latched", state.altLatch);
}

// On-screen key taps. mousedown is cancelled so focus stays on the passage.
$("keyboard").addEventListener("mousedown", (e) => e.preventDefault());
$("keyboard").addEventListener("click", (e) => {
  const key = e.target.closest(".key");
  if (!key) return;
  const { code, mod } = key.dataset;
  if (mod === "ShiftLeft" || mod === "ShiftRight") {
    state.shiftLatch = !state.shiftLatch;
    state.altLatch = false;
    syncMods();
    return;
  }
  if (mod === "AltGr") {
    state.altLatch = !state.altLatch;
    state.shiftLatch = false;
    syncMods();
    return;
  }
  if (mod === "Backspace") backspace();
  else if (mod === "Space") type(" ");
  else if (mod === "Enter") {
    if (state.endedAt) nextPassage();
  } else if (!mod) type(layoutMap()[code][state.altLatch ? 2 : state.shiftLatch ? 1 : 0]);
  if (state.shiftLatch || state.altLatch) {
    state.shiftLatch = state.altLatch = false;
    syncMods();
  }
  flash(code);
});

function flash(code) {
  const el = document.querySelector(`.key[data-code="${code}"]`);
  if (!el) return;
  el.classList.add("pressed");
  setTimeout(() => el.classList.remove("pressed"), 110);
}

// ---------- physical keyboard + soft keyboard input ----------

const isField = (el) => el && el !== $("capture") && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.tagName === "SELECT" || el.isContentEditable);
const inTypingArea = (el) => !el || el === document.body || el === $("passage") || el === $("capture");

document.addEventListener("keydown", (e) => {
  if (!state.lang || isField(e.target) || e.metaKey || e.isComposing) return;
  if (e.code === "AltRight") {
    physAltGr = true;
    syncMods();
    e.preventDefault(); // keep the browser from treating it as a menu key
    return;
  }
  // AltGr arrives as right Alt on Linux/macOS and as Ctrl+Alt on Windows.
  const altgr = physAltGr || e.getModifierState("AltGraph");
  if ((e.ctrlKey || e.altKey) && !altgr) return;
  if (e.key === "Shift") {
    physShift = true;
    syncMods();
  }
  const typing = inTypingArea(e.target);
  if (e.key === "Escape") {
    loadPassage(state.pIndex);
    return;
  }
  if (e.key === "Enter" && state.endedAt) {
    e.preventDefault();
    nextPassage();
    return;
  }
  const mapped = layoutMap()[e.code];
  if (!mapped && !(typing && (e.code === "Space" || e.code === "Backspace"))) return;
  e.preventDefault();
  if (!typing) focusTyping();
  document.querySelector(`.key[data-code="${e.code}"]`)?.classList.add("pressed");
  if (e.code === "Backspace") backspace();
  else if (e.code === "Space") type(" ");
  else type(mapped[altgr ? 2 : e.shiftKey ? 1 : 0]);
});
document.addEventListener("keyup", (e) => {
  if (e.key === "Shift") physShift = false;
  if (e.code === "AltRight") physAltGr = false;
  syncMods();
  document.querySelector(`.key[data-code="${e.code}"]`)?.classList.remove("pressed");
});
window.addEventListener("blur", () => {
  physShift = physAltGr = false;
  syncMods();
});

// Phones/tablets: soft keyboards send text through the input event (keydown
// has no usable code). A one-space sentinel keeps Backspace working when empty.
const capture = $("capture");
const resetCapture = () => {
  capture.value = " ";
  capture.setSelectionRange(1, 1);
};
capture.addEventListener("input", (e) => {
  if (e.inputType && e.inputType.startsWith("delete")) backspace();
  else if (e.data) {
    for (const ch of e.data) {
      const expected = state.target[state.pos];
      if (ch !== expected && /[a-zA-Z`~!@#$%^&*()\-_=+[\]{}\\|;:'",.<>/?]/.test(ch)) {
        const code = Object.keys(US).find((c) => US[c].includes(ch));
        type(code ? layoutMap()[code][US[code].indexOf(ch)] : ch);
      } else type(ch);
    }
  }
  resetCapture();
});

function focusTyping() {
  resetCapture();
  capture.focus({ preventScroll: true });
}
$("passage").addEventListener("click", focusTyping);
$("passage").addEventListener("focus", focusTyping);
capture.addEventListener("focus", () => {
  $("passage").classList.add("focused");
  $("focus-hint").hidden = true;
  paint();
});
capture.addEventListener("blur", () => $("passage").classList.remove("focused"));

// ---------- settings ----------

function setRadio(groupId, attr, value) {
  for (const b of $(groupId).querySelectorAll("button")) {
    b.setAttribute("aria-checked", String(b.dataset[attr] === String(value)));
  }
}

function setLayout(name) {
  state.layout = name;
  store.set(langKey("layout"), name);
  REV = reverseMap();
  setRadio("layout-group", "layout", name);
  renderKeyboard();
  if (state.passages.length) loadPassage(state.pIndex); // typeable set can differ between layouts
}

function storiesAt(level) {
  return state.stories.filter((s) => s.level === level);
}
function randomStory() {
  const pool = storiesAt(state.level).filter((s) => s !== state.story);
  return pool[Math.floor(Math.random() * pool.length)] || storiesAt(state.level)[0];
}

function fillStorySelect() {
  const sel = $("story-select");
  sel.textContent = "";
  if (!state.story) sel.add(new Option("Your own text", "__custom"));
  for (const s of storiesAt(state.level)) {
    // English first so the list is usable before you can read the script.
    const label = (s.title_en ? `${s.title_en} · ${s.title}` : s.title) + (s.paragraphs_en ? "" : ` (${L().name} only)`);
    sel.add(new Option(label, s.id));
  }
  sel.value = state.story ? state.story.id : "__custom";
}

function pickStory(id) {
  state.story = state.stories.find((s) => s.id === id) || null;
  if (state.story) store.set(langKey("story_" + state.level), id);
  buildPassages();
  fillStorySelect();
  const saved = state.story ? Number(store.get("tt_pos_" + state.story.id)) || 0 : 0;
  loadPassage(saved < state.passages.length ? saved : 0);
}

function setLevel(level, { keepCustom = true } = {}) {
  state.level = level;
  store.set(langKey("level"), String(level));
  setRadio("level-group", "level", level);
  if (!state.story && keepCustom && state.customText) {
    buildPassages();
    fillStorySelect();
    loadPassage(0);
    return;
  }
  const remembered = langGet("story_" + level);
  const exists = storiesAt(level).some((s) => s.id === remembered);
  pickStory(exists ? remembered : randomStory().id);
}

function setKeyboard(on) {
  state.showKeyboard = on;
  store.set("tt_keyboard", on ? "1" : "0");
  $("keyboard").hidden = !on;
  $("keyboard-toggle").setAttribute("aria-pressed", String(on));
  $("keyboard-toggle").textContent = on ? "Hide keyboard" : "Show keyboard";
  if (state.lang) renderHint();
}

function effectiveTheme() {
  const t = document.documentElement.dataset.theme;
  if (t) return t;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function renderThemeButton() {
  $("theme-toggle").textContent = effectiveTheme() === "dark" ? "☀ Day" : "☾ Night";
}

$("layout-group").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b) setLayout(b.dataset.layout);
});
$("level-group").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b) setLevel(Number(b.dataset.level));
});
$("story-select").addEventListener("change", (e) => {
  if (e.target.value !== "__custom") pickStory(e.target.value);
  focusTyping();
});
$("random-story").addEventListener("click", () => pickStory(randomStory().id));
$("translation-toggle").addEventListener("click", () => {
  state.showTranslation = !state.showTranslation;
  store.set("tt_translation", state.showTranslation ? "1" : "0");
  renderTranslation();
});
$("keyboard-toggle").addEventListener("click", () => setKeyboard(!state.showKeyboard));
$("theme-toggle").addEventListener("click", () => {
  const next = effectiveTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  store.set("tt_theme", next);
  renderThemeButton();
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", renderThemeButton);

$("custom-toggle").addEventListener("click", () => {
  $("custom-panel").hidden = !$("custom-panel").hidden;
  if (!$("custom-panel").hidden) $("custom-text").focus();
});
$("custom-cancel").addEventListener("click", () => ($("custom-panel").hidden = true));
$("custom-use").addEventListener("click", () => {
  const text = normalize($("custom-text").value);
  if (!text) return;
  state.customText = text;
  state.story = null;
  $("custom-panel").hidden = true;
  buildPassages();
  fillStorySelect();
  loadPassage(0);
  focusTyping();
});

$("prev-passage").addEventListener("click", () => loadPassage(state.pIndex - 1));
$("next-passage").addEventListener("click", nextPassage);
$("restart").addEventListener("click", () => {
  loadPassage(state.pIndex);
  focusTyping();
});
$("result-next").addEventListener("click", () => {
  nextPassage();
  focusTyping();
});

// ---------- languages and routing ----------
// The URL hash picks the view: no hash is the home page (choose a language),
// #th and #km are the practice pages. Tabs are plain links, so back/forward
// and bookmarks work.

async function loadStories(lang) {
  if (!state.storyCache[lang]) {
    try {
      state.storyCache[lang] = await (await fetch(`stories-${lang}.json`)).json();
    } catch {
      state.storyCache[lang] = [];
    }
  }
  return state.storyCache[lang];
}

async function openLanguage(lang) {
  state.lang = lang;
  const cfg = L();
  document.documentElement.dataset.lang = lang;
  graphemes = new Intl.Segmenter(lang, { granularity: "grapheme" });
  words = new Intl.Segmenter(lang, { granularity: "word" });
  $("subtitle").textContent = cfg.subtitle;
  $("subtitle").lang = lang;
  for (const id of ["passage", "story-select", "custom-text", "next-char"]) $(id).lang = lang;
  $("custom-text").placeholder = cfg.placeholder;
  $("bloom-link").href = cfg.bloom;

  const group = $("layout-group");
  group.textContent = "";
  for (const [name, label] of cfg.layouts) {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "radio");
    b.dataset.layout = name;
    b.textContent = label;
    group.appendChild(b);
  }
  const savedLayout = langGet("layout");
  const layout = cfg.layouts.some(([n]) => n === savedLayout) ? savedLayout : cfg.layouts[0][0];
  // Clear the previous language's passage straight away; its stories may take
  // a moment to download on a slow connection.
  state.story = null;
  state.customText = "";
  state.passages = [];
  state.target = "";
  state.status = [];
  state.clusters = [];
  clearInterval(timer);
  $("passage").textContent = "Loading stories…";
  $("story-select").textContent = "";
  $("passage-count").textContent = "";
  $("attribution").textContent = "";
  $("translation").hidden = true;
  $("result").hidden = true;
  setLayout(layout);

  const lvl = Number(langGet("level"));
  state.level = lvl in PASSAGE_LEN ? lvl : 1;
  setRadio("level-group", "level", state.level);
  state.stories = await loadStories(lang);
  if (state.lang !== lang) return; // switched again while loading
  if (!state.stories.length) {
    state.customText = cfg.fallback;
    buildPassages();
    fillStorySelect();
    loadPassage(0);
    return;
  }
  setLevel(state.level, { keepCustom: false });
}

function route() {
  const lang = location.hash.slice(1);
  const known = lang in LANGS;
  $("home").hidden = known;
  $("practice-view").hidden = !known;
  $("keyboard-toggle").hidden = !known;
  for (const a of document.querySelectorAll(".lang-tab")) {
    a.toggleAttribute("aria-current", a.dataset.lang === lang);
    if (a.dataset.lang === lang) a.setAttribute("aria-current", "page");
  }
  if (!known) {
    state.lang = null;
    clearInterval(timer);
    document.documentElement.dataset.lang = "";
    $("subtitle").textContent = "ខ្មែរ · ไทย";
    $("subtitle").removeAttribute("lang");
    document.title = "Language Typing Practice";
    return;
  }
  document.title = `${LANGS[lang].name} Typing Practice`;
  if (state.lang !== lang) openLanguage(lang);
}

renderThemeButton();
setKeyboard(state.showKeyboard);
window.addEventListener("hashchange", route);
route();
