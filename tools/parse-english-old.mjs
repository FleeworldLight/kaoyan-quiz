/**
 * parse-english-old.mjs — 2010–2016 考研英语（一）真题 -> public/data/english1/<year>.json
 *
 * 素材来源（本地，非上游 markdown）：
 *   真题文本：KaoYan-English-master/真题集（纯真题可直接打印）英语一/PDF版本/2005—2016年历年考研英语真题集.pdf
 *   答案解析：KaoYan-English-master/答案解析/<year>年考研英语真题答案及解析.pdf
 * 二者先由 tools/x-extract-english.mjs 抽成
 *   tools/cache/english/local/paper-2005-2016.txt（12 年合集，按年份标题切分）
 *   tools/cache/english/local/ans-<year>.txt
 *
 * 纪律：题目/选项一律取自真题文本；答案/译文/范文一律取自答案解析文本。
 *       抓不到就留空字符串 + 降级 quality，绝不推断、绝不编造。
 *
 * 用法：node tools/parse-english-old.mjs [--diag] [年 年 ...]
 */
import fs from "node:fs";
import path from "node:path";

const LOCAL = "tools/cache/english/local";
const OUTS = "public/data/english1";
const PAPER_FILE = "paper-2005-2016.txt";
const YEARS = [2010, 2011, 2012, 2013, 2014, 2015, 2016];

const SRC_PAPER_NAME = "KaoYan-English-master · 历年考研英语（一）真题集（PDF版本 2005—2016）";
const SRC_PAPER_URL = "local:G:/期末及简历和别的项目/考研资料/KaoYan-English-master/真题集（纯真题可直接打印）英语一/PDF版本/2005—2016年历年考研英语真题集.pdf";
const SRC_ANS_NAME = "KaoYan-English-master · <year>年考研英语真题答案及解析（PDF）";
const SRC_ANS_URL = "local:G:/期末及简历和别的项目/考研资料/KaoYan-English-master/答案解析/<year>年考研英语真题答案及解析.pdf";

export const SEC_DEFS = [
  { id: "cloze", name: "Section I Use of English 完型填空", from: 1, to: 20, score: 0.5 },
  { id: "reading", name: "Section II Reading Comprehension Part A 阅读理解", from: 21, to: 40, score: 2 },
  { id: "newtype", name: "Section II Reading Comprehension Part B 新题型", from: 41, to: 45, score: 2 },
  { id: "translation", name: "Section III Translation 翻译", from: 46, to: 50, score: 2 },
  { id: "writing", name: "Section IV Writing 写作", from: 51, to: 52, score: 0 },
];
const CL = [..."ABCDEFGH"];

/* ------------------------------------------------------------------ 基础 */
export function loadLines(file) {
  let t = fs.readFileSync(file, "utf8").replace(/\r\n?/g, "\n");
  /* 全角罗马数字 -> 半角（长度会变，所以在切行之前一次性替换） */
  t = t.replace(/\u2160/g, "I").replace(/\u2161/g, "II").replace(/\u2162/g, "III").replace(/\u2163/g, "IV").replace(/\u2164/g, "V");
  t = t.replace(/[\u3000\u00a0]/g, " ");
  /* 商家页脚（答案解析 PDF 每页都有） */
  t = t.replace(/淘宝店铺[:：][^\s]*/g, " ").replace(/掌柜旺旺[:：][^\s]*/g, " ");
  return t.split("\n").filter((l) => !/^\s*<<PAGE\s*\d+>>\s*$/.test(l));
}
const T = (l) => String(l == null ? "" : l).trim();
const isPageNo = (s) => /^\d{1,3}$/.test(s);
/* PDF 换行把中文句子切断后 join(" ") 会留下多余空格：把「中文/中文标点」之间的空格去掉 */
const squeezeCJK = (s) => String(s || "").replace(/([\u3000-\u303f\u4e00-\u9fff\uff00-\uffef])\s+(?=[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef])/g, "$1");

/* 选项标记扫描。
   两种写法：
     `[A] text`       —— 方括号形式本身无歧义，不要求前导守卫（真题里存在 `…epidemics[D]describe…` 这种粘连）
     `A. text`/`A、text` —— 需要前导守卫，避免 When/But 之类单词首字母被误判 */
const OPT_BRACKET_RE = /\[\s*([A-H])\s*\]/g;
const OPT_DOT_RE = /(^|[\s([{（])([A-H])\s*[.．、)）]/g;
export function scanMarks(s) {
  const raw = [];
  let m;
  OPT_BRACKET_RE.lastIndex = 0;
  while ((m = OPT_BRACKET_RE.exec(s))) raw.push({ key: m[1], markStart: m.index, contentStart: m.index + m[0].length });
  OPT_DOT_RE.lastIndex = 0;
  while ((m = OPT_DOT_RE.exec(s))) raw.push({ key: m[2], markStart: m.index + m[1].length, contentStart: m.index + m[0].length });
  raw.sort((a, b) => a.markStart - b.markStart);
  const out = [];
  for (const mk of raw) {
    const last = out[out.length - 1];
    if (last && mk.markStart < last.contentStart) continue;
    out.push(mk);
  }
  return out;
}
/* 把 "…（第 N 空）" 形式的选项行拆成选项数组 */
export function splitOptionLine(s) {
  const marks = scanMarks(s);
  const opts = [];
  for (let k = 0; k < marks.length; k++) {
    const end = k + 1 < marks.length ? marks[k + 1].markStart : s.length;
    opts.push({ key: marks[k].key, text: s.slice(marks[k].contentStart, end).trim() });
  }
  return opts;
}
/* 清空行、页码行；合并多余空行 */
export function cleanJoin(arr) {
  return arr
    .map((l) => String(l).replace(/\s+$/, ""))
    .filter((l) => l.trim() && !isPageNo(l.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
/* 跳过 Directions 段落：从 Directions 行到含 "points" 的那一行（含） */
export function skipDirections(seg) {
  let i = 0;
  while (i < seg.length && !/^Directions\s*[:：]?/i.test(T(seg[i]))) i++;
  if (i >= seg.length) return 0;
  for (let j = i; j < Math.min(seg.length, i + 9); j++) {
    if (/points?\b/i.test(seg[j])) return j + 1;
  }
  return Math.min(seg.length, i + 4);
}

/* ------------------------------------------------------------------ 真题（PDF 文本）结构识别 */
const isClozeHdr = (t) => /^Section\s+I(?!I|V)\s*Use of English\b/i.test(t);
const isReadingHdr = (t) => /^Section\s+II\s*Reading Comprehension/i.test(t);
const isWritingHdr = (t) => /^Section\s+I{1,3}V?\s*Writing/i.test(t);
const isPartA = (t) => /^Part\s*A\b/i.test(t);
const isPartB = (t) => /^Part\s*B\b/i.test(t);
const isPartC = (t) => /^Part\s*C\b/i.test(t);
const isTextHdr = (t) => /^Text\s*([1-4])\s*$/i.test(t);

export function paperYearBlocks(paperLines) {
  const marks = [];
  paperLines.forEach((l, i) => {
    const m = T(l).match(/^((?:19|20)\d{2})\s*年全国硕士研究生/);
    if (m) marks.push({ year: Number(m[1]), i });
  });
  const map = new Map();
  for (let k = 0; k < marks.length; k++) {
    const end = k + 1 < marks.length ? marks[k + 1].i : paperLines.length;
    if (!map.has(marks[k].year)) map.set(marks[k].year, paperLines.slice(marks[k].i, end));
  }
  return map;
}
const findIdx = (lines, pred, from = 0, to = Infinity) => {
  for (let i = Math.max(0, from); i < Math.min(lines.length, to); i++) if (pred(T(lines[i]))) return i;
  return -1;
};

/* ------------------------------------------------------------------ 真题：完型 */
export function parseClozePaper(seg, iCloze, iEnd) {
  const region = seg.slice(iCloze + 1, iEnd);
  let o1 = -1;
  for (let i = 0; i < region.length; i++) {
    if (/^1\s*[.．、]\s*(?:\[\s*A\s*\]|A\s*[.．、])/.test(T(region[i]))) { o1 = i; break; }
  }
  if (o1 < 0) return { material: "", options: [] };
  let matLines = region.slice(0, o1);
  const d = skipDirections(matLines);
  if (d) matLines = matLines.slice(d);
  const material = cleanJoin(matLines);
  /* 连续读取 20 行选项（支持跨行续写） */
  const options = [];
  let n = 1;
  for (let i = o1; i < region.length && n <= 20; i++) {
    const t = T(region[i]);
    const m = t.match(/^(\d{1,2})\s*[.．、]\s*/);
    if (m && Number(m[1]) === n) {
      const rest = t.slice(m[0].length);
      const opts = splitOptionLine(rest);
      if (opts.length) {
        for (const o of opts) options.push({ no: n, ...o });
        n++;
        continue;
      }
    }
    if (options.length && !m) {
      /* 上一选项的续行 */
      options[options.length - 1].text += " " + t;
    } else if (m && Number(m[1]) !== n) {
      break;
    }
  }
  return { material, options };
}

/* ------------------------------------------------------------------ 真题：阅读 Part A */
function parseQBlock(lines) {
  let stem = "";
  const options = [];
  for (const raw of lines) {
    const t = T(raw);
    if (!t) continue;
    const marks = scanMarks(t);
    if (marks.length) {
      if (options.length >= 4) break;
      for (let k = 0; k < marks.length && options.length < 4; k++) {
        const end = k + 1 < marks.length ? marks[k + 1].markStart : t.length;
        options.push({ key: marks[k].key, text: t.slice(marks[k].contentStart, end).trim() });
      }
    } else if (!options.length) {
      stem += (stem ? " " : "") + t;
    } else {
      options[options.length - 1].text += " " + t;
    }
  }
  return { stem, options };
}
export function parseReadingPaper(seg, iStart, iEnd) {
  const texts = [];
  for (let i = iStart + 1; i < iEnd; i++) {
    const m = T(seg[i]).match(/^Text\s*([1-4])\s*$/i);
    if (m) texts.push({ no: Number(m[1]), i });
  }
  const materials = new Map();
  const questions = [];
  for (let k = 0; k < texts.length; k++) {
    const from = texts[k].i + 1;
    const to = k + 1 < texts.length ? texts[k + 1].i : iEnd;
    const sub = seg.slice(from, to);
    const qIdx = [];
    for (let i = 0; i < sub.length; i++) {
      const m = T(sub[i]).match(/^(\d{1,2})\s*[.．、]\s*\S/);
      if (m) {
        const n = Number(m[1]);
        if (n >= 21 && n <= 40) qIdx.push({ n, i });
      }
    }
    const matEnd = qIdx.length ? qIdx[0].i : sub.length;
    let matLines = sub.slice(0, matEnd);
    if (k === 0) {
      const d = skipDirections(matLines);
      if (d) matLines = matLines.slice(d);
    }
    const title = "Text " + texts[k].no;
    materials.set(title, cleanJoin(matLines));
    for (let j = 0; j < qIdx.length; j++) {
      const qEnd = j + 1 < qIdx.length ? qIdx[j + 1].i : sub.length;
      const block = sub.slice(qIdx[j].i, qEnd);
      const first = T(block[0]).replace(/^\d{1,2}\s*[.．、]\s*/, "");
      const parsed = parseQBlock([first, ...block.slice(1)]);
      questions.push({ no: qIdx[j].n, materialTitle: title, stem: parsed.stem, options: parsed.options });
    }
  }
  return { materials, questions };
}

/* ------------------------------------------------------------------ 真题：Part B / Part C / Writing */
export function parsePartBPaper(seg, iPartB, iPartC) {
  let body = seg.slice(iPartB + 1, iPartC > iPartB ? iPartC : seg.length);
  const d = skipDirections(body);
  if (d) body = body.slice(d);
  return cleanJoin(body);
}
export function parsePartCPaper(seg, iPartC, iWriting) {
  let body = seg.slice(iPartC + 1, iWriting > iPartC ? iWriting : seg.length);
  const d = skipDirections(body);
  if (d) body = body.slice(d);
  return cleanJoin(body);
}
export function parseWritingPaper(seg, iWriting, end) {
  const sub = seg.slice(iWriting + 1, end);
  const iA = findIdx(sub, isPartA);
  const iB = findIdx(sub, isPartB, iA < 0 ? 0 : iA + 1);
  const out = { 51: "", 52: "" };
  for (const no of [51, 52]) {
    const re = new RegExp("^\\s*" + no + "\\s*[.．、]\\s*");
    const lo = no === 51 ? 0 : iB >= 0 ? iB : 0;
    const hi = no === 51 ? (iB >= 0 ? iB : sub.length) : sub.length;
    let idx = -1;
    for (let i = lo; i < hi; i++) if (re.test(T(sub[i]))) { idx = i; break; }
    if (idx < 0) continue;
    const first = T(sub[idx]).replace(re, "");
    const body = idx + 1 < hi ? sub.slice(idx + 1, hi) : [];
    out[no] = cleanJoin([first, ...body]);
  }
  return out;
}

/* ------------------------------------------------------------------ 答案解析文件 */
export function ansStructure(lines) {
  const iCloze = findIdx(lines, isClozeHdr);
  const iRead = findIdx(lines, isReadingHdr, iCloze + 1);
  const iPartB = findIdx(lines, isPartB, iRead + 1);
  const iPartC = findIdx(lines, isPartC, iPartB + 1);
  const iTrans = findIdx(lines, (t) => /^Section\s+I{1,3}V?\s*Translation/i.test(t), Math.max(iPartB, iCloze) + 1);
  const after = Math.max(iPartB, iPartC, iTrans, iRead) + 1;
  const iWriting = findIdx(lines, isWritingHdr, after);
  return { iCloze, iRead, iPartB, iPartC, iTrans, iWriting };
}
function findAnswerLetter(lines, i, end) {
  for (let j = i; j < Math.min(end, i + 60); j++) {
    const k = lines[j].indexOf("【答案】");
    if (k < 0) continue;
    const rest = lines[j].slice(k + 4);
    const m = rest.match(/[A-H]/);
    if (m) return m[0];
    for (let q = j + 1; q < Math.min(end, j + 4); q++) {
      const m2 = lines[q].match(/[A-H]/);
      if (m2) return m2[0];
    }
    return "";
  }
  return "";
}
/* 源文件偶有漏写「【答案】」（如 2015 年第 31、36 题），但解析正文里明写了「正确答案为 X」。
   这里只在「【答案】」找不到时，用极窄的措辞把源文件自己写出的答案取出来，不做任何推断。 */
function findStatedAnswer(lines, i, end) {
  const RE = /正确答案[是为][^A-D【】\n]{0,8}?([A-D])/;
  for (let j = i; j < end; j++) {
    const m = lines[j].match(RE);
    if (m) return m[1];
  }
  return "";
}
function findExplanation(lines, i, end) {
  let s = -1;
  for (let j = i; j < end; j++) {
    if (/【(考点|解析|解题方法|解题思路)】/.test(lines[j])) { s = j; break; }
  }
  if (s < 0) return "";
  const buf = [];
  for (let j = s; j < end; j++) {
    let t = T(lines[j]);
    if (!t) continue;
    if (j > s && /^【[^】]{2,10}】/.test(t) && !/^【(解析|考点|补充|词汇|解题方法|参考译文)】/.test(t)) break;
    if (j > s && /^(Text\s*\d|Part\s*[ABC]|Section\s)/i.test(t)) break;
    buf.push(t);
  }
  return buf.join("\n").trim();
}
/* 顺序扫描题号入口，返回 Map<no, [{start,end}]>。同一题号可能多次出现
   （例如解析文件里「快速审题」和「试题解析」都列了题号），由 pickEntry 选带【答案】的那个。 */
function entries(lines, from, to, re) {
  const list = [];
  for (let i = from; i < to; i++) {
    const m = T(lines[i]).match(re);
    if (m) list.push({ n: Number(m[1]), i });
  }
  const map = new Map();
  for (let k = 0; k < list.length; k++) {
    const end = k + 1 < list.length ? list[k + 1].i : to;
    if (!map.has(list[k].n)) map.set(list[k].n, []);
    map.get(list[k].n).push({ start: list[k].i, end });
  }
  return map;
}
function pickEntry(lines, cands) {
  if (!cands || !cands.length) return null;
  for (const c of cands) {
    for (let i = c.start; i < c.end; i++) if (lines[i].includes("【答案】")) return c;
  }
  return cands[0];
}
/* 区域内所有「【答案】」按出现顺序的字母（用于入口题号被源文件写错时兜底） */
function orderedAnswerLetters(lines, from, to) {
  const out = [];
  for (let i = from; i < to; i++) {
    const k = lines[i].indexOf("【答案】");
    if (k < 0) continue;
    const m = lines[i].slice(k + 4).match(/[A-H]/);
    if (m) out.push(m[0]);
  }
  return out;
}
/* 若「区域内答案条数 == 应有题数」，则按顺序一一对应（防止源文件题号打错，如 2011 把 26 写成 6） */
function applyOrderFallback(map, lines, from, to, firstNo, count, warn) {
  const ordered = orderedAnswerLetters(lines, from, to);
  if (ordered.length !== count) return { applied: false, ordered };
  const diff = [];
  for (let k = 0; k < count; k++) {
    const n = firstNo + k;
    const cur = map.get(n);
    if (!cur || cur.key !== ordered[k]) diff.push(n + ":" + (cur ? cur.key || "∅" : "缺失") + "→" + ordered[k]);
  }
  if (!diff.length) return { applied: false, ordered };
  const nm = new Map();
  for (let k = 0; k < count; k++) {
    const n = firstNo + k;
    const cur = map.get(n) || { expl: "" };
    nm.set(n, { ...cur, key: ordered[k] });
  }
  warn("按顺序兜底映射（源文件题号有误）: " + diff.join(" "));
  for (const [k, v] of map) if (!nm.has(k)) nm.set(k, v);
  return { applied: true, map: nm, ordered };
}

export function parseAnsFile(lines, warn = () => {}) {
  const S = ansStructure(lines);
  const res = { cloze: new Map(), reading: new Map(), partB: new Map(), partC: new Map(), writing: {}, stated: [], diag: S };
  const put = (map, n, c, letters) => {
    if (!c) return;
    let key = findAnswerLetter(lines, c.start, c.end);
    if (!key) {
      const st = findStatedAnswer(lines, c.start, c.end);
      if (st) { key = st; res.stated.push(n + "→" + st); }
    }
    map.set(n, { key, expl: findExplanation(lines, c.start, c.end), start: c.start, end: c.end });
  };

  /* 完型 1-20：入口形如 `1.[A] xxx [B] xxx` */
  if (S.iCloze >= 0) {
    const end = S.iRead > S.iCloze ? S.iRead : lines.length;
    const e = entries(lines, S.iCloze + 1, end, /^(\d{1,2})\s*[.．、]\s*(?:\[\s*A\s*\]|A\s*[.．、])/);
    for (const [n, c] of e) if (n >= 1 && n <= 20) put(res.cloze, n, pickEntry(lines, c));
    const fb = applyOrderFallback(res.cloze, lines, S.iCloze + 1, end, 1, 20, warn);
    if (fb.applied) res.cloze = fb.map;
  }
  /* 阅读 21-40：入口形如 `21. …` 或 `21.【答案】X` */
  if (S.iRead >= 0) {
    const end = S.iPartB > S.iRead ? S.iPartB : lines.length;
    const e = entries(lines, S.iRead + 1, end, /^(\d{1,2})\s*[.．、]\s*(?:\S)/);
    for (const [n, c] of e) if (n >= 21 && n <= 40) put(res.reading, n, pickEntry(lines, c));
    const fb = applyOrderFallback(res.reading, lines, S.iRead + 1, end, 21, 20, warn);
    if (fb.applied) res.reading = fb.map;
  }
  /* Part B 41-45 */
  if (S.iPartB >= 0) {
    const end = (S.iPartC > S.iPartB ? S.iPartC : S.iTrans > S.iPartB ? S.iTrans : lines.length);
    const e = entries(lines, S.iPartB + 1, end, /^(\d{1,2})\s*[.．、]?\s*【答案】|^(\d{1,2})\s*[.．、]\s*(?:\S)/);
    for (const [n, c] of e) if (n >= 41 && n <= 45) put(res.partB, n, pickEntry(lines, c));
    const fb = applyOrderFallback(res.partB, lines, S.iPartB + 1, end, 41, 5, warn);
    if (fb.applied) res.partB = fb.map;
  }
  /* Part C 46-50 */
  const cFrom = S.iPartC >= 0 ? S.iPartC + 1 : S.iTrans >= 0 ? S.iTrans + 1 : -1;
  if (cFrom >= 0) {
    const cEnd0 = S.iWriting > cFrom ? S.iWriting : lines.length;
    let cEnd = cEnd0;
    let fullFrom = -1;
    /* 到「二、全文翻译/全文译文」为止（后面是整篇译文，不是逐题解析） */
    for (let i = cFrom; i < cEnd0; i++) {
      if (/^二、\s*全文(翻译|译文)/.test(T(lines[i]))) { cEnd = i; fullFrom = i; break; }
    }
    /* 个别年份（2011）Part C 解析里没有【译文】，参考译文只出现在「全文翻译」中且与上下文混排，
       此时按「标记后第一个句末标点」截取，并逐条人工核对（见 english-findings.md）。 */
    const fullText = fullFrom >= 0 ? lines.slice(fullFrom, cEnd0).join("\n") : "";
    const e = entries(lines, cFrom, cEnd, /^\s*[（(]?\s*(4[6-9]|50)\s*[)）]\s*\S/);
    for (const [n, cands] of e) {
      if (n < 46 || n > 50) continue;
      const r = cands[0];
      /* 原句：入口行 + 续行，直到出现【/试题考点/结构分析/完整译文 之类的标记行 */
      const sent = [];
      for (let j = r.start; j < r.end; j++) {
        const t = T(lines[j]);
        if (!t || isPageNo(t)) continue;
        if (j > r.start && /^(【|试题考点|结构分析|完整译文|【考点】)/.test(t)) break;
        if (/^[（(]\s*\d+\s*[)）]\s*[\d.]+\s*分/.test(t)) continue; /* 2016 的分值标注行 */
        sent.push(t);
      }
      let stem = sent.join(" ").replace(/^\s*[（(]?\s*4[6-9]\s*[)）]\s*|^\s*[（(]?\s*50\s*[)）]\s*/, "").replace(/\s*\/\/\s*/g, " ").trim();
      /* 译文 */
      let trans = "";
      for (let j = r.start; j < r.end; j++) {
        const t = T(lines[j]);
        const m = t.match(/^(?:【译文】|完整译文[:：])\s*(.*)$/);
        if (m) {
          const buf = [m[1].trim()];
          for (let q = j + 1; q < r.end; q++) {
            const t2 = T(lines[q]);
            if (!t2 || isPageNo(t2)) continue;
            if (/^(【|试题考点|结构分析|完整译文)/.test(t2) || /^\s*[（(]?\s*(4[6-9]|50)\s*[)）]\s*\S/.test(t2)) break;
            if (/^[一二三四五六七八九十]+、/.test(t2)) break;
            buf.push(t2);
          }
          trans = squeezeCJK(buf.join(" ").replace(/\s+/g, " ").trim());
          break;
        }
      }
      res.partC.set(n, { stem, answer: squeezeCJK(trans), start: r.start, end: r.end });
      if (!trans && fullText) {
        const re = new RegExp("(?:^|[^0-9])[（(]?\\s*" + n + "\\s*[)）]");
        const m = fullText.match(re);
        if (m) {
          const from2 = m.index + m[0].length;
          const tail = fullText.slice(from2);
          const st = tail.search(/[。？！]/);
          if (st >= 0) {
            const txt = squeezeCJK(tail.slice(0, st + 1).replace(/\s+/g, " ").trim()) + (tail.slice(st + 1).match(/^[”"』」）)]+/) || [""])[0];
            res.partC.get(n).answer = txt;
            res.partC.get(n).fromFullTranslation = true;
            if (!res.fullTrans) res.fullTrans = [];
            res.fullTrans.push(n + "→" + txt);
          }
        }
      }
    }
  }
  /* 写作范文 51/52 */
  if (S.iWriting >= 0) {
    const wEnd = lines.length;
    const iA = findIdx(lines, isPartA, S.iWriting + 1, wEnd);
    const iB = findIdx(lines, isPartB, iA < 0 ? S.iWriting + 1 : iA + 1, wEnd);
    for (const [no, lo0, hi0] of [[51, iA, iB], [52, iB, wEnd]]) {
      if (lo0 < 0) continue;
      const hi = hi0 > lo0 ? hi0 : wEnd;
      let s = -1;
      for (let i = lo0; i < hi; i++) if (/^二、\s*(参考范文|范文参考|范文)/.test(T(lines[i]))) { s = i; break; }
      if (s < 0) continue;
      const buf = [];
      for (let i = s + 1; i < hi; i++) {
        const t = T(lines[i]);
        if (/^三、/.test(t) || /^Part\s*[ABC]\b/i.test(t) || /^Section\s/.test(t)) break;
        if (isPageNo(t)) continue;
        buf.push(t);
      }
      res.writing[no] = buf.join("\n").trim();
    }
  }
  return res;
}

/* ------------------------------------------------------------------ 组卷 */
const DEARG = (s) => String(s || "").replace(/[\s ]{2,}/g, " ").trim();
function tagCloze(stem, opts) {
  const s = (stem + " " + opts.join(" ")).toLowerCase();
  if (/however|although|though|while|despite|because|therefore|thus|moreover|furthermore|nevertheless|instead|rather|besides|otherwise|unless|since|so that|in contrast|for example|on the contrary|as a result/.test(s)) return ["完型-逻辑关系"];
  return ["完型-词汇辨析"];
}
function tagReading(stem) {
  const s = stem.toLowerCase();
  if (/best title|mainly about|main idea|the text (?:is|mainly)|purpose of the text|the author.*(?:primarily|mainly) (?:discuss|argue)|which of the following (?:is|would be) the best title/.test(s)) return ["阅读-主旨题"];
  if (/attitude|tone|the author (?:seems|appears) to|feel about/.test(s)) return ["阅读-态度题"];
  if (/the word .* (?:is )?closest in meaning|the phrase .* (?:most probably )?mean|underlined (?:word|phrase|sentence)|refers to|the sentence .* suggests/.test(s)) return ["阅读-词义句意题"];
  if (/it (?:can|may) be (?:inferred|learned|concluded)|infer|implies|suggests that|we can (?:learn|infer)/.test(s)) return ["阅读-推断题"];
  if (/according to|paragraph \d|mentioned|because|the (?:study|example|case) |is (?:used|mentioned|cited) to|why/.test(s)) return ["阅读-细节题"];
  return [];
}

export function buildYear(year, paperSeg, ansLines, log = () => {}) {
  const iCloze = findIdx(paperSeg, isClozeHdr);
  const iReading = findIdx(paperSeg, isReadingHdr, iCloze + 1);
  const iPartA = findIdx(paperSeg, isPartA, iReading + 1);
  const iPartB = findIdx(paperSeg, isPartB, (iPartA < 0 ? iReading : iPartA) + 1);
  const iPartC = findIdx(paperSeg, isPartC, iPartB + 1);
  const iWriting = findIdx(paperSeg, isWritingHdr, iPartC + 1);
  log(`  结构: cloze@${iCloze} reading@${iReading} partA@${iPartA} partB@${iPartB} partC@${iPartC} writing@${iWriting}`);
  if (iCloze < 0 || iReading < 0 || iPartB < 0 || iPartC < 0 || iWriting < 0) {
    return { error: "真题结构识别不全（缺少 Section/Part 标题）" };
  }

  const cloze = parseClozePaper(paperSeg, iCloze, iReading);
  const reading = parseReadingPaper(paperSeg, iPartA < 0 ? iReading : iPartA, iPartB);
  const partBMaterial = parsePartBPaper(paperSeg, iPartB, iPartC);
  const partCMaterial = parsePartCPaper(paperSeg, iPartC, iWriting);
  const writingStems = parseWritingPaper(paperSeg, iWriting, paperSeg.length);
  const ans = parseAnsFile(ansLines, (m) => log("  " + m));

  log(`  完型: material=${cloze.material.length}字 options=${cloze.options.length}`);
  log(`  阅读: texts=${reading.materials.size} questions=${reading.questions.length} 选项数分布=${JSON.stringify(reading.questions.reduce((a, q) => { a[q.options.length] = (a[q.options.length] || 0) + 1; return a; }, {}))}`);
  log(`  PartB: material=${partBMaterial.length}字   PartC: material=${partCMaterial.length}字`);
  log(`  Writing stems: 51=${writingStems[51].length}字 52=${writingStems[52].length}字`);
  log(`  答案: cloze=${ans.cloze.size} reading=${ans.reading.size} partB=${ans.partB.size} partC=${ans.partC.size} writing=${Object.keys(ans.writing).length}`);
  if (ans.stated.length) log(`  源文件未写【答案】、由解析正文「正确答案为 X」取回: ${ans.stated.join(" ")}`);
  if (ans.fullTrans) log("  Part C 参考译文取自「全文翻译」段（源文件无【译文】）:\n    " + ans.fullTrans.join("\n    "));
  /* 交叉核对：区域内【答案】按序排列 应与 21-40 逐题答案一致 */
  const cross = [];
  for (const [firstNo, count, map] of [[1, 20, ans.cloze], [21, 20, ans.reading], [41, 5, ans.partB]]) {
    const seq = [];
    for (let n = firstNo; n < firstNo + count; n++) seq.push((map.get(n) || {}).key || "∅");
    cross.push(firstNo + ": " + seq.join(""));
  }
  log("  逐题答案序列: " + cross.join("  "));
  const badCloze = [...ans.cloze.entries()].filter(([, v]) => !v.key).map(([k]) => k);
  const badRead = [...ans.reading.entries()].filter(([, v]) => !v.key).map(([k]) => k);
  const badB = [...ans.partB.entries()].filter(([, v]) => !v.key).map(([k]) => k);
  const badC = [...ans.partC.entries()].filter(([, v]) => !v.answer).map(([k]) => k);
  if (badCloze.length) log(`  ⚠ 完型缺答案: ${badCloze.join(",")}`);
  if (badRead.length) log(`  ⚠ 阅读缺答案: ${badRead.join(",")}`);
  if (badB.length) log(`  ⚠ PartB 缺答案: ${badB.join(",")}`);
  if (badC.length) log(`  ⚠ PartC 缺译文: ${badC.join(",")}`);

  /* 选项：优先用真题文本里的；缺失时用解析文件里的 */
  const clozeOptsByNo = new Map();
  for (const o of cloze.options) {
    if (!clozeOptsByNo.has(o.no)) clozeOptsByNo.set(o.no, []);
    clozeOptsByNo.get(o.no).push({ key: o.key, text: o.text });
  }

  const groups = { cloze: [], reading: [], newtype: [], translation: [], writing: [] };

  /* 完型 1-20 */
  for (let n = 1; n <= 20; n++) {
    const a = ans.cloze.get(n) || { key: "", expl: "" };
    let opts = clozeOptsByNo.get(n) || [];
    if (opts.length !== 4) {
      /* 回退：从解析文件的选项行里补 */
      const line = ans.cloze.get(n) ? ansLines[ans.cloze.get(n).start] : null;
      if (line) {
        const m = T(line).match(/^\d{1,2}\s*[.．、]\s*(.*)$/);
        if (m) {
          const o2 = splitOptionLine(m[1]);
          if (o2.length) opts = o2;
        }
      }
    }
    groups.cloze.push({
      id: "english1-" + year + "-q" + n, no: n, type: "single",
      materialTitle: "完型填空原文", material: cloze.material,
      stem: "（第 " + n + " 空）",
      options: opts.map((o) => ({ key: o.key, text: DEARG(o.text) })),
      answer: CL.includes(a.key) ? a.key : "",
      explanation: DEARG(a.expl),
      score: 0.5, topics: [], images: [],
    });
  }
  /* 阅读 21-40 */
  for (const q of reading.questions) {
    const a = ans.reading.get(q.no) || { key: "", expl: "" };
    groups.reading.push({
      id: "english1-" + year + "-q" + q.no, no: q.no, type: "single",
      materialTitle: q.materialTitle, material: reading.materials.get(q.materialTitle) || "",
      stem: DEARG(q.stem),
      options: (q.options || []).map((o) => ({ key: o.key, text: DEARG(o.text) })),
      answer: CL.includes(a.key) ? a.key : "",
      explanation: DEARG(a.expl),
      score: 2, topics: [], images: [],
    });
  }
  /* 新题型 41-45 */
  const cand = new Set();
  for (const line of partBMaterial.split("\n")) {
    const m = T(line).match(/^[【\[]?\s*([A-H])\s*[】\]]/);
    if (m) cand.add(m[1]);
  }
  const letters = [...cand].sort().join("");
  for (let n = 41; n <= 45; n++) {
    const a = ans.partB.get(n) || { key: "" };
    groups.newtype.push({
      id: "english1-" + year + "-q" + n, no: n, type: "blank",
      materialTitle: "Part B 新题型", material: partBMaterial,
      stem: "第 " + n + " 空：请从 " + (letters || "A–G") + " 候选中选出最合适的一项填入该空",
      options: [], answer: CL.includes(a.key) ? a.key : "", explanation: "",
      score: 2, topics: [], images: [],
    });
  }
  /* 翻译 46-50 */
  for (let n = 46; n <= 50; n++) {
    const a = ans.partC.get(n) || { stem: "", answer: "" };
    groups.translation.push({
      id: "english1-" + year + "-q" + n, no: n, type: "essay",
      materialTitle: "Part C 翻译原文", material: partCMaterial,
      stem: a.stem || "",
      options: [], answer: a.answer || "", explanation: "",
      score: 2, topics: [], images: [],
    });
  }
  /* 写作 51/52 */
  for (const n of [51, 52]) {
    groups.writing.push({
      id: "english1-" + year + "-q" + n, no: n, type: "essay",
      materialTitle: "", material: "",
      stem: writingStems[n] || "",
      options: [], answer: ans.writing[n] || "", explanation: "",
      score: 0, topics: [], images: [],
    });
  }

  /* 打标 + 规范化 */
  for (const q of groups.cloze) q.topics = tagCloze(q.stem, q.options.map((o) => o.text));
  for (const q of groups.reading) q.topics = tagReading(q.stem);
  for (const q of groups.newtype) q.topics = ["新题型-排序/匹配"];
  for (const q of groups.translation) q.topics = ["翻译-长难句"];
  for (const q of groups.writing) q.topics = [q.no === 51 ? "写作-应用文" : "写作-图画作文"];

  const all = Object.values(groups).flat();
  const obj = all.filter((q) => q.type === "single");
  const answered = all.filter((q) => q.answer || q.explanation).length;
  const cover = all.length ? answered / all.length : 0;
  const optOk = obj.length ? obj.filter((q) => q.options.length === 4 && q.options.every((o) => o.text)).length / obj.length : 0;
  const clozeRead = all.filter((q) => q.no <= 40);
  const matOk = clozeRead.filter((q) => q.material).length / Math.max(1, clozeRead.length);
  let quality = "low";
  if (cover >= 0.9 && optOk >= 0.9) quality = "high";
  else if (cover >= 0.5 && optOk >= 0.7) quality = "medium";
  if (all.length < 40) quality = "low";
  return { year, groups, all, cover, optOk, matOk, quality, ans, cloze, reading, letters };
}

/* ------------------------------------------------------------------ 主流程 */
export function sectionsOf(groups) {
  return SEC_DEFS.filter((d) => groups[d.id] && groups[d.id].length).map((d) => ({ id: d.id, name: d.name, questions: groups[d.id] }));
}
export function totalScoreOf(sections) {
  return sections.reduce((s, sec) => s + sec.questions.reduce((x, q) => x + q.score, 0), 0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]).endsWith("parse-english-old.mjs");
if (isMain) {
  const diag = process.argv.includes("--diag");
  const pick = process.argv.slice(2).filter((a) => /^\d{4}$/.test(a)).map(Number);
  const years = pick.length ? pick : YEARS;
  const paperLines = loadLines(path.join(LOCAL, PAPER_FILE));
  const blocks = paperYearBlocks(paperLines);
  const report = [];
  for (const year of years) {
    const seg = blocks.get(year);
    const ansPath = path.join(LOCAL, "ans-" + year + ".txt");
    console.log("=== " + year);
    if (!seg) { console.log("  真题块缺失"); continue; }
    if (!fs.existsSync(ansPath)) { console.log("  答案解析文件缺失"); continue; }
    const ansLines = loadLines(ansPath);
    let r;
    try { r = buildYear(year, seg, ansLines, (m) => { if (diag) console.log(m); }); }
    catch (e) { console.log("  解析异常: " + e.message + "\n" + e.stack); continue; }
    if (r.error) { console.log("  " + r.error); continue; }
    const sections = sectionsOf(r.groups);
    const doc = {
      id: "english1-" + year, subject: "english1", subjectName: "英语一", year,
      title: year + " 年全国硕士研究生招生考试 英语（一）",
      duration: 180, totalScore: totalScoreOf(sections), quality: r.quality,
      source: {
        name: SRC_PAPER_NAME + " + " + SRC_ANS_NAME.replace("<year>", String(year)),
        url: SRC_PAPER_URL,
      },
      sections,
    };
    fs.mkdirSync(OUTS, { recursive: true });
    fs.writeFileSync(path.join(OUTS, year + ".json"), JSON.stringify(doc), "utf8");
    const secTxt = SEC_DEFS.map((d) => d.id + "=" + r.groups[d.id].length).join(" ");
    const badObj = r.all.filter((q) => q.type === "single" && q.options.length !== 4).map((q) => q.no);
    report.push(
      year + ": " + secTxt +
      "\n     选项完整=" + (r.optOk * 100).toFixed(0) + "%  答案/范文覆盖=" + (r.cover * 100).toFixed(0) +
      "%  完型+阅读有材料=" + (r.matOk * 100).toFixed(0) + "%  quality=" + r.quality +
      (badObj.length ? "\n     ⚠ 选项非 4 个: " + badObj.join(",") : "") +
      "\n     总题=" + r.all.length + " 总分=" + doc.totalScore
    );
  }
  console.log("\n" + report.join("\n"));
}
