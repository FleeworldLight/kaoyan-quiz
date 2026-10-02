/**
 * 解析 2022 年数学（一）解析文件（该文件自带题目 + 答案 + 详解）。
 * 该文件的特殊之处：题号偶有丢失、答案写作「答案 X.」、解释里夹带【例】、
 * 解答题没有独立答案行（解就是答案）。因此单独处理。
 * 输出 public/data/math1/2022.json
 */
import fs from "node:fs";
import path from "node:path";

const SRC = "tools/cache/math/solutions/2022年解析/2022年解析.md";
const OUT = "public/data/math1/2022.json";

const OPT_RES = [
  /^\s*[（(]\s*\\mathrm\s*\{\s*([A-D])\s*\}\s*[)）]/,
  /^\s*\$\s*\\mathrm\s*\{\s*\(\s*([A-D])\s*\)\s*\}/,
  /^\s*\$\s*\\left\s*\(\s*\\mathrm\s*\{\s*([A-D])\s*\}\s*\\right\s*\)/,
  /^\s*\$\s*\(\s*\\mathrm\s*\{\s*([A-D])\s*\}\s*\)/,
  /^\s*[（(]\s*([A-D])\s*[)）]/,
  /^\s*\\mathrm\s*\{\s*([A-D])\s*\}\s*[.．]/,
  /^\s*([A-D])\s*[.．、]/,
];
const optKey = (l) => { for (const re of OPT_RES) { const m = l.match(re); if (m) return m[1]; } return null; };
function stripOpt(line, key) {
  for (const re of OPT_RES) {
    const m = line.match(re);
    if (!m || m[1] !== key) continue;
    const marker = m[0];
    const inMath = /^\s*\$\s*\\/.test(marker) || /^\s*\$\s*\(/.test(marker);
    return (inMath ? "$" : "") + line.slice(marker.length).replace(/^\s+/, "");
  }
  return line;
}
/** 取答案行上方紧邻的段落（跳过不超过 2 个空行） */
function paragraphAbove(lines, idx) {
  let i = idx - 1, skipped = 0;
  while (i >= 0 && !lines[i].trim()) { i--; skipped++; if (skipped > 2) return { start: idx, text: "" }; }
  const end = i + 1;
  while (i >= 0 && lines[i].trim()) i--;
  return { start: i + 1, end, text: lines.slice(i + 1, end).join("\n").trim() };
}
/** 把 [from, to) 之间的内容切成段落（每段是行号数组），并把「只有标记」的段落并入下一段 */
function paragraphsBetween(lines, from, to) {
  const chunks = [];
  let cur = [];
  for (let i = from; i < to; i++) {
    if (!lines[i].trim()) { if (cur.length) { chunks.push(cur); cur = []; } continue; }
    cur.push(i);
  }
  if (cur.length) chunks.push(cur);
  const merged = [];
  for (const c of chunks) {
    const onlyMarker = c.length === 1 && optKey(lines[c[0]]) && lines[c[0]].trim().length <= 6;
    if (onlyMarker && merged.length === 0) { merged.push(c); continue; }
    if (onlyMarker && merged.length) { merged[merged.length - 1] = merged[merged.length - 1].concat(c); continue; }
    const prev = merged[merged.length - 1];
    if (prev && prev.length === 1 && optKey(lines[prev[0]]) && lines[prev[0]].trim().length <= 6) {
      merged[merged.length - 1] = prev.concat(c);
    } else merged.push(c);
  }
  return merged;
}

/** 在 [from, ansIdx) 区间内自下而上收集选项标记（可能不全） */
function markersAbove(body, ansIdx, from = 0) {
  const found = [];
  for (let i = ansIdx - 1; i >= from && ansIdx - i < 120; i--) {
    if (!body[i].trim()) continue;
    const k = optKey(body[i]);
    if (k && !found.some((f) => f.k === k)) found.push({ idx: i, k });
    if (found.length >= 4) break;
  }
  found.reverse();
  return found;
}
/** 只有四个标记齐全且顺序为 ABCD 时才返回 */
function optionsAbove(body, ansIdx, from = 0) {
  const found = markersAbove(body, ansIdx, from);
  const byKey = new Map(found.map((f) => [f.k, f]));
  const ordered = ["A", "B", "C", "D"].map((k) => byKey.get(k)).filter(Boolean);
  return ordered.length === 4 ? ordered : [];
}

const raw = fs.readFileSync(SRC, "utf8").replace(/\r\n?/g, "\n");
const lines = raw.split("\n");
const secMarks = [];
lines.forEach((l, i) => {
  const m = l.match(/^#\s*[一二三四五六七八九十]?[、.．]?\s*(选择题|填空题|解答题)\s*$/);
  if (m) secMarks.push({ i, type: m[1] === "选择题" ? "single" : m[1] === "填空题" ? "blank" : "essay", name: m[1] });
});
const secs = secMarks.slice(0, 3).map((s, k) => ({ ...s, end: k + 1 < 3 ? secMarks[k + 1].i : lines.length }));

const questions = [];
let seq = 0;

/* ---------------------------- 选择题 ---------------------------- */
{
  const sec = secs[0];
  const body = lines.slice(sec.i + 1, sec.end);
  const anchors = [];
  let inExample = false;
  body.forEach((l, i) => {
    if (/^\s*【例】/.test(l)) inExample = true;
    if (/^\s*答案\s/.test(l)) { if (!inExample) anchors.push(i); inExample = false; }
  });
  for (let a = 0; a < anchors.length; a++) {
    const ai = anchors[a];
    const from = a > 0 ? anchors[a - 1] + 1 : 0;     // 选项只能落在上一题答案之后
    let opts = optionsAbove(body, ai, from);
    const marks = opts.length ? opts : markersAbove(body, ai, from);
    const para = paragraphAbove(body, marks.length ? marks[0].idx : ai);
    // 兜底：题干与答案之间恰好 4 个段落时，按位置映射 A–D（有的选项丢了标记）
    if (opts.length !== 4) {
      const chunks = paragraphsBetween(body, para.end, ai);
      if (process.env.DBG) console.log(`  [dbg] anchor@${ai} 标记数=${marks.length} 段落数=${chunks.length}`);
      if (chunks.length === 4) {
        opts = chunks.map((c, i) => ({ idx: c[0], k: "ABCD"[i], lines: c }));
      }
    }
    if (opts.length !== 4) continue;
    const nextAnchor = anchors.slice(a + 1).map((x, k) => {
      const nFrom = ai + 1;
      let o = optionsAbove(body, x, nFrom);
      if (o.length !== 4) {
        const mk = markersAbove(body, x, nFrom);
        const p = paragraphAbove(body, mk.length ? mk[0].idx : x);
        const ch = paragraphsBetween(body, p.end, x);
        if (ch.length === 4) o = ch.map((c, i) => ({ idx: c[0], k: "ABCD"[i] }));
      }
      return { x, o };
    }).find((y) => y.o.length === 4);
    const explEnd = nextAnchor ? paragraphAbove(body, nextAnchor.o[0].idx).start : body.length;
    seq++;
    const linesOf = (o) => (o.lines ? o.lines.map((i) => body[i]) : [body[o.idx]]);
    questions.push({
      id: `math1-2022-q${seq}`, no: seq, type: "single",
      stem: para.text.replace(/^\s*\d{1,2}\s+/, "").replace(/^\s*【例】/, "").trim(),
      options: opts.map((o) => {
        if (o.lines) {
          const first = o.lines[0];
          const mk = optKey(body[first]) || o.k;
          const rest = o.lines.slice(1).map((i) => body[i]).join("\n");
          return { key: o.k, text: [stripOpt(body[first], mk), rest].filter(Boolean).join("\n").trim() };
        }
        return { key: o.k, text: stripOpt(body[o.idx], o.k).trim() };
      }),
      answer: body[ai].replace(/^\s*答案\s*/, "").trim().replace(/\.$/, ""),
      explanation: body.slice(ai + 1, explEnd).join("\n").trim(),
      score: 5, topics: [], images: [],
    });
  }
}

/* ---------------------------- 填空题 ---------------------------- */
{
  const sec = secs[1];
  const body = lines.slice(sec.i + 1, sec.end);
  const anchors = [];
  body.forEach((l, i) => { if (/^\s*答案\s/.test(l)) anchors.push(i); });
  for (let a = 0; a < anchors.length; a++) {
    const ai = anchors[a];
    const para = paragraphAbove(body, ai);
    const explEnd = a + 1 < anchors.length ? paragraphAbove(body, anchors[a + 1]).start : body.length;
    seq++;
    questions.push({
      id: `math1-2022-q${seq}`, no: seq, type: "blank",
      stem: para.text.replace(/^\s*\d{1,2}\s+/, "").trim(),
      options: [],
      answer: body[ai].replace(/^\s*答案\s*/, "").replace(/^应填\s*/, "").trim(),
      explanation: body.slice(ai + 1, explEnd).join("\n").trim(),
      score: 5, topics: [], images: [],
    });
  }
}

/* ---------------------------- 解答题 ---------------------------- */
{
  const sec = secs[2];
  const body = lines.slice(sec.i + 1, sec.end);
  const anchors = [];
  body.forEach((l, i) => {
    const m = l.match(/^\s*(\d{1,2})\s+\S/);
    if (m && Number(m[1]) >= 17 && Number(m[1]) <= 22) anchors.push({ i, n: Number(m[1]) });
  });
  const uniq = [];
  for (const a of anchors) if (!uniq.some((u) => u.n === a.n)) uniq.push(a);
  uniq.sort((x, y) => x.i - y.i);
  for (let a = 0; a < uniq.length; a++) {
    const start = uniq[a].i;
    const end = a + 1 < uniq.length ? uniq[a + 1].i : body.length;
    const stemLine = body[start].replace(/^\s*\d{1,2}\s+/, "").trim();
    let stem = stemLine;
    let j = start + 1;
    // 题干可能延续到下一个空行
    while (j < end && body[j].trim() && !/^\s*(?:分析|解|证明|【解】)/.test(body[j])) { stem += "\n" + body[j].trim(); j++; }
    const expl = body.slice(j, end).join("\n").trim();
    seq++;
    questions.push({
      id: `math1-2022-q${seq}`, no: seq, type: "essay",
      stem, options: [], answer: "", explanation: expl,
      score: 0, topics: [], images: [],
    });
  }
}

const SINGLE_SCORES = [10, 12, 12, 12, 12, 12];
questions.filter((x) => x.type === "essay").forEach((x, i) => (x.score = SINGLE_SCORES[i] || 12));

const q = questions.filter((x) => x.type === "single");
const b = questions.filter((x) => x.type === "blank");
const e = questions.filter((x) => x.type === "essay");
const clean = q.every((x) => x.options.length === 4 && x.stem) && b.every((x) => x.stem) && e.every((x) => x.stem);

const doc = {
  id: "math1-2022", subject: "math1", subjectName: "数学一", year: 2022,
  title: "2022 年全国硕士研究生招生考试 数学（一）",
  duration: 180, totalScore: 150,
  quality: clean && questions.length === 22 ? "high" : "medium",
  source: { name: "TsekaLuk/Kaoyan-Math1-Papers · solutions/2022年解析/2022年解析.md", url: "https://github.com/TsekaLuk/Kaoyan-Math1-Papers" },
  sections: [
    { id: "choice", name: "选择题", questions: q },
    { id: "blank", name: "填空题", questions: b },
    { id: "essay", name: "解答题", questions: e },
  ].filter((s) => s.questions.length),
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(doc), "utf8");

console.log(`产出: 选择 ${q.length} / 填空 ${b.length} / 解答 ${e.length} = ${questions.length}`);
console.log("空题干:", questions.filter((x) => !x.stem).length,
            "| 空答案:", questions.filter((x) => !x.answer).length,
            "| 空解析:", questions.filter((x) => !x.explanation).length,
            "| quality:", doc.quality);
console.log("\n=== 抽查 ===");
for (const x of questions.filter((v) => [1, 4, 6, 10, 11, 16, 17, 22].includes(v.no))) {
  console.log(`--- q${x.no} [${x.type}] score=${x.score} 答案=${String(x.answer).slice(0, 30) || "（见解析）"} 选项=${x.options.length}`);
  console.log("  题干:", x.stem.replace(/\n/g, " ").slice(0, 88));
  if (x.options.length) console.log("  选项:", x.options.map((o) => o.key + "." + o.text.slice(0, 20)).join(" | "));
  console.log("  解析:", x.explanation.replace(/\n/g, " ").slice(0, 76));
}
