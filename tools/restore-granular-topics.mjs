/**
 * 恢复「细粒度考点」标签（q.topics）。
 *
 * 背景：`q.topics`（形如 `史纲-中华民族的抗日战争-考点61马克思主义中国化` 的三段式 Obsidian 考点 id）
 * 由上一轮流程中一个**已不存在的脚本**写入；本轮的 build-politics.mjs 会把 `topics` 重置为空数组。
 * 为避免丢数据，这里把 tools/cache/politics-baseline/ 快照（= 改造前的线上数据）里的 q.topics
 * 原样搬回对应年份；快照里没有的年份（2025+）保持空数组，绝不新造标签。
 *
 * 用法: node tools/restore-granular-topics.mjs
 */
import fs from "node:fs";
import path from "node:path";

const DIR = "G:/期末及简历和别的项目/考研资料/kaoyan-quiz/public/data/politics";
const BASE = "G:/期末及简历和别的项目/考研资料/kaoyan-quiz/tools/cache/politics-baseline";

let restored = 0, yearsTouched = 0, missing = [];
for (const f of fs.readdirSync(DIR).filter((x) => /^\d{4}\.json$/.test(x)).sort()) {
  const target = path.join(DIR, f);
  const baseFile = path.join(BASE, f);
  const paper = JSON.parse(fs.readFileSync(target, "utf8"));
  if (!fs.existsSync(baseFile)) { missing.push(f.replace(".json", "")); continue; }
  const base = JSON.parse(fs.readFileSync(baseFile, "utf8"));
  const byId = new Map();
  for (const s of base.sections) for (const q of s.questions) byId.set(q.id, q);
  let n = 0;
  for (const s of paper.sections) for (const q of s.questions) {
    const b = byId.get(q.id);
    const want = (b && Array.isArray(b.topics)) ? b.topics : [];
    if (want.length && (!Array.isArray(q.topics) || q.topics.length === 0)) { q.topics = want.slice(); n++; }
  }
  if (n) { fs.writeFileSync(target, JSON.stringify(paper, null, 2), "utf8"); restored += n; yearsTouched++; console.log(`${paper.year}: 恢复 ${n} 道题的细粒度考点`); }
}
console.log(`\n合计恢复 ${restored} 道题（${yearsTouched} 个年份）；快照中不存在的年份（未新增）: ${missing.join(",") || "无"}`);
