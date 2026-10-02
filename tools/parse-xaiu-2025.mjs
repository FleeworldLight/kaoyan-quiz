/**
 * 解析「西安外事学院公开的 2025 政治真题 PDF」文本（无答案，但题干/选项最完整、最接近试卷原卷），
 * 并与当前库内 2025 卷（来源：武昌首义学院等）逐题做选项级比对，量化措辞差异。
 * 用法: node tools/parse-xaiu-2025.mjs
 */
import fs from "node:fs";

const TXT = "tools/cache/politics-src2/2025-xaiu-ans.txt";
const raw = fs.readFileSync(TXT, "utf8");
const text = raw.replace(/<<PAGE>>/g, "\n").replace(/[ \t\u3000]+/g, " ").replace(/\r/g, "");

/* ---- 切分段 ---- */
const iSingle = text.search(/单项选择题/);
const iMulti = text.search(/多项选择题/);
const iEssay = text.search(/材料分析题|分析题/);
const segments = {
  single: text.slice(iSingle, iMulti),
  multiple: text.slice(iMulti, iEssay),
  essay: text.slice(iEssay),
};
console.log(`分段位置 single=${iSingle} multiple=${iMulti} essay=${iEssay} 总长=${text.length}`);

/* ---- 从一段里按「N、」切题，再按 A．B．C．D． 切选项 ---- */
function parseChoice(seg, nums) {
  const marks = [];
  for (const n of nums) {
    const re = new RegExp(`(?<![0-9])${n}\\s*、`, "g");
    let m;
    while ((m = re.exec(seg))) marks.push({ n, i: m.index, e: re.lastIndex });
  }
  marks.sort((a, b) => a.i - b.i);
  const seen = new Set();
  const chain = [];
  for (const mk of marks) if (!seen.has(mk.n)) { seen.add(mk.n); chain.push(mk); }
  const out = [];
  for (let k = 0; k < chain.length; k++) {
    const body = seg.slice(chain[k].e, k + 1 < chain.length ? chain[k + 1].i : seg.length);
    const optMarks = [];
    const re = /([A-D])\s*[．.、]/g;
    let m;
    while ((m = re.exec(body))) optMarks.push({ key: m[1], i: m.index, e: re.lastIndex });
    if (optMarks.length < 4) { out.push({ no: chain[k].n, stem: body.replace(/\s+/g, " ").trim(), options: [] }); continue; }
    // 取最后 4 个连成 A B C D 的序列
    let pick = null;
    for (let s = 0; s + 3 < optMarks.length; s++) {
      if (optMarks[s].key === "A" && optMarks[s + 1].key === "B" && optMarks[s + 2].key === "C" && optMarks[s + 3].key === "D") pick = optMarks.slice(s, s + 4);
    }
    if (!pick) { out.push({ no: chain[k].n, stem: body.replace(/\s+/g, " ").trim(), options: [] }); continue; }
    const stem = body.slice(0, pick[0].i).replace(/[_＿\s]+/g, " ").trim();
    const opts = pick.map((p, idx) => ({
      key: "ABCD"[idx],
      text: body.slice(p.e, idx + 1 < pick.length ? pick[idx + 1].i : body.length).replace(/\s+/g, " ").trim(),
    }));
    out.push({ no: chain[k].n, stem, options: opts });
  }
  return out;
}

const single = parseChoice(segments.single, Array.from({ length: 16 }, (_, i) => i + 1));
const multiple = parseChoice(segments.multiple, Array.from({ length: 17 }, (_, i) => i + 17));

/* ---- 相似度（与 build-politics.mjs 同一实现，便于比较） ---- */
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

const paper = JSON.parse(fs.readFileSync("public/data/politics/2025.json", "utf8"));
const mine = paper.sections.flatMap((s) => s.questions).filter((q) => q.type !== "essay");
const xaiu = [...single, ...multiple];
const xMap = new Map(xaiu.map((q) => [q.no, q]));

let noOpts = 0, positionalOk = 0, answersSafe = 0, answersUncertain = [];
const perQ = [];
for (const q of mine) {
  const x = xMap.get(q.no);
  if (!x || x.options.length !== 4) { noOpts++; continue; }
  const hits = q.options.map((o, i) => sim(o.text, x.options[i].text) >= 0.6);
  const nHit = hits.filter(Boolean).length;
  if (nHit >= 3) positionalOk++;
  // 该题答案指向的选项，是否与原件同位置且内容对得上
  const ansIdx = q.answer.split("").map((L) => "ABCD".indexOf(L));
  const ok = ansIdx.every((i) => hits[i]);
  if (ok) answersSafe++; else answersUncertain.push(`Q${q.no}(${q.answer})`);
  perQ.push({ no: q.no, nHit, hits });
}
console.log(`\n选项级比对（本库 2025 vs 西安外事 PDF 原卷）：`);
console.log(`  本库 ${mine.length} 道选择题；原件未能解析出 4 个选项的: ${noOpts} 道`);
console.log(`  4 个选项里 ≥3 个能在原件同位置对上(相似度≥0.6): ${positionalOk} 道`);
console.log(`  「本库答案所选选项」在原件同位置也能对上的: ${answersSafe} 道`);
console.log(`  答案所选选项文字对不上的: ${answersUncertain.join(" ") || "无"}`);
console.log("\n逐题命中数（命中/4）：");
console.log(perQ.map((r) => `${r.no}:${r.nHit}`).join(" "));
console.log("\n前 3 题原件文本：");
for (const no of [12, 13, 21]) {
  const x = xMap.get(no); if (!x) { console.log(`原件缺 Q${no}`); continue; }
  console.log(`  Q${no} 原件题干: ${x.stem.slice(0, 110)}`);
  x.options.forEach((o) => console.log(`     ${o.key}. ${o.text.slice(0, 80)}`));
}
