import fs from "node:fs";
const files = process.argv.slice(2);
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  console.log("=== " + f + "  " + j.title);
  for (const s of j.sections) {
    const nos = s.questions.map((q) => q.no);
    const noAns = s.questions.filter((q) => !q.answer).map((q) => q.no);
    console.log(`  [${s.id}] ${s.name}  n=${s.questions.length}  nos=${nos.join(",")}`);
    if (noAns.length) console.log(`      无答案: ${noAns.join(",")}`);
    // 题号区间外的题型（政治：1-16 单选 / 17-33 多选 / 34-38 材料）
    if (j.subject === "politics") {
      const odd = s.questions.filter((q) => (q.no <= 16 && q.type !== "single") || (q.no >= 17 && q.no <= 33 && q.type !== "multiple") || (q.no >= 34 && q.type !== "essay"));
      if (odd.length) console.log("      题型与题号不符: " + odd.map((q) => `q${q.no}=${q.type}(${q.answer})`).join(" "));
    }
    if (j.subject === "math1") {
      const odd = s.questions.filter((q) => (q.no <= 10 && q.type !== "single") || (q.no >= 11 && q.no <= 16 && q.type !== "blank") || (q.no >= 17 && q.type !== "essay"));
      if (odd.length) console.log("      题型与题号不符: " + odd.map((q) => `q${q.no}=${q.type}`).join(" "));
    }
  }
}
