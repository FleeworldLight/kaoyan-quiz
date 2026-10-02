/**
 * 用第 4 个独立来源（西安外事学院公开的 2025 政治真题 PDF，含完整题干与选项但**不含答案**）
 * 对 2025 卷做「内容级」核对：本库每题的 4 个选项文本是否都能在该 PDF 文本里找到。
 * 用法: node tools/check-2025-xaiu.mjs
 */
import fs from "node:fs";

const TXT = "tools/cache/politics-src2/2025-xaiu-ans.txt";
if (!fs.existsSync(TXT)) { console.log("缺少 " + TXT + "，请先跑 tools/fetch-politics-src2.mjs 并抽取该 PDF"); process.exit(1); }
const norm = (s) => String(s || "").replace(/[\s\u3000]/g, "")
  .replace(/[．。，、；：！？（）()\[\]【】“”‘’《》…—\-_,.;:!?"']/g, "")
  .replace(/[A-D](?=[^A-Da-z]|$)/g, "");
const hay = norm(fs.readFileSync(TXT, "utf8"));

const paper = JSON.parse(fs.readFileSync("public/data/politics/2025.json", "utf8"));
const qs = paper.sections.flatMap((s) => s.questions).filter((q) => q.type !== "essay");
let full = 0, partial = 0;
const weak = [];
for (const q of qs) {
  const found = q.options.filter((o) => {
    const t = norm(o.text);
    return t.length >= 4 && hay.includes(t);
  }).length;
  if (found === 4) full++;
  else { partial++; weak.push(`Q${q.no}: ${found}/4`); }
}
console.log(`2025 选择题共 ${qs.length} 道，与第 4 来源（西安外事学院 PDF）内容核对：`);
console.log(`  4 个选项全部命中: ${full} 道`);
console.log(`  有选项未命中  : ${partial} 道  ${weak.join(" ")}`);
