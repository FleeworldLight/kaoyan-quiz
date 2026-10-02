/**
 * parse-english-web.mjs — 2024 / 2025 考研英语（一）真题 -> public/data/english1/<year>.json
 *
 * 素材（全部落在 tools/cache/english/web/，由 tools/x-fetch.mjs 抓取、本脚本用 pdfjs / x-html2txt 预处理）：
 *   真题（文本层 PDF，题干/选项/原文唯一来源）：
 *     paper-2024.pdf  <- https://github.com/Fantasia1999/kaoyanzhenti 公共课/英语真题/英语一/2024年考研英语一真题.pdf
 *     paper-2025.pdf  <- 同上目录 2025年考研英语一真题.pdf
 *     镜像：https://cdn.jsdelivr.net/gh/Fantasia1999/kaoyanzhenti@main/...（raw.githubusercontent 对本机不稳）
 *   答案/译文/范文（懒笔记 · 考研英语真题网，逐题解析+答案速查表）：
 *     lz-kaoyan_paper-<year>-english-one.txt                     答案速查（完型/阅读/新题型客观题字母）
 *     lz-kaoyan_sections_<year>-english-one_section1.txt          完型逐空解析
 *     lz-kaoyan_sections_<year>-english-one_section2-part-a-1..4.txt  阅读逐题解析
 *     lz-kaoyan_sections_<year>-english-one_section2-part-c.txt   翻译原句 + 参考译文
 *     lz-kaoyan_sections_<year>-english-one_section3-part-a.txt   写作 51 参考范文
 *     lz-kaoyan_sections_<year>-english-one_section3-part-b.txt   写作 52 参考范文
 *   交叉核对来源（不直接写入数据，仅用于确认字母）：
 *     2024：启航考研 2024 全卷解析（m-jixun.iqihang.com ... id=335191）、中国考研网 2024 各 Text 页
 *     2025：禾虎考研 2025 完型答案（m.hhky001.com/sys-nd/7068.html）
 *
 * 纪律：题干/选项/原文只取自真题 PDF；答案/译文/范文只取自上述来源；
 *       完型答案额外用「选项词」和真题 PDF 的字母做一致性校验，不一致就报错不产出。
 *
 * 用法：node tools/parse-english-web.mjs [--diag] [2024 2025]
 */
import fs from "node:fs";
import path from "node:path";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { buildEnglishManifest } from "./english-manifest.mjs";

const WEB = "tools/cache/english/web";
const OUTS = "public/data/english1";
const YEARS = [2024, 2025];

const INFO = {
  2024: {
    paperPdf: "paper-2024.pdf",
    paperName: "Fantasia1999/kaoyanzhenti · 公共课/英语真题/英语一/2024年考研英语一真题.pdf",
    paperUrl: "https://github.com/Fantasia1999/kaoyanzhenti",
    ansName: "懒笔记 english-exam.lazynote.cn · 2024年考研英语一真题及答案解析（整卷）",
    ansUrl: "https://english-exam.lazynote.cn/kaoyan/paper/2024-english-one/",
    crossCheck: "启航考研 2024 全卷解析 + 中国考研网 2024 分 Text 页（用于解决懒笔记/中考研答案个别字母冲突）",
    verified: "PDF 首页标题为「2024 年全国硕士研究生招生考试英语（一）」，完型为自动门（automatic doors）、阅读 Text 1 为罗马钉子、Text 3 为 AI 绘画，与 2024 年真题一致。",
    singleSource: false,
    sources: [
      { role: "真题原文/题干/选项", name: "GitHub Fantasia1999/kaoyanzhenti（文本层 PDF）", url: "https://github.com/Fantasia1999/kaoyanzhenti" },
      { role: "答案/译文/范文", name: "懒笔记 english-exam.lazynote.cn（整卷答案速查 + 分题型解析）", url: "https://english-exam.lazynote.cn/kaoyan/paper/2024-english-one/" },
      { role: "交叉核对（客观题）", name: "启航考研 2024 全卷解析", url: "http://m-jixun.iqihang.com/index.php?m=content&c=index&a=show&catid=1660&id=335191" },
      { role: "交叉核对（客观题）", name: "中国考研网 2024 分 Text 页", url: "http://h.chinakaoyan.com:8080/info/article/id/527381.shtml" },
    ],
    adjudicated: {
      q34: "懒笔记 D / 中国考研网 D 一致；启航标注 C，但启航自己的解析讲的是「在公共领域图像上训练模型、与博物馆和艺术家合作」，对应真题选项 D “adopt a different strategy for AI model training” → 取 D。",
      q35: "懒笔记 A / 启航 A 一致（两家解析都引末段 “It's not just artists… Any sort of visual professional…”）；中国考研网列 B → 取 A。",
      q42: "懒笔记 C / 中国考研网 C 一致；启航标 D，但启航解析的文字「复制品不能取代真品」与 Buck 那段「复制品可作归还替代方案、重要的是展览要讲的故事」语义相反 → 取 C（选项 C = Museum visitors can still learn as much from artifacts' copies after the originals are returned）。",
    },
    note: "客观题（1–45）每题都有 ≥2 份独立来源一致（懒笔记 + 启航/中国考研网），完型另有「答案词与真题 PDF 选项字母」20/20 一致性校验；仅 q34/q35/q42 三家来源不完全一致，已按真题选项原文与解析语义裁决（见 adjudicated）。翻译 46–50 参考译文有懒笔记与中国考研网两份（措辞不同、含义一致）。写作范文仅懒笔记一家，但写作题面取自真题 PDF，范文非唯一答案。",
  },
  2025: {
    paperPdf: "paper-2025.pdf",
    paperName: "Fantasia1999/kaoyanzhenti · 公共课/英语真题/英语一/2025年考研英语一真题.pdf",
    paperUrl: "https://github.com/Fantasia1999/kaoyanzhenti",
    ansName: "懒笔记 english-exam.lazynote.cn · 2025年考研英语一真题及答案解析（整卷）",
    ansUrl: "https://english-exam.lazynote.cn/kaoyan/paper/2025-english-one/",
    crossCheck: "禾虎考研 2025 完型答案（m.hhky001.com/sys-nd/7068.html）与懒笔记 1–20 逐空完全一致",
    verified: "PDF 首页标题为「2025 年全国硕士研究生招生考试英语（一）」，完型为 Pavlopetri 水下古城、Part C 为公民科学（citizen science，与中公考研 2025 翻译解析页「本文选自 How It Works 2020-03-09 How does citizen science work?」一致），与 2025 年真题一致。",
    singleSource: true,
    sources: [
      { role: "真题原文/题干/选项", name: "GitHub Fantasia1999/kaoyanzhenti（文本层 PDF）", url: "https://github.com/Fantasia1999/kaoyanzhenti" },
      { role: "答案/译文/范文", name: "懒笔记 english-exam.lazynote.cn（整卷答案速查 + 分题型解析）", url: "https://english-exam.lazynote.cn/kaoyan/paper/2025-english-one/" },
      { role: "交叉核对（仅完型 1–20）", name: "禾虎考研 2025 英语一真题＋答案", url: "https://m.hhky001.com/sys-nd/7068.html" },
      { role: "交叉核对（仅帕夫洛佩特里/公民科学话题与题型）", name: "中公考研 2025 英语(一)试题解析（经研招网转载）", url: "https://www.yanzhaowang.com.cn/beikao/en/202503/2561015.html" },
    ],
    note: "完型 1–20 有懒笔记 + 禾虎考研两份独立来源完全一致，并额外通过「答案词 vs 真题 PDF 选项字母」20/20 校验；阅读 21–40、新题型 41–45、翻译参考译文、写作范文**只有懒笔记一份来源**，故按纪律把卷级 quality 降为 medium 并标 singleSource。已排除的假来源：koolearn 新闻页 2024-12-21《2025考研英语一答案：翻译+作文答案》给的 Part C 是「密码战/Scovell/拿破仑战争」，与真题 PDF 及中公考研解析的「公民科学」不是同一篇，判定为错年/占位内容，未采用；人人文库《2025年-2026年考研英语一真题及答案解析》内容为「AI 伦理/数字阅读/语言濒危」，与真实 2025 卷完全不符，判定为伪造文档，未采用。",
  },
};

const SEC_DEFS = [
  { id: "cloze", name: "Section I Use of English 完型填空", from: 1, to: 20, score: 0.5 },
  { id: "reading", name: "Section II Reading Comprehension Part A 阅读理解", from: 21, to: 40, score: 2 },
  { id: "newtype", name: "Section II Reading Comprehension Part B 新题型", from: 41, to: 45, score: 2 },
  { id: "translation", name: "Section III Translation 翻译", from: 46, to: 50, score: 2 },
  { id: "writing", name: "Section IV Writing 写作", from: 51, to: 52, score: 0 },
];
const CL = [..."ABCDEFGH"];

/* ------------------------------------------------------------------ 基础 */
const T = (l) => String(l == null ? "" : l).trim();
const isPageNo = (s) => /^\d{1,3}$/.test(s);
const squeezeCJK = (s) => String(s || "").replace(/([\u3000-\u303f\u4e00-\u9fff\uff00-\uffef])\s+(?=[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef])/g, "$1");
function loadLines(file) {
  let t = fs.readFileSync(file, "utf8").replace(/\r\n?/g, "\n");
  t = t.replace(/\u2160/g, "I").replace(/\u2161/g, "II").replace(/\u2162/g, "III").replace(/\u2163/g, "IV").replace(/\u2164/g, "V");
  t = t.replace(/[\u3000\u00a0]/g, " ");
  return t.split("\n").filter((l) => !/^\s*<<PAGE\s*\d+>>\s*$/.test(l));
}
function cleanJoin(arr) {
  return arr.map((l) => String(l).replace(/\s+$/, "")).filter((l) => l.trim() && !isPageNo(l.trim())).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
function skipDirections(seg) {
  let i = 0;
  while (i < seg.length && !/^Directions\s*[:：]?/i.test(T(seg[i]))) i++;
  if (i >= seg.length) return 0;
  for (let j = i; j < Math.min(seg.length, i + 10); j++) if (/points?\b/i.test(seg[j])) return j + 1;
  return Math.min(seg.length, i + 5);
}
async function pdfLines(pdf) {
  const data = new Uint8Array(fs.readFileSync(pdf));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
  let out = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const c = await page.getTextContent();
    for (const it of c.items) { out += it.str; if (it.hasEOL) out += "\n"; }
    out += "\n";
  }
  return loadLinesFromText(out);
}
function loadLinesFromText(t) {
  return t.replace(/\r\n?/g, "\n")
    .replace(/\u2160/g, "I").replace(/\u2161/g, "II").replace(/\u2162/g, "III").replace(/\u2163/g, "IV").replace(/\u2164/g, "V")
    .replace(/[\u3000\u00a0]/g, " ")
    .split("\n").filter((l) => !/^\s*<<PAGE\s*\d+>>\s*$/.test(l));
}

/* ------------------------------------------------------------------ 真题卷面 */
const isClozeHdr = (t) => /^Section\s+I(?!I|V)\s*Use of English\b/i.test(t);
const isReadingHdr = (t) => /^Section\s+II\s*Reading Comprehension/i.test(t);
const isWritingHdr = (t) => /^Section\s+I{1,3}V?\s*Writing/i.test(t);
const isPartA = (t) => /^Part\s*A\b/i.test(t);
const isPartB = (t) => /^Part\s*B\b/i.test(t);
const isPartC = (t) => /^Part\s*C\b/i.test(t);
const findIdx = (lines, pred, from = 0, to = Infinity) => {
  for (let i = Math.max(0, from); i < Math.min(lines.length, to); i++) if (pred(T(lines[i]))) return i;
  return -1;
};
/* 2024/2025 完型选项是「按列排印」：先 1–20 的 A 列，再 B、C、D 列 */
function parseClozePaper(lines, iCloze, iEnd) {
  const region = lines.slice(iCloze + 1, iEnd);
  let o1 = -1;
  for (let i = 0; i < region.length; i++) if (/^1\s*\.\s*A\s*\./.test(T(region[i]))) { o1 = i; break; }
  if (o1 < 0) throw new Error("找不到完型选项块（期望 `1. A. xxx`）");
  let matLines = region.slice(0, o1);
  const d = skipDirections(matLines);
  if (d) matLines = matLines.slice(d);
  const material = cleanJoin(matLines);
  const cols = {};
  for (let i = o1; i < region.length; i++) {
    const t = T(region[i]);
    if (!t) continue;
    const m = t.match(/^(?:(\d{1,2})\s*\.\s*)?([A-H])\s*\.\s*(.+)$/);
    if (!m) break;
    const letter = m[2];
    if (!cols[letter]) cols[letter] = [];
    cols[letter].push(m[3].trim());
  }
  const letters = Object.keys(cols).sort();
  for (const L of letters) if (cols[L].length !== 20) throw new Error("完型 " + L + " 列只有 " + cols[L].length + " 项（应为 20）");
  const opts = new Map();
  for (let n = 1; n <= 20; n++) opts.set(n, letters.map((L) => ({ key: L, text: cols[L][n - 1] })));
  return { material, opts, letters: letters.join("") };
}
function parseReadingPaper(lines, iStart, iEnd) {
  const texts = [];
  for (let i = iStart + 1; i < iEnd; i++) {
    const m = T(lines[i]).match(/^Text\s*([1-4])\s*$/i);
    if (m) texts.push({ no: Number(m[1]), i });
  }
  const materials = new Map();
  const questions = [];
  for (let k = 0; k < texts.length; k++) {
    const from = texts[k].i + 1;
    const to = k + 1 < texts.length ? texts[k + 1].i : iEnd;
    const sub = lines.slice(from, to);
    const qIdx = [];
    for (let i = 0; i < sub.length; i++) {
      const m = T(sub[i]).match(/^(\d{1,2})\s*\.\s*(\S.*)?$/);
      if (m) {
        const n = Number(m[1]);
        if (n >= 21 && n <= 40) qIdx.push({ n, i });
      }
    }
    const matEnd = qIdx.length ? qIdx[0].i : sub.length;
    let matLines = sub.slice(0, matEnd);
    if (k === 0) { const d = skipDirections(matLines); if (d) matLines = matLines.slice(d); }
    const title = "Text " + texts[k].no;
    materials.set(title, cleanJoin(matLines));
    for (let j = 0; j < qIdx.length; j++) {
      const qEnd = j + 1 < qIdx.length ? qIdx[j + 1].i : sub.length;
      const block = sub.slice(qIdx[j].i, qEnd);
      let stem = T(block[0]).replace(/^\d{1,2}\s*\.\s*/, "");
      const options = [];
      for (let q = 1; q < block.length; q++) {
        const t = T(block[q]);
        if (!t) continue;
        const m = t.match(/^([A-D])\s*\.\s*(.*)$/);
        if (m) { options.push({ key: m[1], text: m[2].trim() }); continue; }
        if (!options.length) stem += " " + t;
        else options[options.length - 1].text += " " + t;
      }
      questions.push({ no: qIdx[j].n, materialTitle: title, stem, options });
    }
  }
  return { materials, questions };
}
function parseWritingPaper(lines, iWriting) {
  const sub = lines.slice(iWriting + 1);
  const iA = findIdx(sub, isPartA);
  const iB = findIdx(sub, isPartB, iA < 0 ? 0 : iA + 1);
  const idx51 = findIdx(sub, (t) => /^51\s*\.\s*Directions\b/i.test(t), 0, iB > 0 ? iB : sub.length);
  const idx52 = findIdx(sub, (t) => /^52\s*\.\s*Directions\b/i.test(t), iB > 0 ? iB : 0);
  /* 卷面把 51 题要回的那封信排在卷末，需要把它归到 51，而不是 52 */
  let iLetter = -1;
  for (let i = Math.max(0, idx52); i < sub.length; i++) if (/^Dear\s+Li\s+Ming\s*,?\s*$/i.test(T(sub[i]))) { iLetter = i; break; }
  const out = { 51: "", 52: "" };
  if (idx51 >= 0) {
    const head = sub.slice(idx51, iB > idx51 ? iB : sub.length).map((l, k) => (k === 0 ? T(l).replace(/^51\s*\.\s*/, "") : l));
    if (iLetter > 0) head.push(...sub.slice(iLetter));
    out[51] = cleanJoin(head);
  }
  if (idx52 >= 0) {
    const end = iLetter > idx52 ? iLetter : sub.length;
    const head = sub.slice(idx52, end).map((l, k) => (k === 0 ? T(l).replace(/^52\s*\.\s*/, "") : l));
    out[52] = cleanJoin(head);
  }
  return out;
}

/* ------------------------------------------------------------------ 懒笔记：答案速查表 / 逐题解析 / 译文 / 范文 */
function parseAnswerTable(text) {
  const lines = text.split("\n");
  const cloze = new Map(), reading = new Map(), partB = new Map(), words = new Map();
  for (let i = 0; i < lines.length; i++) {
    const t = T(lines[i]);
    let m;
    if (/^完形填空/.test(t) && /1[–\-—]20/.test(t)) {
      const re = /(\d{1,2})\s+([A-D])\s+([A-Za-z][A-Za-z'’-]*)/g;
      while ((m = re.exec(t))) { cloze.set(Number(m[1]), m[2]); words.set(Number(m[1]), m[3]); }
      continue;
    }
    if (/^阅读理解/.test(t) && /（(\d{2})[–\-—](\d{2})\s*题）/.test(t)) {
      const re = /(\d{2})\s+([A-D])\b/g;
      while ((m = re.exec(t))) reading.set(Number(m[1]), m[2]);
      continue;
    }
    if (/Section\s*II\s*Part\s*B/.test(t)) {
      const re = /(\d{2})\s*[=·]?\s*([A-H])\b/g;
      while ((m = re.exec(t))) partB.set(Number(m[1]), m[2]);
      continue;
    }
  }
  return { cloze, reading, partB, words };
}
/* 懒笔记分题型页：题号标记形如 `[21.]` 或 `1.`，其后紧接该题解析，内含「【答案】」 */
function parseSectionExplanations(file) {
  const lines = loadLines(file);
  const marks = [];
  lines.forEach((l, i) => {
    const t = T(l);
    const m = t.match(/^\[(\d{1,2})\.\]$/) || t.match(/^(\d{1,2})\.$/);
    if (m) marks.push({ n: Number(m[1]), i });
  });
  const out = new Map();
  for (let k = 0; k < marks.length; k++) {
    const end = k + 1 < marks.length ? marks[k + 1].i : lines.length;
    let a = -1;
    for (let i = marks[k].i; i < end; i++) if (lines[i].includes("【答案】")) { a = i; break; }
    if (a < 0) continue;
    let letter = "";
    for (let i = a + 1; i < Math.min(end, a + 4); i++) {
      const m = T(lines[i]).match(/^\[?\s*([A-H])\s*\]?/);
      if (m) { letter = m[1]; break; }
    }
    const expl = [];
    for (let i = a; i < end; i++) { const t = T(lines[i]); if (t) expl.push(t); }
    out.set(marks[k].n, { letter, expl: expl.join("\n") });
  }
  return out;
}
/* 懒笔记翻译页：每个 `(NN) 英文原句` 一行，紧随「【译文】」+ 下一行中文 */
function parseSectionPartC(file, paperMaterial) {
  const lines = loadLines(file);
  const norm = (s) => s.replace(/[^A-Za-z]+/g, "").toLowerCase();
  const paperNorm = norm(paperMaterial);
  const out = new Map();
  for (let i = 0; i < lines.length; i++) {
    const m = T(lines[i]).match(/^\((\d{2})\)\s+(\S.*)$/);
    if (!m) continue;
    const n = Number(m[1]);
    if (n < 46 || n > 50) continue;
    let stem = m[2].trim();
    /* 若该行并非完整句（在真题原文里匹配不上），继续吞并下一行直到能匹配 */
    let j = i;
    while (norm(stem).length > 10 && !paperNorm.includes(norm(stem)) && j + 1 < lines.length && !/^[【(]/.test(T(lines[j + 1]))) {
      j++;
      stem += " " + T(lines[j]);
    }
    let answer = "";
    for (let q = j + 1; q < Math.min(lines.length, j + 40); q++) {
      if (/^【译文】/.test(T(lines[q]))) {
        for (let r = q + 1; r < Math.min(lines.length, q + 4); r++) if (T(lines[r])) { answer = squeezeCJK(T(lines[r])); break; }
        break;
      }
      if (/^\(\d{2}\)\s/.test(T(lines[q]))) break;
    }
    if (out.has(n)) continue;
    out.set(n, { stem, answer, inPaper: paperNorm.includes(norm(stem)) });
  }
  return out;
}
/* 懒笔记写作页：`【参考范文 · N 词 】…` 之后是范文，遇到下一个「【」块或分栏标题结束 */
function parseSectionWriting(file) {
  const lines = loadLines(file);
  const out = { parts: [] };
  for (let i = 0; i < lines.length; i++) {
    if (/^【参考范文/.test(T(lines[i]))) {
      for (let j = i + 1; j < Math.min(lines.length, i + 60); j++) {
        const t = T(lines[j]);
        if (!t) { if (out.parts.length) continue; else continue; }
        if (/^【/.test(t)) break;
        if (/^[A-Z][A-Z &·]{6,}$/.test(t)) break;
        out.parts.push(t);
      }
      break;
    }
  }
  return out.parts;
}

/* ------------------------------------------------------------------ 组卷 */
const DEARG = (s) => String(s || "").replace(/[ \t]{2,}/g, " ").trim();
function tagCloze(stem, opts) {
  const s = (stem + " " + opts.join(" ")).toLowerCase();
  if (/however|although|though|while|despite|because|therefore|thus|moreover|furthermore|nevertheless|instead|rather|besides|otherwise|unless|since|so that|in contrast|for example|on the contrary|as a result/.test(s)) return ["完型-逻辑关系"];
  return ["完型-词汇辨析"];
}
function tagReading(stem) {
  const s = stem.toLowerCase();
  if (/best title|mainly about|main idea|the text (?:is|mainly)|purpose of the text|the author.*(?:primarily|mainly) (?:discuss|argue)|which of the following (?:is|would be) the best title|best summar/.test(s)) return ["阅读-主旨题"];
  if (/attitude|tone|the author (?:seems|appears) to|feel about/.test(s)) return ["阅读-态度题"];
  if (/the word .* (?:is )?closest in meaning|the phrase .* (?:most probably )?mean|underlined (?:word|phrase|sentence)|refers to|the sentence .* suggests/.test(s)) return ["阅读-词义句意题"];
  if (/it (?:can|may) be (?:inferred|learned|concluded)|infer|implies|suggests that|we can (?:learn|infer)/.test(s)) return ["阅读-推断题"];
  if (/according to|paragraph \d|mentioned|because|the (?:study|example|case) |is (?:used|mentioned|cited) to|why/.test(s)) return ["阅读-细节题"];
  return [];
}

async function buildYear(year, log) {
  const info = INFO[year];
  const lines = await pdfLines(path.join(WEB, info.paperPdf));
  const table = parseAnswerTable(fs.readFileSync(path.join(WEB, `lz-kaoyan_paper_${year}-english-one.txt`), "utf8"));
  const iCloze = findIdx(lines, isClozeHdr);
  const iReading = findIdx(lines, isReadingHdr, iCloze + 1);
  const iPartA = findIdx(lines, isPartA, iReading + 1);
  const iPartB = findIdx(lines, isPartB, (iPartA < 0 ? iReading : iPartA) + 1);
  const iPartC = findIdx(lines, isPartC, iPartB + 1);
  const iWriting = findIdx(lines, isWritingHdr, iPartC + 1);
  log(`  结构: cloze@${iCloze} reading@${iReading} partA@${iPartA} partB@${iPartB} partC@${iPartC} writing@${iWriting}`);
  if ([iCloze, iReading, iPartB, iPartC, iWriting].some((x) => x < 0)) throw new Error("真题结构识别不全");

  const cloze = parseClozePaper(lines, iCloze, iReading);
  const reading = parseReadingPaper(lines, iPartA < 0 ? iReading : iPartA, iPartB);
  let partBLines = lines.slice(iPartB + 1, iPartC);
  { const d = skipDirections(partBLines); if (d) partBLines = partBLines.slice(d); }
  const partBMaterial = cleanJoin(partBLines);
  let partCLines = lines.slice(iPartC + 1, iWriting);
  { const d = skipDirections(partCLines); if (d) partCLines = partCLines.slice(d); }
  const partCMaterial = cleanJoin(partCLines);
  const writingStems = parseWritingPaper(lines, iWriting);

  log(`  完型: material=${cloze.material.length}字 选项列=${cloze.letters}`);
  log(`  阅读: texts=${reading.materials.size} questions=${reading.questions.length} 选项数分布=${JSON.stringify(reading.questions.reduce((a, q) => { a[q.options.length] = (a[q.options.length] || 0) + 1; return a; }, {}))}`);
  log(`  PartB=${partBMaterial.length}字  PartC=${partCMaterial.length}字  写作 51=${writingStems[51].length}字 52=${writingStems[52].length}字`);
  log(`  答案速查: cloze=${table.cloze.size} reading=${table.reading.size} partB=${table.partB.size}`);

  /* 完型答案一致性校验：速查表的「字母+词」必须与真题 PDF 的该字母选项吻合 */
  const mismatch = [];
  for (const [n, letter] of table.cloze) {
    const opts = cloze.opts.get(n);
    const opt = opts && opts.find((o) => o.key === letter);
    const w = table.words.get(n);
    if (!opt || !w || !opt.text.toLowerCase().includes(w.toLowerCase())) mismatch.push(n + ":" + letter + "/" + w + " vs 真题「" + (opt ? opt.text : "?") + "」");
  }
  if (mismatch.length) throw new Error("完型答案与真题选项不符: " + mismatch.join("; "));
  log(`  完型答案与真题选项一致性校验通过（20/20）`);

  /* 逐题解析（完型 + 阅读） */
  const expl = new Map();
  for (const f of ["section1", "section2-part-a-1", "section2-part-a-2", "section2-part-a-3", "section2-part-a-4"]) {
    const p = path.join(WEB, `lz-kaoyan_sections_${year}-english-one_${f}.txt`);
    if (!fs.existsSync(p)) { log("  ⚠ 缺少解析页 " + f); continue; }
    for (const [n, v] of parseSectionExplanations(p)) if (!expl.has(n)) expl.set(n, v);
  }
  const explLetterBad = [];
  for (const n of [...table.cloze.keys(), ...table.reading.keys()]) {
    const e = expl.get(n);
    const want = table.cloze.get(n) || table.reading.get(n);
    if (e && e.letter && e.letter !== want) explLetterBad.push(n + ":速查=" + want + " 解析页=" + e.letter);
  }
  if (explLetterBad.length) log("  ⚠ 解析页与速查表字母不一致（以速查表为准）: " + explLetterBad.join(" "));
  log(`  逐题解析: 完型+阅读 命中 ${[...table.cloze.keys(), ...table.reading.keys()].filter((n) => expl.has(n)).length}/40`);

  /* 翻译 & 写作 */
  const partC = parseSectionPartC(path.join(WEB, `lz-kaoyan_sections_${year}-english-one_section2-part-c.txt`), partCMaterial);
  const wA = parseSectionWriting(path.join(WEB, `lz-kaoyan_sections_${year}-english-one_section3-part-a.txt`));
  const wB = parseSectionWriting(path.join(WEB, `lz-kaoyan_sections_${year}-english-one_section3-part-b.txt`));
  const cMissing = [];
  for (let n = 46; n <= 50; n++) { const v = partC.get(n); if (!v || !v.answer) cMissing.push(n); }
  if (cMissing.length) log("  ⚠ 翻译缺译文: " + cMissing.join(","));
  const cNotInPaper = [...partC.entries()].filter(([, v]) => !v.inPaper).map(([n]) => n);
  if (cNotInPaper.length) log("  ⚠ 翻译原句与真题原文对不上（可能切分错误）: " + cNotInPaper.join(","));
  log(`  翻译: 原句+译文 ${partC.size}/5   写作范文: 51=${wA.join(" ").split(/\s+/).length}词 52=${wB.join(" ").split(/\s+/).length}词`);

  /* 组卷 */
  const groups = { cloze: [], reading: [], newtype: [], translation: [], writing: [] };
  for (let n = 1; n <= 20; n++) {
    const e = expl.get(n) || { expl: "" };
    groups.cloze.push({
      id: `english1-${year}-q${n}`, no: n, type: "single",
      materialTitle: "完型填空原文", material: cloze.material,
      stem: `（第 ${n} 空）`,
      options: cloze.opts.get(n).map((o) => ({ key: o.key, text: DEARG(o.text) })),
      answer: table.cloze.get(n) || "", explanation: e.expl || "", score: 0.5, topics: [], images: [],
    });
  }
  for (const q of reading.questions) {
    const e = expl.get(q.no) || { expl: "" };
    groups.reading.push({
      id: `english1-${year}-q${q.no}`, no: q.no, type: "single",
      materialTitle: q.materialTitle, material: reading.materials.get(q.materialTitle) || "",
      stem: DEARG(q.stem),
      options: q.options.map((o) => ({ key: o.key, text: DEARG(o.text) })),
      answer: table.reading.get(q.no) || "", explanation: e.expl || "", score: 2, topics: [], images: [],
    });
  }
  const cand = new Set();
  for (const line of partBMaterial.split("\n")) {
    const m = T(line).match(/^([A-H])\s*\.\s+\S/);
    if (m) cand.add(m[1]);
  }
  const letters = [...cand].sort().join("");
  for (let n = 41; n <= 45; n++) {
    groups.newtype.push({
      id: `english1-${year}-q${n}`, no: n, type: "blank",
      materialTitle: "Part B 新题型", material: partBMaterial,
      stem: `第 ${n} 空：请从 ${letters || "A–G"} 候选中选出最合适的一项填入该空`,
      options: [], answer: table.partB.get(n) || "", explanation: "", score: 2, topics: [], images: [],
    });
  }
  for (let n = 46; n <= 50; n++) {
    const v = partC.get(n) || { stem: "", answer: "" };
    groups.translation.push({
      id: `english1-${year}-q${n}`, no: n, type: "essay",
      materialTitle: "Part C 翻译原文", material: partCMaterial,
      stem: v.stem || "", options: [], answer: v.answer || "", explanation: "", score: 2, topics: [], images: [],
    });
  }
  for (const n of [51, 52]) {
    groups.writing.push({
      id: `english1-${year}-q${n}`, no: n, type: "essay",
      materialTitle: "", material: "",
      stem: writingStems[n] || "", options: [],
      answer: (n === 51 ? wA : wB).join("\n").trim(), explanation: "", score: 0, topics: [], images: [],
    });
  }
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
  if (cover >= 0.9 && optOk >= 0.9 && matOk >= 0.9) quality = "high";
  else if (cover >= 0.5 && optOk >= 0.7) quality = "medium";
  if (all.length < 40) quality = "low";
  /* 纪律：只有单一来源支撑的卷子，卷级质量最高只能算 medium */
  if (info.singleSource && quality === "high") { quality = "medium"; log("  · 单一来源 → quality 降为 medium"); }
  const verification = {
    singleSource: !!info.singleSource,
    verifiedAsYear: info.verified,
    sources: info.sources,
    ...(info.adjudicated ? { adjudicated: info.adjudicated } : {}),
    note: info.note,
  };
  return { groups, all, cover, optOk, matOk, quality, verification, sourceText: info.paperName + " + " + info.ansName, sourceUrl: info.paperUrl + "  |  " + info.ansUrl };
}

/* ------------------------------------------------------------------ 主流程 */
const isMain = process.argv[1] && path.resolve(process.argv[1]).endsWith("parse-english-web.mjs");
if (isMain) {
  const diag = process.argv.includes("--diag");
  const pick = process.argv.slice(2).filter((a) => /^(2024|2025)$/.test(a)).map(Number);
  const years = pick.length ? pick : YEARS;
  const report = [];
  for (const year of years) {
    console.log("=== " + year);
    let r;
    try { r = await buildYear(year, (m) => { if (diag) console.log(m); }); }
    catch (e) { console.log("  ✗ " + e.message); continue; }
    const sections = SEC_DEFS.filter((d) => r.groups[d.id] && r.groups[d.id].length).map((d) => ({ id: d.id, name: d.name, questions: r.groups[d.id] }));
    const totalScore = sections.reduce((s, sec) => s + sec.questions.reduce((x, q) => x + q.score, 0), 0);
    const doc = {
      id: "english1-" + year, subject: "english1", subjectName: "英语一", year,
      title: year + " 年全国硕士研究生招生考试 英语（一）",
      duration: 180, totalScore, quality: r.quality,
      source: { name: r.sourceText, url: r.sourceUrl },
      verification: r.verification,
      sections,
    };
    fs.mkdirSync(OUTS, { recursive: true });
    fs.writeFileSync(path.join(OUTS, year + ".json"), JSON.stringify(doc), "utf8");
    const badObj = r.all.filter((q) => q.type === "single" && q.options.length !== 4).map((q) => q.no);
    report.push(
      year + ": " + SEC_DEFS.map((d) => d.id + "=" + r.groups[d.id].length).join(" ") +
      "\n     选项完整=" + (r.optOk * 100).toFixed(0) + "%  答案/范文覆盖=" + (r.cover * 100).toFixed(0) +
      "%  完型+阅读有材料=" + (r.matOk * 100).toFixed(0) + "%  quality=" + r.quality +
      (badObj.length ? "\n     ⚠ 选项非 4 个: " + badObj.join(",") : "") +
      "\n     总题=" + r.all.length + " 总分=" + totalScore
    );
  }
  console.log("\n" + report.join("\n"));
  const m = buildEnglishManifest(OUTS, {
    extraNotes: [
      "2024/2025 卷：真题文本取自 GitHub Fantasia1999/kaoyanzhenti 的文本层 PDF；答案/参考译文/参考范文取自懒笔记 english-exam.lazynote.cn 的整卷答案速查表与分题型解析页（2024 另用启航考研全卷解析、中国考研网分 Text 页交叉核对；2025 完型另用禾虎考研交叉核对）。",
      "2025 卷卷级 quality=medium：阅读 21–40、新题型 41–45、翻译译文、写作范文只有懒笔记单一来源（完型 1–20 有禾虎考研第二来源且通过真题选项词校验）；卷内 verification.singleSource=true。",
      "2024 卷卷级 quality=high：客观题每题均有 ≥2 份独立来源一致；q34/q35/q42 三家来源不完全一致，已按真题选项原文与解析语义裁决（卷内 verification.adjudicated）。",
      "2024/2025 的 explanation 是来源页逐题解析原文（懒笔记），文风与 2010–2023 的【考点】【解析】不同。",
    ],
  });
  console.log("_manifest.json: " + m.papers.length + " 卷");
  console.log(m.note);
}
