import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "node:fs";
const C = "G:/期末及简历和别的项目/考研资料/kaoyan-quiz/tools/cache";
for (const y of [2009,2010,2011,2013]) {
  const f = `${C}/neville-ans/${y}.pdf`;
  if (!fs.existsSync(f)) { console.log(y,"missing"); continue; }
  const data = new Uint8Array(fs.readFileSync(f));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
  let t="";
  for (let i=1;i<=doc.numPages;i++){const p=await doc.getPage(i); t+=(await p.getTextContent()).items.map(x=>x.str).join("")+"\n<<PAGE>>\n";}
  fs.writeFileSync(`${C}/neville-ans-${y}.txt`, t, "utf8");
  const cjk=(t.match(/[\u4e00-\u9fff]/g)||[]).length;
  console.log(y,"pages",doc.numPages,"chars",t.length,"cjk",cjk,"::",t.slice(0,160).replace(/\s+/g," "));
}
