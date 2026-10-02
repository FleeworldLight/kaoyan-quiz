import fs from "node:fs";
import path from "node:path";
const REPO = "TsekaLuk/Kaoyan-Math1-Papers";
const BR = "main";
const OUT = "tools/cache";
fs.mkdirSync(OUT, { recursive: true });
const r = await fetch(`https://api.github.com/repos/${REPO}/git/trees/${BR}?recursive=1`, {
  headers: { "User-Agent": "kaoyan-quiz-builder", Accept: "application/vnd.github+json" },
});
const data = await r.json();
fs.writeFileSync(path.join(OUT, "tree.json"), JSON.stringify(data, null, 0));
console.log("tree entries:", data.tree.length, "truncated:", data.truncated);

const blobs = data.tree.filter((x) => x.type === "blob");
const md = blobs.filter((x) => x.path.toLowerCase().endsWith(".md"));
console.log("total blobs:", blobs.length, "md:", md.length);
console.log("\n--- md files NOT under images/ ---");
for (const m of md) console.log(`  ${String(m.size).padStart(9)}  ${m.path}`);

const top = new Map();
for (const b of blobs) {
  const seg = b.path.split("/");
  const key = seg.length > 2 ? seg.slice(0, 2).join("/") + "/..." : b.path;
  top.set(key, (top.get(key) || 0) + 1);
}
console.log("\n--- blob grouping ---");
for (const [k, v] of [...top.entries()].sort()) console.log(`  ${String(v).padStart(5)}  ${k}`);
