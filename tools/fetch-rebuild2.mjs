import fs from "node:fs";
const outDir = "<项目根目录>/tools/cache/rebuild";
fs.mkdirSync(outDir, { recursive: true });
async function dl(url, dest, tries=4) {
  for (let a=0;a<tries;a++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 dsh" } });
      if (r.status !== 200) { console.log("status", r.status, url); return false; }
      const b = Buffer.from(await r.arrayBuffer());
      fs.writeFileSync(dest, b);
      return b.length;
    } catch(e) { if (a===tries-1) { console.log("ERR", url, e.message); return false; } await new Promise(r=>setTimeout(r,1500)); }
  }
}
for (const y of [2009,2010,2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023]) {
  const dest = `${outDir}/${y}.pdf`;
  if (fs.existsSync(dest) && fs.statSync(dest).size > 100000) { console.log(y, "cached", fs.statSync(dest).size); continue; }
  const n = await dl(`https://raw.githubusercontent.com/neville-studio/408-exam-paper/main/papers-rebuild/${y}.pdf`, dest);
  console.log(y, n);
}
console.log("--- answers ---");
const aDir = "<项目根目录>/tools/cache/rebuild-ans";
fs.mkdirSync(aDir, { recursive: true });
for (const y of [2021]) {
  const dest = `${aDir}/${y}.pdf`;
  if (fs.existsSync(dest) && fs.statSync(dest).size > 100000) { console.log(y, "cached"); continue; }
  console.log(y, await dl(`https://raw.githubusercontent.com/neville-studio/408-exam-paper/main/answers/${y}-answer.pdf`, dest));
}
