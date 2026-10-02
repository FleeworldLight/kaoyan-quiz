/**
 * 抓取 2025 / 2026 政治的其它候选来源（用于交叉验证），存 tools/cache/koolearn/ 外的 tools/cache/politics-src2/。
 * 用法: node tools/fetch-politics-src2.mjs
 */
import fs from "node:fs";
const OUT = "tools/cache/politics-src2";
fs.mkdirSync(OUT, { recursive: true });

const PAGES = [
  ["2025-wsyu.html", "https://szkb.wsyu.edu.cn/2025/0107/c882a40588/page.htm"],
  ["2025-shzu.html", "https://eol.shzu.edu.cn/meol/data/convert/2025/2/18/328e86b3-a3f2-4ab7-9ed9-d2bdc6360847_4216790.html"],
  ["2025-xaiu-ans.pdf", "http://edu.xaiu.edu.cn/__local/F/70/01/50746677F11FF187B5D43B0E760_18751FEC_70206.pdf"],
  ["2026-koolearn-pdf-page.html", "https://kaoyan.koolearn.com/20251220/1915324.html"],
];

for (const [name, url] of PAGES) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 40000);
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        Accept: "*/*",
        Referer: new URL(url).origin + "/",
      },
      signal: c.signal, redirect: "follow",
    });
    clearTimeout(t);
    const buf = Buffer.from(await r.arrayBuffer());
    console.log(`${r.status} ${name} ${buf.length}B  ${url}`);
    if (r.status !== 200) continue;
    if (name.endsWith(".pdf")) { fs.writeFileSync(`${OUT}/${name}`, buf); continue; }
    let txt = buf.toString("utf8");
    if ((txt.match(/\uFFFD/g) || []).length > 50) { try { txt = new TextDecoder("gbk").decode(buf); } catch {} }
    fs.writeFileSync(`${OUT}/${name}`, txt, "utf8");
    const body = txt.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ");
    const plain = body.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ");
    console.log(`    textCJK=${(plain.match(/[\u4e00-\u9fff]/g) || []).length}`);
  } catch (e) { clearTimeout(t); console.log(`ERR ${name} ${e.message}`); }
}
