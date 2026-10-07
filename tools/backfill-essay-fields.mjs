/** 为材料分析题（essay）补齐 chapterTopics / subjectHint / chapterConfidence 字段（材料题不做章级分类） */
import fs from "node:fs";
import path from "node:path";
const DIR = "<项目根目录>/public/data/politics";
let n = 0;
for (const f of fs.readdirSync(DIR).filter(x => /^\d{4}\.json$/.test(x)).sort()) {
  const p = path.join(DIR, f);
  const paper = JSON.parse(fs.readFileSync(p, "utf8"));
  for (const sec of paper.sections) for (const q of sec.questions) {
    if (q.type !== "essay") continue;
    if (!Array.isArray(q.chapterTopics)) { q.chapterTopics = []; n++; }
    if (q.chapterConfidence === undefined) q.chapterConfidence = null;
    if (q.subjectHint === undefined) q.subjectHint = null;
  }
  fs.writeFileSync(p, JSON.stringify(paper, null, 2), "utf8");
}
console.log("已补齐", n, "道材料分析题的新字段");
