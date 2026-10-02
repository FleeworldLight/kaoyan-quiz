/**
 * validate-english.mjs — 英语一题库校验
 * 用法：node tools/validate-english.mjs
 */
import fs from "node:fs";
import path from "node:path";

const DIR = "public/data/english1";
const SEC_RANGES = { cloze: [1, 20], reading: [21, 40], newtype: [41, 45], translation: [46, 50], writing: [51, 52] };
const KEY_OK = new Set(["A", "B", "C", "D"]);
/* 源 markdown 本身就缺选项的题（非解析缺陷），单独记录为 NOTE */
const KNOWN_SOURCE_GAPS = new Set([
  "english1-2018-q30",   /* 源文件仅给出 A/B/C 三个选项 */
  "english1-2020-q39",   /* 源文件缺 [A]，只有 B/C/D */
  "english1-2023-q4",    /* 源文件为 `4.A.classify`，缺分隔符导致无法解析 */
  "english1-2023-q9",    /* 源文件为 `9. Aassigned`，选项标记残缺 */
  "english1-2023-q20",   /* 源文件末尾被截断（D(series 不完整） */
]);
let notes = 0;
const note = (m) => { notes++; console.log("  [NOTE] " + m); };

let errs = 0, warns = 0;
const err = (m) => { errs++; console.log("  [ERR ] " + m); };
const warn = (m) => { warns++; console.log("  [WARN] " + m); };

/* ---- manifest ---- */
const manifestPath = path.join(DIR, "_manifest.json");
if (!fs.existsSync(manifestPath)) { err("缺少 _manifest.json"); }
let manifest = null;
try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); console.log("manifest OK: papers=" + manifest.papers.length + " topics=" + manifest.topics.length); }
catch (e) { err("_manifest.json 无法解析: " + e.message); }

const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => /^\d{4}\.json$/.test(f)).sort() : [];
console.log("卷文件: " + files.join(", ") + "\n");

const globalIds = new Set();
const summary = [];

for (const f of files) {
  const year = Number(f.slice(0, 4));
  const p = path.join(DIR, f);
  let doc = null;
  try { doc = JSON.parse(fs.readFileSync(p, "utf8")); }
  catch (e) { err(f + " JSON.parse 失败: " + e.message); continue; }
  console.log("=== " + f);

  if (doc.id !== "english1-" + year) err("id 不符: " + doc.id);
  if (doc.subject !== "english1") err("subject 不符: " + doc.subject);
  if (!doc.source || !doc.source.name || !doc.source.url) err("缺少 source");
  if (!["high", "medium", "low"].includes(doc.quality)) err("quality 非法: " + doc.quality);
  if (![180].includes(doc.duration)) warn("duration=" + doc.duration);

  const all = [];
  let totalScore = 0;
  for (const sec of doc.sections) {
    const range = SEC_RANGES[sec.id];
    if (!range) { err("未知分节 id: " + sec.id); continue; }
    const nos = sec.questions.map((q) => q.no).sort((a, b) => a - b);
    /* 题号连续 */
    const expect = [];
    for (let n = range[0]; n <= range[1]; n++) expect.push(n);
    const missing = expect.filter((n) => !nos.includes(n));
    const extra = nos.filter((n) => n < range[0] || n > range[1]);
    if (missing.length) err(sec.id + " 题号缺失: " + missing.join(","));
    if (extra.length) err(sec.id + " 题号越界: " + extra.join(","));
    if (new Set(nos).size !== nos.length) err(sec.id + " 题号重复");
    for (const q of sec.questions) {
      totalScore += q.score || 0;
      if (globalIds.has(q.id)) err("id 重复: " + q.id);
      globalIds.add(q.id);
      if (q.id !== "english1-" + year + "-q" + q.no) err("id 格式不符: " + q.id);
      if (!Array.isArray(q.topics)) err(q.id + " topics 不是数组");
      if (!Array.isArray(q.images)) err(q.id + " images 不是数组");
      if (typeof q.material !== "string") err(q.id + " 缺少 material 字段");
      if (typeof q.materialTitle !== "string") warn(q.id + " 缺少 materialTitle");
      if (!q.stem || !q.stem.trim()) { if (sec.id === "writing" || sec.id === "translation") warn(q.id + " 题干预空（源文件未给该题文本，仅答案）"); else warn(q.id + " 题干预空"); }
      /* 新题型 41-45 的「选项」是材料里的 A-H 段落，题目本身不含选项，
         答案形如 "B"/"F"（2019/2020/2022 等），或带段落大意文本（2017/2018）。 */
      const isNewtype = sec.id === "newtype";
      if (isNewtype) {
        if (!q.answer || !q.answer.trim()) warn(q.id + "（新题型）缺答案");
        if (!q.material || !q.material.trim()) err(q.id + "（新题型）缺材料");
        if (q.options.length) err(q.id + "（新题型）不应有 options");
        continue;
      }
      if (q.type === "single") {
        if (!Array.isArray(q.options) || q.options.length !== 4) { const msg = q.id + " 选项不是 4 个（" + (q.options || []).length + "）"; if (KNOWN_SOURCE_GAPS.has(q.id)) note(msg + " —— 源 markdown 缺选项"); else err(msg); continue; }
        const keys = q.options.map((o) => o.key).join("");
        if (keys !== "ABCD") err(q.id + " 选项 key 顺序异常: " + keys);
        if (q.options.some((o) => !o.text || !o.text.trim())) err(q.id + " 存在空选项");
        if (q.answer && !KEY_OK.has(q.answer)) err(q.id + " answer 非法: " + JSON.stringify(q.answer));
      } else {
        if (Array.isArray(q.options) && q.options.length) err(q.id + " 非单选却有选项");
      }
      if (q.type === "essay" && q.options.length) err(q.id + " essay 不应有选项");
    }
    all.push(...sec.questions);
  }
  if (Math.abs(totalScore - (doc.totalScore || 0)) > 0.01) warn("totalScore=" + doc.totalScore + " 实际合计=" + totalScore);

  const single = all.filter((q) => q.type === "single");
  const withOpts = single.filter((q) => q.options.length === 4);
  const withAns = all.filter((q) => q.answer && String(q.answer).trim());
  const withMat = all.filter((q) => q.material && q.material.trim());
  const clozeRead = all.filter((q) => q.no <= 40);
  const clozeReadMat = clozeRead.filter((q) => q.material && q.material.trim());
  console.log("  题数=" + all.length + " 单选=" + single.length + " 主观=" + (all.length - single.length));
  console.log("  4 选项完整=" + withOpts.length + "/" + single.length + " (" + pct(withOpts.length, single.length) + ")");
  console.log("  有答案/范文=" + withAns.length + "/" + all.length + " (" + pct(withAns.length, all.length) + ")");
  console.log("  有材料=" + withMat.length + "/" + all.length + " (" + pct(withMat.length, all.length) + ")；完型+阅读材料=" + clozeReadMat.length + "/" + clozeRead.length + " (" + pct(clozeReadMat.length, clozeRead.length) + ")");
  const materials = new Set(all.filter((q) => q.material).map((q) => q.materialTitle + "\u0000" + q.material));
  console.log("  不同材料段数=" + materials.size);
  summary.push({ year, quality: doc.quality, total: all.length, single: single.length, optOk: withOpts.length, ans: withAns.length, mat: withMat.length });
}

function pct(a, b) { return b ? ((a / b) * 100).toFixed(0) + "%" : "-"; }

/* ---- manifest 与单卷一致性 ---- */
if (manifest) {
  console.log("\n=== manifest 一致性");
  const paperYears = new Set(manifest.papers.map((p) => p.year));
  for (const f of files) {
    const y = Number(f.slice(0, 4));
    if (!paperYears.has(y)) err("manifest 缺少 " + y);
  }
  for (const p of manifest.papers) {
    const p2 = path.join(DIR, p.file.replace(/^english1\//, ""));
    if (!fs.existsSync(p2)) { err("manifest 指向的文件不存在: " + p.file); continue; }
    const doc = JSON.parse(fs.readFileSync(p2, "utf8"));
    const all = doc.sections.flatMap((s) => s.questions);
    if (p.questionCount !== all.length) err(p.year + " questionCount=" + p.questionCount + " 实际=" + all.length);
    if (p.quality !== doc.quality) err(p.year + " quality 不一致");
  }
  const topicSum = manifest.topics.reduce((s, t) => s + t.count, 0);
  const tagged = [];
  for (const f of files) {
    const doc = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
    tagged.push(...doc.sections.flatMap((s) => s.questions).flatMap((q) => q.topics));
  }
  console.log("  topics 合计=" + topicSum + "，题目中实际标签数=" + tagged.length + (topicSum === tagged.length ? " ✔" : " ✘"));
  if (topicSum !== tagged.length) err("topics count 与题目标签不一致");
}

console.log("\n==== 结果: " + errs + " 个错误, " + warns + " 个警告, " + notes + " 条源文件缺陷记录 ====");
console.log(summary.map((s) => `${s.year}: quality=${s.quality} 题=${s.total} 单选=${s.single} 选项完整=${s.optOk} 有答案=${s.ans} 有材料=${s.mat}`).join("\n"));
process.exit(errs ? 1 : 0);


