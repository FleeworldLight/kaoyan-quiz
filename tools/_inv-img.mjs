/** 临时探针：清点 17 个 rebuild PDF 里的全部嵌入图，输出元数据清单 */
import fs from "node:fs";
import crypto from "node:crypto";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
const OPS = pdfjs.OPS;
const DIR = "tools/cache/rebuild";
const files = fs.readdirSync(DIR).filter((f) => /^\d{4}\.pdf$/.test(f)).sort();
const rows = [];
for (const f of files) {
  const year = f.slice(0, 4);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(`${DIR}/${f}`)), useSystemFonts: true, isEvalSupported: false }).promise;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const ol = await page.getOperatorList();
    const mul = (a, b) => [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
    let ctm = [1, 0, 0, 1, 0, 0]; const st = [];
    let k = 0;
    for (let i = 0; i < ol.fnArray.length; i++) {
      const fn = ol.fnArray[i]; const args = ol.argsArray[i];
      if (fn === OPS.save) st.push(ctm.slice());
      else if (fn === OPS.restore) ctm = st.pop() || [1, 0, 0, 1, 0, 0];
      else if (fn === OPS.transform) ctm = mul(ctm, args);
      else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject) {
        k++;
        const name = fn === OPS.paintImageXObject ? args[0] : null;
        const pts = [[0,0],[1,0],[0,1],[1,1]].map(([x,y]) => [ctm[0]*x+ctm[2]*y+ctm[4], ctm[1]*x+ctm[3]*y+ctm[5]]);
        const xs = pts.map(q=>q[0]), ys = pts.map(q=>q[1]);
        const bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map(v=>Math.round(v*10)/10);
        let info = { op: fn, inline: fn === OPS.paintInlineImageXObject, mask: fn === OPS.paintImageMaskXObject };
        if (name) {
          try {
            const img = page.objs.get(name);
            if (img && img.data) {
              const buf = Buffer.from(img.data.buffer ? img.data.buffer : img.data, img.data.byteOffset || 0, img.data.length);
              info = { ...info, w: img.width, h: img.height, kind: img.kind, len: img.data.length, md5: crypto.createHash("md5").update(buf).digest("hex").slice(0, 10) };
            } else info = { ...info, err: "no data " + typeof img };
          } catch (e) { info = { ...info, err: e.message }; }
        } else {
          const a0 = Array.isArray(args) ? args[0] : null;
          info = { ...info, argsKeys: a0 ? Object.keys(a0) : [], w: a0?.width, h: a0?.height, kind: a0?.kind };
        }
        rows.push({ year, page: p, idx: k, name, bbox, pageW: Math.round(vp.width), pageH: Math.round(vp.height), ...info });
      }
    }
  }
  await doc.destroy();
}
fs.mkdirSync("tools/cache/img", { recursive: true });
fs.writeFileSync("tools/cache/img/inventory.json", JSON.stringify(rows, null, 1), "utf8");
console.log("total image ops:", rows.length);
const byYear = {};
for (const r of rows) byYear[r.year] = (byYear[r.year] || 0) + 1;
console.log(byYear);
console.log("\n-- 按 bbox 面积占比排序（前 25） --");
const area = (r) => (r.bbox[2]-r.bbox[0]) * (r.bbox[3]-r.bbox[1]) / (r.pageW * r.pageH);
for (const r of [...rows].sort((a,b)=>area(b)-area(a)).slice(0, 25)) {
  console.log(`${r.year} p${r.page} #${r.idx} ${r.name || "(inline/mask)"} ${r.w}x${r.h} kind=${r.kind} bbox=${r.bbox.join(",")} 占页 ${(area(r)*100).toFixed(1)}% md5=${r.md5 || "-"} ${r.err || ""}`);
}
console.log("\n-- 重复内容（同 md5，跨页出现） --");
const byMd5 = {};
for (const r of rows) if (r.md5) (byMd5[r.md5] ||= []).push(r);
for (const [h, arr] of Object.entries(byMd5)) if (arr.length > 1) console.log(h, arr.map(r=>`${r.year}p${r.page}#${r.idx}`).join(" "), "size", arr[0].w + "x" + arr[0].h);
console.log("\n-- 无数据的图 --");
for (const r of rows) if (r.err) console.log(JSON.stringify(r));
console.log("\n-- 掩膜/内联图 --");
for (const r of rows) if (r.mask || r.inline) console.log(JSON.stringify(r).slice(0, 200));
