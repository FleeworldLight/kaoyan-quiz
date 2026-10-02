import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "node:fs";
const dir = "G:/期末及简历和别的项目/考研资料/kaoyan-quiz/tools/cache/rebuild";
const out = "G:/期末及简历和别的项目/考研资料/kaoyan-quiz/tools/cache";
for (const y of [2009,2010,2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023]) {
  const f = `${dir}/${y}.pdf`;
  if (!fs.existsSync(f)) { console.log(y,"MISSING"); continue; }
  const data = new Uint8Array(fs.readFileSync(f));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
  let t="";
  for (let i=1;i<=doc.numPages;i++){const p=await doc.getPage(i); t+=(await p.getTextContent()).items.map(x=>x.str).join("")+"\n<<PAGE>>\n";}
  fs.writeFileSync(`${out}/rebuild-${y}.txt`, t, "utf8");
  const cjk=(t.match(/[\u4e00-\u9fff]/g)||[]).length;
  console.log(y,"pages",doc.numPages,"chars",t.length,"cjk",cjk);
}
// 2021 answer
const f21 = "G:/期末及简历和别的项目/考研资料/kaoyan-quiz/tools/cache/rebuild-ans/2021.pdf";
const d21 = new Uint8Array(fs.readFileSync(f21));
const doc21 = await pdfjs.getDocument({ data: d21, useSystemFonts: true, isEvalSupported: false }).promise;
let t21="";
for (let i=1;i<=doc21.numPages;i++){const p=await doc21.getPage(i); t21+=(await p.getTextContent()).items.map(x=>x.str).join("")+"\n<<PAGE>>\n";}
fs.writeFileSync(`${out}/neville-ans-2021.txt`, t21, "utf8");
console.log("2021 neville answer pages",doc21.numPages,"chars",t21.length,"cjk",(t21.match(/[\u4e00-\u9fff]/g)||[]).length);
console.log(t21.slice(0,400).replace(/\s+/g," "));
