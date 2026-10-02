/**
 * 抽取 408 2024/2025 重构版真题与答案 PDF 的文本层。
 * 用法: node tools/extract-rebuild-2425.mjs
 */
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "node:fs";

const CACHE = "tools/cache";
const JOBS = [
  ["rebuild/2024.pdf", "rebuild-2024.txt"],
  ["rebuild/2025.pdf", "rebuild-2025.txt"],
  ["rebuild-ans/2024.pdf", "ans-2425-2024.txt"],
  ["rebuild-ans/2025.pdf", "ans-2425-2025.txt"],
];

async function dump(rel, outName) {
  const f = `${CACHE}/${rel}`;
  const data = new Uint8Array(fs.readFileSync(f));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
  let t = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i);
    t += (await p.getTextContent()).items.map((x) => x.str).join("") + "\n<<PAGE>>\n";
  }
  fs.writeFileSync(`${CACHE}/${outName}`, t, "utf8");
  const cjk = (t.match(/[\u4e00-\u9fff]/g) || []).length;
  console.log(`${rel} -> ${outName}: pages=${doc.numPages} chars=${t.length} cjk=${cjk}`);
  console.log("  head: " + t.slice(0, 220).replace(/\s+/g, " "));
  return { pages: doc.numPages, chars: t.length, cjk };
}

const rep = [];
for (const [rel, out] of JOBS) {
  try { rep.push({ rel, ...(await dump(rel, out)) }); }
  catch (e) { rep.push({ rel, err: e.message }); console.log(rel, "ERR", e.message); }
}
fs.writeFileSync(`${CACHE}/extract-2425-report.json`, JSON.stringify(rep, null, 1), "utf8");
