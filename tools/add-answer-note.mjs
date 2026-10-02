/**
 * 决定 1：把 20 道跨源冲突题的标注规范化 —— 新增 answerNote 字段（给考生看的中文提示）。
 * 保留原 verify 字段。
 */
import fs from "node:fs";
import path from "node:path";
const DIR = "G:/期末及简历和别的项目/考研资料/kaoyan-quiz/public/data/politics";

// 每题给一句面向考生的提示。source 取本库实际采用答案的来源。
const NOTES = {
  "2010-2":  { src: "学信网（教育部学信网）官方真题解析", alt: "另有题库（mrwoov/kyzz）据量变质变原理主张选 C" },
  "2010-25": { src: "学信网（教育部学信网）官方真题解析", alt: "另有题库（mrwoov/kyzz）认为 B 属于世界潮流而非历史文化传统，主张选 ACD" },
  "2010-26": { src: "学信网（教育部学信网）官方真题解析", alt: "另有题库（mrwoov/kyzz）主张选 ABD" },
  "2010-31": { src: "学信网（教育部学信网）官方真题解析", alt: "另有题库（mrwoov/kyzz）对「政治权利和自由」的界定不同，主张选 AB" },
  "2020-2":  { src: "来源真题整理（yy11111111111111111111/kaoyan-politics）", alt: "新东方 2020 真题解析与 mrwoov/kyzz 解析均主张「价值性评价」" },
};
const GENERIC = { src: "来源真题整理（yy11111111111111111111/kaoyan-politics）", alt: "另有独立题库（mrwoov/kyzz）给出不同答案" };

let n = 0;
const list = [];
for (const f of fs.readdirSync(DIR).filter(x => /^\d{4}\.json$/.test(x)).sort()) {
  const p = path.join(DIR, f);
  const paper = JSON.parse(fs.readFileSync(p, "utf8"));
  let changed = 0;
  for (const sec of paper.sections) for (const q of sec.questions) {
    if (!(q.verify && q.verify.startsWith("CONFLICT"))) continue;
    const key = `${paper.year}-${q.no}`;
    const spec = NOTES[key] || GENERIC;
    q.answerNote = `此题在不同来源的答案存在分歧，本站采用「${spec.src}」的答案（${q.answer}）；${spec.alt}。请以官方答案为准。`;
    q.answerDisputed = true;
    changed++; n++;
    list.push({ year: paper.year, no: q.no, type: q.type, answer: q.answer, verify: q.verify, answerNote: q.answerNote });
  }
  // 卷级：冲突题清单，便于前端一次性取用
  paper.verification.disputedQuestions = paper.sections.flatMap(s => s.questions)
    .filter(q => q.answerDisputed).map(q => q.no);
  paper.verification.disputedCount = paper.verification.disputedQuestions.length;
  fs.writeFileSync(p, JSON.stringify(paper, null, 2), "utf8");
  if (changed) console.log(`${paper.year}: ${changed} 道 -> 题号 ${paper.verification.disputedQuestions.join(",")}`);
}
console.log("\n共规范化", n, "道冲突题");
fs.writeFileSync(path.join(DIR, "..", "..", "tools/cache/disputed-list.json"), JSON.stringify(list, null, 2), "utf8");
