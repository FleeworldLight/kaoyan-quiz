import { useSyncExternalStore } from "react";

const KEY = "kq:state:v1";

const EMPTY = {
  progress: {},   // qid -> { seen, right, wrong, lastAt, subject, topics:[], loc:{s,f} }
  wrong: {},      // qid -> { addedAt, subject, wrongCount, loc:{s,f}, cleared }
  fav: {},        // qid -> { addedAt, subject, loc:{s,f} }
  notes: {},      // qid -> string
  records: [],    // { id, at, subject, mode, paperId, total, correct, blank, durationSec, topic }
  exams: {},      // `${subject}-${year}` -> { answers:{}, startedAt, submittedAt, flags:{} }
  settings: { instantReveal: true, autoScroll: true, shuffleOptions: false, overtimeHint: true },
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(EMPTY);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(EMPTY), ...parsed, settings: { ...EMPTY.settings, ...(parsed.settings || {}) } };
  } catch {
    return structuredClone(EMPTY);
  }
}

let state = load();
const listeners = new Set();

let saveTimer = null;
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("保存失败（可能超出容量）", e);
    }
  }, 250);
}

function set(updater) {
  state = typeof updater === "function" ? updater(state) : { ...state, ...updater };
  scheduleSave();
  listeners.forEach((l) => l());
}

function subscribe(l) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useStore() {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
export function getState() {
  return state;
}

/* ------------------------------ 写入动作 ------------------------------ */

export function recordAnswer({ qid, subject, loc, topics = [], correct, blank = false }) {
  const now = Date.now();
  set((s) => {
    const p = s.progress[qid] || { seen: 0, right: 0, wrong: 0, subject, topics, loc };
    const next = {
      ...p,
      subject,
      loc,
      topics: topics && topics.length ? topics : p.topics || [],
      seen: p.seen + 1,
      lastAt: now,
    };
    if (blank) {
      // 自评/未作答，不计对错
    } else if (correct) {
      next.right = p.right + 1;
    } else {
      next.wrong = p.wrong + 1;
    }
    const progress = { ...s.progress, [qid]: next };

    let wrong = s.wrong;
    if (!blank && !correct) {
      const w = s.wrong[qid] || { addedAt: now, subject, loc, wrongCount: 0 };
      wrong = { ...s.wrong, [qid]: { ...w, subject, loc, wrongCount: (w.wrongCount || 0) + 1, cleared: false, lastAt: now } };
    } else if (!blank && correct && s.wrong[qid]) {
      // 答对一次不算移出，需手动或连续两次答对
      const w = s.wrong[qid];
      wrong = { ...s.wrong, [qid]: { ...w, rightAfter: (w.rightAfter || 0) + 1 } };
    }
    return { ...s, progress, wrong };
  });
}

export function addRecord(rec) {
  set((s) => ({ ...s, records: [...s.records, { id: `r${Date.now()}${Math.random().toString(36).slice(2, 6)}`, at: Date.now(), ...rec }].slice(-3000) }));
}

export function clearWrong(qid) {
  set((s) => {
    const w = { ...s.wrong };
    if (qid) delete w[qid];
    else Object.keys(w).forEach((k) => delete w[k]);
    return { ...s, wrong: w };
  });
}

export function toggleFav(qid, subject, loc) {
  set((s) => {
    const fav = { ...s.fav };
    if (fav[qid]) delete fav[qid];
    else fav[qid] = { addedAt: Date.now(), subject, loc };
    return { ...s, fav };
  });
}

export function setNote(qid, text) {
  set((s) => {
    const notes = { ...s.notes };
    if (text && text.trim()) notes[qid] = text;
    else delete notes[qid];
    return { ...s, notes };
  });
}

export function saveExam(key, data) {
  set((s) => ({ ...s, exams: { ...s.exams, [key]: { ...(s.exams[key] || {}), ...data } } }));
}

export function resetExam(key) {
  set((s) => {
    const exams = { ...s.exams };
    delete exams[key];
    return { ...s, exams };
  });
}

export function setSettings(patch) {
  set((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
}

export function resetAll() {
  set(() => structuredClone(EMPTY));
}

export function exportWrong() {
  const s = getState();
  const items = Object.entries(s.wrong).map(([qid, w]) => ({ qid, ...w, note: s.notes[qid] || "" }));
  return { exportedAt: new Date().toISOString(), count: items.length, items };
}

/* ------------------------------ 统计 ------------------------------ */

export function subjectStats(s, subject) {
  const entries = Object.entries(s.progress).filter(([, p]) => p.subject === subject);
  let right = 0, wrong = 0, seen = 0;
  for (const [, p] of entries) { right += p.right || 0; wrong += p.wrong || 0; seen += p.seen || 0; }
  const done = entries.filter(([, p]) => (p.right || 0) + (p.wrong || 0) > 0).length;
  return { done, right, wrong, seen, accuracy: right + wrong ? right / (right + wrong) : 0 };
}

export function topicStats(s, subject) {
  const map = new Map();
  for (const p of Object.values(s.progress)) {
    if (p.subject !== subject) continue;
    for (const t of p.topics || []) {
      const cur = map.get(t) || { topic: t, right: 0, wrong: 0 };
      cur.right += p.right || 0;
      cur.wrong += p.wrong || 0;
      map.set(t, cur);
    }
  }
  return [...map.values()].map((x) => ({ ...x, accuracy: x.right + x.wrong ? x.right / (x.right + x.wrong) : 0 }))
    .sort((a, b) => a.accuracy - b.accuracy);
}

export function heatmap(s, weeks = 26) {
  const byDay = new Map();
  for (const r of s.records) {
    const d = new Date(r.at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    byDay.set(key, (byDay.get(key) || 0) + (r.total || 0));
  }
  const days = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - weeks * 7 + 1);
  // 对齐到周一
  const dow = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - dow);
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    days.push({ key, count: byDay.get(key) || 0, date: new Date(d) });
  }
  return days;
}

export function streak(s) {
  const set2 = new Set(s.records.map((r) => new Date(r.at).toDateString()));
  let n = 0;
  const d = new Date();
  if (!set2.has(d.toDateString())) d.setDate(d.getDate() - 1);
  while (set2.has(d.toDateString())) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
