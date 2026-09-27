import { LAYOUTS } from "./layouts.js";

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
// Thai vowel/tone marks that sit above or below a consonant. Shown on a dotted
// circle (◌) so a lone mark is visible on keys and in the "next" hint.
const COMBINING = /[ัิ-ฺ็-๎]/;

// Physical key rows, in "u" widths. Codes match KeyboardEvent.code, which is
// the key's position regardless of the OS layout -- that's what lets anyone
// type Thai here from a US/UK/any keyboard.
const ROWS = [
  ["Backquote", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0", "Minus", "Equal", { mod: "Backspace", label: "⌫", w: 2 }],
  [{ mod: "Tab", label: "Tab", w: 1.5 }, "KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO", "KeyP", "BracketLeft", "BracketRight", { code: "Backslash", w: 1.5 }],
  [{ mod: "CapsLock", label: "Caps", w: 1.75 }, "KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL", "Semicolon", "Quote", { mod: "Enter", label: "Enter", w: 2.25 }],
  [{ mod: "ShiftLeft", label: "Shift", w: 2.25 }, "KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma", "Period", "Slash", { mod: "ShiftRight", label: "Shift", w: 2.75 }],
  [{ mod: "Space", label: "Space", w: 6.25 }],
];
// US characters per physical key: labels on the on-screen keys, and a fallback
// for phones with a Latin soft keyboard (typing "f" gives the Thai letter on F).
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
const graphemes = new Intl.Segmenter("th", { granularity: "grapheme" });
const words = new Intl.Segmenter("th", { granularity: "word" });

const state = {
  layout: LAYOUTS[store.get("tt_layout")] ? store.get("tt_layout") : "kedmanee",
  level: Number(store.get("tt_level")) in PASSAGE_LEN ? Number(store.get("tt_level")) : 1,
  showKeyboard: store.get("tt_keyboard") === "1",
  stories: [],
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
};
let timer = 0;

// ---------- text preparation ----------

function normalize(text) {
  return text
    .replace(/[​-‍﻿]/g, "") // zero-width spaces are common in Thai web text
    .replace(/ํา/g, "ำ") // nikhahit + sara aa, typed as one key: sara am
    .replace(/[\s ]+/g, " ")
    .trim();
}

// Break long text at word boundaries (Thai has no spaces between words; the
// browser's Thai dictionary segmenter finds them).
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

function makePassages(paragraphs, len) {
  const out = [];
  let cur = "";
  for (const para of paragraphs.map(normalize).filter(Boolean)) {
    for (const piece of para.length > len * 1.4 ? splitLong(para, len) : [para]) {
      if (cur && cur.length + 1 + piece.length > len * 1.3) {
        out.push(cur);
        cur = piece;
      } else {
        cur = cur ? cur + " " + piece : piece;
      }
    }
  }
  if (cur) out.push(cur);
  return out;
}

// ---------- layout helpers ----------

function layoutMap() {
  return LAYOUTS[state.layout];
}

// char -> { code, shift } for the "next key" hint and keyboard highlight.
function reverseMap() {
  const rev = { " ": { code: "Space", shift: false } };
  for (const [code, [plain, shifted]] of Object.entries(layoutMap())) {
    if (!(plain in rev)) rev[plain] = { code, shift: false };
    if (!(shifted in rev)) rev[shifted] = { code, shift: true };
  }
  return rev;
}
let REV = reverseMap();

const typeable = (ch) => ch in REV;
const show = (ch) => (COMBINING.test(ch) ? "◌" + ch : ch);
const keyName = (code) => (code === "Space" ? "Space" : US[code][0].toUpperCase());

// ---------- passage lifecycle ----------

function buildPassages() {
  const len = PASSAGE_LEN[state.level];
  const paras = state.story ? state.story.paragraphs : [state.customText];
  state.passages = makePassages(paras, len);
  if (!state.passages.length) state.passages = [""];
}

function loadPassage(index) {
  state.pIndex = Math.max(0, Math.min(index, state.passages.length - 1));
  state.target = state.passages[state.pIndex];
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
  renderStats();
  paint();
}

function skipUntypeable() {
  while (state.pos < state.target.length && !typeable(state.target[state.pos])) {
    state.status[state.pos] = 3;
    state.pos++;
  }
}

function type(ch) {
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
  renderStats();
  paint();
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
  const praise = s.acc >= 98 ? "เยี่ยมมาก!" : s.acc >= 90 ? "ดีมาก!" : "สู้ ๆ!";
  const r = $("result-text");
  r.textContent = "";
  const th = document.createElement("span");
  th.lang = "th";
  th.textContent = praise + " ";
  r.append(th, `${s.cpm} chars/min · ${s.acc}% accuracy · ${s.time}`);
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
  $("next-key").textContent = k ? (k.shift ? "Shift + " : "") + keyName(k.code) : "";
  document.querySelectorAll(".key.target").forEach((el) => el.classList.remove("target"));
  if (k && state.showKeyboard) {
    document.querySelector(`.key[data-code="${k.code}"]`)?.classList.add("target");
    if (k.shift) document.querySelectorAll('.key[data-mod^="Shift"]').forEach((el) => el.classList.add("target"));
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

function renderAttribution() {
  const el = $("attribution");
  el.textContent = "";
  const s = state.story;
  if (!s) {
    el.textContent = "Your own text — not saved or sent anywhere.";
    return;
  }
  const [licName, licUrl] = LICENSES[s.license] || [s.license, null];
  const link = (text, href) => {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = text;
    a.rel = "noopener";
    a.target = "_blank";
    return a;
  };
  const title = document.createElement("span");
  title.lang = "th";
  title.textContent = `“${s.title}”`;
  el.append(title, ` — ${s.copyright || "Bloom Library author"}. `);
  el.append(licUrl ? link(licName, licUrl) : licName, " · ", link("Read the illustrated book on Bloom Library", s.source));
}

// ---------- keyboard ----------

function renderKeyboard() {
  const kb = $("keyboard");
  kb.textContent = "";
  const map = layoutMap();
  for (const row of ROWS) {
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
        const [plain, shifted] = map[spec.code];
        b.dataset.code = spec.code;
        b.setAttribute("aria-label", `${plain}, shift ${shifted}`);
        for (const [cls, text] of [["latin", US[spec.code][0].toUpperCase()], ["shift", show(shifted)], ["main", show(plain)]]) {
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
  syncShift();
  renderHint();
}

function syncShift(physical = false) {
  const on = state.shiftLatch || physical;
  $("keyboard").classList.toggle("shifted", on);
  document.querySelectorAll('.key[data-mod^="Shift"]').forEach((el) => el.classList.toggle("latched", state.shiftLatch));
}

// On-screen key taps. mousedown is cancelled so focus stays on the passage.
$("keyboard").addEventListener("mousedown", (e) => e.preventDefault());
$("keyboard").addEventListener("click", (e) => {
  const key = e.target.closest(".key");
  if (!key) return;
  const { code, mod } = key.dataset;
  if (mod === "Backspace") backspace();
  else if (mod === "ShiftLeft" || mod === "ShiftRight") {
    state.shiftLatch = !state.shiftLatch;
    syncShift();
    return;
  } else if (mod === "Space") type(" ");
  else if (mod === "Enter") {
    if (state.endedAt) nextPassage();
  } else if (!mod) type(layoutMap()[code][state.shiftLatch ? 1 : 0]);
  if (state.shiftLatch) {
    state.shiftLatch = false;
    syncShift();
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
  if (isField(e.target) || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
  if (e.key === "Shift") syncShift(true);
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
  else type(mapped[e.shiftKey ? 1 : 0]);
});
document.addEventListener("keyup", (e) => {
  if (e.key === "Shift") syncShift(false);
  document.querySelector(`.key[data-code="${e.code}"]`)?.classList.remove("pressed");
});
window.addEventListener("blur", () => syncShift(false));

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
  store.set("tt_layout", name);
  REV = reverseMap();
  setRadio("layout-group", "layout", name);
  renderKeyboard();
  loadPassage(state.pIndex); // typeable set can differ between layouts
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
  for (const s of storiesAt(state.level)) sel.add(new Option(s.title, s.id));
  sel.value = state.story ? state.story.id : "__custom";
}

function pickStory(id) {
  state.story = state.stories.find((s) => s.id === id) || null;
  if (state.story) store.set("tt_story_" + state.level, id);
  buildPassages();
  fillStorySelect();
  const saved = state.story ? Number(store.get("tt_pos_" + state.story.id)) || 0 : 0;
  loadPassage(saved < state.passages.length ? saved : 0);
}

function setLevel(level, { keepCustom = true } = {}) {
  state.level = level;
  store.set("tt_level", String(level));
  setRadio("level-group", "level", level);
  if (!state.story && keepCustom && state.customText) {
    buildPassages();
    fillStorySelect();
    loadPassage(0);
    return;
  }
  const remembered = store.get("tt_story_" + level);
  const exists = storiesAt(level).some((s) => s.id === remembered);
  pickStory(exists ? remembered : randomStory().id);
}

function setKeyboard(on) {
  state.showKeyboard = on;
  store.set("tt_keyboard", on ? "1" : "0");
  $("keyboard").hidden = !on;
  $("keyboard-toggle").setAttribute("aria-pressed", String(on));
  $("keyboard-toggle").textContent = on ? "Hide keyboard" : "Show keyboard";
  renderHint();
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

// ---------- start ----------

async function init() {
  renderThemeButton();
  setRadio("layout-group", "layout", state.layout);
  setRadio("level-group", "level", state.level);
  renderKeyboard();
  setKeyboard(state.showKeyboard);
  try {
    const res = await fetch("stories.json");
    state.stories = await res.json();
  } catch {
    state.stories = [];
  }
  if (!state.stories.length) {
    state.customText = "สวัสดีครับ ยินดีต้อนรับ";
    buildPassages();
    fillStorySelect();
    loadPassage(0);
    return;
  }
  setLevel(state.level, { keepCustom: false });
}
init();
