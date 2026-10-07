import fs from "node:fs";
const outDir = "<项目根目录>/tools/cache/rebuild";
fs.mkdirSync(outDir, { recursive: true });
for (const y of [2016,2017,2018,2019,2020,2021,2022,2023]) {
  const u = `https://raw.githubusercontent.com/neville-studio/408-exam-paper/main/papers-rebuild/${y}.pdf`;
  try {
    const r = await fetch(u, { headers: { "User-Agent": "dsh" } });
    if (r.status !== 200) { console.log(y, r.status); continue; }
    const b = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(`${outDir}/${y}.pdf`, b);
    console.log(y, "bytes", b.length);
  } catch(e){ console.log(y, "ERR", e.message); }
}
