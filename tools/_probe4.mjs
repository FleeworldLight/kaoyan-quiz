import fs from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
const year = process.argv[2];
const pat = new RegExp(process.argv[3]);
const data = new Uint8Array(fs.readFileSync(`tools/cache/rebuild/${year}.pdf`));
const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const tc = await page.getTextContent();
  const hit = [];
  for (let i = 0; i < tc.items.length; i++) {
    const it = tc.items[i];
    if (!it.str || !pat.test(it.str)) continue;
    // 打印该项及前一项，便于看上下文
    for (const j of [i - 1, i]) {
      const x = tc.items[j];
      if (!x || !x.str) continue;
      hit.push(`  [${j}] x=${Math.round(x.transform[4] * 10) / 10} y=${Math.round(x.transform[5] * 10) / 10} ${JSON.stringify(x.str.slice(0, 60))}`);
    }
    hit.push("  --");
  }
  if (hit.length) console.log(`### ${year} p${p}\n${hit.join("\n")}`);
}
await doc.destroy();
