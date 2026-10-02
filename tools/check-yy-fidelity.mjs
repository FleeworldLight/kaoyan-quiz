/**
 * 核查 yy11111111111111111111/kaoyan-politics 各年份的「真题保真度」。
 * 方法：把 yy 的选项文本与独立数据集 mrwoov/kyzz 的选项文本做内容级对齐（不依赖字母），
 *       统计「内容对齐率」。真实真题应与 kyzz 高度一致；重建/AI 改写的题会大面积不匹配。
 * 用法: node tools/check-yy-fidelity.mjs
 */
import { parseYY, parseKyzz } from "./politics-parse.mjs";

function sim(a, b) {
  a = String(a || "").replace(/[\s\u3000]/g, ""); b = String(b || "").replace(/[\s\u3000]/g, "");
  if (!a || !b) return 0;
  if (a.length >= 3 && b.includes(a)) return Math.min(1, a.length / b.length + 0.25);
  if (b.length >= 3 && a.includes(b)) return Math.min(1, b.length / a.length + 0.25);
  const g = (s) => new Set(Array.from({ length: Math.max(0, s.length - 1) }, (_, i) => s.slice(i, i + 2)));
  const A = g(a), B = g(b);
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const x of A) if (B.has(x)) inter++;
  return (inter / A.size) * (a.length / b.length);
}

console.log("年份 | yy与kyzz逐题最高选项相似度均值 | 完全对得上(≥0.75)的题数 | 各题干相似度均值");
for (const year of [2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024]) {
  let yy, kz;
  try { yy = parseYY(year); } catch (e) { console.log(`${year}: 无 yy 源`); continue; }
  try { kz = parseKyzz(year); } catch (e) { console.log(`${year}: 无 kyzz 源`); continue; }
  const kzMap = new Map(kz.map((k) => [k.no, k]));
  const perQ = [];
  const stemSim = [];
  for (const q of yy.questions) {
    if (q.type === "essay") continue;
    const k = kzMap.get(q.no);
    if (!k) continue;
    // 每个 yy 选项在 kyzz 选项里找最相似的
    const bests = q.options.map((o) => {
      let best = 0;
      for (const d of k.options) best = Math.max(best, sim(o.text, d.text));
      return best;
    });
    const avg = bests.length ? bests.reduce((a, b) => a + b, 0) / bests.length : 0;
    perQ.push(avg);
    let bs = 0; for (const d of k.options) bs = Math.max(bs, sim(q.stem, d.text));
    stemSim.push(Math.max(bs, sim(q.stem, k.stem)));
  }
  const mean = perQ.length ? perQ.reduce((a, b) => a + b, 0) / perQ.length : 0;
  const ok = perQ.filter((x) => x >= 0.75).length;
  const sm = stemSim.length ? stemSim.reduce((a, b) => a + b, 0) / stemSim.length : 0;
  console.log(`${year} | ${mean.toFixed(3)} | ${ok}/${perQ.length} | ${sm.toFixed(3)}`);
}
