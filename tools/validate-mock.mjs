#!/usr/bin/env node
/**
 * validate-mock.mjs —— 模拟卷数据区（public/data/mock/）校验
 *
 * 校验项：
 *  1. 目录下每个 *.json 可 JSON.parse（_manifest.json 除外）
 *  2. 单卷必填字段：id / subject / subjectName / kind / title / duration / totalScore / quality / source / sections
 *  3. kind === "mock"，quality 取值合法
 *  4. source 必须同时有 name 与 url（模拟卷硬性要求）
 *  5. 题目 id 全库唯一（跨所有 mock 卷 + 与 public/data 下已有真题卷比对）
 *  6. 题目 id 必须以 mock- 开头
 *  7. single 必须恰好 4 个选项且 answer 为单个 A-D 字母（或空串）
 *  8. multiple 选项 ≥ 2 且 answer 为升序去重的 A-D 字母（或空串）
 *  9. blank/essay 必须 options 为空
 * 10. _manifest.json：groups/papers 结构、paper.file 存在且路径正确、
 *     questionCount/choiceCount 与实际文件一致
 * 11. 图片引用存在性（public/data/mock/images/…）
 *
 * 用法: node tools/validate-mock.mjs [--verbose]
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA = path.join(ROOT, "public", "data");
const MOCK = path.join(DATA, "mock");
const VERBOSE = process.argv.includes("--verbose");

const VALID_SUBJECTS = ["math1", "english1", "politics", "cs408"];
const VALID_QUALITY = ["high", "medium", "low", "unverified"];
const VALID_TYPES = ["single", "multiple", "blank", "essay"];

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    err(`JSON 解析失败 ${path.relative(ROOT, p)}: ${e.message}`);
    return null;
  }
}

if (!fs.existsSync(MOCK)) {
  console.error(`找不到 ${path.relative(ROOT, MOCK)}`);
  process.exit(1);
}

const paperFiles = fs
  .readdirSync(MOCK)
  .filter((f) => f.endsWith(".json") && f !== "_manifest.json")
  .sort();

// ---------------------------------------------------------------- 收集已有真题 id
const realIds = new Set();
for (const sub of ["math1", "english1", "politics", "cs408"]) {
  const dir = path.join(DATA, sub);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const j = readJson(path.join(dir, f));
    if (!j) continue;
    for (const s of j.sections || []) for (const q of s.questions || []) if (q.id) realIds.add(q.id);
  }
}

// ---------------------------------------------------------------- 单卷校验
const allIds = new Map(); // id -> file
const paperInfo = new Map(); // filename -> {ids, qn, ans, choice, json}
let totalQuestions = 0;
let totalAnswers = 0;
const bySubject = {};

for (const f of paperFiles) {
  const p = path.join(MOCK, f);
  const j = readJson(p);
  if (!j) continue;
  const where = `mock/${f}`;

  for (const k of ["id", "subject", "subjectName", "kind", "title", "duration", "totalScore", "quality", "source", "sections"]) {
    if (j[k] === undefined || j[k] === null || j[k] === "") err(`${where}: 缺少必填字段 ${k}`);
  }
  if (j.kind !== "mock") err(`${where}: kind 必须是 "mock"，实际 ${JSON.stringify(j.kind)}`);
  if (!VALID_SUBJECTS.includes(j.subject)) err(`${where}: subject 非法: ${JSON.stringify(j.subject)}`);
  if (!VALID_QUALITY.includes(j.quality)) err(`${where}: quality 非法: ${JSON.stringify(j.quality)}`);
  if (j.quality !== "unverified") warn(`${where}: quality=${j.quality}（模拟卷默认应为 unverified，需人工确认后才可升级）`);
  if (!j.source || typeof j.source !== "object") {
    err(`${where}: source 必须是对象`);
  } else {
    if (!j.source.name) err(`${where}: source.name 缺失`);
    if (!j.source.url) err(`${where}: source.url 缺失`);
  }
  for (const k of ["mockName", "publisher", "year", "paperNo"]) {
    if (j[k] === undefined) warn(`${where}: 建议补充 mock 字段 ${k}`);
  }

  let qn = 0;
  let ans = 0;
  let choice = 0;
  const secIds = new Set();
  for (const s of j.sections || []) {
    if (!s.id) err(`${where}: section 缺 id`);
    if (secIds.has(s.id)) err(`${where}: section id 重复 ${s.id}`);
    secIds.add(s.id);
    if (!Array.isArray(s.questions) || !s.questions.length) {
      warn(`${where}: section ${s.id} 没有题目`);
      continue;
    }
    const nos = new Set();
    for (const q of s.questions) {
      qn++;
      if (!q.id) {
        err(`${where}: 题目缺 id（section ${s.id} 第 ${qn} 题）`);
        continue;
      }
      if (!q.id.startsWith("mock-")) err(`${where}: 题目 id 未以 mock- 开头: ${q.id}`);
      if (allIds.has(q.id)) err(`题目 id 冲突: ${q.id} 同时出现在 ${allIds.get(q.id)} 和 ${where}`);
      else allIds.set(q.id, where);
      if (realIds.has(q.id)) err(`题目 id 与真题库冲突: ${q.id}`);

      if (typeof q.no !== "number") err(`${q.id}: no 必须是数字`);
      else if (nos.has(q.no)) err(`${where}: 题号重复 ${q.no}`);
      else nos.add(q.no);
      if (!VALID_TYPES.includes(q.type)) err(`${q.id}: type 非法 ${JSON.stringify(q.type)}`);
      if (!q.stem || !String(q.stem).trim()) err(`${q.id}: stem 为空`);
      if (!Array.isArray(q.options)) err(`${q.id}: options 必须是数组`);
      if (!Array.isArray(q.topics)) warn(`${q.id}: topics 不是数组`);
      if (q.images !== undefined && !Array.isArray(q.images)) err(`${q.id}: images 必须是数组`);

      const opts = Array.isArray(q.options) ? q.options : [];
      const keys = opts.map((o) => o.key);
      if (q.type === "single" || q.type === "multiple") {
        choice++;
        if (q.type === "single") {
          if (opts.length !== 4) err(`${q.id}: single 题应有 4 个选项，实际 ${opts.length}`);
        } else if (opts.length < 2) {
          err(`${q.id}: multiple 题选项少于 2 个（实际 ${opts.length}）`);
        }
        if (new Set(keys).size !== keys.length) err(`${q.id}: 选项 key 重复`);
        for (const o of opts) {
          if (!o.key || typeof o.text !== "string") err(`${q.id}: 选项结构不合法 ${JSON.stringify(o).slice(0, 60)}`);
        }
        const a = q.answer;
        if (a !== "" && a !== undefined && a !== null) {
          if (!/^[A-D]+$/.test(a)) err(`${q.id}: answer 含非 A-D 字符: ${JSON.stringify(a)}`);
          else if (new Set(a.split("")).size !== a.length) err(`${q.id}: answer 有重复字母: ${JSON.stringify(a)}`);
          else if (a !== [...a].sort().join("")) err(`${q.id}: answer 未按字母升序: ${JSON.stringify(a)}`);
          else if (q.type === "single" && a.length !== 1) err(`${q.id}: single 题 answer 长度应为 1: ${JSON.stringify(a)}`);
          else if (q.type === "multiple" && a.length < 2) err(`${q.id}: multiple 题 answer 应至少 2 个字母: ${JSON.stringify(a)}`);
          else {
            for (const c of a) if (!keys.includes(c)) err(`${q.id}: answer 字母 ${c} 在选项中不存在`);
          }
        }
      } else if (opts.length) {
        err(`${q.id}: ${q.type} 题 options 必须为空数组，实际 ${opts.length}`);
      }

      if (typeof q.answer === "string" && q.answer.length) ans++;
      if (Array.isArray(q.images)) {
        for (const img of q.images) {
          if (!fs.existsSync(path.join(MOCK, "images", img))) err(`${q.id}: 图片不存在 mock/images/${img}`);
        }
      }
    }
  }
  if (!qn) err(`${where}: 整卷没有题目`);
  totalQuestions += qn;
  totalAnswers += ans;

  bySubject[j.subject] ??= { papers: 0, questions: 0, answers: 0, choices: 0 };
  bySubject[j.subject].papers++;
  bySubject[j.subject].questions += qn;
  bySubject[j.subject].answers += ans;
  bySubject[j.subject].choices += choice;

  paperInfo.set(f, { qn, ans, choice, json: j });
  if (VERBOSE) console.log(`  ${where}: ${qn} 题（选择 ${choice}），有答案 ${ans}`);
}

// ---------------------------------------------------------------- manifest 校验
const mfPath = path.join(MOCK, "_manifest.json");
if (!fs.existsSync(mfPath)) {
  err("缺少 _manifest.json");
} else {
  const mf = readJson(mfPath);
  if (mf) {
    if (mf.version !== 1) warn(`_manifest.json: version=${mf.version}`);
    if (!mf.generatedAt) err("_manifest.json: 缺 generatedAt");
    if (!mf.note) warn("_manifest.json: 缺 note");
    if (!Array.isArray(mf.groups)) err("_manifest.json: groups 必须是数组");
    const listed = new Set();
    let mPapers = 0;
    let mQuestions = 0;
    for (const g of mf.groups || []) {
      if (!g.id || !g.subject || !g.publisher || !g.name) err(`_manifest group 缺字段: ${JSON.stringify(g).slice(0, 80)}`);
      if (!VALID_SUBJECTS.includes(g.subject)) err(`_manifest group ${g.id}: subject 非法 ${g.subject}`);
      if (!g.source || !g.source.name || !g.source.url) err(`_manifest group ${g.id}: source 缺 name/url`);
      if (!Array.isArray(g.papers) || !g.papers.length) err(`_manifest group ${g.id}: papers 为空`);
      for (const pp of g.papers || []) {
        mPapers++;
        if (!pp.id || !pp.title || !pp.file) err(`_manifest group ${g.id}: paper 缺 id/title/file`);
        const rel = String(pp.file || "").replace(/^\/+/, "");
        if (!rel.startsWith("mock/")) err(`_manifest ${g.id}: paper.file 必须以 mock/ 开头（相对 public/data/）: ${pp.file}`);
        const abs = path.join(DATA, rel);
        if (!fs.existsSync(abs)) {
          err(`_manifest ${g.id}: paper.file 指向的文件不存在: ${pp.file}`);
          continue;
        }
        listed.add(path.basename(abs));
        const inf = paperInfo.get(path.basename(abs));
        if (inf) {
          mQuestions += pp.questionCount ?? 0;
          if (pp.questionCount !== inf.qn) err(`_manifest ${pp.id}: questionCount=${pp.questionCount} 与实际 ${inf.qn} 不一致`);
          if (pp.choiceCount !== undefined && pp.choiceCount !== inf.choice)
            err(`_manifest ${pp.id}: choiceCount=${pp.choiceCount} 与实际 ${inf.choice} 不一致`);
          if (pp.duration !== undefined && inf.json.duration !== undefined && pp.duration !== inf.json.duration)
            err(`_manifest ${pp.id}: duration 与卷内不一致`);
          if (pp.quality !== inf.json.quality) err(`_manifest ${pp.id}: quality 与卷内不一致`);
          if (inf.ans === 0) warn(`_manifest ${pp.id}: 该卷 0 题有答案`);
        }
      }
    }
    for (const f of paperFiles) if (!listed.has(f)) warn(`mock/${f} 未登记进 _manifest.json`);
    if (mPapers !== paperFiles.length) warn(`_manifest 登记 ${mPapers} 套，目录下实际 ${paperFiles.length} 套`);
    if (mQuestions !== totalQuestions) warn(`_manifest questionCount 合计 ${mQuestions}，实际 ${totalQuestions}`);
    for (const f of mf.failed || []) {
      if (!f.name || !f.reason) err(`_manifest.failed 条目缺 name/reason: ${JSON.stringify(f).slice(0, 80)}`);
      if (!f.source && !f.url) warn(`_manifest.failed 条目建议写明来源: ${JSON.stringify(f).slice(0, 60)}`);
    }
  }
}

// ---------------------------------------------------------------- 汇总
console.log(`\n========== validate-mock 报告 ==========`);
console.log(
  `目录: public/data/mock/    卷数: ${paperFiles.length}    题目总数: ${totalQuestions}    ` +
    `有答案: ${totalAnswers} (${totalQuestions ? ((totalAnswers / totalQuestions) * 100).toFixed(1) : 0}%)`,
);
for (const [s, v] of Object.entries(bySubject)) {
  console.log(
    `  ${s.padEnd(9)} 卷 ${String(v.papers).padStart(2)}   题 ${String(v.questions).padStart(4)}   ` +
      `选择 ${String(v.choices).padStart(4)}   有答案 ${String(v.answers).padStart(4)}`,
  );
}
console.log(`唯一题目 id: ${allIds.size}（与真题库 id 冲突 ${[...allIds.keys()].filter((x) => realIds.has(x)).length}）`);

if (warnings.length) {
  console.log(`\n--- 警告 ${warnings.length} 条 ---`);
  for (const w of warnings.slice(0, VERBOSE ? warnings.length : 40)) console.log("  ! " + w);
  if (!VERBOSE && warnings.length > 40) console.log(`  … 其余 ${warnings.length - 40} 条用 --verbose 查看`);
}
console.log(`\n--- 错误 ${errors.length} 条 ---`);
for (const e of errors.slice(0, VERBOSE ? errors.length : 80)) console.log("  x " + e);
if (!VERBOSE && errors.length > 80) console.log(`  … 其余 ${errors.length - 80} 条用 --verbose 查看`);

console.log(errors.length ? `\n❌ 校验未通过（${errors.length} 个错误）` : `\n✅ 校验通过`);
process.exit(errors.length ? 1 : 0);
