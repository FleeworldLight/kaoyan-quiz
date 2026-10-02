import fs from "node:fs";
const D = "public/data/cs408";
for (const y of [2009, 2023, 2024, 2025]) {
  const p = JSON.parse(fs.readFileSync(`${D}/${y}.json`, "utf8"));
  const e = p.sections.find((s) => s.id === "essay").questions.slice().sort((a, b) => a.no - b.no);
  console.log(`${y} 综合题分值: ${e.map((q) => `${q.no}=${q.score}`).join(" ")} | 合计 ${e.reduce((a, q) => a + q.score, 0)}`);
}
console.log("");
for (const y of [2024, 2025]) {
  const p = JSON.parse(fs.readFileSync(`${D}/${y}.json`, "utf8"));
  const qs = p.sections.flatMap((s) => s.questions);
  console.log(`\n############ ${y} ############`);
  console.log("quality:", p.quality, "| questions:", qs.length, "|", p.sections.map((s) => `${s.id}=${s.questions.length}`).join(","));
  console.log("source:", JSON.stringify(p.source));
  console.log("answerVerification.officialScanReadable:", p.answerVerification && p.answerVerification.officialScanReadable);
  for (const n of [1, 2, 41]) {
    const q = qs.find((x) => x.no === n);
    if (!q) { console.log(`q${n} MISSING`); continue; }
    console.log(`\n--- q${n} (${q.type}, answer=${String(q.answer).slice(0, 90)}) topics=${JSON.stringify(q.topics)} score=${q.score}`);
    console.log("stem: " + q.stem.slice(0, 230));
    if (q.options.length) q.options.forEach((o) => console.log(`   ${o.key}. ${o.text.slice(0, 120)}`));
    console.log("expl: " + String(q.explanation).replace(/\n/g, " ").slice(0, 220));
  }
  const singles = p.sections.find((s) => s.id === "choice").questions.slice().sort((a, b) => a.no - b.no);
  console.log("\n答案串: " + singles.map((q) => q.answer).join(""));
  const emptyOpt = singles.filter((q) => q.options.some((o) => !o.text)).map((q) => q.no);
  console.log("选项为空串的题: " + (emptyOpt.length ? emptyOpt.join(",") : "无"));
  const noExpl = singles.filter((q) => !q.explanation).map((q) => q.no);
  console.log("无解析的题: " + (noExpl.length ? noExpl.join(",") : "无"));
}
