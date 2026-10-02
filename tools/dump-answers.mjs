import fs from "node:fs";
const DIR = "G:/期末及简历和别的项目/考研资料/kaoyan-quiz/public/data/cs408";
const out = [];
for (const y of Array.from({length:15},(_,i)=>2009+i)) {
  const p = JSON.parse(fs.readFileSync(`${DIR}/${y}.json`, "utf8"));
  const singles = p.sections.find(s=>s.id==="choice").questions;
  const essays = p.sections.find(s=>s.id==="essay").questions;
  out.push(`${y}: ${singles.map(q=>q.answer).join("")}  | essayScores=[${essays.map(q=>q.score).join(",")}] essayAnsLen=[${essays.map(q=>(q.answer||"").length).join(",")}]`);
  out.push(`      q1 stem: ${singles[0].stem.slice(0,70)}`);
  out.push(`      q40 stem: ${singles[39].stem.slice(0,60)}`);
  out.push(`      q41 stem: ${essays[0].stem.slice(0,70)}`);
}
out.push("");
out.push("2009 官方清单应为: BCDBCBADABCDDCDCAADBDADDCACBAABABBCDDCA");
fs.writeFileSync("G:/期末及简历和别的项目/考研资料/kaoyan-quiz/tools/cache/answers-summary.txt", out.join("\n"), "utf8");
console.log(out.join("\n"));
