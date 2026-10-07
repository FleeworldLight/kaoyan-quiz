/**
 * x-extract-english.mjs — 从本地 KaoYan-English-master 素材抽取文本到 tools/cache/english/local/
 * 用法：node tools/x-extract-english.mjs [all|名字...]
 */
import fs from "node:fs";
import path from "node:path";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const ROOT = "<资料目录>/KaoYan-English-master";
const OUT = "tools/cache/english/local";
fs.mkdirSync(OUT, { recursive: true });

/* name -> 相对 ROOT 的路径 */
const JOBS = {};
for (let y = 2010; y <= 2020; y++) {
  const p = `${ROOT}/答案解析/${y}年考研英语真题答案及解析.pdf`;
  if (fs.existsSync(p)) JOBS["ans-" + y] = `答案解析/${y}年考研英语真题答案及解析.pdf`;
}
JOBS["paper-2005-2016"] = "真题集（纯真题可直接打印）英语一/PDF版本/2005—2016年历年考研英语真题集.pdf";
JOBS["handtrans-2010-2019"] = "英语一手译版/2010—2019年历年考研英语一真题集.pdf";
JOBS["handtrans-2005-2009"] = "英语一手译版/2005—2009年历年考研英语真题集.pdf";
JOBS["paper-2017"] = "真题集（纯真题可直接打印）英语一/PDF版本/2017考研英语（一)真题.pdf";
JOBS["paper-2018"] = "真题集（纯真题可直接打印）英语一/PDF版本/2018考研英语（一)真题.pdf";
JOBS["paper-2019"] = "真题集（纯真题可直接打印）英语一/2019考研英语（一)真题.pdf";
JOBS["paper-2020"] = "真题集（纯真题可直接打印）英语一/2020考研英语（一)真题.pdf";

async function extract(rel, outName) {
  const f = path.join(ROOT, rel);
  if (!fs.existsSync(f)) { console.log("MISSING " + rel); return null; }
  const data = new Uint8Array(fs.readFileSync(f));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
  const chunks = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const c = await page.getTextContent();
    let t = "";
    for (const it of c.items) {
      t += it.str;
      if (it.hasEOL) t += "\n";
    }
    chunks.push(`<<PAGE ${i}>>\n` + t);
  }
  const text = chunks.join("\n");
  fs.writeFileSync(path.join(OUT, outName + ".txt"), text, "utf8");
  console.log(`${outName}: pages=${doc.numPages} chars=${text.length}`);
  return text;
}

const which = process.argv[2] || "all";
const names = which === "all" ? Object.keys(JOBS) : process.argv.slice(2);
for (const n of names) {
  if (!JOBS[n]) { console.log("unknown job " + n); continue; }
  try { await extract(JOBS[n], n); } catch (e) { console.log("ERR " + n + " " + e.message); }
}
