/**
 * x-check-english.mjs — 英语一答案一致性交叉验证
 *
 * 做法：解析正文里作者通常会明写「正确答案为 X」「X 项正确」「故选 X」等，
 *      把解析中声明的字母集合与我们从【答案】取到的字母比对。
 *      若解析明确了字母而与我们取到的答案不一致，就是危险的信号（题号-答案错位）。
 * 用法：node tools/x-check-english.mjs
 */
import fs from "node:fs";

const PATTERNS = [
  /正确答案\s*(?:为|是|选)?\s*[\[【（(]?\s*([A-D])\b/g,
  /(?:正确)?答案\s*(?:为|是|选)\s*[\[【（(]?\s*([A-D])\b/g,
  /故\s*(?:正确)?答案\s*(?:为|是)\s*[\[【（(]?\s*([A-D])\b/g,
  /(?:因此|所以|故|由此)?\s*(?:应)?选\s*[\[【（(]?\s*([A-D])\b/g,
  /([A-D])\s*(?:项|选项)\s*(?:是|为|即)?\s*(?:正确|最佳|答案)/g,
  /([A-D])\s*(?:是|为)\s*正确答案/g,
];
function declaredLetters(expl) {
  const s = String(expl || "");
  const set = new Set();
  for (const re of PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(s))) set.add(m[1]);
  }
  return set;
}

let checked = 0, agree = 0, conflict = 0;
const conflicts = [];
for (const y of [2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023]) {
  const p = "public/data/english1/" + y + ".json";
  if (!fs.existsSync(p)) continue;
  const d = JSON.parse(fs.readFileSync(p, "utf8"));
  let t = 0, a = 0, c = 0;
  for (const sec of d.sections) {
    if (sec.id !== "cloze" && sec.id !== "reading") continue;
    for (const q of sec.questions) {
      if (!q.answer || !q.explanation) continue;
      const set = declaredLetters(q.explanation);
      if (!set.size) continue;
      t++;
      if (set.has(q.answer)) a++;
      else { c++; conflicts.push(y + " q" + q.no + " 取值=" + q.answer + " 解析声明=" + [...set].join("/")); }
    }
  }
  checked += t; agree += a; conflict += c;
  console.log(y + ": 解析中明确了字母的题 " + t + "，与取值一致 " + a + "，冲突 " + c);
}
console.log("\n合计 明确 " + checked + " / 一致 " + agree + " / 冲突 " + conflict);
if (conflicts.length) { console.log("\n冲突明细："); console.log(conflicts.join("\n")); }
