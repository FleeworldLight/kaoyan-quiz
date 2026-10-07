import fs from "node:fs";
const out = "<项目根目录>/tools/cache/rebuild-ans";
fs.mkdirSync(out, { recursive: true });
async function dl(url, dest, tries=3) {
  for (let a=0;a<tries;a++) {
    try { const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (r.status!==200){console.log("status",r.status,url);return null;}
      const b = Buffer.from(await r.arrayBuffer()); fs.writeFileSync(dest,b); return b.length;
    } catch(e){ if(a===tries-1){console.log("ERR",e.message);return null;} await new Promise(r=>setTimeout(r,1200)); }
  }
}
console.log("jdc2021", await dl("https://raw.githubusercontent.com/JDC2001/408/main/%E7%AD%94%E6%A1%88/2021%E7%AD%94%E6%A1%88.pdf", `${out}/jdc-2021.pdf`));
