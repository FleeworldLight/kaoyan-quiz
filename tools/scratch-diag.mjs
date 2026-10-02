import fs from "node:fs";
const dir = "tools/cache/mock-xiao/nnd/raw/";
for (const id of process.argv.slice(2)) {
  const p = dir + id + ".html";
  if (!fs.existsSync(p)) {
    console.log(id, "MISSING raw");
    continue;
  }
  const h = fs.readFileSync(p, "utf8");
  const q = [...h.matchAll(/id="question(\d+)"/g)].map((m) => Number(m[1]));
  const title = ((h.match(/<title>\s*([\s\S]*?)\s*<\/title>/) || [])[1] || "").replace(/\s+/g, " ").trim();
  const ans = (h.match(/class="correct-answer"/g) || []).length;
  const art = [...new Set([...h.matchAll(/\/Practice\/article\/(\d+)\//g)].map((m) => Number(m[1])))];
  console.log(
    `${id}  qmarks=${q.length} range=${q.length ? q[0] + "-" + q[q.length - 1] : "-"}  ans=${ans}  articles=${art.length}  bytes=${h.length}`,
  );
  console.log(`      ${title}`);
  const missing = [];
  if (q.length) for (let i = q[0]; i <= q[q.length - 1]; i++) if (!q.includes(i)) missing.push(i);
  if (missing.length) console.log("      missing q nos: " + missing.join(","));
}
