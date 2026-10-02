import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "node:fs";
const base = "G:/期末及简历和别的项目/考研资料/cs-408-main/cs-408-main/408真题";
const outDir = "G:/期末及简历和别的项目/考研资料/kaoyan-quiz/tools/cache";
fs.mkdirSync(outDir, { recursive: true });
async function grab(f) {
  const data = new Uint8Array(fs.readFileSync(f));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) { const p = await doc.getPage(i); text += (await p.getTextContent()).items.map(x=>x.str).join("") + "\n<<PAGE>>\n"; }
  return [doc.numPages, text];
}
const years=[2009,2010,2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023];
for (const y of years) {
  for (const [tag, dir] of [["paper","/2009-2023真题/"],["ans","/2009-2023答案/"]]) {
    const cands = fs.readdirSync(base+dir).filter(n=>n.startsWith(String(y)));
    for (const c of cands) {
      if (!c.endsWith(".pdf")) continue;
      try {
        const [np, t] = await grab(base+dir+c);
        fs.writeFileSync(`${outDir}/${tag}-${y}.txt`, t, "utf8");
        const cjk = (t.match(/[\u4e00-\u9fff]/g)||[]).length;
        console.log(tag, y, c.slice(0,40), "pages", np, "chars", t.length, "cjk", cjk, "|", t.slice(0,90).replace(/\s+/g," "));
        break;
      } catch(e){ console.log("ERR", tag, y, e.message); }
    }
  }
}
