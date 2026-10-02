/**
 * 下载 yy11111111111111111111/kaoyan-politics 的 2025 / 2026 真题 md。
 * GitHub REST API 触发未认证限流后，改用 jsDelivr CDN（主）/ raw.githubusercontent（备）。
 * 用法: node tools/fetch-yy-2526.mjs
 */
import fs from "node:fs";

const REPO = "yy11111111111111111111/kaoyan-politics";
const OUT = "tools/cache/yy";
fs.mkdirSync(OUT, { recursive: true });
const WANT = ["2025年考研政治真题.md", "2026年考研政治真题.md"];

async function fetchText(url, timeoutMs = 30000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: c.signal, redirect: "follow" });
    if (r.status !== 200) return { status: r.status };
    return { status: 200, buf: Buffer.from(await r.arrayBuffer()) };
  } catch (e) { return { status: 0, err: e.message }; }
  finally { clearTimeout(t); }
}

for (const name of WANT) {
  const e = encodeURI(name);
  const candidates = [
    `https://cdn.jsdelivr.net/gh/${REPO}@main/${e}`,
    `https://raw.githubusercontent.com/${REPO}/main/${e}`,
    `https://github.com/${REPO}/raw/main/${e}`,
  ];
  let buf = null;
  for (const u of candidates) {
    const r = await fetchText(u);
    if (r.status === 200 && r.buf) { buf = r.buf; console.log(`OK ${u}`); break; }
    console.log(`  fail ${r.status} ${r.err || ""} ${u}`);
  }
  if (!buf) { console.log(`${name}: 下载失败`); continue; }
  const year = name.slice(0, 4);
  fs.writeFileSync(`${OUT}/${year}.md`, buf);
  const txt = buf.toString("utf8");
  const cjk = (txt.match(/[\u4e00-\u9fff]/g) || []).length;
  console.log(`${name} -> ${OUT}/${year}.md  ${buf.length}B cjk=${cjk}  含【答案】=${txt.includes("【答案】")} 含【答案要点】=${txt.includes("【答案要点】")}`);
}
