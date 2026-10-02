import fs from "node:fs";
import path from "node:path";

const REPO = "TsekaLuk/Kaoyan-Math1-Papers";
const BR = "main";
const tree = JSON.parse(fs.readFileSync("tools/cache/tree.json", "utf8"));
const byName = new Map();
for (const b of tree.tree) if (b.type === "blob" && /\.(jpg|jpeg|png|gif)$/i.test(b.path)) {
  const n = b.path.split("/").pop();
  if (!byName.has(n)) byName.set(n, b.path);
}
console.log("repo images indexed:", byName.size);

const dirs = fs.readdirSync("public/data").filter((d) => fs.statSync(path.join("public/data", d)).isDirectory());
const jobs = [];
for (const sub of dirs) {
  const sd = path.join("public/data", sub);
  for (const f of fs.readdirSync(sd)) {
    if (!f.endsWith(".json")) continue;
    const doc = JSON.parse(fs.readFileSync(path.join(sd, f), "utf8"));
    const secs = doc.sections || [];
    for (const s of secs) for (const q of s.questions || []) for (const img of q.images || []) jobs.push({ sub, img });
  }
}
const uniq = [...new Map(jobs.map((j) => [j.sub + "/" + j.img, j])).values()];
console.log("referenced images:", jobs.length, "unique:", uniq.length);

let ok = 0, miss = 0, fail = 0;
const queue = [...uniq];
await Promise.all(Array.from({ length: 8 }, async () => {
  while (queue.length) {
    const j = queue.shift();
    const dest = path.join("public/data", j.sub, "images", j.img);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 100) { ok++; continue; }
    const p = byName.get(j.img);
    if (!p) { miss++; continue; }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const url = `https://raw.githubusercontent.com/${REPO}/${BR}/` + p.split("/").map(encodeURIComponent).join("/");
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error("HTTP " + r.status);
      fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
      ok++;
    } catch (e) { fail++; console.log("FAIL", j.img, e.message); }
  }
}));
console.log("downloaded:", ok, "not-in-repo:", miss, "failed:", fail);
