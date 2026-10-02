/**
 * 汇总各科题库，生成 public/data/index.json
 * 用法: node tools/build-index.mjs
 *
 * 数据来源优先级：
 *   papers  —— 直接扫 public/data/<subject>/*.json（最权威），缺失时回退到 _manifest.json
 *   topics  —— 优先 _manifest.json.topics / politics 的 _topics.json.chapters，
 *              否则扫题目里的 chapterTopics / topics 字段统计
 */
import fs from "node:fs";
import path from "node:path";

const DATA = "public/data";

const SUBJECTS = [
  { id: "math1", name: "数学一", fullName: "考研数学（一）", color: "#4f46e5", icon: "∑", examDuration: 180, examTotalScore: 150,
    sections: [{ id: "choice", name: "选择题" }, { id: "blank", name: "填空题" }, { id: "essay", name: "解答题" }] },
  { id: "english1", name: "英语一", fullName: "考研英语（一）", color: "#0ea5e9", icon: "A", examDuration: 180, examTotalScore: 100,
    sections: [{ id: "cloze", name: "完型填空" }, { id: "reading", name: "阅读理解" }, { id: "newtype", name: "新题型" }, { id: "translation", name: "翻译" }, { id: "writing", name: "写作" }] },
  { id: "politics", name: "政治", fullName: "考研思想政治理论", color: "#dc2626", icon: "★", examDuration: 180, examTotalScore: 100,
    sections: [{ id: "single", name: "单项选择题" }, { id: "multiple", name: "多项选择题" }, { id: "analysis", name: "材料分析题" }] },
  { id: "cs408", name: "408", fullName: "计算机学科专业基础综合（408）", color: "#059669", icon: "①", examDuration: 180, examTotalScore: 150,
    sections: [{ id: "choice", name: "单项选择题" }, { id: "essay", name: "综合应用题" }] },
];

const readJSON = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

/** 知识点分组 id → 中文名 */
const GROUP_LABELS = {
  math1: { 高数: "高等数学", 线代: "线性代数", 概率: "概率论与数理统计" },
  cs408: { ds: "数据结构", co: "计算机组成原理", os: "操作系统", cn: "计算机网络" },
  politics: { 马原: "马克思主义基本原理", 毛中特: "毛泽东思想和中国特色社会主义理论体系概论", 史纲: "中国近现代史纲要", 思修: "思想道德与法治", 新思想: "习近平新时代中国特色社会主义思想", 时政: "形势与政策" },
};
function groupNameOf(subjectId, group) {
  return (GROUP_LABELS[subjectId] && GROUP_LABELS[subjectId][group]) || group;
}

/** _manifest.json 既可能是 { subject: {...} } 也可能是 subject 对象本身 */
function manifestSubject(id) {
  const m = readJSON(path.join(DATA, id, "_manifest.json"));
  if (!m) return null;
  if (m.subject && typeof m.subject === "object" && Array.isArray(m.subject.papers)) return m.subject;
  if (Array.isArray(m.papers)) return m;
  return null;
}

function topicNameMap(id) {
  const map = new Map();
  const t = readJSON(path.join(DATA, id, "_topics.json"));
  const arr = t?.chapters || [];
  for (const c of arr) if (c && c.id) map.set(c.id, { name: c.name || c.id, kind: c.kind || "chapter", count: c.count });
  return map;
}

function scanSubject(id) {
  const dir = path.join(DATA, id);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
  const papers = [];
  const topicCount = new Map();
  let questionCount = 0, choiceCount = 0, answerCount = 0;
  for (const f of files) {
    const doc = readJSON(path.join(dir, f));
    if (!doc || !doc.sections) continue;
    let qn = 0, cn = 0, an = 0;
    for (const sec of doc.sections) {
      for (const q of sec.questions || []) {
        qn++;
        if ((q.type === "single" || q.type === "multiple") && (q.options || []).length > 0) cn++;
        if (q.answer || q.explanation) an++;
        const tags = (q.chapterTopics && q.chapterTopics.length ? q.chapterTopics : q.topics) || [];
        for (const t of tags) topicCount.set(t, (topicCount.get(t) || 0) + 1);
      }
    }
    if (!qn) continue;
    questionCount += qn; choiceCount += cn; answerCount += an;
    papers.push({
      id: doc.id || `${id}-${doc.year}`,
      year: doc.year,
      title: doc.title || `${doc.year} 年真题`,
      file: `${id}/${f}`,
      questionCount: qn,
      choiceCount: cn,
      answerCount: an,
      totalScore: doc.totalScore || 0,
      duration: doc.duration || 180,
      quality: doc.quality || "medium",
      source: typeof doc.source === "string" ? doc.source : doc.source?.name || "",
      sourceUrl: typeof doc.source === "object" ? doc.source?.url || "" : "",
    });
  }
  papers.sort((a, b) => (b.year || 0) - (a.year || 0));
  return { papers, topicCount, questionCount, choiceCount, answerCount };
}

const out = { version: 1, generatedAt: new Date().toISOString(), subjects: [] };
const report = [];

for (const meta of SUBJECTS) {
  const scan = scanSubject(meta.id);
  const man = manifestSubject(meta.id);
  if ((!scan || !scan.papers.length) && !man) { report.push(`${meta.id}: 无数据，跳过`); continue; }

  const papers = scan && scan.papers.length ? scan.papers : man.papers;
  if (!papers.length) { report.push(`${meta.id}: 无试卷，跳过`); continue; }

  // 知识点：manifest 优先，其次 _topics.json，最后按题目统计
  let topics = [];
  const nm = topicNameMap(meta.id);
  if (man && Array.isArray(man.topics) && man.topics.length) {
    topics = man.topics.map((t) => ({ id: t.id, name: t.name || t.id, group: t.group || (t.id.includes("-") ? t.id.split("-")[0] : "其他"), count: t.count || 0, kind: t.kind || "chapter" }));
  } else if (nm.size) {
    topics = [...nm.entries()].map(([tid, v]) => {
      const i = tid.indexOf("-");
      return { id: tid, group: i > 0 ? tid.slice(0, i) : "其他", name: v.name, count: scan?.topicCount.get(tid) || v.count || 0, kind: v.kind };
    }).filter((t) => t.count > 0);
  } else if (scan) {
    topics = [...scan.topicCount.entries()].map(([tid, count]) => {
      const i = tid.indexOf("-");
      return { id: tid, group: i > 0 ? tid.slice(0, i) : "其他", name: i > 0 ? tid.slice(i + 1) : tid, count, kind: "chapter" };
    });
  }
  for (const t of topics) t.groupName = groupNameOf(meta.id, t.group);
  topics.sort((a, b) => (a.group === b.group ? b.count - a.count : a.group.localeCompare(b.group, "zh")));

  const questionCount = scan?.questionCount || papers.reduce((a, p) => a + (p.questionCount || 0), 0);
  const choiceCount = scan?.choiceCount || papers.reduce((a, p) => a + (p.choiceCount || 0), 0);
  const answerCount = scan?.answerCount || papers.reduce((a, p) => a + (p.answerCount || 0), 0);

  out.subjects.push({
    ...meta,
    paperCount: papers.length,
    questionCount, choiceCount, answerCount,
    answerCoverage: questionCount ? Math.round((answerCount / questionCount) * 100) : 0,
    topicCount: topics.length,
    papers, topics,
  });
  report.push(`${meta.id.padEnd(9)} ${String(papers.length).padStart(3)} 套 / ${String(questionCount).padStart(4)} 题 / 客观题 ${String(choiceCount).padStart(4)} / 知识点 ${String(topics.length).padStart(3)} / 答案覆盖 ${questionCount ? Math.round((answerCount / questionCount) * 100) : 0}%`);
}

/* ---------------- 模拟卷：并入 index.mockGroups，并挂到各科 subjects[].mocks ---------------- */
const mockManifest = readJSON(path.join(DATA, "mock", "_manifest.json"));
const mockGroups = [];
if (mockManifest && Array.isArray(mockManifest.groups)) {
  for (const g of mockManifest.groups) {
    const papers = [];
    let qn = 0, cn = 0, inferred = 0;
    for (const p of g.papers || []) {
      const rel = String(p.file || "").replace(/^\.\//, "");
      const doc = rel ? readJSON(path.join(DATA, rel)) : null;
      // 有的来源把「答案由题库生成」写在卷级 sourceNote 里（answerInferred=true），
      // 这种卷的答案是推算值，必须在界面上显式提示。
      const paperInferred = /answerInferred\s*=\s*true/i.test(doc?.sourceNote || "") ||
        /答案.{0,8}(由来源|自动生成)/.test(doc?.sourceNote || "");
      let pq = 0, pc = 0, pi = 0;
      for (const sec of doc?.sections || []) {
        for (const q of sec.questions || []) {
          pq++;
          if ((q.type === "single" || q.type === "multiple") && (q.options || []).length > 0) pc++;
          if (q.answerInferred || paperInferred) pi++;
        }
      }
      qn += pq; cn += pc; inferred += pi;
      papers.push({
        ...p,
        file: rel,
        questionCount: pq || p.questionCount || 0,
        choiceCount: pc || p.choiceCount || 0,
        inferredCount: pi,
        inferredRatio: pq ? pi / pq : 0,
        duration: doc?.duration || p.duration || 180,
        quality: p.quality || doc?.quality || "unverified",
        kind: "mock",
        paperKind: doc?.paperKind || p.paperKind || "questionBank",
      });
    }
    if (!papers.length) continue;
    mockGroups.push({
      ...g, papers, questionCount: qn, choiceCount: cn,
      inferredCount: inferred,
      inferredRatio: qn ? inferred / qn : 0,
    });
  }
}
out.mockGroups = mockGroups;
out.mockNote = mockManifest?.note || "";
out.mockFailed = mockManifest?.failed || [];
for (const sub of out.subjects) {
  sub.mocks = mockGroups.filter((g) => g.subject === sub.id).flatMap((g) =>
    g.papers.map((p) => ({ ...p, mockGroup: g.id, publisher: g.publisher, mockName: g.name }))
  );
}
if (mockGroups.length) {
  report.push(`mock      ${String(mockGroups.length).padStart(3)} 个系列 / ${String(mockGroups.reduce((a, g) => a + g.papers.length, 0)).padStart(3)} 套 / ${mockGroups.reduce((a, g) => a + g.questionCount, 0)} 题`);
}

fs.mkdirSync(DATA, { recursive: true });
fs.writeFileSync(path.join(DATA, "index.json"), JSON.stringify(out), "utf8");
console.log("=== index.json 生成完成 ===");
console.log(report.join("\n"));
console.log(`\n科目 ${out.subjects.length} 个，总题量 ${out.subjects.reduce((a, s) => a + s.questionCount, 0)} 题`);
