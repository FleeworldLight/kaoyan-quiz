import fs from "node:fs";
const out = "<项目根目录>/tools/cache/neville-ans";
fs.mkdirSync(out, { recursive: true });
async function dl(url, dest, tries=3) {
  for (let a=0;a<tries;a++) {
    try { const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (r.status!==200) return null;
      const b = Buffer.from(await r.arrayBuffer()); fs.writeFileSync(dest,b); return b.length;
    } catch(e){ if(a===tries-1) return null; await new Promise(r=>setTimeout(r,1200)); }
  }
}
for (const y of [2009,2010,2011,2013,2014]) {
  const d = `${out}/${y}.pdf`;
  if (fs.existsSync(d) && fs.statSync(d).size > 50000) { console.log(y,"cached",fs.statSync(d).size); continue; }
  console.log(y, await dl(`https://raw.githubusercontent.com/neville-studio/408-exam-paper/main/answers/${y}-answer.pdf`, d));
}
