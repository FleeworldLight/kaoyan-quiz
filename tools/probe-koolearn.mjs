/**
 * 抓取新东方在线（koolearn.com / xdf.cn）2025、2026 考研政治真题文字版页面，存到 tools/cache/koolearn/。
 * 用法: node tools/probe-koolearn.mjs
 */
import fs from "node:fs";
const OUT = "tools/cache/koolearn";
fs.mkdirSync(OUT, { recursive: true });

const PAGES = [
  ["2025-koolearn-full.html", "https://m.koolearn.com/kaoyan/20250103/1795512.html"],
  ["2025-xdf-full.html", "https://www.xdf.cn/621/202506/14473113.html"],
  ["2025-xdf-toutiao.html", "https://mtoutiao.xdf.cn/www/94/202506/14473135.html"],
  ["2026-koolearn-full.html", "https://m.koolearn.com/kaoyan/20251220/1915324.html"],
  ["2026-koolearn-ans.html", "https://m.koolearn.com/kaoyan/20251221/1915452.html"],
  ["2026-koolearn-ans2.html", "https://m.koolearn.com/kaoyan/20251220/1915030.html"],
  ["2026-koolearn-text.html", "https://m.koolearn.com/kaoyan/20251220/1915325.html"],
];

for (const [name, url] of PAGES) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 30000);
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }, signal: c.signal, redirect: "follow" });
    clearTimeout(t);
    const buf = Buffer.from(await r.arrayBuffer());
    if (r.status !== 200) { console.log(`${r.status} ${url}`); continue; }
    // 大概率是 GBK 或 UTF-8，两种都试
    let txt = buf.toString("utf8");
    const bad = (txt.match(/\uFFFD/g) || []).length;
    if (bad > 50) {
      try { txt = new TextDecoder("gbk").decode(buf); console.log("  (gbk decoded)"); } catch { /* keep utf8 */ }
    }
    fs.writeFileSync(`${OUT}/${name}`, txt, "utf8");
    const cjk = (txt.match(/[\u4e00-\u9fff]/g) || []).length;
    console.log(`${name}: len=${txt.length} cjk=${cjk}  <p>计数=${(txt.match(/<p[\s>]/g) || []).length}`);
  } catch (e) { clearTimeout(t); console.log(`ERR ${url} ${e.message}`); }
}
