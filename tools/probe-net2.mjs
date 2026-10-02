const base = "yy11111111111111111111/kaoyan-politics";
const p = "2025年考研政治真题.md";
const e = encodeURI(p);
const urls = [
  `https://cdn.jsdelivr.net/gh/${base}@main/${e}`,
  `https://fastly.jsdelivr.net/gh/${base}@main/${e}`,
  `https://raw.githack.com/${base}/main/${e}`,
  `https://github.com/${base}/raw/main/${e}`,
  `https://gitcdn.link/repo/${base}/main/${e}`,
  `https://raw.githubusercontent.com/${base}/main/${e}`,
  `https://ghproxy.net/https://raw.githubusercontent.com/${base}/main/${e}`,
  `https://gh-proxy.com/https://raw.githubusercontent.com/${base}/main/${e}`,
  `https://api.github.com/repos/${base}/contents/${e}`,
];
for (const u of urls) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 18000);
  try {
    const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" }, signal: c.signal, redirect: "follow" });
    clearTimeout(t);
    const b = Buffer.from(await r.arrayBuffer());
    const txt = b.toString("utf8");
    console.log(`${r.status} len=${b.length} cjk=${(txt.match(/[\u4e00-\u9fff]/g) || []).length}  ${u}`);
  } catch (err) { clearTimeout(t); console.log(`ERR ${err.message}  ${u}`); }
}
