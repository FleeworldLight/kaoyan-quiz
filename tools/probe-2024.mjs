const repos = ["neville-studio/408-exam-paper","yy11111111111111111111/kaoyan-politics"];
for (const r of repos) {
  const u = `https://api.github.com/repos/${r}/git/trees/main?recursive=1`;
  try {
    const res = await fetch(u, { headers: { "User-Agent": "dsh", Accept: "application/vnd.github+json" } });
    console.log("=== " + r + " -> " + res.status);
    if (res.status !== 200) { console.log((await res.text()).slice(0,300)); continue; }
    const j = await res.json();
    for (const t of j.tree) console.log(t.type, t.size ?? "", t.path);
  } catch (e) { console.log(r, "ERR", e.message); }
}
