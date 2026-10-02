import { parsePaperHtmlFile } from "./politics-parse-html.mjs";

const SRC = [
  ["wsyu", "tools/cache/politics-src2/2025-wsyu.html"],
  ["shzu", "tools/cache/politics-src2/2025-shzu.html"],
  ["koolearn", "tools/cache/koolearn/2025-koolearn-full.html"],
];
const parsed = {};
for (const [name, file] of SRC) parsed[name] = parsePaperHtmlFile(file, { year: 2025 });

const want = process.argv.slice(2).map(Number);
for (const no of want) {
  console.log(`\n############### Q${no} ###############`);
  for (const [name] of SRC) {
    const q = [...parsed[name].single, ...parsed[name].multiple].find((x) => x.no === no);
    if (!q) { console.log(`${name}: 缺失`); continue; }
    console.log(`--- ${name} answer=${q.answer}`);
    console.log(`    stem: ${q.stem.replace(/\s+/g, " ").slice(0, 120)}`);
    for (const o of q.options) console.log(`    ${o.key}. [${o.text.length}] ${o.text.slice(0, 100)}`);
  }
}
