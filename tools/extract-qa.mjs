import fs from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
const base = "<资料目录>/cs-408-main/cs-408-main/408真题";
const outDir = "<项目根目录>/tools/cache";
fs.mkdirSync(outDir, { recursive: true });
const jobs = [];
for (const y of [2009,2010,2011,2012,2013,2014,2015,2016]) {
  if (y === 2009) jobs.push([y, base + "/2009-2016真题&答案/2009年计算机408真题及答案解析.pdf"]);
  if (y === 2010) jobs.push([y, base + "/2009-2016真题&答案/2010年计算机408真题及答案解析.pdf"]);
  if (y === 2011) jobs.push([y, base + "/2009-2016真题&答案/2011年计算机408真题及答案.pdf"]);
  if (y === 2012) jobs.push([y, base + "/2009-2016真题&答案/2012年计算机408真题及答案解析.pdf"]);
  if (y === 2013) jobs.push([y, base + "/2009-2016真题&答案/2013年计算机408真题及答案.pdf"]);
  if (y === 2014) jobs.push([y, base + "/2009-2016真题&答案/2014年计算机408真题及答案解析.pdf"]);
  if (y === 2015) jobs.push([y, base + "/2009-2016真题&答案/2015年计算机408真题及答案.pdf"]);
  if (y === 2016) jobs.push([y, base + "/2009-2016真题&答案/2016年计算机408真题及答案.pdf"]);
}
for (const [y, f] of jobs) {
  try {
    const data = new Uint8Array(fs.readFileSync(f));
    const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
    let text = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const c = await page.getTextContent();
      text += c.items.map((it) => it.str).join("") + "\n<<PAGE>>\n";
    }
    fs.writeFileSync(outDir + "/qa-" + y + ".txt", text, "utf8");
    console.log(y, "pages", doc.numPages, "chars", text.length);
  } catch (e) { console.log("ERR", y, e.message); }
}
