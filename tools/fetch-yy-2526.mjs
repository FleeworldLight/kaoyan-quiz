/**
 * 下载 yy11111111111111111111/kaoyan-politics 的 2025 / 2026 真题 md（raw.githubusercontent 在本机不可达，走 Git Blobs API）。
 * 用法: node tools/fetch-yy-2526.mjs
 */
import fs from "node:fs";

const REPO = "yy11111111111111111111/kaoyan-politics";
const OUT = "tools/cache/yy";
fs.mkdirSync(OUT, { recursive: true });
const WANT = ["2025年考研政治真题.md", "2026年考研政治真题.md"];

async function get(url, accept) {
  for (let i = 0; i < 6; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "dsh", Accept: accept } });
      if (r.status === 200) return await r.arrayBuffer();
      if (r.status === 404) return null;
      const body = await r.text();
      console.log(`  retry ${r.status} ${url} ${body.slice(0, 90)}`);
      if (r.status === 403 && /rate limit/i.test(body)) await new Promise((s) => setTimeout(s, 45000));
    } catch (e) { console.log("  retry", e.message); }
    await new Promise((s) => setTimeout(s, 2500 * (i + 1)));
  }
  return null;
}

const tb = await get(`https://api.github.com/repos/${REPO}/git/trees/main?recursive=1`, "application/vnd.github+json");
if (!tb) throw new Error("无法获取仓库树");
const tree = JSON.parse(Buffer.from(tb).toString("utf8")).tree.filter((x) => x.type === "blob");
console.log("仓库文件数:", tree.length);
for (const f of tree) console.log(`  ${String(f.size).padStart(7)}  ${f.path}`);

for (const name of WANT) {
  const ent = tree.find((x) => x.path === name);
  if (!ent) { console.log(`${name}: 仓库中不存在`); continue; }
  const b = await get(`https://api.github.com/repos/${REPO}/git/blobs/${ent.sha}`, "application/vnd.github.raw");
  if (!b) { console.log(`${name}: 下载失败`); continue; }
  const buf = Buffer.from(b);
  const year = name.slice(0, 4);
  fs.writeFileSync(`${OUT}/${year}.md`, buf);
  const txt = buf.toString("utf8");
  const cjk = (txt.match(/[\u4e00-\u9fff]/g) || []).length;
  console.log(`${name} -> ${OUT}/${year}.md  ${buf.length}B cjk=${cjk}  含【答案】=${txt.includes("【答案】")}`);
}
