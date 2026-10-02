import fs from "node:fs";
import path from "node:path";

const CACHE = "tools/cache/math";
const OUTS = "public/data/math1";
const CN = "一二三四五六七八九十";

const SEC_DEFS = [
  { id: "choice", name: "选择题", type: "single", re: /选择题|单项选择/ },
  { id: "blank", name: "填空题", type: "blank", re: /填空题/ },
  { id: "essay", name: "解答题", type: "essay", re: /解答题|计算题|证明题|本题满分|应用题/ },
];

const Q_RE = /^\s*[^\u4e00-\u9fff]{0,10}?(?:[（(【]\s*)?(\d{1,2})\s*(?:[)）】]|\.|．|、)\s*/;
const SEC_RE = new RegExp("^\\s*#{0,4}\\s*([" + CN + "]{1,3})\\s*[、.．,，:：]");
// 选项标记的多种写法，含被 LaTeX 美元符号包裹的形式（$\\mathrm{(A)}、$\\left(\\mathrm{D}\\right)、$(\\mathrm{A})）
const OPT_RES = [
  /^\s*\$\s*\\mathrm\s*\{\s*\(\s*([A-D])\s*\)\s*\}/,
  /^\s*\$\s*\\left\s*\(\s*\\mathrm\s*\{\s*([A-D])\s*\}\s*\\right\s*\)/,
  /^\s*\$\s*\(\s*\\mathrm\s*\{\s*([A-D])\s*\}\s*\)/,
  /^\s*\$\s*\\mathrm\s*\{\s*([A-D])\s*\}\s*[.．]/,
  /^\s*\\mathrm\s*\{\s*\(\s*([A-D])\s*\)\s*\}/,
  /^\s*\\text\s*\{\s*\(\s*([A-D])\s*\)\s*\}/,
  /^\s*[（(]\s*\\mathrm\s*\{\s*([A-D])\s*\}\s*[)）]/,
  /^\s*[（(]\s*([A-D])\s*[)）]/,
  /^\s*\\mathrm\s*\{\s*([A-D])\s*\}\s*[.．]/,
  /^\s*\*\*\s*[（(]?\s*([A-D])\s*[)）]?\s*\*\*/,
  /^\s*([A-D])\s*[.．、]/,
];
const optKey = (l) => { for (const re of OPT_RES) { const m = l.match(re); if (m) return m[1]; } return null; };
/** 去掉选项标记。若标记在 $...$ 内部，则保留一个 "$" 以免公式定界符失衡。 */
function stripOptMark(line, key) {
  for (const re of OPT_RES) {
    const m = line.match(re);
    if (!m || m[1] !== key) continue;
    const marker = m[0];
    const inMath = /^\s*\$\s*\\/.test(marker) || /^\s*\$\s*\(/.test(marker);
    const rest = line.slice(marker.length).replace(/^\s+/, "");
    return (inMath ? "$" : "") + rest;
  }
  return line;
}

/** 选项文本清理：去掉孤立的 $$ 行与残留的选项标记 */
function cleanOptText(t) {
  return t
    .split("\n")
    .filter((ln) => !/^\s*\$\$\s*$/.test(ln))
    .join("\n")
    .replace(/\\mathrm\s*\{\s*\(\s*[A-D]\s*\)\s*\}/g, "")
    .replace(/\\text\s*\{\s*\(\s*[A-D]\s*\)\s*\}/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
function normChoice(s) {
  if (!s) return "";
  const c = s.replace(/\\mathrm\s*\{\s*([A-D])\s*\}/g, "$1").replace(/[（(）)\s.。．、,，:：;；]/g, "");
  const m = c.match(/^[A-D]/);
  return m ? m[0] : "";
}
function cleanAnswerText(s) {
  if (!s) return "";
  return s.replace(/^[（(【]?\s*[A-D]\s*[)）】]?\s*[.．]?\s*/, (m) => (/^[（(【]?\s*[A-D]/.test(m) ? "" : m)).replace(/\s+/g, " ").trim();
}
function extractScore(h) {
  let per = 0;
  const m1 = h.match(/(?:每小题|每题)\s*(\d+)\s*分/);
  if (m1) per = Number(m1[1]);
  return per;
}

function extractStart(h) {
  const m = h.match(/(\d{1,2})\s*(?:[～~\-—]|\\sim)\s*(\d{1,2})/);
  if (m) return Number(m[1]);
  return 0;
}
/** 把选项区切成「单元」。新单元起点：选项标记行、数学 $$ 块、以 ( 或 $ 开头的表达式行。 */
/** 把选项区切成「单元」。新单元起点：选项标记行、数学 $$ 块、以 ( 或 $ 开头的表达式行。 */
const CJK_RE = /[\u4e00-\u9fff]/;
const OPT_ANYWHERE = /[(（]\s*(?:\\mathrm\s*\{\s*)?([A-D])\s*(?:\}\s*)?[)）]/;
const startsUnit = (ln) => {
  const t = ln.trim();
  if (!t) return false;
  if (optKey(ln)) return true;
  if (/^\$\$/.test(t)) return true;
  if (/^\$/.test(t)) return true;
  if (/^[（(]/.test(t)) return true;
  if (!CJK_RE.test(t) && OPT_ANYWHERE.test(t)) return true;
  if (!CJK_RE.test(t) && /(?:^|[\s)）·])([A-D])\s*[.．、]/.test(t)) return true;
  return false;
};
function splitUnits(lines) {
  const units = [];
  let cur = [];
  let inDisplay = false;
  const flush = () => { if (cur.some((l) => l.trim())) units.push(cur); cur = []; };
  for (const ln of lines) {
    const t = ln.trim();
    if (/^\$\$/.test(t)) {
      if (!inDisplay) {
        // 上一单元如果只有一个光秃秃的选项标记（如「（A）」独占一行），让它吸收这个公式块
        const nonBlank = cur.filter((l) => l.trim());
        if (nonBlank.length === 1 && optKey(nonBlank[0])) {
          cur = [nonBlank[0], ln];
        } else {
          flush();
          cur = [ln];
        }
        inDisplay = true;
      } else {
        cur.push(ln);
        flush();
        inDisplay = false;
      }
      continue;
    }
    if (!inDisplay && startsUnit(ln)) { flush(); cur = [ln]; continue; }
    if (!t) { if (cur.length) cur.push(ln); continue; }
    cur.push(ln);
  }
  flush();
  return units;
}

/** 提取选择题的题干与选项。返回 { ok, stem, options } */
function extractOptions(body, inChoiceSection) {
  let endIdx = body.length;
  for (let i = 0; i < body.length; i++) {
    if (/【(?:答案|解|解析|详解)】/.test(body[i])) { endIdx = i; break; }
  }
  const lines = body.slice(0, endIdx);
  const marks = [];
  for (let j = 0; j < lines.length; j++) {
    const k = optKey(lines[j]);
    if (k) marks.push({ j, k });
  }
  // 路径 1：四个标记齐全且顺序正确
  if (marks.length === 4 && marks.map((m) => m.k).join("") === "ABCD") {
    return {
      ok: true,
      stem: lines.slice(0, marks[0].j).join("\n"),
      options: marks.map((m, i) => ({
        key: m.k,
        text: cleanOptText([stripOptMark(lines[m.j], m.k), ...lines.slice(m.j + 1, i + 1 < 4 ? marks[i + 1].j : lines.length)].join("\n")),
      })),
    };
  }
  // 路径 2：OCR 丢了部分标记 —— 定位选项区起点，切成单元，恰好 4 个就按位置映射
  if (inChoiceSection) {
    let optStart = -1;
    if (marks.length >= 1) {
      // 从第一个标记往前回扫，把「无中文、看起来是选项」的行也纳入选项区（例如缺标记的 A、B 两项）
      optStart = marks[0].j;
      while (optStart > 0) {
        const t = lines[optStart - 1].trim();
        if (!t) { optStart--; continue; }
        if (startsUnit(lines[optStart - 1]) && !CJK_RE.test(t)) { optStart--; continue; }
        break;
      }
    } else {
      // 连一个标记都没识别到：找第一行「不含中文且像选项」的行作为起点
      for (let j = 1; j < lines.length; j++) {
        const t = lines[j].trim();
        if (!t || CJK_RE.test(t)) continue;
        if (startsUnit(lines[j]) || OPT_ANYWHERE.test(t)) { optStart = j; break; }
      }
    }
    if (optStart >= 0) {
      const units = splitUnits(lines.slice(optStart));
      if (units.length === 4) {
        const options = units.map((u, i) => {
          const mk = optKey(u[0]);
          return { key: "ABCD"[i], text: cleanOptText([mk ? stripOptMark(u[0], mk) : u[0], ...u.slice(1)].join("\n")) };
        });
        if (options.every((o) => o.text.length > 0)) {
          return { ok: true, stem: lines.slice(0, optStart).join("\n"), options };
        }
      }
    }
  }
  return { ok: false, stem: null, options: [] };
}

function parseDoc(raw, resetPerSection) {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const secs = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!SEC_RE.test(t)) continue;
    if (!/^#{0,4}\s*[一二三四五六七八九十]/.test(t)) continue;
    secs.push({ i, def: SEC_DEFS.find((d) => d.re.test(t)) || null, text: t, per: extractScore(t), start: extractStart(t) });
  }
  const firstSec = secs.length ? secs[0].i : 0;
  const secAt = (idx) => { let cur = null; for (const s of secs) { if (s.i <= idx) cur = s; else break; } return cur; };

  const cands = [];
  for (let i = firstSec; i < lines.length; i++) {
    const m = lines[i].match(Q_RE);
    if (!m) continue;
    const n = Number(m[1]);
    if (n < 1 || n > 40) continue;
    if (optKey(lines[i])) continue;
    cands.push({ i, n, sec: secAt(i) });
  }

  const picked = [];
  let expected = secs.length && secs[0].start ? secs[0].start : 1;
  let lastSec = null, jumps = 0;
  for (let k = 0; k < cands.length; k++) {
    const c = cands[k];
    if (c.sec !== lastSec) {
      lastSec = c.sec;
      if (resetPerSection) expected = 1;
      else if (c.sec && c.sec.start) expected = Math.max(expected, c.sec.start);
    }
    const base = c.sec && c.sec.start ? c.sec.start : 1;
    if (c.n === expected) { picked.push(c); expected++; }
    else if (!resetPerSection && base > 1 && c.n + base - 1 === expected) { picked.push(c); expected++; }
    else if (c.n > expected) {
      const rest = cands.slice(k + 1).filter((x) => !resetPerSection || x.sec === c.sec);
      if (!rest.some((x) => x.n === expected)) { picked.push(c); expected = c.n + 1; jumps++; }
    }
  }
  const questions = [];
  for (let pi = 0; pi < picked.length; pi++) {
    const start = picked[pi].i;
    let end = pi + 1 < picked.length ? picked[pi + 1].i : lines.length;
    for (const s of secs) if (s.i > start && s.i < end) { end = s.i; break; }
    const body = lines.slice(start, end);
    body[0] = body[0].replace(new RegExp("^\\s*(?:[（(【]\\s*)?" + picked[pi].n + "\\s*(?:[)）】]|\\.|．|、)\\s*"), "");
    const block = body.join("\n");

    const inChoiceSection = picked[pi].sec && picked[pi].sec.def && picked[pi].sec.def.id === "choice";
    const ex = extractOptions(body, inChoiceSection);
    const isChoice = ex.ok;

    let inlineAnswer = "";
    const am = block.match(/【答案】\s*([^\n]*)/);
    if (am) inlineAnswer = am[1];
    let inlineExpl = "";
    const em = block.match(/【(?:解|解析|详解)】\s*([\s\S]*)$/);
    if (em) inlineExpl = em[1].trim();

    let stem = "", options = [];
    if (isChoice) {
      stem = ex.stem || "";
      options = ex.options;
      // 选项之后单独成段的插图属于题干（“如图”类题目），挪回题干，避免挂到最后一个选项上
      const lastOpt = options[options.length - 1];
      const tail = lastOpt.text.match(/\n\s*\n((?:\s*!\[[^\]]*\]\([^)]+\)\s*)+)$/);
      if (tail) {
        lastOpt.text = lastOpt.text.slice(0, lastOpt.text.length - tail[0].length).trim();
        stem = (stem.trim() + "\n\n" + tail[1].trim()).trim();
      }
    } else {
      stem = block.replace(/【答案】[\s\S]*$/, "").replace(/【(?:解|解析|详解)】[\s\S]*$/, "");
    }
    stem = stem.replace(/\n*【答案】[\s\S]*$/m, "").trim();

    const def = picked[pi].sec && picked[pi].sec.def;
    questions.push({
      no: picked[pi].n, seq: questions.length + 1,
      type: isChoice ? "single" : def ? def.type : "essay",
      secId: def ? def.id : "essay",
      stem, options, inlineAnswer, inlineExpl,
      perScore: picked[pi].sec ? picked[pi].sec.per : 0,
    });
  }
  return { questions, secs, jumps, mode: resetPerSection ? "reset" : "continuous" };
}

function collect() {
  const byYear = new Map();
  const add = (file, kind) => {
    const m = path.basename(file).match(/(19|20)\d{2}/);
    if (!m) return;
    const y = Number(m[0]);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push({ file, kind });
  };
  for (const f of fs.readdirSync(path.join(CACHE, "papers"))) {
    if (!f.endsWith(".md") || f === "README.md" || f.includes("数学二")) continue;
    add(path.join(CACHE, "papers", f), "paper");
  }
  const sd = path.join(CACHE, "solutions");
  for (const d of fs.readdirSync(sd)) {
    const sub = path.join(sd, d);
    if (!fs.statSync(sub).isDirectory()) continue;
    for (const f of fs.readdirSync(sub)) if (f.endsWith(".md")) add(path.join(sub, f), "solution");
  }
  return byYear;
}

const CNJ = /[\u4e00-\u9fff]/g;
function qualityOf(questions, srcKind, jumps) {
  const all = questions;
  if (!all.length) return "low";
  const choice = all.filter((q) => q.type === "single" && q.options.length === 4);
  const withAns = all.filter((q) => q.answer || q.explanation).length / all.length;
  const stemChars = all.map((q) => q.stem).join("");
  const bad = (stemChars.match(/[\ufffd\u25a1]/g) || []).length;
  const badRatio = bad / Math.max(1, stemChars.length);
  const optionless = all.filter((q) => q.type === "single" && q.options.some((o) => !o.text.trim())).length;
  if (choice.length / all.length < 0.12) return "low";
  if (withAns < 0.5 || badRatio > 0.02) return "low";
  if (srcKind === "solution" || withAns < 0.9 || jumps > 0 || optionless > 0) return "medium";
  return "high";
}
const SKIP_YEARS = new Set([2022]);   // 2022 由 parse-math-2022.mjs 单独处理
// 先清空旧产物，避免上一轮遗留的年份文件混进索引
if (fs.existsSync(OUTS)) for (const f of fs.readdirSync(OUTS)) if (f.endsWith(".json")) fs.unlinkSync(path.join(OUTS, f));

const byYear = collect();
const report = [], papers = [];
let totalQ = 0, totalChoice = 0;

for (const y of [...byYear.keys()].sort((a, b) => a - b)) {
  const variants = [];
  for (const { file, kind } of byYear.get(y)) {
    let raw; try { raw = fs.readFileSync(file, "utf8"); } catch { continue; }
    for (const reset of [false, true]) {
      let p; try { p = parseDoc(raw, reset); } catch { continue; }
      const ch = p.questions.filter((q) => q.type === "single" && q.options.length === 4).length;
      const valid = p.questions.filter((q) => q.stem.replace(/\s/g, "").length > 5).length;
      variants.push({ file, kind, reset, p, score: valid * 3 + ch * 10 - p.jumps * 0.5 });
    }
  }
  if (!variants.length) continue;
  variants.sort((a, b) => b.score - a.score);
  const chosen = variants[0];
  if (SKIP_YEARS.has(y)) { report.push(`${y}: SKIPPED (ocr 损坏)`); continue; }

  // 答案来源：同 reset 模式的、带【答案】/【解】的最佳解析文件（或任意文件）
  const ansVariants = variants.filter((v) => v.reset === chosen.reset && (v.p.kind ?? true));
  const withAns = variants.filter((v) => v.reset === chosen.reset && v.p.questions.some((q) => q.inlineAnswer || q.inlineExpl));
  withAns.sort((a, b) => b.score - a.score);
  const ansDoc = withAns[0] || null;
  const keyOf = (q) => (chosen.p.mode === "continuous" ? "n" + q.no : "s" + q.seq);
  const ansMap = new Map();
  if (ansDoc && ansDoc.file !== chosen.file) {
    for (const q of ansDoc.p.questions) if (q.inlineAnswer || q.inlineExpl) ansMap.set(keyOf(q), q);
  }

  const groups = { choice: [], blank: [], essay: [] };
  for (const q of chosen.p.questions) {
    if (q.stem.replace(/\s/g, "").length < 4) continue;
    let a = q.inlineAnswer, e = q.inlineExpl;
    if ((!a && !e) && ansMap.has(keyOf(q))) { a = ansMap.get(keyOf(q)).inlineAnswer; e = ansMap.get(keyOf(q)).inlineExpl; }
    const entry = {
      id: `math1-${y}-q${q.seq}`,
      no: q.no,
      type: q.type,
      stem: q.stem,
      options: q.type === "single" ? q.options : [],
      answer: q.type === "single" ? normChoice(a) : (a || "").trim(),
      explanation: (e || "").trim(),
      score: q.perScore || 0,
      topics: [],
      ...(q.type === "single" && (!q.options || q.options.length === 0)
        ? { optionIssue: "本题选项在原始素材（OCR）中缺失，请对照原卷作答" }
        : {}),
      images: [],
    };
    const imgs = [...(entry.stem + "\n" + entry.options.map((o) => o.text).join("\n")).matchAll(/\(images\/([^)]+)\)/g)].map((m) => m[1]);
    entry.images = [...new Set(imgs)];
    groups[q.secId].push(entry);
  }

  const all = [...groups.choice, ...groups.blank, ...groups.essay];
  if (all.length < 5) { report.push(`${y}: 解析失败（题量 ${all.length}）`); continue; }
  const quality = qualityOf(all, chosen.kind, chosen.p.jumps);

  // 知识点打标（关键词启发式）
  for (const q of all) q.topics = tagTopics(q);

  const secOut = [];
  for (const [k, def] of [["choice", SEC_DEFS[0]], ["blank", SEC_DEFS[1]], ["essay", SEC_DEFS[2]]]) {
    if (groups[k].length) secOut.push({ id: k, name: def.name, questions: groups[k] });
  }
  const doc = {
    id: `math1-${y}`, subject: "math1", subjectName: "数学一", year: y,
    title: `${y} 年全国硕士研究生招生考试 数学（一）`,
    duration: 180, totalScore: 150, quality,
    source: { name: `TsekaLuk/Kaoyan-Math1-Papers · ${path.basename(chosen.file)}`, url: "https://github.com/TsekaLuk/Kaoyan-Math1-Papers" },
    sections: secOut,
  };
  fs.mkdirSync(OUTS, { recursive: true });
  fs.writeFileSync(path.join(OUTS, `${y}.json`), JSON.stringify(doc), "utf8");
  papers.push({ id: doc.id, year: y, title: doc.title, file: `math1/${y}.json`, questionCount: all.length, choiceCount: groups.choice.length, totalScore: 150, duration: 180, quality, source: doc.source.name, sourceUrl: doc.source.url });
  totalQ += all.length; totalChoice += groups.choice.length;
  const ansN = all.filter((q) => q.answer || q.explanation).length;
  report.push(`${y}: mode=${chosen.p.mode} src=${chosen.kind}(${path.basename(chosen.file)}) 选择=${groups.choice.length} 填空=${groups.blank.length} 解答=${groups.essay.length} 有答案=${ansN}/${all.length} q=${quality} jumps=${chosen.p.jumps} ansSrc=${ansDoc ? path.basename(ansDoc.file) : "无"}`);
}

/* 知识点标签：按题干关键词命中 */
function topicRules() { return [
  ["高数-函数极限连续", /极限|连续|无穷小|间断点|渐近线|无穷大/],
  ["高数-一元微分学", /导数|微分|中值定理|洛必达|极值|拐点|单调|泰勒|曲率/],
  ["高数-一元积分学", /不定积分|定积分|原函数|广义积分|反常积分|变限积分|积分中值/],
  ["高数-多元微分学", /偏导|全微分|方向导数|梯度|多元函数|条件极值|拉格朗日/],
  ["高数-多元积分学", /二重积分|三重积分|曲线积分|曲面积分|格林公式|高斯公式|斯托克斯/],
  ["高数-级数", /级数|收敛半径|幂级数|傅里叶|绝对收敛|条件收敛/],
  ["高数-微分方程", /微分方程|通解|特解|特征方程|齐次|欧拉方程/],
  ["高数-空间解析几何", /平面方程|直线|曲面|法向量|向量|旋转曲面/],
  ["线代-行列式", /行列式|余子式|代数余子式/],
  ["线代-矩阵", /矩阵|可逆|伴随矩阵|秩|初等变换|分块/],
  ["线代-向量组", /向量组|线性相关|线性无关|极大无关组|基|维数|坐标/],
  ["线代-线性方程组", /线性方程组|基础解系|通解|非齐次|同解/],
  ["线代-特征值与二次型", /特征值|特征向量|相似|对角化|二次型|正定|规范形|标准形/],
  ["概率-随机事件与概率", /概率|条件概率|独立|全概率|贝叶斯|古典概型/],
  ["概率-随机变量及分布", /分布函数|概率密度|随机变量|正态分布|泊松|均匀分布|二项分布|指数分布/],
  ["概率-多维随机变量", /联合分布|边缘分布|相互独立|二维随机|协方差|相关系数/],
  ["概率-数字特征", /数学期望|方差|协方差|相关系数|矩|期望/],
  ["概率-大数定律与中心极限", /大数定律|中心极限|切比雪夫|辛钦|依概率收敛/],
  ["概率-数理统计", /样本|统计量|估计量|最大似然|矩估计|置信区间|假设检验|无偏/],
]; }
function tagTopics(q) {
  const t = q.stem;
  const out = [];
  for (const [id, re] of topicRules()) if (re.test(t)) out.push(id);
  return out.slice(0, 3);
}

fs.writeFileSync("tools/cache/math-manifest.json", JSON.stringify({ subject: "math1", papers }, null, 1), "utf8");
console.log(report.join("\n"));
console.log("\n卷数:", papers.length, "总题:", totalQ, "选择题:", totalChoice);
