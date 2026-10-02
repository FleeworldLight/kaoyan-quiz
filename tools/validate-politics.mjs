#!/usr/bin/env node
/**
 * tools/validate-politics.mjs
 * 校验 public/data/politics/*.json 是否符合 tools/SCHEMA.md 规范，并做一致性检查。
 * 用法: node tools/validate-politics.mjs
 * 退出码: 0 = 全部通过（可能有 warning）；1 = 存在 error
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(__dirname, "../public/data/politics");

const errors = [];
const warnings = [];
const err = (f, m) => errors.push(`[${f}] ${m}`);
const warn = (f, m) => warnings.push(`[${f}] ${m}`);

const files = fs.readdirSync(DIR).filter(f => f.endsWith(".json") && f !== "_topics.json").sort();
if (!files.length) { console.error("没有找到任何卷子 JSON：" + DIR); process.exit(1); }

const allIds = new Map();       // id -> file
const TYPES = new Set(["single", "multiple", "blank", "essay"]);
let totalQ = 0;
const perYear = [];

/* ---------- _topics.json （v2：chapters[] + subjects[]） ---------- */
let topicIds = new Set();
const tp = path.join(DIR, "_topics.json");
if (!fs.existsSync(tp)) {
  err("_topics.json", "缺失");
} else {
  try {
    const t = JSON.parse(fs.readFileSync(tp, "utf8"));
    if (typeof t.version !== "number") err("_topics.json", "缺少 version 字段");
    if (!Array.isArray(t.chapters) || !t.chapters.length) err("_topics.json", "chapters 为空");
    for (const c of t.chapters || []) {
      if (!c.id) { err("_topics.json", "chapter 缺少 id"); continue; }
      if (!/^[^-]+-[^-]+$/.test(c.id)) warn("_topics.json", `chapter id 不是「学科-章」两段式: ${c.id}`);
      if (topicIds.has(c.id)) err("_topics.json", `topic id 重复: ${c.id}`);
      topicIds.add(c.id);
      if (!Number.isInteger(c.count) || c.count <= 0) err("_topics.json", `chapter ${c.id} 的 count 必须 > 0，实际 ${c.count}`);
    }
    if (!Array.isArray(t.subjects)) err("_topics.json", "subjects 不是数组");
    for (const s2 of t.subjects || []) {
      if (!s2.id || !s2.name) err("_topics.json", `科目缺少 id/name: ${JSON.stringify(s2).slice(0, 60)}`);
      for (const c of s2.chapters || []) {
        if (!c.id) err("_topics.json", `章节缺少 id (科目 ${s2.id})`);
        for (const topic of c.topics || []) {
          if (!topic.id) err("_topics.json", `考点缺少 id (章节 ${c.id})`);
          if (topicIds.has(topic.id)) err("_topics.json", `topic id 重复: ${topic.id}`);
          topicIds.add(topic.id);
          if (!Number.isInteger(topic.count) || topic.count <= 0) err("_topics.json", `考点 ${topic.id} 的 count 必须 > 0（规范要求剔除 0 题章节）`);
        }
      }
    }
  } catch (e) { err("_topics.json", "JSON.parse 失败: " + e.message); }
}

/* ---------- 逐年卷子 ---------- */
for (const f of files) {
  const full = path.join(DIR, f);
  let paper;
  try { paper = JSON.parse(fs.readFileSync(full, "utf8")); }
  catch (e) { err(f, "JSON.parse 失败: " + e.message); continue; }

  const expectId = `politics-${paper.year}`;
  if (paper.id !== expectId) err(f, `id 应为 ${expectId}，实际 ${paper.id}`);
  if (paper.subject !== "politics") err(f, `subject 应为 politics，实际 ${paper.subject}`);
  if (!paper.title) err(f, "缺少 title");
  if (!paper.source || !paper.source.name || !paper.source.url) err(f, "缺少 source.name / source.url");
  else if (!/^https?:\/\//.test(paper.source.url)) err(f, `source.url 不是合法 URL: ${paper.source.url}`);
  if (!Number.isFinite(paper.totalScore)) err(f, "缺少 totalScore");
  if (!["high", "medium", "low"].includes(paper.quality)) err(f, `quality 非法: ${paper.quality}`);
  if (!Array.isArray(paper.sections) || !paper.sections.length) { err(f, "sections 为空"); continue; }

  const seenNo = new Set();
  const seenId = new Set();
  let counts = { single: 0, multiple: 0, essay: 0, blank: 0 };
  let scoreSum = 0;

  for (const sec of paper.sections) {
    if (!sec.id || !sec.name) err(f, "section 缺少 id/name");
    if (!Array.isArray(sec.questions)) { err(f, `section ${sec.id} 缺少 questions 数组`); continue; }
    for (const q of sec.questions) {
      totalQ++;
      const tag = `${paper.id}/${q.id ?? "?"}`;
      // id
      if (!q.id) err(f, `${tag} 缺少 id`);
      else {
        const expect = `${paper.id}-q${q.no}`;
        if (q.id !== expect) err(f, `id 格式应为 ${expect}，实际 ${q.id}`);
        if (seenId.has(q.id)) err(f, `卷内 id 重复: ${q.id}`);
        seenId.add(q.id);
        if (allIds.has(q.id)) err(f, `全库 id 重复: ${q.id} (另一处在 ${allIds.get(q.id)})`);
        else allIds.set(q.id, f);
      }
      // no
      if (!Number.isInteger(q.no) || q.no < 1) err(f, `${tag} no 非法: ${q.no}`);
      else {
        if (seenNo.has(q.no)) err(f, `卷内题号重复: ${q.no}`);
        seenNo.add(q.no);
      }
      // type
      if (!TYPES.has(q.type)) err(f, `${tag} type 非法: ${q.type}`);
      // stem
      if (typeof q.stem !== "string" || !q.stem.trim()) err(f, `${tag} stem 为空`);
      else if (q.stem.trim().length < 6) warn(f, `${tag} stem 过短（${q.stem.trim().length} 字）`);
      // options
      if (!Array.isArray(q.options)) err(f, `${tag} options 不是数组`);
      else if (q.type === "single" || q.type === "multiple") {
        if (q.options.length < 2) err(f, `${tag} ${q.type} 题至少需要 2 个选项，实际 ${q.options.length}`);
        const keys = q.options.map(o => o.key);
        const expectKeys = "ABCD".slice(0, q.options.length);
        if (q.options.length === 4 && keys.join("") !== expectKeys) err(f, `${tag} 选项顺序应为 A/B/C/D，实际 ${keys.join("")}`);
        for (const o of q.options) {
          if (!/^[A-D]$/.test(o.key || "")) err(f, `${tag} 选项 key 非法: ${o.key}`);
          if (typeof o.text !== "string" || !o.text.trim()) err(f, `${tag} 选项 ${o.key} 文本为空`);
        }
        if (new Set(keys).size !== keys.length) err(f, `${tag} 选项 key 重复`);
        if (/^[A-D][\.、．]\s*\S/.test(q.stem.trim())) warn(f, `${tag} stem 疑似混入了选项文本`);
      } else if (q.options.length) warn(f, `${tag} ${q.type} 题不应有 options，实际 ${q.options.length} 个`);
      // answer
      const a = q.answer;
      if (typeof a !== "string") err(f, `${tag} answer 不是字符串`);
      else if (q.type === "single") {
        if (!/^[A-D]$/.test(a)) err(f, `${tag} 单选 answer 非法: "${a}"`);
        else if (q.options.length && !q.options.some(o => o.key === a)) err(f, `${tag} 单选 answer ${a} 不在选项中`);
      } else if (q.type === "multiple") {
        if (!/^[A-D]{2,4}$/.test(a)) err(f, `${tag} 多选 answer 非法（需 2~4 个字母）: "${a}"`);
        else if (a !== a.split("").sort().join("")) err(f, `${tag} 多选 answer 未按字母升序: "${a}"`);
        else if (new Set(a).size !== a.length) err(f, `${tag} 多选 answer 有重复字母: "${a}"`);
        else for (const L of a) if (q.options.length && !q.options.some(o => o.key === L)) err(f, `${tag} 多选 answer ${L} 不在选项中`);
      } else if (!a.trim()) warn(f, `${tag} ${q.type} 题 answer 为空`);
      // score / topics / images
      if (typeof q.score !== "number" || q.score < 0) err(f, `${tag} score 非法: ${q.score}`);
      scoreSum += q.score || 0;
      if (!Array.isArray(q.topics)) err(f, `${tag} topics 不是数组`);
      else for (const t of q.topics) if (topicIds.size && !topicIds.has(t)) err(f, `${tag} topics 引用了不存在的考点 id: ${t}`);
      if (!Array.isArray(q.images)) err(f, `${tag} images 不是数组`);
      if (typeof q.explanation !== "string") err(f, `${tag} explanation 不是字符串`);
      if (!Array.isArray(q.chapterTopics)) err(f, `${tag} chapterTopics 不是数组`);
      else if (q.chapterTopics.length && q.type !== "essay") {
        if (!["chapter", "subject-only"].includes(q.chapterConfidence)) err(f, `${tag} chapterTopics 非空但 chapterConfidence 非法: ${q.chapterConfidence}`);
      }
      if (q.subjectHint !== null && q.subjectHint !== undefined && !["马原","毛中特","史纲","思修","新思想","时政"].includes(q.subjectHint)) err(f, `${tag} subjectHint 非法: ${q.subjectHint}`);
      if (q.answerDisputed === true && (typeof q.answerNote !== "string" || !q.answerNote.trim())) err(f, `${tag} 标了 answerDisputed 但 answerNote 为空`);
      if (typeof q.answerNote === "string" && q.answerNote.trim() && q.answerDisputed !== true) warn(f, `${tag} 有 answerNote 但未标 answerDisputed`);
      if (!Array.isArray(q.chapterTopics) && !Array.isArray(q.topics)) err(f, `${tag} 缺少 topics/chapterTopics`);
      if (q.type && counts[q.type] !== undefined) counts[q.type]++;
    }
  }
  // 题号连续
  const nos = [...seenNo].sort((a, b) => a - b);
  const missing = [];
  for (let i = 1; i <= nos[nos.length - 1]; i++) if (!seenNo.has(i)) missing.push(i);
  if (missing.length) {
    // 2010 无材料分析题（34-38 缺失）是可接受的
    const onlyEssay = missing.every(n => n >= 34 && n <= 38);
    if (onlyEssay) warn(f, `缺少材料分析题号 ${missing.join(",")}（该卷无材料分析题）`);
    else err(f, `题号不连续，缺失: ${missing.join(",")}`);
  }
  if (nos[nos.length - 1] > 38) err(f, `题号超过 38: ${nos[nos.length - 1]}`);

  if (counts.single !== 16) warn(f, `单选 ${counts.single} 题（标准 16 题）`);
  if (counts.multiple !== 17) warn(f, `多选 ${counts.multiple} 题（标准 17 题）`);
  if (counts.essay && counts.essay !== 5) warn(f, `材料分析 ${counts.essay} 题（标准 5 题）`);
  const chTagged = paper.sections.filter(x => x.id !== "essay").flatMap(x => x.questions).filter(q => (q.chapterTopics || []).length).length;
  const disputed = paper.sections.flatMap(x => x.questions).filter(q => q.answerDisputed).length;
  perYear.push({ year: paper.year, quality: paper.quality, single: counts.single, multiple: counts.multiple, essay: counts.essay, total: counts.single + counts.multiple + counts.essay, score: scoreSum, conflicts: (paper.verification || {}).conflicts ?? 0, chTagged, disputed });
}

/* ---------- 反向一致性：_topics.json 声明的 topic 必须至少被一道题引用 ---------- */
const declared = new Map();
if (fs.existsSync(tp)) {
  const t = JSON.parse(fs.readFileSync(tp, "utf8"));
  for (const c of t.chapters || []) declared.set(c.id, c.count);
  for (const s2 of t.subjects || []) for (const c of s2.chapters || []) for (const topic of c.topics || []) declared.set(topic.id, topic.count);
}
const usedCount = new Map();
for (const [id, file] of allIds) { /* 占位，真实统计在下方 */ }
for (const f of files) {
  const p = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
  for (const sec of p.sections) for (const q of sec.questions) {
    for (const t of q.topics || []) usedCount.set(t, (usedCount.get(t) || 0) + 1);
    for (const t of q.chapterTopics || []) usedCount.set(t, (usedCount.get(t) || 0) + 1);
  }
}
for (const [id] of declared) if (!usedCount.has(id)) err("_topics.json", `声明的 topic ${id} 在题目中从未被引用（应剔除）`);
for (const [id] of usedCount) if (!declared.has(id)) err("题目", `题目引用了 _topics.json 中不存在的 topic: ${id}`);

/* ---------- 输出 ---------- */
const w = (s) => process.stdout.write(s);
w("\n=== 考研政治题库校验 ===\n");
w(`目录: ${DIR}\n`);
w(`卷子: ${files.length} 份\n\n`);
w("年份  单选  多选  材料  合计  分值  答案冲突  章标  存疑  quality\n");
for (const r of perYear) w(`${String(r.year).padEnd(5)} ${String(r.single).padEnd(5)} ${String(r.multiple).padEnd(5)} ${String(r.essay).padEnd(5)} ${String(r.total).padEnd(5)} ${String(r.score).padEnd(5)} ${String(r.conflicts).padEnd(9)} ${String(r.chTagged).padEnd(5)} ${String(r.disputed).padEnd(5)} ${r.quality}\n`);
w(`\n题目总数: ${totalQ}   全库唯一 id: ${allIds.size}   知识点: ${topicIds.size}\n`);

w(`\n--- ERROR ${errors.length} 条 ---\n`);
for (const e of errors) w("  ✗ " + e + "\n");
w(`\n--- WARNING ${warnings.length} 条 ---\n`);
for (const x of warnings) w("  ! " + x + "\n");
w(`\n结果: ${errors.length === 0 ? "✅ 通过" : "❌ 失败"}\n`);
process.exit(errors.length === 0 ? 0 : 1);
