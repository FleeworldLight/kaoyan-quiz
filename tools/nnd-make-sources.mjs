#!/usr/bin/env node
/**
 * nnd-make-sources.mjs —— 从 tools/cache/mock-xiao/nnd/scan.jsonl（nnd-scan.mjs 的产出）
 * 归纳出「模拟卷清单」，为每一套卷挑一个最佳 exam_solution id，写出
 * tools/cache/mock-xiao/sources.json（供 fetch-mock-xiao.mjs / build-mock-xiao.mjs 使用）。
 *
 * 同一套卷常被多个用户重复上传（多个 examId）。挑选规则：题量多者优先 → 答案多者优先 → id 小者优先。
 *
 * 用法: node tools/nnd-make-sources.mjs [--include-all]
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE = path.join(ROOT, "tools", "cache", "mock-xiao");
const SCAN = path.join(CACHE, "nnd", "scan.jsonl");

const CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const PUBLISHERS = [
  ["肖秀荣", "肖秀荣", "politics"],
  ["徐涛", "徐涛", "politics"],
  ["腿姐", "陆寓丰（腿姐）", "politics"],
  ["米鹏", "米鹏", "politics"],
  ["张宇", "张宇", "math1"],
  ["李林", "李林", "math1"],
  ["李艳芳", "李艳芳", "math1"],
  ["汤家凤", "汤家凤", "math1"],
  ["武忠祥", "武忠祥", "math1"],
  ["余丙森", "余丙森", "math1"],
  ["方浩", "方浩", "math1"],
  ["杨超", "杨超", "math1"],
  ["王式安", "王式安", "math1"],
];

const rows = [];
for (const line of fs.readFileSync(SCAN, "utf8").split("\n")) {
  if (!line.trim()) continue;
  try {
    const r = JSON.parse(line);
    if (r.status === 200 && r.title) rows.push(r);
  } catch {}
}

/** 把页面标题拆成 {year, series, setNo}；不是「模拟卷」的返回 null */
function splitTitle(t) {
  let s = t.replace(/__N诺考研$/, "").trim();
  const m = s.match(/^(\d{4})年?(.+)（([一二三四五六七八九十]+)）$/);
  if (!m) return null;
  const year = Number(m[1]);
  const body = m[2].trim();
  const setNo = CN_NUM[m[3]];
  if (!setNo) return null;
  // 只保留「预测/模拟/冲刺/押题/套卷」类，排除真题
  if (!/预测|模拟|冲刺|押题|套卷|模考/.test(body)) return null;
  if (/真题|考试试题/.test(body)) return null;
  return { year, body, setNo };
}

function classify(body) {
  for (const [kw, pub, subject] of PUBLISHERS) {
    if (body.includes(kw)) return { publisher: pub, subject };
  }
  return { publisher: body.replace(/终极|冲刺|模拟|预测|套卷|考研|数学|政治|\d+|（|）/g, "").trim() || "未知", subject: null };
}

function subjectOf(body, fallback) {
  if (/数学|数一|数二|数三/.test(body)) return "math1";
  if (/政治|思想政治/.test(body)) return "politics";
  if (/英语/.test(body)) return "english1";
  if (/408|计算机/.test(body)) return "cs408";
  return fallback;
}

const groups = new Map(); // seriesKey -> { meta, sets: Map<setNo, best> }
for (const r of rows) {
  const sp = splitTitle(r.title);
  if (!sp) continue;
  const cls = classify(sp.body);
  let subject = subjectOf(sp.body, cls.subject);
  if (!subject) continue;
  // 只纳入本任务关注的科目
  if (!["politics", "math1"].includes(subject)) continue;
  const seriesKey = `${sp.year}|${sp.body}`;
  if (!groups.has(seriesKey)) {
    groups.set(seriesKey, { meta: { year: sp.year, body: sp.body, publisher: cls.publisher, subject }, sets: new Map() });
  }
  const g = groups.get(seriesKey);
  const prev = g.sets.get(sp.setNo);
  const score = (x) => [x.qLinks || 0, x.ansCount || 0, -(x.id || 0)];
  if (!prev || JSON.stringify(score(r)) > JSON.stringify(score(prev))) g.sets.set(sp.setNo, r);
}

// ------------------------------------------------------------------ 生成 sources.json
const papers = [];
const groupSummary = [];
const slugify = (s) =>
  s
    .replace(/[^\u4e00-\u9fa5A-Za-z0-9]+/g, "")
    .slice(0, 18);

for (const [seriesKey, g] of [...groups].sort((a, b) => a[0].localeCompare(b[0], "zh"))) {
  const setName = `${g.meta.year} ${g.meta.body}`;
  const groupId = `nnd-${g.meta.subject}-${slugify(g.meta.body)}-${g.meta.year}`;
  const sets = [...g.sets.keys()].sort((a, b) => a - b);
  if (!sets.length) continue;
  groupSummary.push(`${setName}  [${g.meta.publisher} / ${g.meta.subject}]  套数 ${sets.length}（${sets.join(",")}）`);
  for (const n of sets) {
    const r = g.sets.get(n);
    papers.push({
      paperId: `mock-${g.meta.subject}-nnd-${slugify(g.meta.body)}-${g.meta.year}-set${n}`,
      examId: r.id,
      groupId,
      subject: g.meta.subject,
      subjectName: g.meta.subject === "politics" ? "政治" : "数学一",
      publisher: g.meta.publisher,
      mockName: setName,
      year: g.meta.year,
      paperNo: n,
      paperKind: "testPaper",
      title: `${setName}（${Object.keys(CN_NUM).find((k) => CN_NUM[k] === n)}）`,
      duration: g.meta.subject === "politics" ? 180 : 180,
      totalScore: g.meta.subject === "politics" ? 100 : 150,
      sourceName: `N诺考研 noobdream.com · ${setName}（${Object.keys(CN_NUM).find((k) => CN_NUM[k] === n)}）练习解析页`,
      sourceNote:
        "来源为 N诺考研（noobdream.com）公开的「练习作答记录 + 答案解析」页，题干/选项/正确答案/原书解析均逐字照抄自该页；" +
        "该页本身是用户练习记录的展示页，题干与公式为网页文本（含 LaTeX），未逐题人工核对，请以正式出版物为准。",
      _stat: { qLinks: r.qLinks, ansCount: r.ansCount },
    });
  }
}

const out = {
  note:
    "N诺考研（noobdream.com）exam_solution 页 → public/data/mock/ 的卷级元数据。" +
    "由 tools/nnd-make-sources.mjs 从 scan.jsonl 自动生成：每套卷在多个重复上传里取「题量多→答案多」的那个 examId。",
  generator: "tools/nnd-make-sources.mjs",
  discoveredAt: new Date().toISOString(),
  groups: groupSummary,
  papers,
};
fs.writeFileSync(path.join(CACHE, "sources.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`[sources] 系列 ${groups.size}，卷 ${papers.length} -> tools/cache/mock-xiao/sources.json`);
for (const g of groupSummary) console.log("  " + g);
