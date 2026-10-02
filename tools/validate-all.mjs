/**
 * 全库校验：遍历 public/data/<subject>/*.json，检查数据结构是否满足 SCHEMA.md。
 * 用法: node tools/validate-all.mjs
 */
import fs from "node:fs";
import path from "node:path";

const DATA = "public/data";
const TYPES = new Set(["single", "multiple", "blank", "essay"]);
const problems = [];
const warn = [];
let totalQ = 0;

function err(f, msg) { problems.push(`[${f}] ${msg}`); }
function warnA(f, msg) { warn.push(`[${f}] ${msg}`); }
function readJSON(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } }

/**
 * 题目 images 里引用的文件必须真实存在于 public/data/<subject>/images/ 下。
 * 详见 SCHEMA.md：images 是「相对 public/data/<subject>/images/ 的文件名数组」。
 */
let imageRefs = 0;
const imageSeen = new Set();
function checkImages(rel, qid, sid, images) {
  if (!images || !images.length) return;
  if (!Array.isArray(images)) return; // 上面已报错
  for (const name of images) {
    if (typeof name !== "string" || !name.trim()) { err(rel, `${qid} images 里有空文件名`); continue; }
    if (/[\\/]/.test(name) || name.includes("..")) { err(rel, `${qid} images 里应写文件名而不是路径: ${name}`); continue; }
    imageRefs++;
    imageSeen.add(`${sid}/${name}`);
    const p = path.join(DATA, sid, "images", name);
    if (!fs.existsSync(p)) err(rel, `${qid} 引用的图片不存在: ${sid}/images/${name}`);
    else if (fs.statSync(p).size === 0) err(rel, `${qid} 引用的图片是空文件: ${sid}/images/${name}`);
  }
}

const index = JSON.parse(fs.readFileSync(path.join(DATA, "index.json"), "utf8"));
const subjectIds = index.subjects.map((s) => s.id);

console.log("=== 全库校验 ===");
console.log(`科目: ${subjectIds.join(", ")}\n`);

for (const sid of subjectIds) {
  const dir = path.join(DATA, sid);
  if (!fs.existsSync(dir)) { err(sid, "目录不存在"); continue; }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
  const ids = new Set();
  let subQ = 0, subChoice = 0, subAns = 0;
  const rows = [];

  for (const f of files) {
    const rel = `${sid}/${f}`;
    let doc;
    try { doc = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); }
    catch (e) { err(rel, `JSON 解析失败: ${e.message}`); continue; }

    if (!doc.id) err(rel, "缺 id");
    if (doc.subject && doc.subject !== sid) err(rel, `subject=${doc.subject} 与目录 ${sid} 不符`);
    if (!doc.source) warnA(rel, "缺 source");
    if (!doc.sections || !doc.sections.length) { err(rel, "缺 sections"); continue; }

    let qn = 0, cn = 0, an = 0;
    for (const sec of doc.sections) {
      if (!sec.id) err(rel, "section 缺 id");
      if (!sec.questions || !sec.questions.length) warnA(rel, `section ${sec.id} 没有题目`);
      for (const q of sec.questions || []) {
        qn++;
        const qid = q.id || `${rel}#${sec.id}-${q.no}`;
        if (!q.id) err(rel, `题 ${q.no} 缺 id`);
        else if (ids.has(q.id)) err(rel, `题目 id 重复: ${q.id}`);
        else ids.add(q.id);

        if (!TYPES.has(q.type)) err(rel, `${qid} type 非法: ${q.type}`);
        const stem = String(q.stem || "").replace(/\s/g, "");
        if (stem.length < 4) err(rel, `${qid} 题干过短或为空`);
        if (typeof q.answer !== "string") err(rel, `${qid} answer 必须是字符串`);

        if (q.type === "single" || q.type === "multiple") {
          const opts = q.options || [];
          if (q.optionIssue) {
            warnA(rel, `${qid} 选项缺失（已在数据里标注 optionIssue）`);
          } else {
            cn++;
            if (opts.length < 2) err(rel, `${qid} 选项少于 2 个`);
            const keys = opts.map((o) => o.key).join("");
            if (q.type === "single" && opts.length === 4 && keys !== "ABCD") err(rel, `${qid} 选项字母顺序异常: ${keys}`);
            if (opts.some((o) => !String(o.text || "").trim())) warnA(rel, `${qid} 有空白选项`);
            const ans = String(q.answer || "").replace(/[^A-D]/g, "");
            if (!ans) warnA(rel, `${qid} 没有答案`);
            else {
              if (q.type === "single" && ans.length !== 1) err(rel, `${qid} 单选题答案非法: ${q.answer}`);
              if (q.type === "multiple") {
                if (ans.length < 2) err(rel, `${qid} 多选题答案少于 2 个: ${q.answer}`);
                if (ans !== [...ans].sort().join("")) err(rel, `${qid} 多选答案未按字母升序: ${q.answer}`);
              }
              for (const c of ans) if (!opts.some((o) => o.key === c)) err(rel, `${qid} 答案 ${c} 不在选项里`);
            }
          }
        }
        if (q.answer || q.explanation) an++;
        if (q.topics && !Array.isArray(q.topics)) err(rel, `${qid} topics 必须是数组`);
        if (q.images && !Array.isArray(q.images)) err(rel, `${qid} images 必须是数组`);
        checkImages(rel, qid, sid, q.images);
      }
    }
    subQ += qn; subChoice += cn; subAns += an;
    totalQ += qn;
    rows.push({ f, qn, cn, an, quality: doc.quality || "-" });
  }

  const cov = subQ ? Math.round((subAns / subQ) * 100) : 0;
  console.log(`--- ${sid} (${files.length} 卷 / ${subQ} 题 / 选择 ${subChoice} / 答案覆盖 ${cov}%) ---`);
  for (const r of rows.sort((a, b) => a.f.localeCompare(b.f, "zh"))) {
    console.log(`   ${r.f.padEnd(16)} 题 ${String(r.qn).padStart(3)}  选择 ${String(r.cn).padStart(3)}  答案 ${String(r.an).padStart(3)}  ${r.quality}`);
  }
  console.log();
}

/* ------------------------------ 模拟卷 ------------------------------ */
const mockManifestPath = path.join(DATA, "mock", "_manifest.json");
if (fs.existsSync(mockManifestPath)) {
  let mockManifest = null;
  try { mockManifest = JSON.parse(fs.readFileSync(mockManifestPath, "utf8")); }
  catch (e) { err("mock/_manifest.json", "JSON 解析失败: " + e.message); }
  const seen = new Set();
  let mq = 0, mChoice = 0, mAns = 0, mPapers = 0;
  const rows = [];
  for (const g of mockManifest?.groups || []) {
    if (!g.id) err("mock/_manifest.json", "分组缺 id");
    if (!g.papers?.length) warnA("mock/_manifest.json", `分组 ${g.id} 没有试卷`);
    for (const p of g.papers || []) {
      const rel = String(p.file || "").replace(/^\.\//, "");
      const doc = readJSON(path.join(DATA, rel));
      if (!doc) { err(rel, "文件不存在或无法解析"); continue; }
      mPapers++;
      if (doc.kind !== "mock") err(rel, "kind 不是 mock");
      if (!doc.source) err(rel, "缺 source（模拟卷必须逐套记录来源）");
      if (!doc.subject) err(rel, "缺 subject");
      if (doc.quality && doc.quality !== "unverified") warnA(rel, `quality=${doc.quality}（模拟卷默认应为 unverified）`);
      let qn = 0, cn = 0, an = 0;
      for (const sec of doc.sections || []) {
        for (const q of sec.questions || []) {
          qn++;
          if (!q.id) err(rel, `题 ${q.no} 缺 id`);
          else if (seen.has(q.id)) err(rel, `题目 id 与其它模拟卷重复: ${q.id}`);
          else seen.add(q.id);
          if (String(q.stem || "").replace(/\s/g, "").length < 3) err(rel, `${q.id || q.no} 题干过短`);
          if (q.type === "single" || q.type === "multiple") {
            const opts = q.options || [];
            if (q.optionIssue) { warnA(rel, `${q.id} 选项缺失（已标注）`); }
            else {
              cn++;
              if (opts.length < 2) err(rel, `${q.id} 选项少于 2 个`);
              const ans = String(q.answer || "").replace(/[^A-D]/g, "");
              if (!ans) warnA(rel, `${q.id} 没有答案`);
              else {
                if (q.type === "single" && ans.length !== 1) err(rel, `${q.id} 单选答案非法: ${q.answer}`);
                if (q.type === "multiple" && ans !== [...ans].sort().join("")) err(rel, `${q.id} 多选答案未升序: ${q.answer}`);
                for (const c of ans) if (!opts.some((o) => o.key === c)) err(rel, `${q.id} 答案 ${c} 不在选项里`);
              }
            }
          }
          if (q.answer || q.explanation) an++;
          checkImages(rel, q.id || q.no, doc.subject || "mock", q.images);
        }
      }
      mq += qn; mChoice += cn; mAns += an;
      rows.push({ rel, qn, cn, an });
    }
  }
  if (mockManifest?.groups?.length) {
    console.log(`--- mock (${mockManifest.groups.length} 个系列 / ${mPapers} 套 / ${mq} 题 / 客观 ${mChoice} / 答案覆盖 ${mq ? Math.round((mAns / mq) * 100) : 0}%) ---`);
    for (const r of rows) console.log(`   ${r.rel.padEnd(34)} 题 ${String(r.qn).padStart(4)}  客观 ${String(r.cn).padStart(4)}  答案 ${String(r.an).padStart(4)}`);
    console.log();
    totalQ += mq;
  }
}

console.log("=== 结果 ===");
console.log(`总题量: ${totalQ}`);
console.log(`题目图片引用: ${imageRefs} 处 / ${imageSeen.size} 个文件（均已核对存在性）`);
console.log(`ERROR: ${problems.length} 条`);
for (const p of problems.slice(0, 40)) console.log("  ✗ " + p);
if (problems.length > 40) console.log(`  … 另有 ${problems.length - 40} 条`);
console.log(`WARNING: ${warn.length} 条`);
for (const w of warn.slice(0, 20)) console.log("  ! " + w);
if (warn.length > 20) console.log(`  … 另有 ${warn.length - 20} 条`);
console.log(problems.length ? "\n结果: ❌ 有错误" : "\n结果: ✅ 通过");
process.exit(problems.length ? 1 : 0);
