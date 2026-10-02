import fs from "node:fs";
const ALT = "tools/cache/alt";
const want = { 2024: [43], 2025: [45, 41] };
for (const y of Object.keys(want).map(Number)) {
  const t = fs.readFileSync(`${ALT}/csgrad-study_methods__408quiz__${y}__content.md`, "utf8");
  const blocks = t.split(/\n(?=#####\s*\d{1,3}\s*$)/m);
  for (const b of blocks) {
    const h = b.match(/^#####\s*(\d{1,3})\s*$/m);
    if (!h) continue;
    const n = Number(h[1]);
    if (!want[y].includes(n)) continue;
    console.log(`\n=============== ${y} q${n} ===============`);
    b.split("\n").forEach((L, i) => { if (i < 40) console.log(String(i).padStart(3) + "| " + L.slice(0, 150)); });
  }
}
