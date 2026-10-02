/** x-html2txt.mjs — 把抓到的 HTML 去标签成纯文本，块级标签换成换行
 *  用法：node tools/x-html2txt.mjs <in.html> [out.txt] [年 年 ...] */
import fs from "node:fs";
import path from "node:path";

const file = process.argv[2];
let t = fs.readFileSync(file, "utf8");
t = t.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<!--[\s\S]*?-->/g, " ");
t = t.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|tr|h[1-6]|td|section|article)>/gi, "\n")
  .replace(/<(p|div|li|tr|h[1-6]|table|section|article)[^>]*>/gi, "\n");
t = t.replace(/<[^>]+>/g, "");
const ents = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&ldquo;": "“", "&rdquo;": "”", "&mdash;": "—", "&hellip;": "…", "&times;": "×" };
for (const [k, v] of Object.entries(ents)) t = t.split(k).join(v);
t = t.replace(/&#(\d+);/g, (m, d) => String.fromCharCode(Number(d)));
t = t.replace(/[ \t\u00a0]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
const out = process.argv[3] || file.replace(/\.html?$/i, ".txt");
fs.writeFileSync(out, t, "utf8");
console.log(out + "  " + t.length + " chars");
