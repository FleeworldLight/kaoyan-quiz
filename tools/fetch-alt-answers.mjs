/**
 * 下载 408 2024/2025 的备选答案来源（neville 官方 answers PDF 是扫描件，无文本层）。
 *   A) kaichan-kc/408-questions      —— 结构化题库 JSON（含答案/解析）
 *   B) kxmzyc/cs408-exam-analysis    —— 2024/2025 大题逐题解析 md（第二来源）
 * 全部走 GitHub Git Blobs API。用法: node tools/fetch-alt-answers.mjs
 */
import fs from "node:fs";

const CACHE = "tools/cache/alt";
fs.mkdirSync(CACHE, { recursive: true });

const JOBS = [
  ["kaichan-kc/408-questions", "main", "README.md", "kaichan-README.md"],
  ["kaichan-kc/408-questions", "main", "scrape_408.py", "kaichan-scrape.py"],
  ["kaichan-kc/408-questions", "main", "408_questions_by_year/2024.json", "kaichan-2024-byyear.json"],
  ["kaichan-kc/408-questions", "main", "408_questions_by_year/2025.json", "kaichan-2025-byyear.json"],
  ["kaichan-kc/408-questions", "main", "408_questions_full/2024.json", "kaichan-2024-full.json"],
  ["kaichan-kc/408-questions", "main", "408_questions_full/2025.json", "kaichan-2025-full.json"],
  ["kxmzyc/cs408-exam-analysis", "main", "2024年大题逐题解析.md", "xmzyc-2024-essay.md"],
  ["kxmzyc/cs408-exam-analysis", "main", "2025年大题逐题解析.md", "xmzyc-2025-essay.md"],
  ["kxmzyc/cs408-exam-analysis", "main", "README.md", "xmzyc-README.md"],
];

const trees = new Map();
async function tree(repo, br) {
  const k = repo + "@" + br;
  if (trees.has(k)) return trees.get(k);
  const r = await fetch(`https://api.github.com/repos/${repo}/git/trees/${br}?recursive=1`, { headers: { "User-Agent": "dsh", Accept: "application/vnd.github+json" } });
  if (r.status !== 200) throw new Error("tree " + repo + " " + r.status);
  const j = await r.json();
  const m = new Map();
  for (const x of j.tree) if (x.type === "blob") m.set(x.path, x);
  trees.set(k, m);
  return m;
}

const rep = [];
for (const [repo, br, p, local] of JOBS) {
  try {
    const m = await tree(repo, br);
    const ent = m.get(p);
    if (!ent) { rep.push(`MISSING ${repo}/${p}`); continue; }
    const r = await fetch(`https://api.github.com/repos/${repo}/git/blobs/${ent.sha}`, { headers: { "User-Agent": "dsh", Accept: "application/vnd.github.raw" } });
    if (r.status !== 200) { rep.push(`ERR ${repo}/${p} ${r.status}`); continue; }
    const b = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(`${CACHE}/${local}`, b);
    rep.push(`OK ${repo}/${p} ${b.length}B -> ${local}`);
  } catch (e) { rep.push(`ERR ${repo}/${p} ${e.message}`); }
}
console.log(rep.join("\n"));
fs.writeFileSync(`${CACHE}/fetch-report.txt`, rep.join("\n"), "utf8");
