const BASE = (import.meta.env.BASE_URL || "./").replace(/\/$/, "") + "/data/";

const cache = new Map();

async function getJSON(rel) {
  if (cache.has(rel)) return cache.get(rel);
  const p = fetch(BASE + rel).then((r) => {
    if (!r.ok) throw new Error(`加载失败 ${rel} (HTTP ${r.status})`);
    return r.json();
  });
  cache.set(rel, p);
  try {
    return await p;
  } catch (e) {
    cache.delete(rel);
    throw e;
  }
}

let indexPromise = null;
export function loadIndex(force) {
  if (force) indexPromise = null;
  if (!indexPromise) indexPromise = getJSON("index.json");
  return indexPromise;
}

export async function loadSubject(id) {
  const idx = await loadIndex();
  return idx.subjects.find((s) => s.id === id) || null;
}

export async function loadPaper(file) {
  return getJSON(file);
}

/** 把一份卷子摊平成题目数组，附带试卷上下文 */
export function flatten(paper) {
  const out = [];
  for (const sec of paper.sections || []) {
    for (const q of sec.questions || []) {
      out.push({
        ...q,
        subject: paper.subject,
        subjectName: paper.subjectName,
        paperId: paper.id,
        paperTitle: paper.title,
        year: paper.year,
        sectionId: sec.id,
        sectionName: sec.name,
        file: paper.file || `${paper.subject}/${paper.year}.json`,
        quality: paper.quality,
        source: paper.source,
      });
    }
  }
  return out;
}

/** 加载某科目全部题目（按需缓存） */
const subjectQuestions = new Map();
export async function allQuestions(subjectId) {
  if (subjectQuestions.has(subjectId)) return subjectQuestions.get(subjectId);
  const p = (async () => {
    const sub = await loadSubject(subjectId);
    if (!sub) return [];
    const papers = await Promise.all(sub.papers.map((p) => loadPaper(p.file).catch(() => null)));
    const out = [];
    for (const paper of papers) {
      if (!paper) continue;
      out.push(...flatten(paper));
    }
    return out;
  })();
  subjectQuestions.set(subjectId, p);
  return p;
}

export function invalidateSubject(id) {
  subjectQuestions.delete(id);
}

/* ------------------------------ 组卷 ------------------------------ */

function shuffleArr(a, rnd) {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * config:
 *  { mode:'paper', subject, year }
 *  { mode:'chapter', subject, topic, count, onlyChoice }
 *  { mode:'random', mix:{math1:10,english1:10,...}, onlyChoice, seed }
 *  { mode:'wrong', subject }
 *  { mode:'fav', subject }
 */
export async function buildQueue(config) {
  const { mode } = config;
  if (mode === "paper") {
    const sub = await loadSubject(config.subject);
    const meta = sub.papers.find((p) => String(p.year) === String(config.year));
    if (!meta) throw new Error("未找到该年份试卷");
    const paper = await loadPaper(meta.file);
    paper.file = meta.file;
    const qs = flatten(paper);
    return {
      title: paper.title, subtitle: `${qs.length} 题 · ${paper.duration || 180} 分钟`,
      questions: qs, duration: paper.duration || 180, totalScore: paper.totalScore || 0,
      source: paper.source, quality: paper.quality,
      exam: !config.practice,   // 默认按模考跑；加 practice=1 变为随时看答案的练习模式
    };
  }
  if (mode === "chapter") {
    const all = await allQuestions(config.subject);
    let pool = config.topic === "__all__" ? all.filter((q) => (q.topics || []).length > 0) : all.filter((q) => (q.topics || []).includes(config.topic));
    if (config.onlyChoice !== false) {
      const choice = pool.filter((q) => q.type === "single" || q.type === "multiple");
      if (choice.length >= 5) pool = choice;
    }
    const rnd = mulberry32(Number(config.seed) || Date.now() % 100000);
    const picked = shuffleArr(pool, rnd).slice(0, Number(config.count) || 20);
    return { title: `章节练习 · ${config.topic}`, subtitle: `${picked.length} 题`, questions: picked, exam: false };
  }
  if (mode === "random") {
    const mix = config.mix || { [config.subject]: Number(config.count) || 20 };
    const rnd = mulberry32(Number(config.seed) || Date.now() % 100000);
    const picked = [];
    for (const [sid, n] of Object.entries(mix)) {
      if (!n) continue;
      let all = await allQuestions(sid);
      if (config.onlyChoice !== false) {
        const choice = all.filter((q) => q.type === "single" || q.type === "multiple");
        if (choice.length) all = choice;
      }
      picked.push(...shuffleArr(all, rnd).slice(0, Number(n)));
    }
    return { title: "随机组卷", subtitle: `${picked.length} 题`, questions: shuffleArr(picked, rnd), exam: false };
  }
  if (mode === "wrong" || mode === "fav") {
    const { getState } = await import("./store.js");
    const s = getState();
    const map = mode === "wrong" ? s.wrong : s.fav;
    const list = Object.entries(map)
      .filter(([, v]) => !config.subject || v.subject === config.subject)
      .map(([qid, v]) => ({ qid, ...v }));
    const byFile = new Map();
    for (const it of list) {
      const loc = it.loc;
      if (!loc) continue;
      if (!byFile.has(loc.f)) byFile.set(loc.f, []);
      byFile.get(loc.f).push(it.qid);
    }
    const qs = [];
    for (const [file, ids] of byFile) {
      const paper = await loadPaper(file).catch(() => null);
      if (!paper) continue;
      paper.file = file;
      const flat = flatten(paper);
      const idSet = new Set(ids);
      qs.push(...flat.filter((q) => idSet.has(q.id)));
    }
    return {
      title: mode === "wrong" ? "错题重做" : "收藏夹练习",
      subtitle: `${qs.length} 题`,
      questions: qs,
      exam: false,
    };
  }
  throw new Error("未知的练习模式：" + mode);
}

export function buildRunUrl(cfg) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(cfg)) {
    if (v === undefined || v === null || v === "") continue;
    p.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  return `/run?${p.toString()}`;
}

export function parseRunConfig(search) {
  const p = new URLSearchParams(search);
  const cfg = {};
  for (const [k, v] of p.entries()) {
    if (k === "mix") { try { cfg.mix = JSON.parse(v); } catch { cfg.mix = {}; } }
    else if (["count", "seed", "year"].includes(k)) cfg[k] = Number(v);
    else if (k === "onlyChoice") cfg[k] = v !== "false";
    else cfg[k] = v;
  }
  return cfg;
}
