const BASE = (import.meta.env.BASE_URL || "./").replace(/\/$/, "") + "/data/";

const cache = new Map();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 取 JSON，失败自动重试。
 *
 * 为什么要重试：站点在 GitHub Pages 上，国内（尤其手机流量）访问 github.io 经常
 * 出现 net::ERR_CONNECTION_RESET —— 是间歇性的，同一个请求重试往往就成功了。
 * 以前一次失败就让整个应用停在「题库加载失败」，体验很差。
 * 指数退避重试 3 次（0.35s / 0.9s），配合 Service Worker 的缓存基本能兜住。
 */
async function fetchJSONOnce(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("加载失败 " + url + " (HTTP " + r.status + ")");
  return r.json();
}

async function getJSON(rel) {
  if (cache.has(rel)) return cache.get(rel);
  const p = (async () => {
    const url = BASE + rel;
    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await fetchJSONOnce(url);
      } catch (e) {
        lastErr = e;
        // HTTP 404 这类确定性错误不必重试
        if (/HTTP 4\d\d/.test(e.message)) break;
        if (attempt < 3) await sleep(attempt === 1 ? 350 : 900);
      }
    }
    throw lastErr;
  })();
  cache.set(rel, p);
  try { return await p; } catch (e) { cache.delete(rel); throw e; }
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
        kind: paper.kind || "real",
        quality: paper.quality,
        source: paper.source,
        sectionId: sec.id,
        sectionName: sec.name,
        file: paper.file || paper.subject + "/" + paper.year + ".json",
      });
    }
  }
  return out;
}

const subjectQuestions = new Map();
export async function allQuestions(subjectId) {
  if (subjectQuestions.has(subjectId)) return subjectQuestions.get(subjectId);
  const p = (async () => {
    const sub = await loadSubject(subjectId);
    if (!sub) return [];
    const papers = await Promise.all(sub.papers.map((x) => loadPaper(x.file).catch(() => null)));
    const out = [];
    for (const paper of papers) { if (!paper) continue; out.push(...flatten(paper)); }
    return out;
  })();
  subjectQuestions.set(subjectId, p);
  return p;
}
/** 只加载严格质量的题目（用于「严选」过滤） */
export async function qualityQuestions(subjectId, minQuality = "high") {
  const sub = await loadSubject(subjectId);
  if (!sub) return [];
  const ok = new Set(["high"]);
  const papers = sub.papers.filter((x) => ok.has(x.quality))
    .concat((sub.mocks || []).filter((x) => ok.has(x.quality)));
  const out = [];
  for (const meta of papers) {
    const paper = await loadPaper(meta.file).catch(() => null);
    if (paper) { paper.file = meta.file; out.push(...flatten(paper)); }
  }
  return out;
}
/** 加载模拟卷题目 */
const mockQuestions = new Map();
export async function allMockQuestions(subjectId) {
  const key = subjectId || "__all__";
  if (mockQuestions.has(key)) return mockQuestions.get(key);
  const p = (async () => {
    const idx = await loadIndex();
    const groups = (idx.mockGroups || []).filter((g) => !subjectId || g.subject === subjectId);
    const out = [];
    for (const g of groups) {
      for (const meta of g.papers) {
        const paper = await loadPaper(meta.file).catch(() => null);
        if (!paper) continue;
        paper.file = meta.file;
        paper.kind = "mock";
        const inferred = meta.inferredRatio > 0.5;
        out.push(...flatten(paper).map((q) => ({ ...q, mockName: g.name, publisher: g.publisher, mockGroup: g.id, answerInferred: inferred || !!q.answerInferred })));
      }
    }
    return out;
  })();
  mockQuestions.set(key, p);
  return p;
}
export function invalidateSubject(id) {
  subjectQuestions.delete(id);
  mockQuestions.clear();
}

/* ------------------------------ 随机 ------------------------------ */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffleArr(a, rnd) {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ------------------------------ 组卷 ------------------------------ */
/**
 * config:
 *  { mode:'paper', subject, year, practice? }
 *  { mode:'mock', file }
 *  { mode:'chapter', subject, topic, count, onlyChoice }
 *  { mode:'random', mix:{math1:10,...}, onlyChoice, seed }
 *  { mode:'custom', buckets:[{subject,topic,type,count,source}], seed }   智能组卷
 *  { mode:'wrong'|'fav', subject? }
 */
export async function buildQueue(config) {
  const { mode } = config;
  const seed = Number(config.seed) || (Date.now() % 1000000);
  const rnd = mulberry32(seed);

  if (mode === "paper") {
    const sub = await loadSubject(config.subject);
    const meta = sub.papers.find((p) => String(p.year) === String(config.year));
    if (!meta) throw new Error("未找到该年份试卷");
    const paper = await loadPaper(meta.file);
    paper.file = meta.file;
    const qs = flatten(paper);
    return {
      title: paper.title,
      subtitle: qs.length + " 题 · " + (paper.duration || 180) + " 分钟" + (config.practice ? " · 练习模式" : " · 模考"),
      questions: qs, duration: paper.duration || 180, totalScore: paper.totalScore || 0,
      source: paper.source, quality: paper.quality,
      exam: !config.practice,
    };
  }

  if (mode === "mock") {
    const idx = await loadIndex();
    let meta = null, group = null;
    for (const g of idx.mockGroups || []) {
      const hit = g.papers.find((p) => p.file === config.file || p.id === config.file);
      if (hit) { meta = hit; group = g; break; }
    }
    if (!meta) throw new Error("未找到该模拟卷");
    const paper = await loadPaper(meta.file);
    paper.file = meta.file;
    paper.kind = "mock";
    const inferred = (meta.inferredRatio || 0) > 0.5;
    const qs = flatten(paper).map((q) => ({ ...q, mockName: group.name, publisher: group.publisher, mockGroup: group.id, answerInferred: inferred || !!q.answerInferred }));
    return {
      title: (group.publisher ? group.publisher + " · " : "") + meta.title,
      subtitle: qs.length + " 题 · 模拟卷" + (config.practice ? " · 练习模式" : ""),
      questions: qs, duration: paper.duration || 180, totalScore: paper.totalScore || 0,
      source: paper.source || group.source, quality: meta.quality || paper.quality,
      exam: !config.practice,
    };
  }

  if (mode === "chapter") {
    const all = await allQuestions(config.subject);
    let pool = config.topic === "__all__"
      ? all.filter((q) => (q.topics || []).length > 0)
      : all.filter((q) => (q.topics || []).includes(config.topic));
    if (config.onlyChoice !== false) {
      const choice = pool.filter((q) => q.type === "single" || q.type === "multiple");
      if (choice.length >= 5) pool = choice;
    }
    const picked = shuffleArr(pool, rnd).slice(0, Number(config.count) || 20);
    return { title: "章节练习 · " + config.topic, subtitle: picked.length + " 题", questions: picked, exam: false };
  }

  if (mode === "random") {
    const mix = config.mix || { [config.subject]: Number(config.count) || 20 };
    const picked = [];
    for (const [sid, n] of Object.entries(mix)) {
      if (!n) continue;
      let all = await allQuestions(sid);
      if (config.onlyChoice !== false) {
        const choice = all.filter((q) => q.type === "single" || q.type === "multiple");
        if (choice.length) all = choice;
      }
      if (config.excludeAnswered) all = all.filter((q) => !MOCK_MARK(q));
      picked.push(...shuffleArr(all, rnd).slice(0, Number(n)));
    }
    return { title: "随机组卷", subtitle: picked.length + " 题", questions: shuffleArr(picked, rnd), exam: false };
  }

  if (mode === "custom") {
    const buckets = config.buckets || [];
    const picked = [];
    const missing = [];
    for (const b of buckets) {
      if (!b.count) continue;
      let pool = await allQuestions(b.subject);
      if (b.source === "mock") pool = await allMockQuestions(b.subject);
      if (b.topic && b.topic !== "__all__") pool = pool.filter((q) => (q.topics || []).includes(b.topic));
      if (b.type && b.type !== "any") pool = pool.filter((q) => q.type === b.type);
      else if (config.onlyChoice !== false) {
        const choice = pool.filter((q) => q.type === "single" || q.type === "multiple");
        if (choice.length) pool = choice;
      }
      const take = shuffleArr(pool, rnd).slice(0, Number(b.count));
      if (take.length < Number(b.count)) missing.push({ subject: b.subject, topic: b.topic, want: b.count, got: take.length });
      picked.push(...take);
    }
    return {
      title: "智能组卷", subtitle: picked.length + " 题", questions: shuffleArr(picked, rnd),
      exam: false, missing,
    };
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
      if (!loc?.f) continue;
      if (!byFile.has(loc.f)) byFile.set(loc.f, []);
      byFile.get(loc.f).push(it.qid);
    }
    const qs = [];
    for (const [file, ids] of byFile) {
      const paper = await loadPaper(file).catch(() => null);
      if (!paper) continue;
      paper.file = file;
      const idSet = new Set(ids);
      qs.push(...flatten(paper).filter((q) => idSet.has(q.id)));
    }
    const ordered = config.order === "random" ? shuffleArr(qs, rnd) : qs;
    return {
      title: mode === "wrong" ? "错题复测" : "收藏本练习",
      subtitle: ordered.length + " 题", questions: ordered, exam: false,
    };
  }

  throw new Error("未知的练习模式：" + mode);
}
function MOCK_MARK() { return false; }

export function buildRunUrl(cfg) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(cfg)) {
    if (v === undefined || v === null || v === "") continue;
    p.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  return "/practice?" + p.toString();
}
export function parseRunConfig(search) {
  const p = new URLSearchParams(search);
  const cfg = {};
  for (const [k, v] of p.entries()) {
    if (k === "mix" || k === "buckets") { try { cfg[k] = JSON.parse(v); } catch { cfg[k] = k === "mix" ? {} : []; } }
    else if (["count", "seed", "year"].includes(k)) cfg[k] = Number(v);
    else if (k === "onlyChoice" || k === "practice" || k === "excludeAnswered") cfg[k] = v !== "false";
    else cfg[k] = v;
  }
  return cfg;
}
