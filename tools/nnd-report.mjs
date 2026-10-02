#!/usr/bin/env node
/**
 * nnd-report.mjs —— 生成 N诺考研来源的「exam_solution ID → 卷」对照表与抽查样例。
 *
 * 用法:
 *   node tools/nnd-report.mjs                    # 对照表（markdown 表格）
 *   node tools/nnd-report.mjs --samples 5        # 抽查 N 道题（题干+选项+答案+来源 URL）
 *   node tools/nnd-report.mjs --json             # 机器可读
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const MOCK = path.join(ROOT, "public", "data", "mock");
const CACHE = path.join(ROOT, "tools", "cache", "mock-xiao");
const report = JSON.parse(fs.readFileSync(path.join(CACHE, "build-report.json"), "utf8"));
const sources = JSON.parse(fs.readFileSync(path.join(CACHE, "sources.json"), "utf8"));
const srcByPaper = new Map(sources.papers.map((p) => [p.paperId, p]));

const rows = [];
for (const p of report.papers) {
  const sp = srcByPaper.get(p.paperId) || {};
  const doc = JSON.parse(fs.readFileSync(path.join(MOCK, `${p.paperId}.json`), "utf8"));
  rows.push({
    paperId: p.paperId,
    examId: p.examId,
    examIds: sp.examIds || [p.examId],
    subject: doc.subject,
    publisher: doc.publisher,
    mockName: doc.mockName,
    title: doc.title,
    paperNo: doc.paperNo,
    year: doc.year,
    questionCount: p.questionCount,
    choiceCount: p.choiceCount,
    withAnswer: p.withAnswer,
    answerRate: p.answerRate,
    sections: p.sections,
    answerFrom: p.answerFrom,
    sourceUrl: doc.source.url,
  });
}
rows.sort((a, b) => (a.subject + a.mockName + String(a.paperNo)).localeCompare(b.subject + b.mockName + String(b.paperNo), "zh"));

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(rows, null, 2));
} else if (process.argv.includes("--samples")) {
  const i = process.argv.indexOf("--samples");
  const n = Number(process.argv[i + 1] || 5);
  // 抽样规则：政治优先取肖八/肖四的第 1 套（单选/多选/材料各一），其余随机补足
  const prefer = [
    "mock-politics-nnd-肖秀荣考研政治冲刺8套卷-2026-set1-q1",
    "mock-politics-nnd-肖秀荣考研政治冲刺8套卷-2026-set1-q17",
    "mock-politics-nnd-肖秀荣考研政治冲刺8套卷-2026-set1-q34",
    "mock-politics-nnd-肖秀荣终极预测4套卷-2025-set2-q5",
    "mock-math1-nnd-张宇终极预测8套卷-2025-set3-q1",
    "mock-politics-nnd-肖秀荣考研政治冲刺8套卷-2026-set5-q20",
  ];
  const out = [];
  for (const id of prefer) {
    for (const r of rows) {
      const doc = JSON.parse(fs.readFileSync(path.join(MOCK, `${r.paperId}.json`), "utf8"));
      for (const s of doc.sections)
        for (const q of s.questions) if (q.id === id) out.push({ row: r, sec: s, q });
    }
  }
  for (const { row, sec, q } of out.slice(0, n)) {
    console.log(`\n### ${q.id}  [${sec.name}]  来源：${row.sourceUrl}`);
    console.log(`卷名：${row.title}`);
    console.log(`题型：${q.type}　题号：${q.no}　答案：${q.answer || "(来源未给)"}　答案来源标记：${q._answerFrom || "-"}`);
    if (q.material) console.log(`材料：${q.material.slice(0, 400)}${q.material.length > 400 ? "…" : ""}`);
    console.log(`题干：${q.stem}`);
    for (const o of q.options) console.log(`  ${o.key}. ${o.text}`);
    if (q.explanation) console.log(`解析：${q.explanation.slice(0, 300)}${q.explanation.length > 300 ? "…" : ""}`);
  }
} else {
  console.log("| paperId | 实际用 examId | 候选 examId（多上传） | 科目 | 出版方 | 卷名 | 套 | 题量 | 客观题 | 有答案 | 答案率 | 来源 URL |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of rows) {
    console.log(
      `| \`${r.paperId}\` | ${r.examId} | ${r.examIds.join(", ")} | ${r.subject} | ${r.publisher} | ${r.mockName} | ${r.paperNo} | ${r.questionCount} | ${r.choiceCount} | ${r.withAnswer} | ${(r.answerRate * 100).toFixed(1)}% | ${r.sourceUrl} |`,
    );
  }
  const tot = rows.reduce((a, r) => ({ q: a.q + r.questionCount, a: a.a + r.withAnswer, c: a.c + r.choiceCount }), { q: 0, a: 0, c: 0 });
  console.log(`\n合计：${rows.length} 套 / ${tot.q} 题 / 客观题 ${tot.c} / 有答案 ${tot.a}（${((tot.a / tot.q) * 100).toFixed(1)}%）`);
}
