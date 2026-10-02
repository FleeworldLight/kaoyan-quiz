import fs from "node:fs";
const p = "G:/期末及简历和别的项目/考研资料/kaoyan-quiz/tools/build-cs408.mjs";
let t = fs.readFileSync(p, "utf8");
const oldBlock = t.slice(t.indexOf("  // ---- 解析文本"), t.indexOf("const ANS_CFG = {"));
const newBlock = `  // ---- 解析文本：多来源取"有实质内容"最多者 ----
  const meaningful = (mp) => [...mp.values()].filter(v => typeof v === "string" && v.replace(/\\s/g, "").length >= 15).length;
  const stripExpl = (s) => s.trim().replace(/^[.．、]?\\s*[A-Da-d]?\\s*(?:【答案解析】|【解析】|答案解析|解析|考查)[:：]?\\s*/, "").trim();
  const explFromRegion = (tx, start) => {
    if (start < 0) return new Map();
    const segs = splitByMarkers(tx.slice(start), Array.from({ length: 40 }, (_, i) => i + 1), true);
    if (!segs) return new Map();
    const out = new Map();
    for (const [n, seg] of segs) { const s = stripExpl(seg); if (s.length > 5) out.set(n, s); }
    return out;
  };
  const headerStart = (tx) => {
    let start = -1;
    for (const k of ["（二）", "选择题解析", "单项选择题解析", "答案解析", "参考答案及解析", "真题答案解析", "答案及解析", "试题参考答案及解析"]) {
      const i = tx.lastIndexOf(k); if (i > start) start = i;
    }
    return start;
  };
  const markerStart = (tx) => {
    const m = tx.match(/\\d{1,2}\\s*[.．]\\s*(?:【答案解析】|【解析】|答案解析|解析[:：])/);
    return m ? m.index : -1;
  };
  const explSet = (tx, prefix) => [
    { tag: prefix + "E1-随答案块", map: explFromMap(tx, chosen.map) },
    { tag: prefix + "E3-解析区(标题)", map: explFromRegion(tx, headerStart(tx)) },
    { tag: prefix + "E5-解析区(标记)", map: explFromRegion(tx, markerStart(tx)) },
  ];
  let candidates = explSet(text, "");
  candidates.push({ tag: "E2-逐题首段", map: pq.expl });
  if (EXPL_OVERRIDE[year]) {
    try {
      const ot = norm(fs.readFileSync(\`\${CACHE}/\${EXPL_OVERRIDE[year]}\`, "utf8"));
      candidates = candidates.concat(explSet(ot, "O:" + EXPL_OVERRIDE[year] + " "));
    } catch (e) { /* ignore */ }
  }
  candidates.sort((a, b) => meaningful(b.map) - meaningful(a.map));
  const expl = candidates[0].map;
  return { letters: chosen.map, expl, mode: chosen.tag, explMode: candidates[0].tag, explCount: meaningful(expl), conflicts, stratSizes: strats.map(s => \`\${s.tag}=\${s.map.size}\`).join(" ") };
}
`;
t = t.replace(oldBlock, newBlock);
t = t.replace('  2010: ["qa-2010.txt", "本地 2010年计算机408真题及答案解析.pdf"],', '  2010: ["ans-2010.txt", "本地 2009-2023答案/2010答案.pdf"],');
fs.writeFileSync(p, t, "utf8");
console.log("patched expl block");
