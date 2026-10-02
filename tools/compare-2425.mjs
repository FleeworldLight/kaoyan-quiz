/**
 * 408 2024/2025 答案多源比对。
 *   A) csgraduates.com（dyuebug/csgraduates）—— 答案速对表 + 逐题「正确答案：X」
 *   B) 408os.cn（kaichan-kc/408-questions）—— question.answer
 *   C) neville-studio answers/2024|2025-answer.pdf —— 官方参考答案扫描件（Windows OCR，可能不全）
 * 用法: node tools/compare-2425.mjs
 */
import fs from "node:fs";

const ALT = "tools/cache/alt";
const letters = (s) => [...new Set(String(s || "").toUpperCase().replace(/[^A-D]/g, ""))].sort().join("");

/* ---------- A: csgraduates ---------- */
function parseCsgrad(year) {
  const t = fs.readFileSync(`${ALT}/csgrad-study_methods__408quiz__${year}__content.md`, "utf8");
  // 答案速对表：No.AnsNo.Ans... 形式，形如 1D2A3A4B...
  const speed = new Map();
  const si = t.indexOf("答案速对");
  if (si >= 0) {
    const seg = t.slice(si, si + 2000).replace(/\s+/g, "");
    const re = /(\d{1,2})([A-D])(?![A-Za-z])/g;
    let m;
    while ((m = re.exec(seg))) {
      const n = Number(m[1]);
      if (n >= 1 && n <= 40 && !speed.has(n)) speed.set(n, m[2]);
      if (speed.size >= 40) break;
    }
  }
  // 逐题「正确答案：X」：按 ##### n 切块
  const per = new Map();
  const blocks = t.split(/\n(?=#####\s*\d{1,3}\s*$)/m);
  for (const b of blocks) {
    const h = b.match(/^#####\s*(\d{1,3})\s*$/m);
    if (!h) continue;
    const n = Number(h[1]);
    const am = b.match(/正确答案[:：]\s*([A-D]{1,4})/);
    if (am) per.set(n, letters(am[1]));
  }
  return { speed, per, raw: t };
}

/* ---------- B: kaichan / 408os.cn ---------- */
function parseKaichan(year) {
  const j = JSON.parse(fs.readFileSync(`${ALT}/kaichan-${year}-byyear.json`, "utf8"));
  const m = new Map();
  for (const it of j) {
    const q = it.question || it;
    if (!q.answer) continue;
    m.set(q.questionIndex, letters(q.answer));
  }
  return m;
}

/* ---------- C: 官方扫描件 OCR ---------- */
function parseScanOcr(year) {
  const dir = "tools/cache/alt/scan-big";
  const files = fs.readdirSync(dir).filter((f) => f.startsWith(`${year}-`) && f.endsWith(".txt"));
  const m = new Map();
  for (const f of files) {
    const t = fs.readFileSync(`${dir}/${f}`, "utf8").replace(/\s+/g, "");
    // 形如 11.D / 14．D / 3·A
    const re = /(?<!\d)(\d{1,2})[.．·，,]?([A-Da-d])(?![A-Za-z])/g;
    let x;
    while ((x = re.exec(t))) {
      const n = Number(x[1]);
      if (n >= 1 && n <= 40 && !m.has(n)) m.set(n, x[2].toUpperCase());
    }
  }
  return m;
}

const out = [];
for (const year of [2024, 2025]) {
  const A = parseCsgrad(year), B = parseKaichan(year), C = parseScanOcr(year);
  out.push(`\n================= ${year} =================`);
  out.push(`源A csgraduates.com  覆盖 ${A.speed.size}/40（速对表） ${A.per.size} 条逐题`);
  out.push(`源B 408os.cn         覆盖 ${B.size}/40`);
  out.push(`源C 官方扫描件(OCR)  可读 ${C.size}/40`);
  const speedMismatch = [];
  for (let n = 1; n <= 40; n++) {
    const a = A.speed.get(n), p = A.per.get(n);
    if (a && p && a !== p) speedMismatch.push(`q${n}: 速对=${a} 逐题=${p}`);
  }
  out.push(`源A 内部（速对表 vs 逐题）冲突: ${speedMismatch.length ? speedMismatch.join(" ") : "无"}`);
  const ab = [], ac = [], bc = [];
  for (let n = 1; n <= 40; n++) {
    const a = A.speed.get(n), b = B.get(n), c = C.get(n);
    if (a && b && a !== b) ab.push(`q${n}:csgrad=${a}/408os=${b}`);
    if (a && c && a !== c) ac.push(`q${n}:csgrad=${a}/scan=${c}`);
    if (b && c && b !== c) bc.push(`q${n}:408os=${b}/scan=${c}`);
  }
  out.push(`A vs B 冲突: ${ab.length ? ab.join(" ") : "无（完全一致）"}`);
  out.push(`A vs C 冲突: ${ac.length ? ac.join(" ") : "无"}`);
  out.push(`B vs C 冲突: ${bc.length ? bc.join(" ") : "无"}`);
  out.push(`源C 缺号: [${[...Array(40)].map((_, i) => i + 1).filter((n) => !C.has(n)).join(",")}]`);
  out.push(`源A 速对表: ${[...Array(40)].map((_, i) => `${i + 1}${A.speed.get(i + 1) || "?"}`).join(" ")}`);
  out.push(`源B 408os : ${[...Array(40)].map((_, i) => `${i + 1}${B.get(i + 1) || "?"}`).join(" ")}`);
  out.push(`源C 官方  : ${[...Array(40)].map((_, i) => `${i + 1}${C.get(i + 1) || "?"}`).join(" ")}`);
}
console.log(out.join("\n"));
fs.writeFileSync(`${ALT}/compare-2425.txt`, out.join("\n"), "utf8");
