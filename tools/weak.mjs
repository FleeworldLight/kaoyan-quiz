import fs from "node:fs";
const DIR = "<项目根目录>/public/data/cs408";
const out = [];
for (const y of Array.from({length:15},(_,i)=>2009+i)) {
  const p = JSON.parse(fs.readFileSync(`${DIR}/${y}.json`, "utf8"));
  const qs = p.sections.find(s=>s.id==="choice").questions;
  const weak = qs.filter(q => (q.explanation||"").replace(/\s/g,"").length < 15);
  out.push(`${y}: 解析过短/为空 ${weak.length} 题 -> ` + weak.map(q=>`q${q.no}(${(q.explanation||"").slice(0,18)||"空"})`).join(" "));
  const shortStem = qs.filter(q => q.stem.length < 12);
  if (shortStem.length) out.push(`    题干过短: ` + shortStem.map(q=>`q${q.no}=${JSON.stringify(q.stem)}`).join(" "));
}
fs.writeFileSync("<项目根目录>/tools/cache/weak-expl.txt", out.join("\n"), "utf8");
console.log(out.join("\n"));
