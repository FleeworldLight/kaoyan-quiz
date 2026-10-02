/**
 * 下载 neville-studio/408-exam-paper 的 2024/2025 重构版真题 PDF 与答案 PDF。
 * 走 GitHub Git Blobs API（raw.githubusercontent.com 在本机网络不可达）。
 * 用法: node tools/fetch-neville-2425.mjs
 */
import fs from "node:fs";

const REPO = "neville-studio/408-exam-paper";
const BRANCH = "main";
const OUT = {
  "papers-rebuild/2024.pdf": "tools/cache/rebuild/2024.pdf",
  "papers-rebuild/2025.pdf": "tools/cache/rebuild/2025.pdf",
  "answers/2024-answer.pdf": "tools/cache/rebuild-ans/2024.pdf",
  "answers/2025-answer.pdf": "tools/cache/rebuild-ans/2025.pdf",
};

const cacheDir = "tools/cache";
for (const p of ["tools/cache/rebuild", "tools/cache/rebuild-ans"]) fs.mkdirSync(p, { recursive: true });

async function treeMap() {
  const u = `https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`;
  const r = await fetch(u, { headers: { "User-Agent": "dsh", Accept: "application/vnd.github+json" } });
  if (r.status !== 200) throw new Error("tree " + r.status);
  const j = await r.json();
  const m = new Map();
  for (const x of j.tree) if (x.type === "blob") m.set(x.path, x);
  return m;
}

async function blob(path, sha, size) {
  const u = `https://api.github.com/repos/${REPO}/git/blobs/${sha}`;
  const r = await fetch(u, { headers: { "User-Agent": "dsh", Accept: "application/vnd.github.raw" } });
  if (r.status !== 200) throw new Error(`blob ${path} ${r.status}`);
  const b = Buffer.from(await r.arrayBuffer());
  if (size && b.length !== size) throw new Error(`blob ${path} size mismatch ${b.length} != ${size}`);
  return b;
}

const tm = await treeMap();
const report = [];
for (const [repoPath, local] of Object.entries(OUT)) {
  const ent = tm.get(repoPath);
  if (!ent) { report.push(`${repoPath}: MISSING in tree`); continue; }
  try {
    const b = await blob(repoPath, ent.sha, ent.size);
    fs.writeFileSync(local, b);
    report.push(`${repoPath}: OK ${b.length} bytes -> ${local}`);
  } catch (e) {
    report.push(`${repoPath}: ERR ${e.message}`);
  }
}
console.log(report.join("\n"));
fs.writeFileSync(`${cacheDir}/fetch-2425-report.txt`, report.join("\n"), "utf8");
