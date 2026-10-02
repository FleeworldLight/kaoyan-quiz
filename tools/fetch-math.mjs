import fs from "node:fs";
import path from "node:path";

const REPO = process.env.KQ_REPO || "TsekaLuk/Kaoyan-Math1-Papers";
const BR = process.env.KQ_BRANCH || "main";
const CACHE = "tools/cache";
fs.mkdirSync(CACHE, { recursive: true });

const tree = JSON.parse(fs.readFileSync(path.join(CACHE, "tree.json"), "utf8"));
const blobs = tree.tree.filter((x) => x.type === "blob").map((x) => x.path);

// 只抓纯文本 md：真题 + 数学解析
const wanted = blobs.filter((p) => {
  if (!p.toLowerCase().endsWith(".md")) return false;
  if (p.startsWith("papers/images/")) return false;
  if (p.startsWith("solutions/英语一/")) return false; // 英语单独抓
  if (p === "papers/数学二/2024.md") return false; // 数学二，跳过
  return p.startsWith("papers/") || p.startsWith("solutions/");
});

console.log("to fetch:", wanted.length);

const raw = (p) => `https://raw.githubusercontent.com/${REPO}/${BR}/` + p.split("/").map(encodeURIComponent).join("/");

let ok = 0, fail = 0;
const queue = [...wanted];
const workers = Array.from({ length: 6 }, async () => {
  while (queue.length) {
    const p = queue.shift();
    const dest = path.join(CACHE, "math", p);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 200) { ok++; continue; }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(raw(p), { headers: { "User-Agent": "kaoyan-quiz-builder" } });
        if (!r.ok) throw new Error("HTTP " + r.status);
        const t = await r.text();
        if (t.length < 100) throw new Error("too small: " + t.slice(0, 80));
        fs.writeFileSync(dest, t, "utf8");
        ok++;
        break;
      } catch (e) {
        if (attempt === 2) { fail++; console.log("FAIL", p, e.message); }
        else await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
    }
  }
});
await Promise.all(workers);
console.log("done. ok:", ok, "fail:", fail);
