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

console.log("=== 结果 ===");
console.log(`总题量: ${totalQ}`);
console.log(`ERROR: ${problems.length} 条`);
for (const p of problems.slice(0, 40)) console.log("  ✗ " + p);
if (problems.length > 40) console.log(`  … 另有 ${problems.length - 40} 条`);
console.log(`WARNING: ${warn.length} 条`);
for (const w of warn.slice(0, 20)) console.log("  ! " + w);
if (warn.length > 20) console.log(`  … 另有 ${warn.length - 20} 条`);
console.log(problems.length ? "\n结果: ❌ 有错误" : "\n结果: ✅ 通过");
process.exit(problems.length ? 1 : 0);
