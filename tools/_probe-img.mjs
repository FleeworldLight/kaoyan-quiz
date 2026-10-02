import fs from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
const OPS = pdfjs.OPS;
const NAME = Object.fromEntries(Object.entries(OPS).map(([k, v]) => [v, k]));
const year = process.argv[2] || "2020";
const data = new Uint8Array(fs.readFileSync(`tools/cache/rebuild/${year}.pdf`));
const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
const p = Number(process.argv[3] || 1);
const page = await doc.getPage(p);
const ol = await page.getOperatorList();
console.log(`=== ${year} page ${p}: first 40 ops`);
for (let i = 0; i < Math.min(40, ol.fnArray.length); i++) {
  console.log(`  ${i} ${NAME[ol.fnArray[i]] || ol.fnArray[i]} ${JSON.stringify(ol.argsArray[i]).slice(0, 100)}`);
}
const tc = await page.getTextContent();
console.log("\n=== text items in order (y rounded) ===");
let last = null;
for (const it of tc.items) {
  if (!it.str || !it.str.trim()) continue;
  const y = Math.round(it.transform[5] * 10) / 10;
  if (y !== last) { console.log(`  y=${y}  x=${Math.round(it.transform[4])}  "${it.str.slice(0, 30)}"`); last = y; }
}
await doc.destroy();
