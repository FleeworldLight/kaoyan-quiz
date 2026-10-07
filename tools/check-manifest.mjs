import fs from "node:fs";
const DIR = "<项目根目录>/public/data/cs408";
const out = [];
const m = JSON.parse(fs.readFileSync(`${DIR}/_manifest.json`, "utf8"));
out.push("manifest keys: " + Object.keys(m).join(", "));
out.push("subject keys: " + Object.keys(m.subject).join(", "));
out.push("papers: " + m.subject.papers.length + " topics: " + m.subject.topics.length);
for (const t of m.subject.topics.slice(0, 20)) out.push(`  ${t.id} (${t.count})`);
out.push("defects years: " + m.defects.map(d => d.year + ":" + d.items.length).join(" "));
out.push("knownLimitations: " + m.knownLimitations.length);
out.push("");
// sample explanations
for (const y of [2011, 2014, 2009, 2020]) {
  const p = JSON.parse(fs.readFileSync(`${DIR}/${y}.json`, "utf8"));
  const qs = p.sections.find(s=>s.id==="choice").questions;
  const missing = qs.filter(q=>!q.explanation).map(q=>q.no);
  out.push(`${y}: 缺解析题号=[${missing.join(",")}]`);
  out.push(`   q1 expl: ${(qs[0].explanation||"(空)").slice(0,90)}`);
  out.push(`   q5 expl: ${(qs[4].explanation||"(空)").slice(0,90)}`);
  out.push(`   topics: ${qs.slice(0,12).map(q=>q.topics[0]||"-").join(" | ")}`);
}
fs.writeFileSync("<项目根目录>/tools/cache/manifest-check.txt", out.join("\n"), "utf8");
console.log(out.join("\n"));
