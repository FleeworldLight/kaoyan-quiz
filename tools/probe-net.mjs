const urls = [
 "https://api.github.com/repos/neville-studio/408-exam-paper",
 "https://raw.githubusercontent.com/neville-studio/408-exam-paper/main/papers-rebuild/2023.pdf",
 "https://github.com/neville-studio/408-exam-paper",
 "https://codeload.github.com/neville-studio/408-exam-paper/zip/refs/heads/main"
];
for (const u of urls) {
  try {
    const c = new AbortController(); const t = setTimeout(()=>c.abort(), 25000);
    const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" }, signal: c.signal });
    clearTimeout(t);
    const b = Buffer.from(await r.arrayBuffer());
    console.log(r.status, b.length, u);
  } catch(e) { console.log("ERR", e.message, e.cause && e.cause.message, u); }
}
