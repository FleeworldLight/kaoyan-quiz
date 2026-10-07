import fs from "node:fs";
import path from "node:path";

const DIR = "<项目根目录>/public/data/cs408";
const errors = [];
const warns = [];
const stats = { files: 0, questions: 0, singles: 0, essays: 0, emptyStem: 0, emptyAnswer: 0, emptyExpl: 0, emptyOpt: 0, noTopic: 0 };
const seenIds = new Map();

function fail(m) { errors.push(m); }
function warn(m) { warns.push(m); }

const files = fs.readdirSync(DIR).filter(f => /^\d{4}\.json$/.test(f)).sort();
if (!files.length) fail("未找到任何 <year>.json");

let manifest = null;
try { manifest = JSON.parse(fs.readFileSync(path.join(DIR, "_manifest.json"), "utf8")); }
catch (e) { fail(`_manifest.json 解析失败: ${e.message}`); }

const years = [];
for (const f of files) {
  const fp = path.join(DIR, f);
  let p;
  try { p = JSON.parse(fs.readFileSync(fp, "utf8")); }
  catch (e) { fail(`${f}: JSON.parse 失败 -> ${e.message}`); continue; }
  stats.files++;
  const year = Number(f.replace(".json", ""));
  years.push(year);

  // 卷级字段
  for (const k of ["id", "subject", "year", "title", "quality", "source", "sections"]) {
    if (p[k] === undefined || p[k] === null || p[k] === "") fail(`${f}: 缺少字段 ${k}`);
  }
  if (p.id !== `cs408-${year}`) fail(`${f}: 卷 id 应为 cs408-${year}，实际 ${p.id}`);
  if (p.subject !== "cs408") fail(`${f}: subject 应为 cs408`);
  if (!p.source || !p.source.name || !p.source.url) fail(`${f}: source 必须包含 name 与 url`);
  if (!["high", "medium", "low"].includes(p.quality)) fail(`${f}: quality 非法 (${p.quality})`);
  if (!Array.isArray(p.sections) || p.sections.length === 0) fail(`${f}: sections 缺失`);

  const secs = {};
  for (const s of p.sections) {
    if (!s.id || !s.name || !Array.isArray(s.questions)) { fail(`${f}: section 结构非法`); continue; }
    if (secs[s.id]) fail(`${f}: section id 重复 ${s.id}`);
    secs[s.id] = s;
  }
  if (!secs.choice) fail(`${f}: 缺少 choice section`);
  if (!secs.essay) fail(`${f}: 缺少 essay section`);

  const checkRange = (sec, lo, hi, type, scoreEach) => {
    if (!sec) return;
    const nos = sec.questions.map(q => q.no);
    for (let n = lo; n <= hi; n++) if (!nos.includes(n)) fail(`${f}/${sec.id}: 题号 ${n} 缺失`);
    for (let i = 0; i < nos.length; i++) {
      if (i > 0 && nos[i] !== nos[i - 1] + 1) fail(`${f}/${sec.id}: 题号不连续 ${nos[i - 1]} -> ${nos[i]}`);
    }
    if (nos.length !== hi - lo + 1) fail(`${f}/${sec.id}: 题量应为 ${hi - lo + 1}，实际 ${nos.length}`);
    for (const q of sec.questions) {
      stats.questions++;
      if (q.type !== type) fail(`${f}/q${q.no}: type 应为 ${type}，实际 ${q.type}`);
      if (typeof q.id !== "string" || !q.id) fail(`${f}/q${q.no}: id 缺失`);
      if (seenIds.has(q.id)) fail(`${f}/q${q.no}: id 重复（已出现于 ${seenIds.get(q.id)}）`);
      else seenIds.set(q.id, `${f}/${q.no}`);
      if (q.id !== `cs408-${year}-q${q.no}`) fail(`${f}/q${q.no}: id 格式错误 -> ${q.id}`);
      if (typeof q.stem !== "string" || q.stem.trim() === "") { fail(`${f}/q${q.no}: stem 为空`); stats.emptyStem++; }
      if (!Array.isArray(q.topics)) fail(`${f}/q${q.no}: topics 必须是数组`);
      if (q.topics.length === 0) stats.noTopic++;
      if (!Array.isArray(q.images)) fail(`${f}/q${q.no}: images 必须是数组`);
      if (typeof q.score !== "number") fail(`${f}/q${q.no}: score 必须是数字`);
      if (scoreEach && q.score !== scoreEach) warn(`${f}/q${q.no}: score=${q.score}（预期 ${scoreEach}）`);
      if (typeof q.explanation !== "string") fail(`${f}/q${q.no}: explanation 必须是字符串`);
      if (!q.explanation || q.explanation.trim() === "") stats.emptyExpl++;

      if (type === "single") {
        stats.singles++;
        if (!Array.isArray(q.options) || q.options.length !== 4) { fail(`${f}/q${q.no}: single 必须有 4 个选项（实际 ${Array.isArray(q.options) ? q.options.length : "非数组"}）`); }
        else {
          const keys = q.options.map(o => o.key).join("");
          if (keys !== "ABCD") fail(`${f}/q${q.no}: 选项 key 必须为 A,B,C,D，实际 ${keys}`);
          for (const o of q.options) {
            if (typeof o.text !== "string") fail(`${f}/q${q.no}: 选项 ${o.key} text 非字符串`);
            else if (o.text.trim() === "") { warn(`${f}/q${q.no}: 选项 ${o.key} 文本为空`); }
          }
          if (q.options.some(o => !o.text || o.text.trim() === "")) stats.emptyOpt++;
        }
        if (!/^[A-D]$/.test(q.answer || "")) { fail(`${f}/q${q.no}: single 的 answer 必须为 A-D 之一，实际 "${q.answer}"`); }
        if (q.answer && q.options && q.options.length === 4 && !q.options.some(o => o.key === q.answer)) fail(`${f}/q${q.no}: answer ${q.answer} 不在选项中`);
      } else {
        stats.essays++;
        if (q.options !== undefined && (!Array.isArray(q.options) || q.options.length !== 0)) warn(`${f}/q${q.no}: essay 的 options 应为空数组`);
        if (!q.answer || String(q.answer).trim() === "") { fail(`${f}/q${q.no}: essay 的 answer（参考答案）为空`); stats.emptyAnswer++; }
      }
      if (!q.answer || String(q.answer).trim() === "") { if (type !== "essay") { fail(`${f}/q${q.no}: answer 为空`); stats.emptyAnswer++; } }
    }
  };
  checkRange(secs.choice, 1, 40, "single", 2);
  checkRange(secs.essay, 41, 47, "essay", null);
}

// manifest 一致性
if (manifest && manifest.subject) {
  const s = manifest.subject;
  if (s.id !== "cs408") fail("_manifest.json: subject.id 应为 cs408");
  if (!Array.isArray(s.papers)) fail("_manifest.json: subject.papers 必须是数组");
  else {
    for (const y of years) {
      const rec = s.papers.find(p => p.year === y);
      if (!rec) { fail(`_manifest.json: 缺少 ${y} 年的 paper 记录`); continue; }
      const fp = path.join(DIR, `${y}.json`);
      if (!fs.existsSync(path.join(DIR, "..", rec.file.replace(/^cs408\//, "cs408/")))) {
        // rec.file 形如 cs408/2016.json，相对 public/data
        const alt = path.join(DIR, "..", rec.file);
        if (!fs.existsSync(alt)) fail(`_manifest.json: ${y} 的 file=${rec.file} 不存在`);
      }
      const p = JSON.parse(fs.readFileSync(fp, "utf8"));
      const qn = p.sections.reduce((a, x) => a + x.questions.length, 0);
      if (rec.questionCount !== qn) fail(`_manifest.json: ${y} questionCount=${rec.questionCount} 与文件 ${qn} 不一致`);
      if (rec.choiceCount !== 40) fail(`_manifest.json: ${y} choiceCount=${rec.choiceCount} 应为 40`);
      if (!rec.source || !rec.sourceUrl) fail(`_manifest.json: ${y} 缺少 source/sourceUrl`);
      if (!["high","medium","low"].includes(rec.quality)) fail(`_manifest.json: ${y} quality 非法`);
    }
  }
} else if (manifest) fail("_manifest.json: 缺少 subject 对象");

const lines = [];
lines.push("=== CS408 题库校验报告 ===");
lines.push(`扫描文件: ${stats.files} 份卷子 (${years[0]}–${years[years.length-1]})`);
lines.push(`题目总数: ${stats.questions}（单选 ${stats.singles} / 综合 ${stats.essays}）`);
lines.push(`空 stem: ${stats.emptyStem} | 空 answer: ${stats.emptyAnswer} | 空 explanation: ${stats.emptyExpl}`);
lines.push(`含空选项文本的单选题: ${stats.emptyOpt} | 无 topics 的题: ${stats.noTopic}`);
lines.push("");
lines.push(`ERRORS (${errors.length}):`);
for (const e of errors) lines.push("  [E] " + e);
lines.push("");
lines.push(`WARNINGS (${warns.length}):`);
for (const w of warns) lines.push("  [W] " + w);
lines.push("");
lines.push(errors.length === 0 ? "RESULT: PASS（无错误）" : `RESULT: FAIL（${errors.length} 个错误）`);
const out = lines.join("\n");
fs.writeFileSync("<项目根目录>/tools/cache/validate-report.txt", out, "utf8");
console.log(out);
process.exit(errors.length ? 1 : 0);
