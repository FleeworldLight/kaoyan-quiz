import fs from "node:fs";
import path from "node:path";
const REPO = "TsekaLuk/Kaoyan-Math1-Papers", BR = "main";
const tree = JSON.parse(fs.readFileSync("tools/cache/tree.json", "utf8"));
const want = tree.tree.filter((x) => x.type === "blob" && x.path.startsWith("solutions/英语一/") && x.path.endsWith(".md") && !x.path.includes("images/"));
console.log(want.map((w) => `${w.size}\t${w.path}`).join("\n"));
const CACHE = "tools/cache/english";
let ok = 0;
for (const w of want) {
  const dest = path.join(CACHE, w.path);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const url = `https://raw.githubusercontent.com/${REPO}/${BR}/` + w.path.split("/").map(encodeURIComponent).join("/");
  const r = await fetch(url);
  if (r.ok) { fs.writeFileSync(dest, await r.text(), "utf8"); ok++; } else console.log("FAIL", w.path, r.status);
}
console.log("downloaded", ok);
