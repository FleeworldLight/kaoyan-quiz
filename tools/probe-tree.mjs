const repos = ["neville-studio/408-exam-paper","yy11111111111111111111/kaoyan-politics"];
for (const r of repos) {
  for (const br of ["main","master"]) {
    const u = `https://api.github.com/repos/${r}/git/trees/${br}?recursive=1`;
    try {
      const c = new AbortController(); const t = setTimeout(()=>c.abort(), 30000);
      const res = await fetch(u, { headers: { "User-Agent": "dsh", Accept: "application/vnd.github+json" }, signal: c.signal });
      clearTimeout(t);
      console.log("=== " + r + "@" + br + " -> " + res.status);
      if (res.status !== 200) { console.log((await res.text()).slice(0,200)); continue; }
      const j = await res.json();
      for (const x of j.tree) if (x.type === "blob") console.log(String(x.size).padStart(9), x.path);
    } catch(e) { console.log("ERR", r, br, e.message); }
  }
}
