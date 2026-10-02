import fs from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
const year = process.argv[2];
const data = new Uint8Array(fs.readFileSync(`tools/cache/rebuild/${year}.pdf`));
const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const body = tc.items.filter((it) => it.str && it.str.trim() && it.transform[5] > 70 && it.transform[5] < vp.height - 30);
  const minX = Math.min(...body.map((it) => it.transform[4]));
  console.log(`\n### ${year} p${p}  minX=${Math.round(minX * 10) / 10}  items=${body.length}`);
  for (const it of body) {
    if (it.transform[4] > minX + 3) continue;
    console.log(`   y=${Math.round(it.transform[5] * 10) / 10} x=${Math.round(it.transform[4] * 10) / 10} ${JSON.stringify(it.str.slice(0, 50))}`);
  }
}
await doc.destroy();
