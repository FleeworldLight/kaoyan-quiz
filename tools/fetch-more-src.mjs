/**
 * 探查/下载更多 408 2024-2025 答案来源。
 * 用法: node tools/fetch-more-src.mjs
 */
import fs from "node:fs";

const CACHE = "tools/cache/alt";
fs.mkdirSync(CACHE, { recursive: true });

async function get(url, accept) {
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "dsh", Accept: accept } });
      if (r.status === 200) return await r.arrayBuffer();
      if (r.status === 404) return null;
      console.log("  retry", r.status, url);
    } catch (e) { console.log("  retry", e.message, url); }
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  return null;
}
async function tree(repo, br) {
  const b = await get(`https://api.github.com/repos/${repo}/git/trees/${br}?recursive=1`, "application/vnd.github+json");
  if (!b) return null;
  const j = JSON.parse(Buffer.from(b).toString("utf8"));
  return j.tree.filter((x) => x.type === "blob");
}
async function blob(repo, sha) {
  const b = await get(`https://api.github.com/repos/${repo}/git/blobs/${sha}`, "application/vnd.github.raw");
  return b ? Buffer.from(b) : null;
}

// 1) dyuebug/csgraduates —— 找 408 quiz 内容
for (const br of ["main", "master"]) {
  const t = await tree("dyuebug/csgraduates", br);
  if (!t) { console.log("csgraduates/" + br + " not found"); continue; }
  console.log(`=== csgraduates@${br} blobs=${t.length}`);
  for (const x of t) if (/408|quiz/i.test(x.path)) console.log(String(x.size).padStart(9), x.path);
  const want = t.filter((x) => /408quiz/.test(x.path));
  for (const x of want) {
    const b = await blob("dyuebug/csgraduates", x.sha);
    if (!b) continue;
    const local = "csgrad-" + x.path.replace(/[\\/]/g, "__");
    fs.writeFileSync(`${CACHE}/${local}`, b);
    console.log("  saved", local, b.length);
  }
  break;
}

// 2) kxmzyc 的 2024 回忆版 PDF
{
  const t = await tree("kxmzyc/cs408-exam-analysis", "main");
  const pdf = t && t.find((x) => x.path.startsWith("2024年408"));
  if (pdf) {
    const b = await blob("kxmzyc/cs408-exam-analysis", pdf.sha);
    fs.writeFileSync(`${CACHE}/xmzyc-2024-paper.pdf`, b);
    console.log("saved xmzyc-2024-paper.pdf", b.length);
  } else console.log("2024 pdf not found");
}
