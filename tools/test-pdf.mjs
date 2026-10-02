import fs from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const files = [
  "G:/期末及简历和别的项目/考研资料/cs-408-main/cs-408-main/408真题/2009-2023真题/2020计算机考研408真题.pdf",
  "G:/期末及简历和别的项目/考研资料/cs-408-main/cs-408-main/408真题/2009-2023答案/2020答案.pdf",
  "G:/期末及简历和别的项目/考研资料/KaoYan-English-master/真题集（纯真题可直接打印）英语一/PDF版本/2017考研英语（一)真题.pdf",
];
for (const f of files) {
  try {
    const data = new Uint8Array(fs.readFileSync(f));
    const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
    let text = "";
    for (let i = 1; i <= Math.min(doc.numPages, 4); i++) {
      const page = await doc.getPage(i);
      const c = await page.getTextContent();
      text += c.items.map((it) => it.str).join("");
    }
    console.log("=".repeat(70));
    console.log(f.split("/").pop(), "pages:", doc.numPages, "chars(first4p):", text.length);
    console.log(text.slice(0, 700).replace(/\s+/g, " "));
  } catch (e) {
    console.log("ERR", f, e.message);
  }
}
