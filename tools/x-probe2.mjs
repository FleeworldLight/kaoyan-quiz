import fs from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

for (const f of process.argv.slice(2)) {
  const data = new Uint8Array(fs.readFileSync(f));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const c = await page.getTextContent();
    let t = "";
    for (const it of c.items) { t += it.str; if (it.hasEOL) t += "\n"; }
    text += `<<PAGE ${i}>>\n` + t + "\n";
  }
  const out = f.replace(/\.pdf$/i, ".txt").replace(/^.*[\\/]/, "tools/cache/english/web/");
  fs.writeFileSync(out, text, "utf8");
  console.log(f + " pages=" + doc.numPages + " chars=" + text.length + " -> " + out);
  console.log(text.slice(0, 700).replace(/\n+/g, "\n"));
  console.log("...");
}
