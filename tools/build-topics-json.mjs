/**
 * 生成 public/data/politics/_topics.json —— 只保留 count > 0 的 topic。
 * 包含两套体系：
 *   chapters[] —— 28 个「学科-章」+ 6 个「学科-综合」兜底，用于章节练习（count>0 才输出）
 *   subjects[].chapters[].topics[] —— 682 个细粒度考点（来自本地 Obsidian 笔记），count>0 才输出
 */
import fs from "node:fs";
import path from "node:path";
const ROOT = "G:/期末及简历和别的项目/考研资料/kaoyan-quiz";
const DIR = path.join(ROOT, "public/data/politics");

// 章名映射（与 tag-chapters.mjs 的 id 保持一致）
const CH_NAMES = {
  "马原-导论": "导论（马克思主义总论）",
  "马原-唯物论": "辩证唯物论（物质观·意识观）",
  "马原-辩证法": "唯物辩证法（联系发展·三大规律）",
  "马原-认识论": "认识论（实践与认识·真理）",
  "马原-唯物史观": "唯物史观（社会存在与社会意识·社会形态）",
  "马原-政治经济学": "马克思主义政治经济学（商品经济·资本·垄断）",
  "马原-科学社会主义": "科学社会主义（社会主义·共产主义）",
  "毛中特-新民主主义革命": "毛泽东思想与新民主主义革命理论",
  "毛中特-社会主义改造与建设": "社会主义改造与社会主义建设道路初步探索",
  "毛中特-中国特色社会主义理论体系": "中国特色社会主义理论体系（邓小平理论·三个代表·科学发展观）",
  "史纲-近代史": "旧民主主义革命时期（近代史）",
  "史纲-党史": "新民主主义革命时期（党史）",
  "史纲-现代史": "新中国时期（现代史·建设与改革开放）",
  "思修-人生观价值观": "思想篇：人生观与价值观",
  "思修-道德": "道德篇：道德观与道德实践",
  "思修-法治": "法治篇：法治素养与法律基础",
  "新思想-导论": "导论：新思想的历史地位与世界观方法论",
  "新思想-基本问题": "基本问题：新时代总目标总任务与领导力量",
  "新思想-总体布局": "布局安排：经济·政治·文化·社会·生态",
  "新思想-内外条件": "内外条件：安全·国防·一国两制·外交",
  "新思想-党建": "全面从严治党",
  "时政-当年时事": "时政：当年国内外重大时事",
};
const SUBJ_NAMES = { 马原: "马克思主义基本原理", 毛中特: "毛泽东思想和中国特色社会主义理论体系概论", 史纲: "中国近现代史纲要", 思修: "思想道德与法治", 新思想: "习近平新时代中国特色社会主义思想概论", 时政: "形势与政策（时政）" };

const stats = { chapter: 0, subjectOnly: 0, none: 0, total: 0, tagged: 0 };
const counts = new Map();       // topicId -> count
const subjectCounts = new Map();// subject -> 选择题数
let granularTagged = 0;

for (const f of fs.readdirSync(DIR).filter(x => /^\d{4}\.json$/.test(x)).sort()) {
  const paper = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
  for (const sec of paper.sections) for (const q of sec.questions) {
    for (const t of q.topics || []) counts.set(t, (counts.get(t) || 0) + 1);
    if ((q.topics || []).length) granularTagged++;
    if (sec.id === "essay") continue;
    stats.total++;
    if (q.subjectHint) subjectCounts.set(q.subjectHint, (subjectCounts.get(q.subjectHint) || 0) + 1);
    const ct = (q.chapterTopics || [])[0];
    if (ct) { counts.set(ct, (counts.get(ct) || 0) + 1); stats.tagged++; if (q.chapterConfidence === "chapter") stats.chapter++; else stats.subjectOnly++; }
    else stats.none++;
  }
}

// --- 章级体系 ---
const chapters = [];
for (const [id, name] of Object.entries(CH_NAMES)) {
  const c = counts.get(id) || 0;
  if (c > 0) chapters.push({ id, subject: id.split("-")[0], name, count: c, kind: "chapter" });
}
for (const [subj, c] of [...subjectCounts.entries()].sort()) {
  const id = `${subj}-综合`;
  const n = counts.get(id) || 0;
  if (n > 0) chapters.push({ id, subject: subj, name: `${SUBJ_NAMES[subj] || subj}·综合`, count: n, kind: "subject-fallback" });
}
chapters.sort((a, b) => (a.subject === b.subject ? b.count - a.count : a.subject.localeCompare(b.subject)));

// --- 细粒度考点体系 ---
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/cache/topics-raw.json"), "utf8"));
const subjects = raw.subjects.map(s => {
  const chs = s.chapters.map(c => {
    const topics = c.topics.map(t => ({ id: t.id, name: t.name, kind: t.kind || "考点", count: counts.get(t.id) || 0 })).filter(t => t.count > 0);
    return { id: c.id, name: c.name, part: c.part || null, topics };
  }).filter(c => c.topics.length > 0);
  return { id: s.id, name: s.name, chapters: chs };
}).filter(s => s.chapters.length > 0);

const doc = {
  version: 2,
  generatedAt: new Date().toISOString(),
  note: "chapters[] 为章节练习用的「学科-章」索引（含少量「学科-综合」兜底，kind=subject-fallback）；subjects[] 为从本地考点笔记抽取的细粒度考点。两者 id 均为全局唯一，且只保留 count>0 的项。",
  tagging: {
    method: "关键词规则打分（章级阈值 6 / 科目取最高分章）",
    choiceQuestions: stats.total,
    chapterLevel: stats.chapter,
    subjectFallback: stats.subjectOnly,
    untagged: stats.none,
    chapterPrecision: +(stats.chapter / stats.total * 100).toFixed(1),
    coverage: +((stats.tagged) / stats.total * 100).toFixed(1),
    granularTaggedQuestions: granularTagged,
  },
  stats: {
    totalChapters: chapters.filter(c => c.kind === "chapter").length,
    totalFallbackBuckets: chapters.filter(c => c.kind === "subject-fallback").length,
    totalTopics: subjects.reduce((a, s) => a + s.chapters.reduce((b, c) => b + c.topics.length, 0), 0),
    totalQuestions: stats.total + 70,
    choiceQuestions: stats.total,
  },
  chapters,
  subjects,
};
fs.writeFileSync(path.join(DIR, "_topics.json"), JSON.stringify(doc, null, 2), "utf8");
console.log("_topics.json v2 写入完成");
console.log("章级:", doc.stats.totalChapters, " 兜底桶:", doc.stats.totalFallbackBuckets, " 细粒度考点(>0):", doc.stats.totalTopics);
console.log("打标:", JSON.stringify(doc.tagging));
console.log("\n章节列表（id / count）：");
for (const c of chapters) console.log(`  ${String(c.count).padStart(3)}  ${c.id}`);
