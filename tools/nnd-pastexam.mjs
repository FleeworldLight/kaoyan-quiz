#!/usr/bin/env node
/**
 * nnd-pastexam.mjs —— 解析 N诺考研 /Practice/pastexam/（真题 + 模考 目录页）里的试卷清单。
 * 目录页是服务端渲染的静态 HTML，每条 .exam-item 带 data-type / data-tag / data-exam-id 和标题。
 *
 * 用法: node tools/nnd-pastexam.mjs [htmlPath] [--mock-only]
 * 输出: tools/cache/mock-xiao/nnd/pastexam-list.json
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE = path.join(ROOT, "tools", "cache", "mock-xiao", "nnd");
const file = process.argv[2] && !process.argv[2].startsWith("--")
  ? process.argv[2]
  : path.join(CACHE, "noobdream.com_Practice_pastexam_.html");
const MOCK_ONLY = process.argv.includes("--mock-only");

const html = fs.readFileSync(file, "utf8");
const items = [];
const re = /<a[^>]*class="exam-item"([\s\S]*?)<\/a>/g;
let m;
while ((m = re.exec(html))) {
  const attrs = m[1];
  const g = (k) => (attrs.match(new RegExp(`data-${k}="([^"]*)"`)) || [])[1] || "";
  const title = (attrs.match(/class="exam-title">([\s\S]*?)<\/div>/) || [])[1] || "";
  const subtitle = [...attrs.matchAll(/<span>([^<]*)<\/span>/g)].map((x) => x[1]).filter(Boolean);
  items.push({
    examId: Number(g("exam-id")),
    type: g("type"),
    tag: g("tag"),
    author: g("author") || "",
    title: title.replace(/\s+/g, " ").trim(),
    subtitle,
  });
}
const seen = new Set();
const uniq = items.filter((i) => {
  const k = `${i.type}|${i.tag}|${i.examId}`;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});
const out = MOCK_ONLY ? uniq.filter((i) => i.type === "模考") : uniq;
fs.writeFileSync(path.join(CACHE, "pastexam-list.json"), JSON.stringify(out, null, 2) + "\n");

const byType = {};
for (const i of uniq) byType[i.type] = (byType[i.type] || 0) + 1;
console.log(`[pastexam] 共 ${uniq.length} 条 ` + JSON.stringify(byType));
const byTag = {};
for (const i of uniq.filter((x) => x.type === "模考")) {
  byTag[i.tag] ??= [];
  byTag[i.tag].push(i);
}
for (const [tag, list] of Object.entries(byTag)) {
  console.log(`\n== 模考 / ${tag}（${list.length}）`);
  for (const i of list) console.log(`  ${String(i.examId).padStart(6)}  ${i.title}   [${i.subtitle.join(" / ")}]`);
}
if (!Object.keys(byTag).length) console.log("（没有 data-type=模考 的条目）");
