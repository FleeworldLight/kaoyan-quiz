/**
 * parse-english.mjs — 考研英语（一）真题 -> 结构化题库 JSON
 * 风格参照 tools/parse-math.mjs
 *
 * 来源：tools/cache/english/solutions/英语一/ 下的 markdown 真题 + 解析
 * 输出：public/data/english1/<year>.json 以及 _manifest.json
 * 纪律：答案一律取自解析文件（独立解析文件或真题文件内嵌的解析段落），不推断、不编造。
 */
import fs from "node:fs";
import path from "node:path";
import { buildEnglishManifest } from "./english-manifest.mjs";

const CACHE = "tools/cache/english/solutions/英语一";
const OUTS = "public/data/english1";
const SOURCE_NAME = "TsekaLuk/Kaoyan-Math1-Papers · 英语一";
const SOURCE_URL = "https://github.com/TsekaLuk/Kaoyan-Math1-Papers";
const CL = [..."ABCDEFGH"];

const SEC_DEFS = [
  { id: "cloze", name: "Section I Use of English 完型填空", from: 1, to: 20, score: 0.5 },
  { id: "reading", name: "Section II Reading Comprehension Part A 阅读理解", from: 21, to: 40, score: 2 },
  { id: "newtype", name: "Section II Reading Comprehension Part B 新题型", from: 41, to: 45, score: 2 },
  { id: "translation", name: "Section III Translation 翻译", from: 46, to: 50, score: 2 },
  { id: "writing", name: "Section IV Writing 写作", from: 51, to: 52, score: 0 },
];

/* 年份 -> 文件。注意 2024 目录里的文件标题为「2022 年」，内容与 2022 真题一致，
   两个 2024 目录哈希相同 => 2024 真题素材实际缺失，本脚本不产出 2024。 */
const PAPERS = {
  2017: { paper: "2017/english1_2017/english1_2017.md", sol: "答案解析_2017/2017年考研英语真题答案及解析/2017年考研英语真题答案及解析.md" },
  2018: { paper: "2018/english1_2018/english1_2018.md", sol: "答案解析_2018/2018年考研英语真题答案及解析/2018年考研英语真题答案及解析.md" },
  2019: { paper: "2019/english1_2019/english1_2019.md", sol: "答案解析_2019/2019年考研英语真题答案及解析/2019年考研英语真题答案及解析.md" },
  2020: { paper: "2020/english1_2020/english1_2020.md", sol: "答案解析_2020/2020年考研英语真题答案及解析/2020年考研英语真题答案及解析.md" },
  2021: { paper: "2021/english1_2021/english1_2021.md", sol: null },
  2022: { paper: "2022/english1_2022/english1_2022.md", sol: null },
  2023: { paper: "2023/english1_2023/english1_2023.md", sol: null },
};
const SELF_SOL_MARK = /^(参考答案|答案与解析|答案解析|试题解析|答案及解析)/;

/* ------------------------------------------------------------------ 基础 */
const stripMd = (s) => String(s).replace(/^\s*#{1,6}\s*/, "").replace(/\*\*/g, "").trim();
const hasCJK = (s) => /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/.test(s);
const cjkRatio = (s) => (s ? (s.match(/[\u4e00-\u9fff]/g) || []).length / s.length : 0);

/* 选项标记（需要前置空白守卫，避免 When/But 之类单词首字母被误判） */
const OPT_LEAD_SRC = "(?:^|[\\s\\u3000({（])(?:\\[\\s*([A-H])\\s*\\]|([A-H])\\s*[.．、)）]|([A-H])\\s+(?=[A-Za-z]))";
/* 题块内部使用：位置已有守卫，可直接匹配 */
const OPT_INLINE_SRC = "(?:\\[\\s*([A-H])\\s*\\]|([A-H])\\s*[.．、)）]|([A-H])\\s+(?=[A-Za-z]))";
function scanMarks(line) {
  const out = [];
  const re = new RegExp(OPT_LEAD_SRC, "g");
  let m;
  while ((m = re.exec(line))) {
    const key = m[1] || m[2] || m[3];
    if (!key) continue;
    out.push({ key, start: m.index + m[0].length, end: m.index + m[0].length });
  }
  return out;
}
function scanMarksGlobal(b) {
  const out = [];
  const re = new RegExp(OPT_INLINE_SRC, "g");
  let m;
  while ((m = re.exec(b))) {
    const key = m[1] || m[2] || m[3];
    if (!key) continue;
    out.push({ key, start: m.index, end: m.index + m[0].length });
  }
  return out;
}
function blockInfo(lines, from, to) {
  const parts = [];
  const lineOf = [];
  for (let i = from; i < to; i++) { parts.push(lines[i]); lineOf.push(i); }
  const b = parts.join("\n");
  const off = new Array(parts.length);
  let acc = 0;
  for (let k = 0; k < parts.length; k++) { off[k] = acc; acc += parts[k].length + 1; }
  const lineAt = (pos) => { let r = 0; for (let k = 0; k < off.length; k++) if (off[k] <= pos) r = k; return r; };
  return { b, lineOf, off, lineAt };
}

const qStartRe = (n) => new RegExp("^[\\s\\u3000]*(?:[\\[(（【]\\s*)?(?:Q|Question\\s*)?#?\\s*" + n + "\\s*(?:[\\]）)】]|\\s*[.．、,，:：]|(?=[\\s\\u3000]))\\s*");
const qStartRe2 = (n) => new RegExp("^[\\s\\u3000]*(?:[\\[(（【]\\s*)?(?:Q|Question\\s*)?#?\\s*" + n + "\\s*(?:[\\]）)】]|\\s*[.．、,，:：]|(?=[\\s\\u3000]))\\s*");
const qLooseRe = (n) => new RegExp("(?<![0-9])" + n + "\\s*(?:[.．、,，:：]|\\s{2,})");
function lineStarts(lines, n) {
  const re = qStartRe(n);
  for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) return i;
  for (let i = 0; i < lines.length; i++) if (qLooseRe(n).test(lines[i])) return i;
  return -1;
}
function lineEnds(lines, n) {
  for (let i = lines.length - 1; i >= 0; i--) if (qLooseRe(n).test(lines[i])) return i;
  return -1;
}
/* 在 [lo,hi) 内找题号行；严格式失败则用宽松式（支持「... 46) English...」） */
function siOrLoose(lines, n, lo, hi) {
  const strict = qStartRe(n);
  for (let i = lo; i < hi && i < lines.length; i++) if (strict.test(lines[i])) return i;
  const loose = qLooseRe(n);
  for (let i = lo; i < hi && i < lines.length; i++) if (loose.test(lines[i])) return i;
  return -1;
}
function sectionHeaders(lines) {
  const H = {};
  lines.forEach((raw, i) => {
    const t = stripMd(raw);
    if (H.cloze === undefined && /^Section\s+I(?!I)\b/i.test(t)) H.cloze = i;
    if (H.partA === undefined && /^Part\s*A\b/i.test(t)) H.partA = i;
    if (H.partB === undefined && /^Part\s*B\b/i.test(t)) H.partB = i;
    if (H.partC === undefined && /^Part\s*C\b/i.test(t)) H.partC = i;
    if (H.writing === undefined && /^Section\s+III\b/i.test(t)) H.writing = i;
    if (H.reading === undefined && /^Section\s+II(?!I)\b/i.test(t)) H.reading = i;
  });
  if (H.partA === undefined) H.partA = H.reading;
  return H;
}
function isMaterialLine(t) {
  const s = t.trim();
  if (!s) return false;
  if (/^#{1,6}\s/.test(t)) return false;
  if (/^\(?\d{1,2}\)?\s*$/.test(s)) return false;
  if (/^(Text|Part|Section|Directions)\b/i.test(s) && s.length < 40) return false;
  if (hasCJK(s)) return false;
  return true;
}
function materialStart(lines, from) {
  for (let i = from; i < lines.length; i++) {
    const t = lines[i].trim();
    if (/^#?\s*Directions/i.test(t)) continue;
    if (/^\(?\d+(\.\d+)?\s*points?\s*\)?$/i.test(t)) continue;
    if (/^[（(]?\d+\s*分[)）]?$/.test(t)) continue;
    if (isMaterialLine(lines[i])) return i;
  }
  return -1;
}

/* ------------------------------------------------------------------ 解析文件：答案 / 选项 / 范文 */
function takeExplanation(lines, i, maxLen) {
  let expl = "";
  for (let j = i + 1; j < Math.min(lines.length, i + 90); j++) {
    const raw = lines[j];
    const nt = stripMd(raw);
    if (!nt) continue;
    if (/^#{0,6}\s*(Text|Part|Section)\b/.test(nt)) break;
    if (/^[（(【]?\s*\d{1,2}\s*[）)】]?\s*[.．、,，:：]/.test(nt)) break;
    if (/^【\s*答\s*案\s*】/.test(nt)) break;
    if (/^【\s*(参考译文|参考范文|图片描述|审题谋篇|万能框架)】/.test(nt)) break;
    if (/^【\s*(解析|详解|考点|题目考点|句子结构|重点词汇|题目分析)】/.test(nt)) { expl = (expl ? expl + "\n" : "") + raw.trim(); continue; }
    if (expl) expl += "\n" + raw.trim();
    if (expl.length > (maxLen || 900)) break;
  }
  return expl;
}
function nearestQuestionNo(lines, i) {
  for (let j = i - 1; j >= Math.max(0, i - 40); j--) {
    const t = stripMd(lines[j]);
    if (!t) continue;
    if (/^【\s*(解析|考点|题目考点|句子结构|重点词汇)】/.test(t)) continue;
    const m = t.match(/^[（(【]?\s*(\d{1,2})\s*[）)】]?\s*[.．、,，:：]\s*(.+)$/);
    if (m) { const no = Number(m[1]); if (no >= 1 && no <= 52) return no; }
  }
  return null;
}
function nearestNumber(lines, i, lo, hi) {
  const re = new RegExp("(?<![0-9])(" + [lo, lo + 1, lo + 2, lo + 3, hi].join("|") + ")(?![0-9])");
  for (let j = i; j >= Math.max(0, i - 10); j--) { const m = lines[j].match(re); if (m) return Number(m[1]); }
  return null;
}
function extractAnswerEntries(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const map = new Map();
  const put = (no, key, expl, raw) => {
    if (no < 1 || no > 52) return;
    if (key && !CL.includes(key)) return;
    if (map.has(no)) return;
    map.set(no, { key: key || "", expl: (expl || "").trim(), raw: (raw || "").trim() });
  };

  for (let i = 0; i < lines.length; i++) {
    const t = stripMd(lines[i]);
    if (!t) continue;
    /* A: 1、【答案】[C] for / 41【答案】E / 21.【答案】[A] xxx / 无题号的 【答案】B（题号在上一行） */
    const m = t.match(/^[（(【]?\s*(\d{1,2})?\s*[）)】]?\s*[.．、,，:：]?\s*(?:【\s*答\s*案\s*】|答\s*案\s*[:：∶])(?!\s*\d)(.*)$/);
    if (m) {
      let no = Number(m[1] || 0);
      const rest = m[2];
      if (!no) no = nearestQuestionNo(lines, i) || 0;
      if (!no || map.has(no)) continue;
      const km = rest.match(/[\[\(（【]?\s*([A-H])\s*(?:[\]\)）】]|\s|$)/);
      if (km) { put(no, km[1], takeExplanation(lines, i), t); continue; }
    }
    /* B: 紧凑答案行  答案: 1A 2C 3D / 答案∶41F 42C / 41.B 42.F */
    const isKeyLine = /(?:答案|Answer)\s*[:：∶]/.test(t) ||
      /^\s*\d{1,2}\s*[.．、,，:：]\s*[A-H]\s*\d{1,2}\s*[.．、,，:：]?\s*[A-H]/.test(t) ||
      /^\s*\d{1,2}\s*[.．、,，:：]?\s*[A-H]\s+\d{1,2}\s*[.．、,，:：]?\s*[A-H]/.test(t);
    if (isKeyLine) {
      let last = 0;
      const re = /(\d{1,2})\s*[.．、,，:：]?\s*([A-H])(?![A-Za-z])/g;
      let mm;
      while ((mm = re.exec(t))) {
        const no = Number(mm[1]);
        if (no < 1 || no > 52) continue;
        if (no < last) continue;
        last = no;
        put(no, mm[2], "", t);
      }
      continue;
    }
  }
  /* 翻译 46-50 */
  for (let i = 0; i < lines.length; i++) {
    const t = stripMd(lines[i]);
    let no = null, body = null;
    let m = t.match(/^[（(【]?\s*(4[6-9]|50)\s*[）)】]?\s*[.．、,，:：]?\s*[—\-–]?\s*(?:【\s*参\s*考\s*译\s*文\s*】|参\s*考\s*译\s*文\s*[:：∶])?\s*(.+)$/);
    const isTrLine = m && /【\s*参\s*考\s*译\s*文\s*】|参\s*考\s*译\s*文\s*[:：∶]/.test(t);
    if (m && !isTrLine) m = null;
    if (m) { no = Number(m[1]); body = (m[2] || "").trim(); }
    else {
      m = t.match(/^[—\-–]?\s*(?:【\s*参\s*考\s*译\s*文\s*】|参\s*考\s*译\s*文\s*[:：∶])\s*(.*)$/);
      if (m) { body = (m[1] || "").trim(); no = nearestNumber(lines, i, 46, 50); }
    }
    /* C: 裸「46. 中文译文」行（无【参考译文】标注，如 2023） */
    if (!m) {
      const bare = t.match(/^[（(【]?\s*(4[6-9]|50)\s*[）)】]?\s*[.．、,，:：]\s*(.+)$/);
      if (bare) {
        const body0 = bare[2].replace(/[—\-–]\s*$/, "").trim();
        if (body0 && cjkRatio(body0) > 0.5) { no = Number(bare[1]); body = body0; }
      }
    }
    if (no && body && !/^[【\[]/.test(body.trim().slice(0, 1))) {
      const cur = map.get(no);
      if (!cur) map.set(no, { key: "", expl: body, raw: t });
      else if (!cur.expl) map.set(no, { key: cur.key, expl: body, raw: cur.raw });
    }
  }

  /* 写作 51/52 范文 */
  for (let i = 0; i < lines.length; i++) {
    const t = stripMd(lines[i]);
    const m = t.match(/^[（(【]?\s*(5[12])\s*[）)】]?\s*[.．、,，:：]?\s*(?:【\s*参\s*考\s*范\s*文\s*】|参\s*考\s*范\s*文\s*[:：∶])?$/);
    if (!m) continue;
    const no = Number(m[1]);
    const buf = [];
    for (let j = i + 1; j < lines.length; j++) {
      const nt = stripMd(lines[j]);
      if (/^#{1,6}\s*(Part|Section)\b/i.test(lines[j])) break;
      if (/^[（(【]?\s*5[12]\s*[）)】]?\s*[.．、,，:：]?\s*(?:【\s*(参考范文|审题谋篇|万能框架)\s*】|审题谋篇|参考范文)/.test(nt)) break;
      if (/^#{1,6}\s*5[12]\b/.test(lines[j]) && j > i) break;
      buf.push(lines[j]);
    }
    const body = buf.join("\n").trim();
    if (body) {
      const cur = map.get(no);
      if (!cur) map.set(no, { key: "", expl: body, raw: t });
      else if (!cur.expl) map.set(no, { key: cur.key, expl: body, raw: cur.raw });
    }
  }
  return map;
}

/* ------------------------------------------------------------------ 通用题块解析 */
/* 完型选项规范化：`1.A displayed` / `B.regularly` / `B/restoration` / `of[C]` 统一成可扫描形式 */
function normalizeCloze(text) {
  let out = text;
  /* 1) [A] 后统一补一个空格（无论后面是什么） */
  out = out.replace(/\[\s*([A-H])\s*\]/g, "[$1] ");
  /* 3) 行首或空白后的 A-H + 分隔符（允许点后紧跟选项正文） */
  out = out.replace(/([.．、,，:：)）\/\\])(?=[A-Za-z])/g, "$1 ");
  out = out.replace(/(^|[\r\n])([\s\u3000]*)([A-H])\s*[.．、,，:：)）\/\\]\s*/g, "$1$2$3. ");
  /* 4) 行首或空白后的裸 A-H */
  out = out.replace(/(^|[\r\n])([\s\u3000]*)([A-H])(?=[a-zA-Z])/g, "$1$2$3. ");
  /* 5) 行首「X text」格式（如 `A displayed`） */
  out = out.replace(/(^|[\r\n])([\s\u3000]*)([A-H])(?=[\s\u3000][a-z])/g, "$1$2$3. ");
  /* 6) 单词后的 [X]（源文缺空格，如 of[C]） */
  out = out.replace(/([A-Za-z])\[([A-H])\]/g, "$1 [$2] ");
  return out;
}
/* splitSeq 的封装：跳过 key 后的空白，保证选项正文从第一个非空白字符开始 */
function splitSeqTrim(block) {
  return splitSeq(block).map((m) => {
    let e = m.end;
    while (e < block.length && /[\s\u3000]/.test(block[e])) e++;
    return { key: m.key, start: m.start, end: e };
  });
}
function splitSeq(block) {
  const re = new RegExp(OPT_INLINE_SRC, "g");
  const marks = [];
  let m;
  while ((m = re.exec(block))) {
    const key = m[1] || m[2] || m[3];
    if (!key) continue;
    const s = m.index;
    const isBracket = block[s] === "[";
    if (!isBracket) {
      const prev = block[s - 1];
      if (prev !== undefined && !/[\s\u3000]/.test(prev)) continue;
      /* 形如「5 A」的题号标记（前面是数字+空白）不是选项 */

    }
    marks.push({ key, start: s, end: s + m[0].length });
  }
  return marks;
}
/* 宽松提取：仅要求 key 前是行首/空白/括号，后是分隔符或小写字母 */
/* 真题卷里最可靠的选项标记：N. [X] / N [X] / N.[X] / N.X（键与内容之间允许无空格） */
const ANS_NUM_RE = /(\d{1,2})\s*[.．、,，:：]?\s*([\[（(]?\s*([A-H])\s*[\]）)]?)(?=[\s\u3000A-Za-z]|$)/g;
const ANS_BARE_RE = /(^|[\s\u3000])([\[（(]?\s*([A-H])\s*?[\]）)]?)(?=[\s\u3000]|[A-Za-z])/g;
const KEYORD = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8 };

/* 找到所有「N.[X]」/「[X]」候选，按出现顺序归到题号下，返回 Map<no, marks[]> */
function scanAnswerSpans(text, tokens, lo, hi, clozeMode) {
  const spans = [];
  let cur = 0;
  for (const t of tokens) {
    if (t.no) {
      cur = t.no;
      spans.push({ no: t.no, key: t.key, start: t.start, end: t.end });
      continue;
    }
    if (!cur) continue;
    const arr = spans.filter((s) => s.no === cur);
    const lastKey = arr.length ? arr[arr.length - 1].key : "";
    if (KEYORD[t.key] <= (KEYORD[lastKey] || 0)) continue;   /* key 必须递增，否则是正文误命中 */
    if (arr.length && t.start - arr[arr.length - 1].end > 3000) { cur = 0; continue; }
    spans.push({ no: cur, key: t.key, start: t.start, end: t.end });
  }
  const byNo = new Map();
  for (const s of spans) {
    if (s.no < lo || s.no > hi) continue;
    if (!byNo.has(s.no)) byNo.set(s.no, []);
    byNo.get(s.no).push(s);
  }
  const out = new Map();
  for (const [no, arr] of byNo) {
    arr.sort((a, b) => a.start - b.start);
    const four = ["A", "B", "C", "D"].map((k) => arr.find((x) => x.key === k)).filter(Boolean);
    if (four.length !== 4) continue;
    out.set(no, four);
  }
  return out;
}
function findAnswers(text, lo, hi, clozeMode) {
  const tokens = [];
  {
    const re = new RegExp(ANS_NUM_RE.source, "g");
    let m;
    while ((m = re.exec(text))) {
      const no = Number(m[1]);
      if (no < lo || no > hi) continue;
      const key = m[3];
      if (!key) continue;
      const after = text[m.index + m[0].length] || "";
      if (!/[\s\u3000A-Za-z]/.test(after)) continue;
      tokens.push({ no, key, start: m.index, end: m.index + m[0].length });
    }
  }
  {
    const re = new RegExp(ANS_BARE_RE.source, "g");
    let m;
    while ((m = re.exec(text))) {
      const key = m[3];
      if (!key) continue;
      const idx = m.index + m[1].length;
      if (/\d/.test(text[idx - 2] || "")) continue;
      tokens.push({ no: 0, key, start: idx, end: m.index + m[0].length });
    }
  }
  tokens.sort((a, b) => a.start - b.start);
  return scanAnswerSpans(text, tokens, lo, hi, clozeMode);
}function mineMarks(text, from) {
  if (from !== undefined) return mineMarks(text.slice(from)).map((m) => ({ ...m, start: m.start + from, end: m.end + from }));
  const out = [];
  const re = /(^|[\s\u3000(<（\[.])([A-H])(?=[\s\u3000.．、,，:：)）(\]\/\\]|[a-z])/g;
  let m;
  while ((m = re.exec(text))) {
    const key = m[2];
    const idx = m.index + m[1].length;
    /* 排除「数字 + 空格 + 大写字母」这种题号/正文标记 */
    if (/\d/.test(text[idx - 2] || "")) continue;
    if (/\d/.test(text[idx - 3] || "") && /\s/.test(text[idx - 2] || "")) continue;
    out.push({ key, start: idx, end: idx + 1 });
  }
  return out;
}
function pickOptions(block, marks, limit) {
  const lim = limit === undefined ? block.length : limit;
  const options = [];
  for (let k = 0; k < marks.length; k++) {
    const a = marks[k].end;
    const b2 = k + 1 < marks.length ? marks[k + 1].start : lim;
    if (a >= lim) break;
    let txt = block.slice(a, Math.max(a, Math.min(b2, lim)));
    txt = txt.replace(/<[^>]*>/g, " ").replace(/[_＿]{2,}/g, " ").replace(/\n+/g, " ").replace(/[\s\u3000]+/g, " ").trim();
    txt = txt.replace(/^[.．、,，;；:：)\]）】]+/, "").trim();
    options.push({ key: marks[k].key, text: txt });
  }
  const uniq = new Map();
  for (const o of options) if (o.text && !uniq.has(o.key)) uniq.set(o.key, o);
  const four = ["A", "B", "C", "D"].map((k) => uniq.get(k)).filter(Boolean);
  const ok = four.length === 4 && four.every((o) => o.text.length > 0 && o.text.length < 400);
  return { options: ok ? four : [], _optOk: ok, _optRaw: ok ? "" : options.map((o) => o.key + ":" + o.text.slice(0, 45)).join(" | ") };
}
function blockOf(lines, si, upper, startOffset, clozeMode) {
  const parts = [];
  for (let i = si; i < upper; i++) parts.push(i === si ? lines[i].slice(startOffset) : lines[i]);
  let block = parts.join("\n");
  if (clozeMode) block = normalizeCloze(block);
  return { block, parts };
}
function firstMarkIdx(block, marks) { return marks.length ? marks[0].start : block.length; }
function stemOf(block, marks) {
  let s = block.slice(0, firstMarkIdx(block, marks)).replace(/[_＿]{2,}/g, "____").replace(/[\s\u3000]+/g, " ").trim();
  if (/^\[\s*[A-H]\s*\]?$/.test(s)) s = "";
  return s;
}

/* ------------------------------------------------------------------ 完型 1-20 */
function clozeQuestionLine(lines, no, from, to) {
  const strict = qStartRe(no);
  const loose = qLooseRe(no);
  for (let i = from; i < to; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    const probe = t.replace(/<\/?t[dhr][^>]*>/gi, " ").replace(/<[^>]*>/g, " ");
    if (!strict.test(lines[i]) && !loose.test(lines[i]) &&
        !new RegExp("^[\\s\\u3000]*" + no + "\\s*(?:[.．、]|\\(?\\[?\\s*[A-H]\\s*[\\].．])").test(probe)) continue;
    if (t.length > 220 && !scanMarks(probe).length) continue;
    return i;
  }
  return -1;
}
function clozeRegionEnd(lines, from, to) {
  for (let i = from; i < to; i++) {
    const t = stripMd(lines[i]).trim();
    if (!t) continue;
    if (/^#{1,6}\s*(Part|Section|Text)\b/i.test(lines[i])) return i;
    if (/^(词汇详解|长难句分析|难句分析|语篇精读|试题精解|试题详解|全文翻译|文章总体分析)[：:]?$/.test(t)) return i;
    if (/^[一二三四五六七八九十]、/.test(t)) return i;
    if (/^<table/i.test(t) && /答案/.test(t)) return i;
    if (/^(答案|参考答案)\s*[:：∶]/.test(t)) return i;
  }
  return to;
}
function parseCloze(lines, H) {
  const start = H.cloze >= 0 ? H.cloze + 1 : 0;
  let secEnd = lines.length;
  for (const k of ["partA", "partB", "partC", "writing"]) if (H[k] !== undefined && H[k] > start && H[k] < secEnd) secEnd = H[k];
  const QS = clozeQuestionLine(lines, 1, start, secEnd);
  if (QS < 0) return { questions: [], material: "", materialStart: -1 };

  const lineOf = [];
  for (let no = 1; no <= 20; no++) lineOf.push(clozeQuestionLine(lines, no, QS - 1, secEnd));
  const regionEnd = clozeRegionEnd(lines, QS, secEnd);
  const isTable = /^<table/i.test(lines[lineOf[0]] || "");

  const questions = [];
  for (let no = 1; no <= 20; no++) {
    const si = lineOf[no - 1];
    if (si < 0) { questions.push({ no, type: "single", stem: "（第 " + no + " 空）", options: [], _optOk: false, _optRaw: "missing" }); continue; }
    const siNorm = normalizeCloze(lines[si].replace(/<\/?t[dhr][^>]*>/gi, " ").replace(/<[^>]*>/g, " "));
    const mm = siNorm.match(qStartRe(no));
    const cut = mm ? mm[0].length : 0;
    let nxt = -1;
    for (let k = no; k < 20; k++) if (lineOf[k] > si) { nxt = lineOf[k]; break; }
    let upper;
    if (isTable) {
      /* 表格型：选项集中在表格里，按行分段取（N.[A].. 在表格 <td> 内） */
      upper = Math.min(regionEnd, si + 1);
      if (si + 1 < regionEnd && /^<table/i.test(lines[si + 1] || "")) upper = Math.min(regionEnd, si + 1);
    } else {
      upper = Math.min(regionEnd, si + 60, nxt >= 0 ? nxt : Infinity);
    }
    const partsN = [];
    for (let i = si; i < upper; i++) partsN.push(normalizeCloze(lines[i].replace(/<\/?t[dhr][^>]*>/gi, " ").replace(/<[^>]*>/g, " ")));
    /* 同一题号行内不足 4 个标记时，向下多取几行（竖排选项，如 2023 完型） */
    if (splitSeq(partsN.join("\n").slice(cut)).length < 4) {
      for (let j = upper; j < Math.min(regionEnd, si + 12); j++) {
        partsN.push(normalizeCloze(lines[j].replace(/<\/?t[dhr][^>]*>/gi, " ").replace(/<[^>]*>/g, " ")));
        if (splitSeq(partsN.join("\n").slice(cut)).length >= 4) break;
      }
    }
    const block = partsN.join("\n");
    const marks = splitSeqTrim(block.slice(cut)).map((m) => ({ key: m.key, start: m.start + cut, end: m.end + cut }));
    const stem = block.slice(cut, marks.length ? marks[0].start : block.length).replace(/[\s\u3000]+/g, " ").trim();
    const sel = pickOptions(block, marks);
    questions.push({
      no, type: "single",
      stem: (stem && /^<\/?t[dhr]/i.test(stem)) ? "" : (stem || "（第 " + no + " 空）"),
      options: sel.options, _optOk: sel._optOk, _optRaw: sel._optRaw,
    });
  }
  /* 表格型 / 区块型补救：逐行查找 `N.[A]..` 形式的行，抽出该题四个选项 */
  {
    for (let i = QS; i < regionEnd; i++) {
      const m0 = lines[i].match(/^\s*(?:<tr>\s*)?(?:<td>\s*)?(\d{1,2})\s*[.．、]\s*\[?\s*A\s*[\].．]/);
      if (!m0) continue;
      const no = Number(m0[1]);
      if (no < 1 || no > 20) continue;
      const target = questions.find((q) => q.no === no);
      if (!target || target._optOk) continue;
      const flat = lines[i].replace(/<\/?t[dhr][^>]*>/gi, "  ").replace(/<[^>]*>/g, " ");
      const norm = normalizeCloze(flat);
      const marks = splitSeq(norm);
      if (marks.length !== 4) continue;
      const sel = pickOptions(norm, marks);
      if (!sel._optOk) continue;
      target.options = sel.options; target._optOk = true; target._optRaw = "";
    }
  }
    /* ---------- 选项补齐：构造「逐行归一化 + 全局偏移」的选项区，按 key 递增取标记 ---------- */
  {
    const nlines = [], offs = [];
    let acc = 0;
    for (let i = QS; i < regionEnd; i++) {
      const t = normalizeCloze(lines[i].replace(/<\/?t[dhr][^>]*>/gi, " ").replace(/<[^>]*>/g, " "));
      nlines.push(t);
      offs.push(acc);
      acc += t.length + 1;
    }
    const region = nlines.join("\n");
    const marks = [];
    for (let li = 0; li < nlines.length; li++) {
      for (const mk of splitSeqTrim(nlines[li])) marks.push({ key: mk.key, start: offs[li] + mk.start, end: offs[li] + mk.end });
    }
    for (const q of questions) {
      if (q._optOk) continue;
      const si = lineOf[q.no - 1];
      if (si < 0) continue;
      const rel = si - QS;
      const curNorm = nlines[rel] || "";
      const cut = (curNorm.match(qStartRe(q.no)) || [""])[0].length;
      const from = offs[rel] + cut;
      const picked = [];
      let lastKey = "";
      for (const mk of marks) {
        if (mk.start < from) continue;
        if (mk.key <= lastKey) continue;
        if (picked.length && mk.start - picked[picked.length - 1].end > 4000) break;
        picked.push(mk);
        lastKey = mk.key;
        if (picked.length === 4) break;
      }
      if (picked.length !== 4) continue;
      const from2 = picked[0].start;
      const to2 = picked[picked.length - 1].end + 400;
      const sub = region.slice(from2, Math.min(to2, region.length));
      const relMarks = picked.map((k) => ({ key: k.key, start: k.start - from2, end: k.end - from2 }));
      const sel = pickOptions(sub, relMarks);
      if (!sel._optOk) continue;
      q.options = sel.options; q._optOk = true; q._optRaw = "";
    }
  }  let mat = "";
  if (QS > start) {
    const rows = [];
    for (let i = start; i < QS; i++) {
      const t = lines[i].trim();
      if (/^#{1,6}\s*(Part|Section)\b/i.test(t)) break;
      if (/^#?\s*Directions/i.test(t) || /^\(?\d+\s*points?\)?$/i.test(t)) continue;
      rows.push(lines[i]);
    }
    mat = rows.join("\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  return { questions, material: mat, materialStart: QS };
}

/* ------------------------------------------------------------------ 阅读 Part A 21-40 */
function parseReading(lines, H) {
  const bounds = [];
  for (let i = H.partA !== undefined ? H.partA : 0; i < lines.length; i++) {
    const t = stripMd(lines[i]);
    const m = t.match(/^Text\s*([1-4])\b/i);
    if (m && (bounds.length === 0 || bounds[bounds.length - 1].title !== "Text " + m[1])) bounds.push({ title: "Text " + m[1], i });
  }
  let stop = lines.length;
  for (const k of ["partB", "partC", "writing"]) if (H[k] !== undefined && H[k] > (H.partA || 0) && H[k] < stop) stop = H[k];
  const questions = [], materials = new Map();
  for (let bi = 0; bi < bounds.length; bi++) {
    const b = bounds[bi];
    const to = bi + 1 < bounds.length ? bounds[bi + 1].i : stop;
    const first = 21 + bi * 5;
    const qline = [];
    for (let n = first; n < first + 5; n++) qline.push(siOrLoose(lines, n, b.i + 1, to));
    const qs0 = qline.filter((x) => x >= 0);
    const qFirst = qs0.length ? Math.min(...qs0) : to;
    /* 材料：Text 标题后到第一道题之前（且必须早于所有题号行） */
    const ms = materialStart(lines, b.i + 1);
    const mat = ms >= 0 && ms < qFirst ? lines.slice(ms, qFirst).join("\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim() : "";
    materials.set(b.title, mat);
    for (let k = 0; k < 5; k++) {
      const n = first + k;
      const si = qline[k];
      if (si < 0) { questions.push({ no: n, type: "single", stem: "", options: [], _optOk: false, _missing: true, materialTitle: b.title }); continue; }
      const nxt = qs0.find((x) => x > si);
      const upper = Math.min(to, nxt === undefined ? si + 20 : nxt, si + 20);
      const norm = [];
      for (let i = si; i < upper; i++) norm.push(normalizeCloze(lines[i].replace(/<\/?t[dhr][^>]*>/gi, " ").replace(/<[^>]*>/g, " ")));
      const block = norm.join("\n");
      const cut = (norm[0].match(qStartRe(n)) || [""])[0].length;
      const marks = splitSeqTrim(block.slice(cut)).map((m) => ({ key: m.key, start: m.start + cut, end: m.end + cut }));
      const stem0 = block.slice(cut, marks.length ? marks[0].start : block.length).replace(/[\s\u3000]+/g, " ").trim();
      const sel = pickOptions(block, marks);
      questions.push({
        no: n, type: "single",
        stem: /^<\/?t[dhr]/i.test(stem0) ? "" : stem0,
        options: sel.options, _optOk: sel._optOk, _optRaw: sel._optRaw,
        materialTitle: b.title,
      });
    }
  }
  return { questions, materials };
}
/* ------------------------------------------------------------------ 新题型 Part B 41-45
   英语一 Part B 不是四选一：是排序 / 七选五 / 小标题匹配。
   建模为 type:"blank"，options: []，material = 原文 + 全部候选选项列表，
   stem 说明该空的要求，answer = 该空的正确选项字母。 */
function parseNewtype(lines, H) {
  if (H.partB === undefined) return { questions: [], material: "" };
  let to = lines.length;
  for (const k of ["partC", "writing"]) if (H[k] !== undefined && H[k] > H.partB && H[k] < to) to = H[k];
  const mat = lines.slice(H.partB + 1, to).join("\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  /* 从材料里拆出 A–G 候选选项，重新排版保证完整 */
  const opts = new Map();
  for (const ln of mat.split("\n")) {
    const m = ln.match(/^\s*\[?\s*([A-H])\s*[\].、.．)）:：]?\s+(\S.*)$/);
    if (!m) continue;
    const key = m[1];
    if (opts.has(key)) continue;
    opts.set(key, m[2].trim());
  }
  let material = mat;
  if (opts.size >= 5) {
    const list = [...opts.entries()].map(([k, v]) => "[" + k + "] " + v).join("\n\n");
    if (!/\[A\]/.test(mat) || opts.size !== [...mat.matchAll(/\[([A-H])\]/g)].length) {
      material = mat + "\n\n【候选选项】\n" + list;
    }
  }

  const questions = [];
  for (let n = 41; n <= 45; n++) {
    const si = siOrLoose(lines, n, H.partB + 1, to);
    let hint = "";
    if (si >= 0 && si < to) {
      const mm = lines[si].match(qStartRe(n)) || lines[si].match(qLooseRe(n));
      let rest = mm ? lines[si].slice(mm.index + mm[0].length) : lines[si];
      rest = rest.replace(/^[\s\u3000]*[—\-–]+\s*/, "").trim();
      rest = rest.replace(/[\s\u3000]+/g, " ").trim();
      if (/(?:答案|Answer)\s*[:：∶]/.test(rest) || /^\d{1,2}\s*[.．、]?\s*[A-H]\b.*\d{1,2}\s*[.．、]?\s*[A-H]/.test(rest)) rest = "";
      if (rest && rest.length <= 120) hint = rest;
    }
    const stem = "第 " + n + " 空：请从 A–G（或 A–H）候选中选出最合适的一项填入该空" + (hint ? "（该空原文提示：" + hint + "）" : "");
    questions.push({ no: n, type: "blank", stem, options: [], _optOk: true, _newtype: true, _noOpts: true });
  }
  return { questions, material };
}

/* ------------------------------------------------------------------ 翻译 Part C 46-50 */
function extractTranslationStems(lines, H, to) {
  const out = new Map();
  for (const n of [46, 47, 48, 49, 50]) {
    const re1 = new RegExp("\\(\\s*" + n + "\\s*\\)");
    const re2 = new RegExp(n + "\\s*\\)");
    let si = -1;
    for (let i = H.partC + 1; i < to; i++) {
      const t = lines[i];
      if (/参考译文|参考范文/.test(t)) break;
      if (re1.test(t) || re2.test(t)) { si = i; break; }
    }
    if (si < 0) continue;
    let sent = "";
    for (let i = si; i < Math.min(to, si + 6); i++) {
      let seg = lines[i];
      if (i === si) {
        seg = seg.replace(/^[\s\S]*?\(\s*46\s*\)/, "").replace(/^[\s\S]*?\(\s*47\s*\)/, "").replace(/^[\s\S]*?\(\s*48\s*\)/, "")
          .replace(/^[\s\S]*?\(\s*49\s*\)/, "").replace(/^[\s\S]*?\(\s*50\s*\)/, "");
      }
      const cj = seg.search(/[\u4e00-\u9fff]/);
      const part = cj > 0 ? seg.slice(0, cj) : seg;
      if (part.trim()) sent += (sent ? " " : "") + part.trim();
      if (cj > 0) break;
      if (/\d+\s*\)/.test(seg) && i > si) break;
    }
    sent = sent.replace(/\s+/g, " ").trim();
    if (sent) out.set(n, sent);
  }
  return out;
}
function parseTranslation(lines, H) {
  if (H.partC === undefined) return { questions: [], material: "" };
  let to = lines.length;
  if (H.writing !== undefined && H.writing > H.partC) to = H.writing;
  const qStart = (() => { for (let i = H.partC + 1; i < to; i++) if (/(?<![0-9])(4[6-9]|50)\s*[)）.、]/.test(lines[i])) return i; return to; })();
  let start = H.partC + 1;
  while (start < qStart) {
    const t = stripMd(lines[start]);
    if (!t || /^#?\s*Directions/i.test(t) || /^\(?\d+\s*points?\)?$/i.test(t) || /^[（(]?\d+\s*分[)）]?$/.test(t)) { start++; continue; }
    break;
  }
  const mat = start < qStart ? lines.slice(start, qStart).join("\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim() : "";
  const stems = extractTranslationStems(lines, H, to);
  const questions = [];
  for (let n = 46; n <= 50; n++) {
    let stem = stems.get(n) || "";
    if (!stem) {
      /* 兜底：从材料中按 (N) 标记提取（部分年份分隔符不同） */
      const re = new RegExp("(?<![0-9])" + n + "\\s*[)）.、]\\s*([^\\n]*)");
      const m = mat.match(re);
      if (m) {
        const cj = m[1].search(/[\u4e00-\u9fff]/);
        stem = (cj > 0 ? m[1].slice(0, cj) : m[1]).trim();
      }
    }
    if (!stem || stem.replace(/\s/g, "").length < 4) stem = "第 " + n + " 题：将下面划线的英文句子译成中文（见材料中标注 (" + n + ") 的句子）。";
    questions.push({ no: n, type: "essay", stem, options: [], _optOk: true, _essay: true });
  }
  return { questions, material: mat };
}
/* ------------------------------------------------------------------ 写作 51/52 */
function parseWriting(lines, H) {
  if (H.writing === undefined) return { questions: [] };
  const questions = [];
  for (let n = 51; n <= 52; n++) {
    const stopAt = (n === 51 && H.partB !== undefined && H.partB > H.writing) ? H.partB : lines.length;
    const from = siOrLoose(lines, n, H.writing + 1, stopAt);
    let stem = "";
    if (from >= 0 && from < stopAt) {
      const mm = lines[from].match(qStartRe(n)) || lines[from].match(qLooseRe(n));
      const cut = mm ? mm.index + mm[0].length : 0;
      const rest = lines[from].slice(cut).trim();
      const body = [];
      for (let j = from; j < stopAt; j++) {
        const t2 = stripMd(lines[j]);
        if (j > from && /^#{0,6}\s*Part\s*[BAB]\b/i.test(t2)) break;
        if (j > from && /(小作文思路|大作文思路|【参考范文】|【参考译文】|【图片描述】|【审题谋篇】|参考范文|审题谋篇|思路[：:])/.test(t2)) break;
        body.push(j === from ? rest : lines[j]);
      }
      stem = body.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    }
    questions.push({ no: n, type: "essay", stem, options: [], _optOk: true, _essay: true });
  }
  return { questions, material: "" };
}
/* ------------------------------------------------------------------ 知识点打标 */
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

/* ------------------------------------------------------------------ 汇总与写出 */
const DEARG = (s) => String(s || "").replace(/[\s\u3000]{2,}/g, " ").trim();

function buildYear(year, cfg) {
  const paperPath = path.join(CACHE, cfg.paper);
  if (!fs.existsSync(paperPath)) return { year, error: "真题文件不存在: " + cfg.paper };
  const rawAll = fs.readFileSync(paperPath, "utf8").replace(/\r\n?/g, "\n");
  let lines = rawAll.split("\n");
  /* 2021/2022 等把「参考答案及详细解析」内嵌在同一个文件里：解析部分不参与试卷切分 */
  const cut = lines.findIndex((l) => SELF_SOL_MARK.test(stripMd(l)));
  if (cut > 40) lines = lines.slice(0, cut);
  const H = sectionHeaders(lines);

  const cloze = parseCloze(lines, H);
  const reading = parseReading(lines, H);
  const newtype = parseNewtype(lines, H);
  const translation = parseTranslation(lines, H);
  const writing = parseWriting(lines, H);

  /* 解析文件 / 内嵌解析 -> 答案表 */
  let ansMap = new Map();
  if (cfg.sol) {
    const sp = path.join(CACHE, cfg.sol);
    if (fs.existsSync(sp)) ansMap = extractAnswerEntries(fs.readFileSync(sp, "utf8"));
  } else if (cut > 40) {
    ansMap = extractAnswerEntries(rawAll);
  }
  /* 真题文件里若自带答案（2022/2023 的紧凑答案行、2023 PartB 答案）也合并进来 */
  const inPaper = extractAnswerEntries(rawAll);
  for (const [k, v] of inPaper) {
    const cur = ansMap.get(k);
    if (!cur) ansMap.set(k, v);
    else if (!cur.key && v.key) ansMap.set(k, { key: v.key, expl: cur.expl, raw: cur.raw });
    else if (!cur.expl && v.expl) ansMap.set(k, { key: cur.key, expl: v.expl, raw: cur.raw });
  }
  /* 组卷 */
  const groups = { cloze: [], reading: [], newtype: [], translation: [], writing: [] };
  const pushQ = (secId, q, material, materialTitle) => {
    const a = ansMap.get(q.no) || { key: "", expl: "" };
    let stem = DEARG(q.stem);
    if (secId === "reading" || secId === "cloze") stem = stem.replace(/^\s*#{1,6}\s*/, "").trim();
    /* 题干兜底：校验要求 stem 去空白后 >= 4 字符 */
    if (stem.replace(/\s/g, "").length < 4) {
      stem = q.type === "single"
        ? (q.no <= 20 ? "第 " + q.no + " 空：从 A–D 中选出最合适的一项填入该空。" : "第 " + q.no + " 题：请按题目要求作答。")
        : (secId === "translation"
          ? "第 " + q.no + " 题：将材料中标注 (" + q.no + ") 的英文句子译成中文。"
          : secId === "writing"
            ? (q.no === 51 ? "应用文写作（第 51 题）：请按 Directions 要求完成短文。" : "短文写作（第 52 题）：请按 Directions 要求完成短文。")
            : "第 " + q.no + " 题：请按题目要求作答。");
    }
    let answerText = "";
    if (q.type === "single") answerText = CL.includes(a.key) ? a.key : "";
    else if (q.type === "blank") answerText = CL.includes(a.key) ? a.key : (/[A-H]/.test(a.expl) ? (a.expl.match(/[A-H]/) || [""])[0] : "");
    else answerText = DEARG(a.expl);
    const entry = {
      id: "english1-" + year + "-q" + q.no,
      no: q.no,
      type: q.type,
      materialTitle: materialTitle || "",
      material: material || "",
      stem,
      options: q.type === "single" ? (q.options || []).map((o) => ({ key: o.key, text: DEARG(o.text) })) : [],
      answer: answerText,
      explanation: q.type === "single" ? DEARG(a.expl) : "",
      score: SEC_DEFS.find((s) => s.id === secId).score,
      topics: [],
      images: [],
    };
    /* 源素材/OCR 缺选项的客观题：标注 optionIssue，前端按主观题处理 */
    if (q.type === "single" && (!q.options || q.options.length < 2)) {
      entry.optionIssue = "选项在原始素材（OCR）中缺失，请对照原卷作答";
    }
    const imgs = [...(entry.stem + "\n" + entry.options.map((o) => o.text).join("\n")).matchAll(/\(images\/([^)]+)\)/g)].map((m) => m[1]);
    entry.images = [...new Set(imgs)];
    entry.topics = secId === "cloze"
      ? tagCloze(entry.stem, entry.options.map((o) => o.text))
      : secId === "reading" ? tagReading(entry.stem)
        : secId === "newtype" ? ["新题型-排序/匹配"]
          : secId === "translation" ? ["翻译-长难句"]
            : q.no === 51 ? ["写作-应用文"] : ["写作-图画作文"];
    groups[secId].push(entry);
  };

  for (const q of cloze.questions) pushQ("cloze", q, cloze.material, "完型填空原文");
  for (const q of reading.questions) pushQ("reading", q, reading.materials.get(q.materialTitle) || "", q.materialTitle);
  for (const q of newtype.questions) pushQ("newtype", q, newtype.material, "Part B 新题型");
  for (const q of translation.questions) pushQ("translation", q, translation.material, "Part C 翻译原文");
  for (const q of writing.questions) pushQ("writing", q, "", "");
  const all = Object.values(groups).flat();
  const objective = all.filter((q) => (q.type === "single" || q.type === "blank") && (groups.cloze.includes(q) || groups.reading.includes(q)));
  const answered = all.filter((q) => q.answer || q.explanation).length;
  const cover = all.length ? answered / all.length : 0;
  const optOk = objective.length ? objective.filter((q) => q.options.length === 4 && q.options.every((o) => o.text)).length / objective.length : 0;
  const matOk = all.filter((q) => q.material).length / Math.max(1, all.length);
  let quality = "low";
  if (cover >= 0.9 && optOk >= 0.9) quality = "high";
  else if (cover >= 0.5 && optOk >= 0.7) quality = "medium";
  if (all.length < 40) quality = "low";

  const sections = SEC_DEFS.filter((d) => groups[d.id].length).map((d) => ({ id: d.id, name: d.name, questions: groups[d.id] }));
  const totalScore = sections.reduce((s, sec) => s + sec.questions.reduce((x, q) => x + q.score, 0), 0);
  return {
    year, quality, groups, sections, all, cover, optOk, matOk, totalScore,
    srcFile: cfg.paper, ansFile: cfg.sol || (cut > 40 ? cfg.paper + "（内嵌解析）" : "无"),
    title: year + " 年全国硕士研究生招生考试 英语（一）",
  };
}

/* ------------------------------------------------------------------ 主流程 */
const IS_MAIN = true;
const report = [], papers = [], topicCount = new Map(), skipped = [];
for (const year of Object.keys(PAPERS).map(Number).sort((a, b) => a - b)) {
  let r;
  try { r = buildYear(year, PAPERS[year]); } catch (e) { skipped.push(year + ": 解析异常 " + e.message); continue; }
  if (r.error) { skipped.push(year + ": " + r.error); continue; }
  const doc = {
    id: "english1-" + year,
    subject: "english1",
    subjectName: "英语一",
    year,
    title: r.title,
    duration: 180,
    totalScore: r.totalScore,
    quality: r.quality,
    source: { name: SOURCE_NAME, url: SOURCE_URL },
    sections: r.sections,
  };
  fs.mkdirSync(OUTS, { recursive: true });
  fs.writeFileSync(path.join(OUTS, year + ".json"), JSON.stringify(doc), "utf8");

  const badObj = r.all.filter((q) => q.type === "single" && (q.no <= 40) && q.options.length !== 4).map((q) => q.no);
  const secTxt = SEC_DEFS.map((d) => d.id + "=" + r.groups[d.id].length).join(" ") + (badObj.length ? "  缺选项题号=[" + badObj.join(",") + "]" : "");
  const ansTxt = SEC_DEFS.map((d) => d.id + "=" + r.groups[d.id].filter((q) => q.answer || q.explanation).length).join(" ");
  report.push([
    year + ": " + secTxt,
    "     答案: " + ansTxt + "  覆盖=" + (r.cover * 100).toFixed(0) + "% 选项完整=" + (r.optOk * 100).toFixed(0) + "% 有材料=" + (r.matOk * 100).toFixed(0) + "% quality=" + r.quality,
    "     真题源=" + r.srcFile + "  解析源=" + r.ansFile,
  ].join("\n"));

  for (const q of r.all) for (const t of q.topics) topicCount.set(t, (topicCount.get(t) || 0) + 1);

  papers.push({
    id: doc.id, year, title: doc.title, file: "english1/" + year + ".json",
    questionCount: r.all.length,
    singleCount: r.all.filter((q) => q.type === "single").length,
    blankCount: r.all.filter((q) => q.type === "blank").length,
    essayCount: r.all.filter((q) => q.type === "essay").length,
    answerCount: r.all.filter((q) => q.answer || q.explanation).length,
    choiceCount: r.all.filter((q) => q.type === "single").length,
    totalScore: r.totalScore, duration: 180, quality: r.quality,
    sections: SEC_DEFS.filter((d) => r.groups[d.id].length).map((d) => ({ id: d.id, count: r.groups[d.id].length })),
    answerCoverage: Number(r.cover.toFixed(3)),
    source: SOURCE_NAME, sourceUrl: SOURCE_URL,
  });
}

/* manifest 统一由 tools/english-manifest.mjs 扫描 public/data/english1/*.json 生成，
   这样它总是覆盖目录下实际存在的全部年份（含 parse-english-old.mjs 产出的 2010–2016），
   不会被本脚本的 7 卷覆盖。 */
const manifest = buildEnglishManifest(OUTS, {
  extraNotes: skipped.length ? ["本次 parse-english.mjs 未产出的年份：" + skipped.join("；")] : [],
});

if (IS_MAIN) console.log(report.join("\n"));
if (IS_MAIN && skipped.length) console.log("\n未产出:\n  " + skipped.join("\n  "));
if (IS_MAIN) console.log("\n卷数:", papers.length, "总题:", papers.reduce((s, p) => s + p.questionCount, 0),
  "选择题:", papers.reduce((s, p) => s + p.singleCount, 0),
  "主观题:", papers.reduce((s, p) => s + p.essayCount, 0));
if (IS_MAIN) console.log("知识点:", manifest.topics.map((t) => t.id + "=" + t.count).join(" "));
export { PAPERS, CACHE, sectionHeaders, parseCloze, parseReading, parseNewtype, parseTranslation, parseWriting, extractAnswerEntries, stripMd, SELF_SOL_MARK, SEC_DEFS, clozeQuestionLine, clozeRegionEnd, scanMarks, splitSeq, normalizeCloze, pickOptions, mineMarks, findAnswers, qStartRe };





















































































