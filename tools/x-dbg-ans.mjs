import fs from "node:fs";
import { loadLines } from "./parse-english-old.mjs";

const T = (l) => String(l == null ? "" : l).trim();
for (const year of [2010, 2011, 2012, 2013, 2014, 2015, 2016]) {
  const lines = loadLines("tools/cache/english/local/ans-" + year + ".txt");
  const findIdx = (p, from = 0) => { for (let i = from; i < lines.length; i++) if (p(T(lines[i]))) return i; return -1; };
  const iRead = findIdx((t) => /^Section\s+II\s*Reading Comprehension/i.test(t));
  const iPartB = findIdx((t) => /^Part\s*B\b/i.test(t), iRead + 1);
  console.log("===== " + year + "  iRead=" + iRead + " iPartB=" + iPartB);
  const re = /^(\d{1,2})\s*[.．、]\s*(?:\S)/;
  const seen = new Map();
  for (let i = iRead + 1; i < iPartB; i++) {
    const m = T(lines[i]).match(re);
    if (m) {
      const n = Number(m[1]);
      if (n < 21 || n > 40) continue;
      if (!seen.has(n)) seen.set(n, []);
      seen.get(n).push(i + 1);
    }
  }
  const dup = [...seen.entries()].filter(([, v]) => v.length > 1);
  const missing = [];
  for (let n = 21; n <= 40; n++) if (!seen.has(n)) missing.push(n);
  console.log("  缺入口题号: " + (missing.join(",") || "无"));
  console.log("  重复入口: " + (dup.map(([n, v]) => n + "@" + v.join("/")).join(" ") || "无"));
  const ansLines = [];
  for (let i = iRead + 1; i < iPartB; i++) {
    const k = lines[i].indexOf("【答案】");
    if (k >= 0) ansLines.push({ line: i + 1, letter: (lines[i].slice(k + 4).match(/[A-H]/) || [""])[0] });
  }
  console.log("  答案条数=" + ansLines.length + " -> " + ansLines.map((a) => a.letter).join(""));
  console.log("  答案行: " + ansLines.map((a) => a.line).join(","));
}
