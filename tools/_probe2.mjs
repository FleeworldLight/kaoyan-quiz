import fs from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
const OPS = pdfjs.OPS;
const NAME = Object.fromEntries(Object.entries(OPS).map(([k, v]) => [v, k]));
const year = process.argv[2] || "2024";
const data = new Uint8Array(fs.readFileSync(`tools/cache/rebuild/${year}.pdf`));
const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
const p = Number(process.argv[3] || 1);
const page = await doc.getPage(p);
const ol = await page.getOperatorList();
console.log(`ops=${ol.fnArray.length}`);
const names = [];
for (let i = 0; i < ol.fnArray.length; i++) {
  if (ol.fnArray[i] === OPS.paintImageXObject) names.push({ i, args: ol.argsArray[i] });
}
console.log("image ops:", JSON.stringify(names));
for (const { i } of names) {
  console.log(`--- around op ${i} ---`);
  for (let j = Math.max(0, i - 6); j <= Math.min(ol.fnArray.length - 1, i + 2); j++)
    console.log(`   ${j} ${NAME[ol.fnArray[j]] || ol.fnArray[j]} ${JSON.stringify(ol.argsArray[j]).slice(0, 90)}`);
}
console.log("page.objs keys:", page.objs.objs ? Object.keys(page.objs.objs) : "-");
console.log("commonObjs keys:", page.commonObjs.objs ? Object.keys(page.commonObjs.objs) : "-");
for (const { args } of names) {
  const nm = args[0];
  for (const [lbl, store] of [["page", page.objs], ["common", page.commonObjs]]) {
    try {
      const img = await new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error("timeout")), 2000);
        store.get(nm, (v) => { clearTimeout(t); res(v); });
      });
      console.log(`  ${lbl}.get ${nm} callback ->`, img && img.width + "x" + img.height, "kind", img && img.kind, "len", img && img.data && img.data.length);
    } catch (e) { console.log(`  ${lbl}.get ${nm} callback FAILED: ${e.message}`); }
  }
}
await doc.destroy();
