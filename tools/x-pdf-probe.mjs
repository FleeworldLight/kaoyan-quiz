/** 临时探针：抽取 PDF 前几页文本，判断是否为文本层 PDF */
import fs from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const ROOT = "G:/期末及简历和别的项目/考研资料/KaoYan-English-master";
const files = process.argv.slice(2);

for (const rel of files) {
  const f = ROOT + "/" + rel;
  try {
    const data = new Uint8Array(fs.readFileSync(f));
    const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
    let text = "";
    const n = Math.min(doc.numPages, 3);
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i);
      const c = await page.getTextContent();
      text += c.items.map((it) => it.str).join("") + "\n";
    }
    console.log("=".repeat(70));
    console.log(rel, "pages:", doc.numPages, "chars(3p):", text.length);
    console.log(text.slice(0, 900));
  } catch (e) {
    console.log("ERR", rel, e.message);
  }
}
