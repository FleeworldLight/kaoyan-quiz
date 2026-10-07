import fs from "node:fs";
import path from "node:path";
const DIR = "<项目根目录>/public/data/politics";
const t = JSON.parse(fs.readFileSync(path.join(DIR, "_topics.json"), "utf8"));

const declared = new Map();      // id -> {count, kind}
for (const c of t.chapters) declared.set(c.id, { count: c.count, kind: c.kind });
for (const s of t.subjects) for (const c of s.chapters) for (const x of c.topics) declared.set(x.id, { count: x.count, kind: "granular" });

const used = new Map();
const perYear = {};
let choiceTotal = 0, choiceTagged = 0, strictChapter = 0;
for (const f of fs.readdirSync(DIR).filter(x => /^\d{4}\.json$/.test(x)).sort()) {
  const p = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
  perYear[p.year] = { choice: 0, tagged: 0 };
  for (const sec of p.sections) for (const q of sec.questions) {
    for (const x of q.topics || []) used.set(x, (used.get(x) || 0) + 1);
    for (const x of q.chapterTopics || []) used.set(x, (used.get(x) || 0) + 1);
    if (sec.id === "essay") continue;
    choiceTotal++; perYear[p.year].choice++;
    if ((q.chapterTopics || []).length) { choiceTagged++; perYear[p.year].tagged++; }
    if (q.chapterConfidence === "chapter") strictChapter++;
  }
}
console.log("=== 选择题每题是否都有章级标签 ===");
let miss = 0;
for (const [y, v] of Object.entries(perYear)) { const ok = v.choice === v.tagged; if (!ok) miss++; console.log(`  ${y}: ${v.tagged}/${v.choice} ${ok ? "✔" : "✘ 缺" + (v.choice - v.tagged)}`); }
console.log(`合计 ${choiceTagged}/${choiceTotal}  章级(confidence=chapter) ${strictChapter}`);

const orphanDeclared = [...declared.keys()].filter(id => !used.has(id));
const orphanUsed = [...used.keys()].filter(id => !declared.has(id));
const countMismatch = [...declared.entries()].filter(([id, v]) => (used.get(id) || 0) !== v.count);
console.log("\n=== id 双向一致性 ===");
console.log("  _topics.json 声明 topic 数:", declared.size);
console.log("  题目实际引用 topic 数:", used.size);
console.log("  只在 _topics.json 有、题目里没有:", orphanDeclared.length, orphanDeclared.slice(0, 10));
console.log("  只在题目里有、_topics.json 没有:", orphanUsed.length, orphanUsed.slice(0, 10));
console.log("  count 与题目实际引用数不一致:", countMismatch.length, countMismatch.slice(0, 10).map(([id, v]) => `${id}: 声明${v.count} 实际${used.get(id)}`));

console.log("\n=== 最终 _topics.json 章级 topic 列表（id + count）===");
const bySubj = {};
for (const c of t.chapters) (bySubj[c.subject] ||= []).push(c);
for (const [s, list] of Object.entries(bySubj)) {
  console.log(`\n【${s}】`);
  for (const c of list.sort((a, b) => b.count - a.count)) console.log(`  ${String(c.count).padStart(3)}  ${c.id}${c.kind === "subject-fallback" ? "   (兜底)" : ""}`);
}
console.log("\n=== 细粒度考点（count>0）共", [...declared.values()].filter(v => v.kind === "granular").length, "个 ===");
const gr = [...declared.entries()].filter(([, v]) => v.kind === "granular").sort((a, b) => b[1].count - a[1].count);
for (const [id, v] of gr) console.log(`  ${String(v.count).padStart(3)}  ${id}`);
