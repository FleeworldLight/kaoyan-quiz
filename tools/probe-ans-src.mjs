import fs from "node:fs";
for (const y of [2024,2025]) {
  const t = fs.readFileSync(`tools/cache/rebuild-${y}.txt`, "utf8");
  console.log(`=== rebuild-${y}: 参考答案? ${t.includes("参考答案")} 答案解析? ${t.includes("答案解析")} SINGLE? ${t.includes("一、")} ESSAY? ${t.includes("二、")}`);
  console.log("  tail: " + t.slice(-300).replace(/\s+/g," "));
}
const repos = ["JDC2001/408","suhan42/cs-408"];
for (const r of repos) {
  for (const br of ["main","master"]) {
    try {
      const res = await fetch(`https://api.github.com/repos/${r}/git/trees/${br}?recursive=1`, { headers: { "User-Agent":"dsh", Accept:"application/vnd.github+json" }});
      console.log(`=== ${r}@${br} -> ${res.status}`);
      if (res.status !== 200) { console.log((await res.text()).slice(0,120)); continue; }
      const j = await res.json();
      for (const x of j.tree) if (x.type==="blob") console.log(String(x.size).padStart(9), x.path);
    } catch(e){ console.log("ERR", r, br, e.message); }
  }
}
