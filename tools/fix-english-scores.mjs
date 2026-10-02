/**
 * 把英语一各卷的分值统一到考研真实口径（总分 100）：
 *   完型 1–20 每题 0.5（共 10）· 阅读 21–40 每题 2（共 40）· 新题型 41–45 每题 2（共 10）
 *   翻译 46–50 每题 2（共 10）· 写作 51 为 10、52 为 20（共 30）
 * 只改 score / totalScore，不触碰题干、选项、答案。
 */
import fs from "node:fs";
import path from "node:path";

const DIR = "public/data/english1";
const RULES = {
  cloze: [1, 20, 0.5],
  reading: [21, 40, 2],
  newtype: [41, 45, 2],
  translation: [46, 50, 2],
  writing: null,   // 51 → 10, 52 → 20
};
const files = fs.readdirSync(DIR).filter((f) => /^\d{4}\.json$/.test(f));
let changed = 0;

for (const f of files) {
  const p = path.join(DIR, f);
  const doc = JSON.parse(fs.readFileSync(p, "utf8"));
  let touched = 0;
  for (const sec of doc.sections || []) {
    const rule = RULES[sec.id];
    for (const q of sec.questions || []) {
      let want = q.score;
      if (sec.id === "writing") want = q.no === 51 ? 10 : 20;
      else if (rule && q.no >= rule[0] && q.no <= rule[1]) want = rule[2];
      else if (rule) want = rule[2];
      if (q.score !== want) { q.score = want; touched++; }
    }
  }
  if (doc.totalScore !== 100) { doc.totalScore = 100; touched++; }
  if (doc.duration !== 180) { doc.duration = 180; touched++; }
  if (touched) {
    fs.writeFileSync(p, JSON.stringify(doc), "utf8");
    changed++;
    const sum = (doc.sections || []).flatMap((s) => s.questions).reduce((a, q) => a + (q.score || 0), 0);
    console.log(`${f}  修改 ${touched} 处  分值合计 ${sum}`);
  }
}
// 同步 _manifest.json 里的 totalScore / duration
const mp = path.join(DIR, "_manifest.json");
if (fs.existsSync(mp)) {
  const m = JSON.parse(fs.readFileSync(mp, "utf8"));
  for (const x of m.papers || []) { x.totalScore = 100; x.duration = 180; }
  if (m.subject) { m.subject.examTotalScore = 100; m.subject.examDuration = 180; if (m.subject.papers) for (const x of m.subject.papers) { x.totalScore = 100; x.duration = 180; } }
  fs.writeFileSync(mp, JSON.stringify(m, null, 1), "utf8");
  console.log("_manifest.json 已同步 totalScore=100");
}
console.log(`\n共处理 ${files.length} 卷，实际修改 ${changed} 卷`);
