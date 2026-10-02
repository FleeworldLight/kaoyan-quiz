/**
 * 政治 HTML 卷子解析器（2025 起使用）。
 *
 * 背景：yy 源的 2025/2026 文件经核实是**重写/生成**内容而非真题原文（见 politics-findings.md「yy 源的保真度问题」），
 * 因此 2025 改用三个可核实的公开来源，其原始抓取页存在 tools/cache/：
 *   1) 武昌首义学院马克思主义学院  https://szkb.wsyu.edu.cn/2025/0107/c882a40588/page.htm  （题干+选项+【参考答案】+【解析】）
 *   2) 石河子大学 eol 转换页         https://eol.shzu.edu.cn/meol/...（题干+选项+【答案】）
 *   3) 新东方在线                    https://m.koolearn.com/kaoyan/20250103/1795512.html （题干+选项+1~33 答案速查）
 * 本模块只做「抽取」，不做任何改写或补全。
 */
import fs from "node:fs";

/* ---------------- HTML → 文本 ---------------- */
export function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&ldquo;/g, "\u201c").replace(/&rdquo;/g, "\u201d")
    .replace(/&lsquo;/g, "\u2018").replace(/&rsquo;/g, "\u2019")
    .replace(/&mdash;/g, "\u2014").replace(/&hellip;/g, "\u2026")
    .replace(/&#xa0;|&nbsp;/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/[\t\u3000 ]+/g, " ").trim())
    .filter((l) => l.length)
    .join("\n");
}

/* ---------------- 分段 ---------------- */
export function splitSections(text) {
  const idxMulti = text.search(/多项选择题|多选题/);
  const idxEssay = text.search(/分析题/);
  const singleStart = text.search(/单项选择题|单选题/);
  const out = new Map();
  if (singleStart >= 0) {
    const end = idxMulti >= 0 && idxMulti > singleStart ? lineStartBefore(text, idxMulti) : text.length;
    out.set("single", text.slice(lineStartBefore(text, singleStart), end));
  }
  if (idxMulti >= 0) {
    const end = idxEssay >= 0 && idxEssay > idxMulti ? lineStartBefore(text, idxEssay) : text.length;
    out.set("multiple", text.slice(lineStartBefore(text, idxMulti), end));
  }
  if (idxEssay >= 0) out.set("essay", text.slice(lineStartBefore(text, idxEssay)));
  return out;
}
function lineStartBefore(text, idx) {
  const i = text.lastIndexOf("\n", idx);
  return i < 0 ? 0 : i + 1;
}

/* ---------------- 选项切分 ---------------- */
function optionMarks(text, loose) {
  const marks = [];
  const re = loose ? /([A-D])\s*[.．、]\s*/g : /(?:^|\s)([A-D])\s*[.．、]\s*/g;
  let m;
  while ((m = re.exec(text))) {
    const off = loose ? 0 : m[0].length - m[0].replace(/^\s+/, "").length;
    marks.push({ key: m[1], idx: m.index + off, end: re.lastIndex });
  }
  return marks;
}
function pickABCD(marks) {
  for (let i = 0; i < marks.length; i++) {
    if (marks[i].key !== "A") continue;
    const b = marks.find((x) => x.key === "B" && x.idx > marks[i].idx);
    if (!b) continue;
    const c = marks.find((x) => x.key === "C" && x.idx > b.idx);
    if (!c) continue;
    const d = marks.find((x) => x.key === "D" && x.idx > c.idx);
    if (!d) continue;
    const extra = marks.filter((x) => x.idx > marks[i].idx && x.idx < d.idx && x !== b && x !== c);
    if (extra.length) continue;
    return [marks[i], b, c, d];
  }
  return null;
}
function findOptions(text) {
  // 先严格（选项前须有空白/行首），失败再宽松（允许 A.xxB.xxC.xxD.xx 连排）
  return pickABCD(optionMarks(text, false)) || pickABCD(optionMarks(text, true));
}

/* ---------------- 答案速查区（新东方等页面用） ---------------- */
/**
 * 解析「1-5：CBDCB / 6-10:CADAB / 17.CD 18.AD ...」这种答案速查块。
 * 返回 Map<no, letters>
 */
export function parseAnswerKeyBlock(text) {
  const map = new Map();
  const norm = text.replace(/\s+/g, "");
  // 形如 1-5：CBDCB
  const reRange = /(\d{1,2})\s*[-–~]\s*(\d{1,2})\s*[:：]?\s*([A-D]+)/g;
  let m;
  while ((m = reRange.exec(norm))) {
    const lo = Number(m[1]), hi = Number(m[2]);
    const letters = m[3];
    if (hi - lo + 1 === letters.length) for (let i = 0; i < letters.length; i++) map.set(lo + i, letters[i]);
  }
  // 形如 17.CD / 16:C
  const reOne = /(\d{1,2})\s*[.．、:：]\s*([A-D]{1,4})(?![A-Za-z0-9])/g;
  let x;
  while ((x = reOne.exec(text.replace(/(\d)\s+(?=[A-D]\b)/g, "$1")))) {
    const n = Number(x[1]);
    if (n >= 1 && n <= 40) map.set(n, [...new Set(x[2])].sort().join(""));
  }
  return map;
}

/* ---------------- 题号链 ---------------- */
function markerChain(text, nums) {
  const cands = new Map();
  for (const n of nums) {
    const re = new RegExp(`(?:^|\\n)\\s*${n}\\s*[.．、]`, "g");
    const arr = [];
    let m;
    while ((m = re.exec(text))) arr.push({ n, start: m.index, end: m.index + m[0].length });
    cands.set(n, arr);
  }
  // 贪心：按顺序为每个题号选择第一个「在上一个题号结束之后」的位置
  const picks = [];
  let cursor = 0;
  for (const n of nums) {
    const c = (cands.get(n) || []).find((x) => x.start >= cursor);
    if (!c) { picks.push(null); continue; }
    picks.push(c);
    cursor = c.end;
  }
  // 若某个题号在顺序上找不到（源文本顺序错乱），回退为「该题号单独第一个候选」
  for (let i = 0; i < picks.length; i++) {
    if (!picks[i]) picks[i] = (cands.get(nums[i]) || [])[0] || null;
  }
  return picks;
}

const ANSWER_TAIL = /【(?:参考答案|答案|答案要点|参考答案及解析)】/;

/**
 * 解析一份「选择题」区段文本。
 * @returns [{no, type, stem, options:[{key,text}], answer, explanation}]
 */
export function parseChoiceSection(text, nums, type) {
  const picks = markerChain(text, nums);
  const out = [];
  for (let i = 0; i < nums.length; i++) {
    const p = picks[i];
    if (!p) continue;
    const nextStart = picks[i + 1] ? picks[i + 1].start : text.length;
    const seg = text.slice(p.end, nextStart);
    const ansIdx = seg.search(ANSWER_TAIL);
    const body = ansIdx >= 0 ? seg.slice(0, ansIdx) : seg;
    const tail = ansIdx >= 0 ? seg.slice(ansIdx) : "";
    const opt = findOptions(body);
    let stem, options;
    if (opt) {
      stem = body.slice(0, opt[0].idx).trim();
      const parts = [
        body.slice(opt[0].end, opt[1].idx),
        body.slice(opt[1].end, opt[2].idx),
        body.slice(opt[2].end, opt[3].idx),
        body.slice(opt[3].end),
      ];
      options = parts.map((x, k) => ({ key: "ABCD"[k], text: x.replace(/\s+/g, " ").trim() }));
    } else {
      stem = body.replace(/\s+/g, " ").trim();
      options = ["A", "B", "C", "D"].map((k) => ({ key: k, text: "" }));
    }
    // 答案：答案标记之后、「【解析】」之前的 A–D 字母
    let answer = "";
    let explanation = "";
    if (tail) {
      const em = tail.search(/【解析】/);
      const ansPart = em >= 0 ? tail.slice(0, em) : tail;
      answer = [...new Set((ansPart.match(/[A-D]/g) || []))].sort().join("");
      if (em >= 0) explanation = tail.slice(em + 4).trim();
    }
    out.push({ no: nums[i], type, stem, options, answer, explanation });
  }
  return out;
}

/**
 * 解析「分析题」区段（34–38）：题干（含材料与设问）+ 【参考答案】全文。
 */
export function parseEssaySection(text, nums) {
  // 题号可能被换行拆开（如 shzu 的 "3\n4.："），先把 "数字\n数字." 合并
  const t = text
    .replace(/(?:^|\n)\s*3\n\s*4\s*[.．、]/g, "\n34.")
    .replace(/(?:^|\n)\s*3\n\s*5\s*[.．、]/g, "\n35.")
    .replace(/(?:^|\n)\s*3\n\s*6\s*[.．、]/g, "\n36.")
    .replace(/(?:^|\n)\s*3\n\s*7\s*[.．、]/g, "\n37.")
    .replace(/(?:^|\n)\s*3\n\s*8\s*[.．、]/g, "\n38.");
  const picks = markerChain(t, nums);
  const out = [];
  for (let i = 0; i < nums.length; i++) {
    const p = picks[i];
    if (!p) continue;
    const nextStart = picks[i + 1] ? picks[i + 1].start : t.length;
    const seg = t.slice(p.end, nextStart);
    const ansIdx = seg.search(ANSWER_TAIL);
    const stem = (ansIdx >= 0 ? seg.slice(0, ansIdx) : seg).replace(/\s*\n\s*/g, "\n").trim();
    const answer = ansIdx >= 0 ? seg.slice(ansIdx).replace(ANSWER_TAIL, "").trim() : "";
    out.push({ no: nums[i], type: "essay", stem, options: [], answer, explanation: "" });
  }
  return out;
}

/* ---------------- 对外入口 ---------------- */
export function parsePaperHtmlFile(file, { year, sections } = {}) {
  const text = htmlToText(fs.readFileSync(file, "utf8"));
  const secs = splitSections(text);
  const out = { year, text, single: [], multiple: [], essay: [], answerKey: new Map(), missingSections: [] };
  const want = sections || ["single", "multiple", "essay"];
  if (want.includes("single")) {
    if (secs.get("single")) out.single = parseChoiceSection(secs.get("single"), Array.from({ length: 16 }, (_, i) => i + 1), "single");
    else out.missingSections.push("single");
  }
  if (want.includes("multiple")) {
    if (secs.get("multiple")) out.multiple = parseChoiceSection(secs.get("multiple"), Array.from({ length: 17 }, (_, i) => i + 17), "multiple");
    else out.missingSections.push("multiple");
  }
  if (want.includes("essay")) {
    if (secs.get("essay")) out.essay = parseEssaySection(secs.get("essay"), [34, 35, 36, 37, 38]);
    else out.missingSections.push("essay");
  }
  // 卷末答案速查（形如 "1-5：CBDCB"），用于补全没有逐题【答案】的来源
  const keyIdx = text.search(/(?:答案解析|参考答案一览|答案速查|一、单选题[:：])/);
  if (keyIdx >= 0) out.answerKey = parseAnswerKeyBlock(text.slice(keyIdx));
  // 逐题【答案】缺失时用答案速查补
  for (const q of [...out.single, ...out.multiple]) if (!q.answer && out.answerKey.has(q.no)) q.answer = out.answerKey.get(q.no);
  return out;
}
