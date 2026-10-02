/**
 * 生成 408 2024/2025 的「答案中间产物」，供 build-cs408.mjs 复用既有解析链路。
 *
 * 背景：neville-studio/408-exam-paper 的 answers/2024-answer.pdf、2025-answer.pdf 是**扫描件**
 * （pdfjs 抽出的文本层为 0 个汉字），因此单选答案改用以下两个**带完整文本**的独立来源，
 * 并已与扫描件做 OCR 互证（见 tools/compare-2425.mjs）：
 *   A) csgraduates.com 408 真题精讲（仓库 dyuebug/csgraduates，study_methods/408quiz/<year>/content.md）
 *      —— 「选择题答案速对」表 + 逐题「正确答案：X」+ 解析 + 41–47 题参考解答
 *   B) 408os.cn 题库（仓库 kaichan-kc/408-questions，408_questions_by_year/<year>.json）
 *      —— question.answer + analysisText
 *   C) neville-studio answers/<year>-answer.pdf（官方参考答案扫描件，Windows OCR 可读部分）
 *
 * 产物：
 *   tools/cache/ans-2425-<year>.txt       1–40 单选答案 + 解析（【参考答案】X【解析】…）
 *   tools/cache/ans-2425-<year>-essay.txt 41–47 综合题参考答案（【参考答案】…）
 *   tools/cache/alt/essay-official-<year>.txt 官方扫描件 OCR 的 41–47 答案要点（仅供互证/留档）
 *
 * 用法: node tools/build-ans-2425.mjs
 */
import fs from "node:fs";

const ALT = "tools/cache/alt";
const CACHE = "tools/cache";
const YEARS = [2024, 2025];
const lettersAsc = (s) => [...new Set(String(s || "").toUpperCase().replace(/[^A-D]/g, ""))].sort().join("");

/* ---------- A: csgraduates ---------- */
function parseCsgrad(year) {
  const t = fs.readFileSync(`${ALT}/csgrad-study_methods__408quiz__${year}__content.md`, "utf8");
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
  // 逐块（##### n）取「正确答案：X」与其后的解析
  const blocks = t.split(/\n(?=#####\s*\d{1,3}\s*$)/m);
  const ans = new Map(), expl = new Map(), stem = new Map();
  for (const b of blocks) {
    const h = b.match(/^#####\s*(\d{1,3})\s*$/m);
    if (!h) continue;
    const n = Number(h[1]);
    const am = b.match(/正确答案[:：]\s*([A-D]{1,4})/);
    if (!am) continue;
    ans.set(n, lettersAsc(am[1]));
    const after = b.slice(am.index + am[0].length);
    const clean = after
      .replace(/\[\S*?\]\(\S*?\)/g, " ")      // 站内标签链接
      .replace(/^\s*[\r\n]+/, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    expl.set(n, clean);
    stem.set(n, b.slice(0, b.search(/正确答案[:：]/)).replace(/^#####\s*\d+\s*$/m, "").trim());
  }
  return { speed, ans, expl, stem, raw: t };
}

/**
 * 综合题（41–47）：csgraduates 的「解答题」章节把**题干**与**参考解答**放在同一个 ##### 块里。
 * 分界规则（对 14 个块逐一验证过）：
 *   anchor = max(最后一个站内 tag 链接行, 题干末句「请回答下列问题/要求：」所在行)
 *   答案起点 = anchor 之后第一个形如 `1）…` / `(1) …` **且结尾不带「（N 分）」分值标记**的行
 *   （分值标记是题干小问的特征，参考解答不会带）；找不到则退化为 anchor 之后第一个非空行。
 */
function parseCsgradEssay(year) {
  const t = fs.readFileSync(`${ALT}/csgrad-study_methods__408quiz__${year}__content.md`, "utf8");
  const blocks = t.split(/\n(?=#####\s*\d{1,3}\s*$)/m);
  const out = new Map();
  for (const b of blocks) {
    const h = b.match(/^#####\s*(\d{1,3})\s*$/m);
    if (!h) continue;
    const n = Number(h[1]);
    if (n < 41 || n > 47) continue;
    const lines = b.split("\n");
    let anchor = -1;
    lines.forEach((L, i) => { if (/^\[[^\]]+\]\(\/study_methods\/tags\//.test(L.trim())) anchor = i; });
    const stemEnd = lines.findIndex((L) => /请回答下列问题|要求[:：]\s*$/.test(L));
    if (stemEnd > anchor) anchor = stemEnd;
    let start = -1;
    for (let i = anchor + 1; i < lines.length; i++) {
      const L = lines[i];
      if (/^\s*[（(]?\s*\d\s*[）)]\s*\S/.test(L) && !/[（(]\s*\d+\s*分\s*[）)]\s*$/.test(L)) { start = i; break; }
    }
    if (start < 0) { for (let i = anchor + 1; i < lines.length; i++) if (lines[i].trim()) { start = i; break; } }
    if (start < 0) continue;
    const body = lines.slice(start).join("\n")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")   // 站内相对链接 → 保留文字
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (body) out.set(n, body);
  }
  return out;
}

/* ---------- B: 408os.cn ---------- */
function parseKaichan(year) {
  const j = JSON.parse(fs.readFileSync(`${ALT}/kaichan-${year}-byyear.json`, "utf8"));
  const m = new Map(), score = new Map();
  for (const it of j) {
    const q = it.question || it;
    if (q.answer) m.set(q.questionIndex, lettersAsc(q.answer));
    score.set(q.questionIndex, q.score || 0);
  }
  return { ans: m, score };
}

/* ---------- C: 官方扫描件 OCR（仅互证） ---------- */
function parseOfficialOcr(year) {
  const dir = "tools/cache/alt/scan-big";
  const m = new Map();
  for (const f of fs.readdirSync(dir).filter((f) => f.startsWith(`${year}-`) && f.endsWith(".txt"))) {
    const t = fs.readFileSync(`${dir}/${f}`, "utf8").replace(/\s+/g, "");
    const re = /(?<!\d)(\d{1,2})[.．·，,]?([A-Da-d])(?![A-Za-z])/g;
    let x;
    while ((x = re.exec(t))) {
      const n = Number(x[1]);
      if (n >= 1 && n <= 40 && !m.has(n)) m.set(n, x[2].toUpperCase());
    }
  }
  return m;
}

const report = [];
for (const year of YEARS) {
  const A = parseCsgrad(year), B = parseKaichan(year), C = parseOfficialOcr(year);

  /* 1) 多源一致性检查 —— 不一致就整体中止，绝不猜 */
  const conflicts = [];
  for (let n = 1; n <= 40; n++) {
    const a = A.ans.get(n), s = A.speed.get(n), b = B.ans.get(n), c = C.get(n);
    if (a && s && a !== s) conflicts.push(`q${n}: csgrad-逐题=${a} vs csgrad-速对=${s}`);
    if (a && b && a !== b) conflicts.push(`q${n}: csgrad=${a} vs 408os=${b}`);
    if (a && c && a !== c) conflicts.push(`q${n}: csgrad=${a} vs 官方扫描件OCR=${c}`);
    if (s && b && s !== b) conflicts.push(`q${n}: csgrad-速对=${s} vs 408os=${b}`);
    if (s && c && s !== c) conflicts.push(`q${n}: csgrad-速对=${s} vs 官方扫描件OCR=${c}`);
    if (b && c && b !== c) conflicts.push(`q${n}: 408os=${b} vs 官方扫描件OCR=${c}`);
  }
  const missingA = [...Array(40)].map((_, i) => i + 1).filter((n) => !A.ans.get(n));
  if (conflicts.length) throw new Error(`${year} 答案存在跨源分歧，拒绝生成：\n` + conflicts.join("\n"));
  if (missingA.length) throw new Error(`${year} 源A 缺答案：${missingA.join(",")}`);

  /* 2) 写单选答案文件 */
  const lines = [`${year} 年 408 单项选择题参考答案（来源：csgraduates.com 408 真题精讲，已与 408os.cn / 官方扫描件 OCR 三方互证一致）`];
  for (let n = 1; n <= 40; n++) {
    const e = (A.expl.get(n) || B.ans.get(n) ? A.expl.get(n) || "" : "").replace(/\s*\n\s*/g, " ").trim();
    lines.push(`${n}.【参考答案】${A.ans.get(n)}【解析】${e || "（该题解析在来源中缺失）"}`);
  }
  fs.writeFileSync(`${CACHE}/ans-2425-${year}.txt`, lines.join("\n"), "utf8");

  /* 3) 写综合题答案文件（csgraduates 的 41–47 参考解答） */
  const E = parseCsgradEssay(year);
  const essayLines = [`${year} 年 408 综合应用题参考答案（来源：csgraduates.com 408 真题精讲「解答题」章节）`];
  const essayMissing = [];
  for (let n = 41; n <= 47; n++) {
    const e = E.get(n);
    if (!e) { essayMissing.push(n); continue; }
    essayLines.push(`${n}.【参考答案】${e}`);
  }
  fs.writeFileSync(`${CACHE}/ans-2425-${year}-essay.txt`, essayLines.join("\n\n"), "utf8");

  /* 4) 留档：官方扫描件 OCR 的 41–47 答案要点 */
  const ocrFiles = fs.readdirSync("tools/cache/alt/scan-big").filter((f) => f.startsWith(`${year}-`) && f.endsWith(".txt"));
  const ocrAll = ocrFiles
    .sort()
    .map((f) => `----- ${f} -----\n` + fs.readFileSync(`tools/cache/alt/scan-big/${f}`, "utf8"))
    .join("\n");
  fs.writeFileSync(`${ALT}/essay-official-${year}.txt`, ocrAll, "utf8");

  report.push(
    `${year}: 源A=${A.ans.size}/40（速对表${A.speed.size}/40） 源B=${B.ans.size}/40 源C(官方扫描件OCR)=${C.size}/40 ` +
    `冲突=0 综合题答案=${7 - essayMissing.length}/7 缺=${essayMissing.join(",") || "无"}`
  );
  report.push(`  答案串: ${[...Array(40)].map((_, i) => A.ans.get(i + 1)).join("")}`);
  report.push(`  官方OCR可读并一致: ${[...C.entries()].filter(([n, v]) => v === A.ans.get(n)).length}/${C.size}`);
  report.push(`  综合题科目分组(csgraduates): ` + ["41,42=数据结构", "43,44=组成原理", "45,46=操作系统", "47=计算机网络"].join(" "));
}
console.log(report.join("\n"));
fs.writeFileSync(`${ALT}/build-ans-2425-report.txt`, report.join("\n"), "utf8");
