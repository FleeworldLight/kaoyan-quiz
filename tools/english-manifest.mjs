/**
 * english-manifest.mjs — 英语一 _manifest.json 统一生成器
 *
 * 扫描 public/data/english1/<year>.json（已产出的全部年份），据此生成
 * public/data/english1/_manifest.json：subject 对象 + papers + topics + note。
 * 这样无论跑哪一个解析器（parse-english.mjs 产出 2017+，parse-english-old.mjs 产出 2010-2016），
 * manifest 都覆盖目录下实际存在的全部年份，不会互相覆盖。
 *
 * 用法（被其他脚本 import）：
 *   import { buildEnglishManifest } from "./english-manifest.mjs";
 *   buildEnglishManifest("public/data/english1", { extraNotes: [...] });
 */
import fs from "node:fs";
import path from "node:path";

export const TOPIC_NAMES = {
  "完型-逻辑关系": "完型 · 逻辑关系",
  "完型-词汇辨析": "完型 · 词汇辨析",
  "阅读-细节题": "阅读 · 细节题",
  "阅读-推断题": "阅读 · 推断题",
  "阅读-主旨题": "阅读 · 主旨题",
  "阅读-态度题": "阅读 · 态度题",
  "阅读-词义句意题": "阅读 · 词义句意题",
  "新题型-排序/匹配": "新题型 · 排序/匹配",
  "翻译-长难句": "翻译 · 长难句",
  "写作-应用文": "写作 · 应用文",
  "写作-图画作文": "写作 · 图画作文",
};

export const SUBJECT = {
  id: "english1",
  name: "英语一",
  fullName: "考研英语（一）",
  color: "#0ea5e9",
  icon: "EN",
  examDuration: 180,
  examTotalScore: 100,
};

export const SECTION_NAMES = {
  cloze: "Section I Use of English 完型填空",
  reading: "Section II Reading Comprehension Part A 阅读理解",
  newtype: "Section II Reading Comprehension Part B 新题型",
  translation: "Section III Translation 翻译",
  writing: "Section IV Writing 写作",
};

/* 起始年份：本库英语一只从 2010 年做起（更早年份未纳入） */
export const COVERAGE_FROM = 2010;
export const COVERAGE_TO = 2025;

export function buildEnglishManifest(outsDir, opts = {}) {
  const files = fs.existsSync(outsDir)
    ? fs.readdirSync(outsDir).filter((f) => /^\d{4}\.json$/.test(f)).sort()
    : [];
  const papers = [];
  const topicCount = new Map();
  let questionCount = 0, choiceCount = 0, answerCount = 0;

  for (const f of files) {
    const doc = JSON.parse(fs.readFileSync(path.join(outsDir, f), "utf8"));
    const year = doc.year || Number(f.slice(0, 4));
    const all = (doc.sections || []).flatMap((s) => s.questions || []);
    if (!all.length) continue;
    for (const q of all) for (const t of q.topics || []) topicCount.set(t, (topicCount.get(t) || 0) + 1);
    const single = all.filter((q) => q.type === "single");
    const blank = all.filter((q) => q.type === "blank");
    const essay = all.filter((q) => q.type === "essay");
    const answered = all.filter((q) => q.answer || q.explanation);
    const missing = all.filter((q) => !q.answer && !q.explanation).map((q) => q.no);
    questionCount += all.length;
    choiceCount += single.length;
    answerCount += answered.length;
    papers.push({
      id: doc.id || "english1-" + year,
      year,
      title: doc.title || year + " 年全国硕士研究生招生考试 英语（一）",
      file: "english1/" + f,
      questionCount: all.length,
      singleCount: single.length,
      blankCount: blank.length,
      essayCount: essay.length,
      /* 兼容旧字段名 */
      choiceCount: single.length,
      answerCount: answered.length,
      answerCoverage: Number((answered.length / all.length).toFixed(3)),
      missingAnswerNos: missing,
      totalScore: doc.totalScore || 0,
      duration: doc.duration || 180,
      quality: doc.quality || "medium",
      sections: (doc.sections || []).map((s) => ({ id: s.id, count: (s.questions || []).length })),
      source: (doc.source && doc.source.name) || "",
      sourceUrl: (doc.source && doc.source.url) || "",
    });
  }
  papers.sort((a, b) => a.year - b.year);

  const topics = [...topicCount.entries()]
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .map(([id, count]) => ({ id, name: TOPIC_NAMES[id] || id, count }));

  /* -------- note：覆盖范围 + 已知缺陷 -------- */
  const have = new Set(papers.map((p) => p.year));
  const missingYears = [];
  for (let y = COVERAGE_FROM; y <= COVERAGE_TO; y++) if (!have.has(y)) missingYears.push(y);
  const notes = [];
  notes.push(`覆盖 ${papers.length ? papers[0].year : "-"}–${papers.length ? papers[papers.length - 1].year : "-"} 共 ${papers.length} 卷 ` +
    `（目标区间 ${COVERAGE_FROM}–${COVERAGE_TO}）。` +
    (missingYears.length ? `缺失年份：${missingYears.join("、")}。` : "目标区间无缺卷。"));
  const lowQ = papers.filter((p) => p.quality === "low").map((p) => p.year);
  const medQ = papers.filter((p) => p.quality === "medium").map((p) => p.year);
  notes.push(`quality：high ${papers.filter((p) => p.quality === "high").length} 卷` +
    (medQ.length ? `，medium ${medQ.length} 卷（${medQ.join("、")}）` : "") +
    (lowQ.length ? `，low ${lowQ.length} 卷（${lowQ.join("、")}）` : "") + "。");
  const partial = papers.filter((p) => p.missingAnswerNos.length);
  if (partial.length) {
    notes.push("答案/范文缺口（该题在来源里确实没有答案，按纪律留空、未推断）：" +
      partial.map((p) => `${p.year} 第 ${p.missingAnswerNos.join(",")} 题`).join("；") + "。");
  }
  notes.push(`题目客观题（单选）${choiceCount} 题；答案/解析覆盖 ${answerCount}/${questionCount}（${((answerCount / Math.max(1, questionCount)) * 100).toFixed(0)}%）。`);
  for (const n of opts.extraNotes || []) notes.push(n);
  const note = notes.join("\n");

  const manifest = {
    subject: { ...SUBJECT, sections: Object.keys(SECTION_NAMES).map((id) => ({ id, name: SECTION_NAMES[id] })) },
    id: SUBJECT.id,
    name: SUBJECT.name,
    fullName: SUBJECT.fullName,
    color: SUBJECT.color,
    icon: SUBJECT.icon,
    examDuration: SUBJECT.examDuration,
    examTotalScore: SUBJECT.examTotalScore,
    sections: Object.keys(SECTION_NAMES).map((id) => ({ id, name: SECTION_NAMES[id] })),
    papers,
    topics,
    generatedAt: new Date().toISOString(),
    note,
  };
  fs.mkdirSync(outsDir, { recursive: true });
  fs.writeFileSync(path.join(outsDir, "_manifest.json"), JSON.stringify(manifest, null, 1), "utf8");
  return manifest;
}

export const isDirectRun = (p) => p && path.resolve(p).endsWith("english-manifest.mjs");
if (isDirectRun(process.argv[1])) {
  const m = buildEnglishManifest("public/data/english1");
  console.log("_manifest.json: " + m.papers.length + " 卷 / " + m.topics.length + " 知识点");
  console.log(m.note);
}
