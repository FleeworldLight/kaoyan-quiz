import fs from "node:fs";
const p = "<项目根目录>/tools/build-cs408.mjs";
let t = fs.readFileSync(p, "utf8");
// add E6 parser-marker extractor + cleanup
t = t.replace(`  const explSet = (tx, prefix) => [
    { tag: prefix + "E1-随答案块", map: explFromMap(tx, chosen.map) },
    { tag: prefix + "E3-解析区(标题)", map: explFromRegion(tx, headerStart(tx)) },
    { tag: prefix + "E5-解析区(标记)", map: explFromRegion(tx, markerStart(tx)) },
  ];`, `  const explByParserMarker = (tx) => {
    const re = /(\\d{1,2})\\s*[.．]\\s*(?:【答案解析】|【解析】|答案解析|解析)[:：]?/g;
    let m; const arr = [];
    while ((m = re.exec(tx))) { const n = Number(m[1]); if (n >= 1 && n <= 40) arr.push({ n, start: m.index, end: m.index + m[0].length }); }
    const out = new Map();
    for (let i = 0; i < arr.length; i++) {
      const e = arr[i + 1] ? arr[i + 1].start : tx.length;
      const s = tx.slice(arr[i].end, e).trim();
      if (s.length > 5 && !out.has(arr[i].n)) out.set(arr[i].n, s);
    }
    return out;
  };
  const explSet = (tx, prefix) => [
    { tag: prefix + "E1-随答案块", map: explFromMap(tx, chosen.map) },
    { tag: prefix + "E3-解析区(标题)", map: explFromRegion(tx, headerStart(tx)) },
    { tag: prefix + "E5-解析区(标记)", map: explFromRegion(tx, markerStart(tx)) },
    { tag: prefix + "E6-解析标记", map: explByParserMarker(tx) },
  ];`);
// cleanup helper + apply
t = t.replace(`  candidates.sort((a, b) => meaningful(b.map) - meaningful(a.map));
  const expl = candidates[0].map;`, `  candidates.sort((a, b) => meaningful(b.map) - meaningful(a.map));
  const cleanup = (s) => s.replace(/(?:\\d{1,2}\\s*[.．]\\s*){2,}/g, " ").replace(/\\s{2,}/g, " ").trim();
  const expl = new Map([...candidates[0].map.entries()].map(([k, v]) => [k, cleanup(v)]));`);
fs.writeFileSync(p, t, "utf8");
console.log("patched E6 + cleanup");
