import fs from "node:fs";
const parse = (p) => {
  const m = new Map();
  for (const l of fs.readFileSync(p, "utf8").split("\n")) {
    const g = l.match(/^(\d{4}) {2}q\s*(\d+) {2}(\S+\.png)\s+p\s*(\d+) {2}(.*)$/);
    if (!g) continue;
    m.set(g[3], { year: g[1], no: +g[2], page: +g[4], rule: g[5] });
  }
  return m;
};
const a = parse(process.argv[2]), b = parse(process.argv[3]);
console.log("files", a.size, b.size);
for (const [f, v] of b) {
  const o = a.get(f);
  if (!o) console.log("NEW   ", f, JSON.stringify(v).slice(0, 90));
  else if (o.no !== v.no) console.log("CHANGE", f, `q${o.no} -> q${v.no}`, "|", o.rule.slice(0, 28), "->", v.rule.slice(0, 28));
}
for (const [f, v] of a) if (!b.has(f)) console.log("GONE  ", f, v.no);
