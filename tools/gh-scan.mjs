const repos = [
  "neville-studio/408-exam-paper",
  "JDC2001/408",
  "CheapMeow/CS408",
  "suhan42/cs-408",
];
for (const r of repos) {
  for (const br of ["main","master"]) {
    try {
      const res = await fetch(`https://api.github.com/repos/${r}/git/trees/${br}?recursive=1`, { headers: { "User-Agent": "dsh", "Accept": "application/vnd.github+json" } });
      if (res.status !== 200) { console.log(r, br, res.status); continue; }
      const j = await res.json();
      console.log("=== ", r, br, "files:", (j.tree||[]).length);
      for (const t of (j.tree||[]).slice(0, 200)) console.log("   ", t.path, t.size ?? "");
      break;
    } catch(e) { console.log(r, br, "ERR", e.message); }
  }
}
