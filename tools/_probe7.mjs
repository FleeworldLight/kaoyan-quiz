/** 交叉核对：本地原始 2022 真题 PDF 里，第 5/7 题附近有没有插图 */
import fs from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
const OPS = pdfjs.OPS;
const file = process.argv[2];
const data = new Uint8Array(fs.readFileSync(file));
const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
console.log("pages", doc.numPages, file);
const mul = (a, b) => [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
for (let p = 1; p <= Math.min(4, doc.numPages); p++) {
  const page = await doc.getPage(p);
  const tc = await page.getTextContent();
  const txt = tc.items.map((i) => i.str).join("").replace(/[\u0000-\u001f]/g, "").replace(/\s+/g, "");
  console.log(`--- p${p} 文本片段: ${txt.slice(0, 120)}`);
  const ol = await page.getOperatorList();
  let ctm = [1,0,0,1,0,0]; const st = []; let n = 0;
  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i], args = ol.argsArray[i];
    if (fn === OPS.save) st.push(ctm.slice());
    else if (fn === OPS.restore) ctm = st.pop() || [1,0,0,1,0,0];
    else if (fn === OPS.transform) ctm = mul(ctm, args);
    else if (fn === OPS.paintFormXObjectBegin) { st.push(ctm.slice()); if (Array.isArray(args[0])) ctm = mul(ctm, args[0]); }
    else if (fn === OPS.paintFormXObjectEnd) { ctm = st.pop() || [1,0,0,1,0,0]; }
    else if (fn === OPS.paintImageXObject) {
      n++;
      const pts = [[0,0],[1,0],[0,1],[1,1]].map(([x,y]) => [ctm[0]*x+ctm[2]*y+ctm[4], ctm[1]*x+ctm[3]*y+ctm[5]]);
      const xs = pts.map(q=>q[0]), ys = pts.map(q=>q[1]);
      console.log(`   IMG ${args[0]} y=[${Math.min(...ys).toFixed(1)}, ${Math.max(...ys).toFixed(1)}] x=[${Math.min(...xs).toFixed(1)}, ${Math.max(...xs).toFixed(1)}] px=${args[1]}x${args[2]}`);
    }
  }
  console.log(`   图数 ${n}`);
}
await doc.destroy();
