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

/* ------------------------------ 导入 ------------------------------ */

/**
 * 合并导入一份导出数据（或整份 kq:state:v1 快照）。
 * 规则：进度取「更大的对/错次数」（不会因为导入而丢失已有练习量），
 *       错题/收藏/笔记取并集（已有的优先），记录按 id 去重后拼接，考试状态取更新的。
 * 返回一份合并统计，供界面提示。
 */
export function importData(raw) {
  if (!raw || typeof raw !== "object") throw new Error("文件内容不是有效的 JSON 对象");
  const src = raw.state && typeof raw.state === "object" ? raw.state : raw;
  if (!src.progress && !src.wrong && !src.fav && !src.notes && !src.records) {
    // 兼容「错题本导出」的 { items: [...] } 结构
    if (Array.isArray(raw.items)) {
      let n = 0;
      set((s) => {
        const wrong = { ...s.wrong };
        for (const it of raw.items) {
          if (!it.qid) continue;
          const cur = wrong[it.qid];
          wrong[it.qid] = {
            addedAt: Math.min(cur?.addedAt || it.addedAt || Date.now(), it.addedAt || Date.now()),
            lastAt: Math.max(cur?.lastAt || 0, it.lastAt || 0) || undefined,
            subject: it.subject || cur?.subject,
            loc: it.loc || cur?.loc,
            wrongCount: Math.max(cur?.wrongCount || 0, it.wrongCount || 1),
          };
          if (it.note) s = { ...s, notes: { ...s.notes, [it.qid]: s.notes[it.qid] || it.note } };
          n++;
        }
        return { ...s, wrong };
      });
      return { ok: true, wrong: n, progress: 0, fav: 0, notes: 0, records: 0 };
    }
    throw new Error("看不懂这个文件：既不是完整快照，也不是错题本导出文件");
  }

  const stats = { ok: true, progress: 0, wrong: 0, fav: 0, notes: 0, records: 0, exams: 0 };
  set((s) => {
    const progress = { ...s.progress };
    for (const [qid, p] of Object.entries(src.progress || {})) {
      const cur = progress[qid];
      if (!cur) progress[qid] = p;
      else progress[qid] = {
        ...cur,
        subject: cur.subject || p.subject,
        loc: cur.loc || p.loc,
        topics: [...new Set([...(cur.topics || []), ...(p.topics || [])])],
        seen: Math.max(cur.seen || 0, p.seen || 0),
        right: Math.max(cur.right || 0, p.right || 0),
        wrong: Math.max(cur.wrong || 0, p.wrong || 0),
        lastAt: Math.max(cur.lastAt || 0, p.lastAt || 0) || undefined,
      };
      stats.progress++;
    }

    const wrong = { ...s.wrong };
    for (const [qid, w] of Object.entries(src.wrong || {})) {
      const cur = wrong[qid];
      wrong[qid] = cur
        ? { ...cur, wrongCount: Math.max(cur.wrongCount || 0, w.wrongCount || 0), lastAt: Math.max(cur.lastAt || 0, w.lastAt || 0) || undefined }
        : w;
      stats.wrong++;
    }

    const fav = { ...s.fav };
    for (const [qid, v] of Object.entries(src.fav || {})) {
      if (!fav[qid]) { fav[qid] = v; stats.fav++; }
    }

    const notes = { ...s.notes };
    for (const [qid, t] of Object.entries(src.notes || {})) {
      if (!notes[qid] && t) { notes[qid] = t; stats.notes++; }
    }

    const seenRec = new Set((s.records || []).map((r) => r.id));
    const records = [...(s.records || [])];
    for (const r of src.records || []) {
      if (r && r.id && !seenRec.has(r.id)) { records.push(r); seenRec.add(r.id); stats.records++; }
    }
    records.sort((a, b) => (a.at || 0) - (b.at || 0));

    const exams = { ...s.exams };
    for (const [k, e] of Object.entries(src.exams || {})) {
      const cur = exams[k];
      if (!cur || (e.startedAt || 0) > (cur.startedAt || 0)) { exams[k] = e; stats.exams++; }
    }

    const settings = { ...s.settings, ...(src.settings || {}) };
    return { ...s, progress, wrong, fav, notes, records: records.slice(-3000), exams, settings };
  });
  return stats;
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
