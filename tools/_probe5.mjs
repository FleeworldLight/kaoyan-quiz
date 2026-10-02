import fs from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
const OPS = pdfjs.OPS;
const year = process.argv[2];
const want = String(process.argv[3] || "");
const data = new Uint8Array(fs.readFileSync(`tools/cache/rebuild/${year}.pdf`));
const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
const FOOTER_RE = /页[（(]共|第\s*\d+\s*页|共\s*\d+\s*页/;
const mul = (a, b) => [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
for (let p = 1; p <= doc.numPages; p++) {
  if (want && String(p) !== want) continue;
  const page = await doc.getPage(p);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const body = tc.items.filter((it) => it.str && it.str.trim() && it.transform[5] > 32 && it.transform[5] < vp.height - 30 && !(it.transform[5] < 48 && FOOTER_RE.test(it.str)));
  const minX = Math.min(...body.map((it) => it.transform[4]));
  console.log(`### ${year} p${p} minX=${minX}`);
  const ol = await page.getOperatorList();
  let ctm = [1,0,0,1,0,0]; const st = [];
  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i], args = ol.argsArray[i];
    if (fn === OPS.save) st.push(ctm.slice());
    else if (fn === OPS.restore) ctm = st.pop() || [1,0,0,1,0,0];
    else if (fn === OPS.transform) ctm = mul(ctm, args);
    else if (fn === OPS.paintFormXObjectBegin) { st.push(ctm.slice()); if (Array.isArray(args[0])) ctm = mul(ctm, args[0]); }
    else if (fn === OPS.paintFormXObjectEnd) { ctm = st.pop() || [1,0,0,1,0,0]; }
    else if (fn === OPS.paintImageXObject) {
      const pts = [[0,0],[1,0],[0,1],[1,1]].map(([x,y]) => [ctm[0]*x+ctm[2]*y+ctm[4], ctm[1]*x+ctm[3]*y+ctm[5]]);
      const xs = pts.map(q=>q[0]), ys = pts.map(q=>q[1]);
      console.log(`  >> IMAGE ${args[0]} y=[${Math.min(...ys).toFixed(1)}, ${Math.max(...ys).toFixed(1)}] x=[${Math.min(...xs).toFixed(1)}, ${Math.max(...xs).toFixed(1)}]`);
    }
  }
  const sorted = body.map((it) => ({ y: Math.round(it.transform[5]*10)/10, x: Math.round(it.transform[4]*10)/10, s: it.str.replace(/\s+/g," ").slice(0,55) })).sort((a,b)=>b.y-a.y);
  for (const l of sorted) console.log(`   y=${String(l.y).padStart(6)} x=${String(l.x).padStart(6)} ${l.x <= minX + 3 ? "*" : " "} ${JSON.stringify(l.s)}`);
}
await doc.destroy();
