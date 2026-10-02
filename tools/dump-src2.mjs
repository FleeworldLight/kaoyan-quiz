import fs from "node:fs";
const DIR = "tools/cache/politics-src2";
const files = process.argv.slice(2).length ? process.argv.slice(2) : ["2025-wsyu.html", "2025-shzu.html"];

function toText(h) {
  return h.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&ldquo;/g, "\u201c").replace(/&rdquo;/g, "\u201d")
    .replace(/&#xa0;|&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&hellip;/g, "\u2026")
    .replace(/[ \t\u3000]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

if (process.env.ANALYZE) {
  for (const f of files) {
    const t = toText(fs.readFileSync(`${DIR}/${f}`, "utf8"));
    const has = (s) => (t.includes(s) ? "有" : "无");
    console.log(`${f}: 分析题=${has("分析题")} 材料分析=${has("材料分析")} 【参考答案】=${(t.match(/【参考答案】/g) || []).length} 【答案】=${(t.match(/【答案】/g) || []).length} 【解析】=${(t.match(/【解析】/g) || []).length}`);
    for (const n of [33, 34, 35, 36, 37, 38]) {
      const re = new RegExp(`(?:^|\\n)\\s*${n}\\s*[.．、]`, "m");
      console.log(`   ${n}题标记=${re.test(t) ? "有" : "无"}`);
    }
    const i = t.indexOf("分析题");
    if (i >= 0) console.log("   分析题附近: " + JSON.stringify(t.slice(Math.max(0, i - 120), i + 700)));
    console.log("   尾部: " + JSON.stringify(t.slice(-700)));
  }
} else {
  for (const f of files) {
    const text = toText(fs.readFileSync(`${DIR}/${f}`, "utf8"));
    console.log(`================= ${f} len=${text.length}`);
    console.log(text.slice(0, Number(process.env.N || 2500)));
  }
}

