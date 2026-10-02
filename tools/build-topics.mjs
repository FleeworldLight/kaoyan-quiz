import fs from "node:fs";
import path from "node:path";
const BASE = "G:/期末及简历和别的项目/考研资料/Politics-Obsidian-Note-latest";
const SUBJECTS = ["马原", "毛中特", "史纲", "思修", "新思想"];

const clean = s => s
  .replace(/^[a-z]\s+/, "")                       // "a 导论" -> "导论"
  .replace(/^\d+\s+/, "")                          // "1 辩证唯物论" -> "辩证唯物论"
  .replace(/[""]/g, '"').replace(/[""]/g, '"').trim();

const out = { version: 1, source: "Politics-Obsidian-Note-latest (本地考点笔记)", subjects: [] };
let total = 0;
for (const sub of SUBJECTS) {
  const subj = { id: sub, name: sub, chapters: [], topicCount: 0 };
  const subDir = path.join(BASE, sub);
  if (!fs.existsSync(subDir)) { console.log("MISSING", sub); continue; }
  // 一级目录 = 篇
  const parts = fs.readdirSync(subDir, { withFileTypes: true }).filter(d => d.isDirectory());
  for (const part of parts) {
    const partName = clean(part.name);
    const partDir = path.join(subDir, part.name);
    const chapters = fs.readdirSync(partDir, { withFileTypes: true }).filter(d => d.isDirectory());
    if (chapters.length === 0) {
      // 该篇下直接是考点（如 新思想\a 导论）
      const files = fs.readdirSync(partDir).filter(f => f.endsWith(".md"));
      const ch = { id: `${sub}-${partName}`, name: partName, topics: [] };
      for (const f of files) {
        const t = clean(f.replace(/\.md$/, ""));
        ch.topics.push({ id: `${sub}-${partName}-${t.replace(/[\s]/g, "")}`, name: t });
      }
      subj.chapters.push(ch); subj.topicCount += ch.topics.length;
      continue;
    }
    for (const chap of chapters) {
      const chapName = clean(chap.name);
      const chapDir = path.join(partDir, chap.name);
      const files = fs.readdirSync(chapDir).filter(f => f.endsWith(".md"));
      const ch = { id: `${sub}-${chapName}`, name: chapName, part: partName, topics: [] };
      for (const f of files) {
        const nm = f.replace(/\.md$/, "");
        const isKaodian = /^考点\d+/.test(nm);
        const label = clean(nm);
        ch.topics.push({
          id: `${sub}-${chapName}-${label.replace(/\s+/g, "").slice(0, 24)}`,
          name: label,
          kind: isKaodian ? "考点" : (/^总结/.test(nm) ? "总结扩展" : "其他"),
        });
      }
      // 章节下有时还有子目录（三级），递归一层
      for (const sub2 of fs.readdirSync(chapDir, { withFileTypes: true }).filter(d => d.isDirectory())) {
        const d2 = path.join(chapDir, sub2.name);
        for (const f of fs.readdirSync(d2).filter(f => f.endsWith(".md"))) {
          const label = clean(f.replace(/\.md$/, ""));
          ch.topics.push({ id: `${sub}-${chapName}-${label.replace(/\s+/g, "").slice(0, 24)}`, name: label, kind: /^考点\d+/.test(f) ? "考点" : "其他" });
        }
      }
      subj.chapters.push(ch); subj.topicCount += ch.topics.length;
    }
  }
  total += subj.topicCount;
  out.subjects.push(subj);
  console.log(`${sub}: 章节(含篇)=${subj.chapters.length}  考点=${subj.topicCount}`);
}
console.log("总考点:", total);
out.totalTopics = total;
// 检查 id 唯一
const ids = out.subjects.flatMap(s => s.chapters.flatMap(c => c.topics.map(t => t.id)));
console.log("id 总数:", ids.length, "唯一:", new Set(ids).size, "重复示例:", ids.filter((x, i) => ids.indexOf(x) !== i).slice(0, 6));
fs.writeFileSync("G:/期末及简历和别的项目/考研资料/kaoyan-quiz/tools/cache/topics-raw.json", JSON.stringify(out, null, 2), "utf8");
console.log("\n样本:", JSON.stringify(out.subjects[0].chapters.slice(0, 2), null, 1).slice(0, 900));
