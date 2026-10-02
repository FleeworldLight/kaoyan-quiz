/** 打印某页的内容流顺序：图算子前后各若干文字（用于判断图在文档流中的归属） */
import fs from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
const OPS = pdfjs.OPS;
const year = process.argv[2], p = Number(process.argv[3]);
const data = new Uint8Array(fs.readFileSync(`tools/cache/rebuild/${year}.pdf`));
const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
const page = await doc.getPage(p);
const ol = await page.getOperatorList();
const events = [];
let buf = "", matrix = null;
for (let i = 0; i < ol.fnArray.length; i++) {
  const fn = ol.fnArray[i], args = ol.argsArray[i];
  if (fn === OPS.setTextMatrix) matrix = args;
  else if (fn === OPS.showText) {
    let s = "";
    for (const g of args[0]) s += g.unicode || "";
    s = s.replace(/[\u0000-\u001f]/g, "");
    if (s.trim()) events.push({ i, t: "text", s, y: matrix ? Math.round(matrix[5] * 10) / 10 : null });
  } else if (fn === OPS.paintImageXObject) events.push({ i, t: "image", s: args[0] });
}
console.log(`=== ${year} p${p} 事件数 ${events.length}`);
for (let k = 0; k < events.length; k++) {
  const e = events[k];
  if (e.t !== "image") continue;
  console.log(`\n>>> 图 ${e.s} 位于第 ${k} 个事件（op#${e.i}）`);
  const fmt = (ev) => `${ev.t === "image" ? "[图]" : ""}${ev.s}`;
  // 向前拼 60 个文字事件，向后拼 25 个
  let before = "";
  for (let j = Math.max(0, k - 60); j < k; j++) if (events[j].t === "text") before += fmt(events[j]);
  let after = "";
  for (let j = k + 1; j < Math.min(events.length, k + 26); j++) if (events[j].t === "text") after += fmt(events[j]);
  console.log("  之前:", before.slice(-160));
  console.log("  之后:", after.slice(0, 160));
}
await doc.destroy();
