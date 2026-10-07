import fs from "node:fs";
const C = "<项目根目录>/tools/cache";
const DIR = "<项目根目录>/public/data/cs408";
const norm = (t) => t.replace(/<<PAGE>>/g, " ").replace(/\s+/g, " ").trim();

function simpleLetters(text) {
  // 三种独立策略，取能覆盖 1..40 的
  const out = new Map();
  // A: "N. X" 递增链
  const reA = /(?<![0-9])(\d{1,2})\s*[.．]\s*([A-Da-d])(?![A-Za-z])/g;
  let m; const hits = [];
  while ((m = reA.exec(text))) { const n = +m[1]; if (n>=1&&n<=40) hits.push({n, l:m[2].toUpperCase()}); }
  for (let i=0;i<hits.length;i++){ if(hits[i].n!==1) continue; const run=[hits[i]]; let e=2; for(let j=i+1;j<hits.length;j++) if(hits[j].n===e){run.push(hits[j]);e++;} if(run.length>out.size){ out.clear(); for(const h of run) out.set(h.n,h.l); } }
  // B: 【参考答案】
  const reB = /(\d{1,2})\s*[.．]\s*【参考答案】\s*([A-Da-d])/g; const mb = new Map();
  while ((m = reB.exec(text))) { const n=+m[1]; if(n>=1&&n<=40&&!mb.has(n)) mb.set(n,m[2].toUpperCase()); }
  if (mb.size > out.size) return mb;
  // C: N. X解析/。 
  const reC = /(\d{1,2})\s*[.．]\s*([A-Da-d])\s*(?:解析[:：]|[。．]\s*【解析】)/g; const mc = new Map();
  while ((m = reC.exec(text))) { const n=+m[1]; if(n>=1&&n<=40&&!mc.has(n)) mc.set(n,m[2].toUpperCase()); }
  if (mc.size > out.size) return mc;
  return out;
}
const lines = [];
for (const y of Array.from({length:15},(_,i)=>2009+i)) {
  const p = JSON.parse(fs.readFileSync(`${DIR}/${y}.json`, "utf8"));
  const final = p.sections.find(s=>s.id==="choice").questions.map(q=>q.answer).join("");
  const cands = [`qa-${y}.txt`, `ans-${y}.txt`, `jdc-ans-${y}.txt`, `neville-ans-${y}.txt`].filter(f => fs.existsSync(`${C}/${f}`));
  const parts = [];
  for (const f of cands) {
    const t = norm(fs.readFileSync(`${C}/${f}`, "utf8"));
    const mp = simpleLetters(t);
    const s = Array.from({length:40},(_,i)=> mp.get(i+1) || "?").join("");
    const diff = []; for (let i=0;i<40;i++) if (s[i] !== "?" && s[i] !== final[i]) diff.push(`q${i+1}:${final[i]}vs${s[i]}`);
    parts.push(`${f}(${mp.size})${diff.length ? " DIFF[" + diff.join(",") + "]" : (mp.size===40 ? " OK" : " partial")}`);
  }
  lines.push(`${y} final=${final}`);
  for (const q of parts) lines.push(`      ${q}`);
}
fs.writeFileSync(`${C}/xcheck-report.txt`, lines.join("\n"), "utf8");
console.log(lines.join("\n"));
