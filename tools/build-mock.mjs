#!/usr/bin/env node
/**
 * build-mock.mjs —— 把 tools/cache/mock/ 下的原始素材转成 public/data/mock/ 的单卷 JSON
 *
 * 素材 → 产出：
 *   1. politics2027/qbank.html   考研政治选择题题库
 *      → 5 个科目 ×(单选卷/多选卷) + 综合训练卷
 *   2. zhangyu/                  2026 张宇考研数学1000题（数学一）
 *      → 4 套测试卷 + 2 套章节练习卷
 *   3. w408/                     王道 408 教材 OCR 题库（按教材章节）
 *      → 4 套（数据结构 / 计算机组成原理 / 操作系统 / 计算机网络）
 *
 * 硬性纪律（对齐 SCHEMA.md）：不编造题干/选项/答案；卷级 quality 一律 unverified；
 * 每卷必须有 source.name + source.url；题干明显 OCR 损坏的题目不入库，计入 dropped 报告。
 *
 * 用法: node tools/build-mock.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE = path.join(ROOT, "tools", "cache", "mock");
const OUT = path.join(ROOT, "public", "data", "mock");
const GENERATED_AT = new Date().toISOString();

const warnings = [];
const dropped = [];
const paperRecords = [];
function drop(source, ref, reason, detail) {
  dropped.push({ source, ref, reason, detail: detail ? String(detail).slice(0, 120) : undefined });
}
function warn(m) { warnings.push(m); }

const decodeMap = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'",
  "&nbsp;": " ", "&mdash;": "\u2014", "&ndash;": "\u2013", "&hellip;": "\u2026", "&times;": "\u00d7",
  "&divide;": "\u00f7", "&le;": "\u2264", "&ge;": "\u2265", "&ne;": "\u2260", "&plusmn;": "\u00b1",
  "&alpha;": "\u03b1", "&beta;": "\u03b2", "&gamma;": "\u03b3", "&delta;": "\u03b4", "&pi;": "\u03c0",
  "&theta;": "\u03b8", "&lambda;": "\u03bb", "&mu;": "\u03bc", "&sigma;": "\u03c3", "&phi;": "\u03c6",
  "&omega;": "\u03c9", "&infin;": "\u221e", "&sum;": "\u2211", "&int;": "\u222b", "&radic;": "\u221a",
  "&rarr;": "\u2192", "&larr;": "\u2190", "&harr;": "\u2194", "&sup2;": "\u00b2", "&sup3;": "\u00b3",
  "&frac12;": "\u00bd", "&deg;": "\u00b0", "&middot;": "\u00b7", "&bull;": "\u2022", "&ldquo;": "\u201c",
  "&rdquo;": "\u201d", "&lsquo;": "\u2018", "&rsquo;": "\u2019", "&laquo;": "\u00ab", "&raquo;": "\u00bb",
};
function decodeEntities(s) {
  if (!s) return "";
  let out = s.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
  out = out.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
  return out.replace(/&[a-zA-Z]+;/g, (m) => (m in decodeMap ? decodeMap[m] : m));
}
function textOf(html) {
  const s = String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(?:p|div|li|tr|h[1-6])[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(s).replace(/[ \t\u00a0]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/\n{2,}/g, "\n").trim();
}
function inlineText(html) { return textOf(html).replace(/\n+/g, " ").trim(); }
function stripLeadNo(s) { return String(s || "").replace(/\s+/g, " ").replace(/^\d{1,3}[.\u3001]\s*/, "").trim(); }
const LETTERS = "ABCD";
function normalizeLetters(raw) {
  const s = String(raw || "").toUpperCase().replace(/[^A-D]/g, "");
  const uniq = [...new Set(s.split(""))].sort().join("");
  return { letters: uniq, changed: s !== uniq, raw: s };
}
function looksGarbled(s) {
  const t = String(s || "");
  if (!t.trim()) return "\u7a7a";
  const q = (t.match(/\?/g) || []).length;
  if (q >= 5 && q / t.length > 0.04) return "\u95ee\u53f7\u5360\u6bd4\u8fc7\u9ad8(" + q + ")";
  if (/[\uFFFD]/.test(t)) return "\u542b\u66ff\u6362\u5b57\u7b26";
  const cjk = (t.match(/[\u4e00-\u9fff]/g) || []).length;
  const latinWord = (t.match(/[a-zA-Z]{3,}/g) || []).length;
  // 数学题常有大段 LaTeX/符号，不能仅凭「无中文」判为乱码
  const mathy = (t.match(/[\\$^_{}=<>]/g) || []).length;
  if (t.length >= 12 && cjk / t.length < 0.1 && latinWord === 0 && mathy < 3) return "\u51e0\u4e4e\u65e0\u4e2d\u6587\u3001\u65e0\u82f1\u6587\u5355\u8bcd\u4e14\u65e0\u6570\u5b66\u7b26\u53f7";
  return null;
}
function writePaper(paper, meta) {
  const file = "mock/" + paper.id + ".json";
  fs.writeFileSync(path.join(OUT, paper.id + ".json"), JSON.stringify(paper, null, 2) + "\n");
  const qs = paper.sections.flatMap((s) => s.questions);
  const choice = qs.filter((q) => q.type === "single" || q.type === "multiple").length;
  const withAns = qs.filter((q) => typeof q.answer === "string" && q.answer.length).length;
  const rec = Object.assign({
    id: paper.id, file, title: paper.title, paperKind: paper.paperKind,
    questionCount: qs.length, choiceCount: choice, withAnswer: withAns,
    answerRate: qs.length ? +(withAns / qs.length).toFixed(4) : 0,
    duration: paper.duration, quality: paper.quality,
  }, meta || {});
  paperRecords.push(rec);
  console.log("  [paper] " + file.replace(/^mock\//, "").padEnd(46) + " 题 " + String(qs.length).padStart(4) + "  选择 " + String(choice).padStart(4) + "  有答案 " + String(withAns).padStart(4));
  return rec;
}

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.join(OUT, "images"), { recursive: true });
// ================================================================ 1. 政治
function buildPolitics() {
  const file = path.join(CACHE, "politics2027", "qbank.html");
  if (!fs.existsSync(file)) { console.log("[politics2027] 缺少缓存文件，跳过"); return []; }
  const html = fs.readFileSync(file, "utf8");
  const blocks = [...html.matchAll(/<script type="application\/json" id="(__data__[^"]*)">([\s\S]*?)<\/script>/g)];
  if (!blocks.length) { console.log("[politics2027] 未找到内嵌 JSON，跳过"); return []; }
  const SUBJECT_META = {
    s1: { group: "marx", short: "马原" },
    s2: { group: "maogai", short: "毛中特" },
    s3: { group: "xisi", short: "习思想" },
    s4: { group: "shigang", short: "史纲" },
    s5: { group: "sixiu", short: "思修法基" },
    s6: { group: "zonghe", short: "综合训练" },
  };
  const buckets = {};
  let parsed = 0;
  for (const b of blocks) {
    let j;
    try { j = JSON.parse(b[2]); } catch (e) { drop("politics2027", b[1], "内嵌 JSON 解析失败", e.message); continue; }
    const sid = j.sid;
    buckets[sid] = buckets[sid] || { single: [], multiple: [] };
    for (const q of j.questions || []) {
      parsed++;
      const ref = sid + "#" + q.num;
      const optsObj = q.options || {};
      const keys = Object.keys(optsObj).filter((k) => LETTERS.includes(k));
      const isMulti = String(q.type) === "多选";
      const nl = normalizeLetters(q.answer);
      const stem = String(q.stem || "").trim();
      const garbled = looksGarbled(stem);
      if (garbled) { drop("politics2027", ref, "题干疑似损坏：" + garbled, stem.slice(0, 60)); continue; }
      if (keys.length !== 4) { drop("politics2027", ref, "选项数异常(" + keys.length + ")", stem.slice(0, 50)); continue; }
      if (!nl.letters) { drop("politics2027", ref, "无答案", stem.slice(0, 50)); continue; }
      if (isMulti ? nl.letters.length < 2 : nl.letters.length !== 1) {
        drop("politics2027", ref, "答案与题型不匹配(type=" + q.type + ", answer=" + nl.raw + ")", stem.slice(0, 50));
        continue;
      }
      if (nl.changed) warn("politics2027 " + ref + ": 答案字母规范化 " + nl.raw + " -> " + nl.letters);
      const options = keys.map((k) => ({
        key: k,
        text: String(optsObj[k] || "").replace(new RegExp("^\\s*" + k + "[.、．:：]?\\s*"), "").trim(),
      }));
      if (options.some((o) => !o.text)) { drop("politics2027", ref, "存在空选项", stem.slice(0, 50)); continue; }
      const detail = q.optionDetails || {};
      const lines = [];
      for (const k of keys) {
        const d = detail[k];
        if (!d) continue;
        const parts = [d.knowledge, d.why, d.trap].filter(Boolean);
        if (parts.length) lines.push("【" + k + "】" + parts.join(" "));
      }
      const explanation = lines.length ? "（以下解析由来源题库自动生成，未经人工核对）\n" + lines.join("\n") : "";
      (isMulti ? buckets[sid].multiple : buckets[sid].single).push({
        stem, options, answer: nl.letters, explanation, chapter: q.chapter || "",
      });
    }
  }

  const SOURCE = {
    name: "SatoriSatori555/Kaoyan_Politics2027 · 考研政治选择题网页版题库（yantu 徐涛 袁·杰 题目）",
    url: "https://github.com/SatoriSatori555/Kaoyan_Politics2027",
  };
  const PUBLISHER = "徐涛 / 袁·杰（来源题库）";
  const YEAR = 2027;
  const SOURCE_NOTE =
    "来源为 GitHub 上的网页版选择题题库（非正式出版物模拟卷）。答案与选项级解析由来源仓库生成" +
    "（answerInferred=true），未经逐题核对；请以正式出版物为准。";
  const groups = [];
  for (const sid of Object.keys(SUBJECT_META)) {
    const meta = SUBJECT_META[sid];
    const bk = buckets[sid];
    if (!bk) continue;
    const parts = [];
    for (const kind of ["single", "multiple"]) {
      const list = bk[kind];
      if (!list.length) continue;
      const typeName = kind === "single" ? "single" : "multiple";
      const label = kind === "single" ? "单项选择题" : "多项选择题";
      const suffix = kind === "single" ? "single" : "multi";
      const paperId = "mock-politics-2027-" + meta.group + "-" + suffix;
      const questions = list.map((q, i) => Object.assign({
        id: paperId + "-q" + (i + 1),
        no: i + 1,
        type: typeName,
        stem: q.stem,
        options: q.options,
        answer: q.answer,
        explanation: q.explanation,
        score: kind === "single" ? 1 : 2,
        topics: q.chapter ? ["politics-2027-" + meta.group + "-" + q.chapter] : [],
        images: [],
      }, q.chapter ? { chapter: q.chapter } : {}));
      const paper = {
        id: paperId,
        subject: "politics",
        subjectName: "政治",
        kind: "mock",
        mockName: "2027 考研政治选择题题库 · " + meta.short,
        publisher: PUBLISHER,
        year: YEAR,
        paperNo: 1,
        paperKind: "questionBank",
        title: "2027 考研政治选择题题库 · " + meta.short + "（" + label + "）",
        duration: 0,
        totalScore: 0,
        quality: "unverified",
        source: SOURCE,
        sourceNote: SOURCE_NOTE,
        sections: [{ id: suffix === "single" ? "single" : "multiple", name: label + "（" + questions.length + " 题）", questions }],
      };
      parts.push(writePaper(paper, { groupId: "politics-2027-" + meta.group }));
    }
    if (parts.length) {
      groups.push({
        id: "politics-2027-" + meta.group,
        subject: "politics",
        subjectName: "政治",
        publisher: PUBLISHER,
        name: "2027 考研政治选择题题库 · " + meta.short,
        year: YEAR,
        source: SOURCE,
        note: "题库型素材（按教材章节组织，非整卷模拟卷）。答案由来源生成（answerInferred=true），未经逐题核对；题干/选项未经人工校对。",
        papers: parts,
      });
    }
  }
  console.log("  parsed=" + parsed + "  入库分组=" + groups.length);
  return groups;
}
// ================================================================ 2. 数学一 · 张宇 1000 题
function buildZhangyu() {
  const base = path.join(CACHE, "zhangyu");
  const idxFile = path.join(base, "index.html");
  const chapDir = path.join(base, "chapters");
  if (!fs.existsSync(idxFile) || !fs.existsSync(chapDir)) { console.log("[zhangyu] 缺少缓存文件，跳过"); return []; }
  const idx = fs.readFileSync(idxFile, "utf8");
  const meta = new Map();
  {
    const re = /<h2 class="part-title"[^>]*>([^<]+)<\/h2>|<h3 class="subject-title">([^<]+)<\/h3>|<a class="chapter-item" href="chapters\/chapter-(\d+)\.html" data-cid="\d+">\s*<span class="ci-title">([^<]*)<\/span>\s*<span class="ci-meta"><span class="ci-count">(\d+)题/g;
    let m, part = "", subject = "";
    while ((m = re.exec(idx))) {
      if (m[1] !== undefined) part = m[1].replace(/[^\u4e00-\u9fff]/g, "").trim();
      else if (m[2] !== undefined) subject = m[2].trim();
      else meta.set(Number(m[3]), { title: m[4].trim(), count: Number(m[5]), part, subject });
    }
  }
  if (!meta.size) { console.log("[zhangyu] 目录解析失败，跳过"); return []; }

  const chapters = [];
  for (const f of fs.readdirSync(chapDir).filter((x) => x.endsWith(".html")).sort()) {
    const no = Number(f.match(/chapter-(\d+)/)[1]);
    const info = meta.get(no) || { title: "第 " + no + " 章", count: 0, part: "未分组", subject: "" };
    const html = fs.readFileSync(path.join(chapDir, f), "utf8");
    const questions = [];
    for (const m of html.matchAll(/<article class="question"[^>]*data-no="(\d+)"[\s\S]*?<\/article>/g)) {
      const block = m[0];
      const qno = Number(m[1]);
      const kind = (block.match(/<span class="q-kind">([^<]*)<\/span>/) || [])[1] || "";
      const stemEnd = block.indexOf('<div class="divider"');
      if (stemEnd < 0) { drop("zhangyu", f + "#q" + qno, "未匹配到题干分隔"); continue; }
      const stemHtml = block.slice(block.indexOf('<div class="q-stem">') + '<div class="q-stem">'.length, stemEnd);
      const stemOnly = inlineText(stemHtml.replace(/<div class="options">[\s\S]*$/, ""));
      const optMatches = [...stemHtml.matchAll(/<b class="opt-key">\s*\(?([A-D])\)?[.、]?\s*<\/b>\s*<span class="opt-val">([\s\S]*?)<\/span>/g)];
      const options = optMatches.map((o) => ({ key: o[1], text: inlineText(o[2]) }));
      const analysisHtml = (block.match(/<div class="analysis-body">([\s\S]*?)<\/div>/) || [])[1] || "";
      const expl = textOf(analysisHtml.replace(/<div class="answer-line">[\s\S]*$/, ""));
      const ansTxt = inlineText((block.match(/<span class="answer-body">([\s\S]*?)<\/span>/) || [])[1] || "");
      let type = "essay";
      let answer = "";
      if (options.length) {
        const nl = normalizeLetters(ansTxt.replace(/[()（）]/g, ""));
        if (nl.letters) {
          type = nl.letters.length > 1 ? "multiple" : "single";
          answer = nl.letters;
        } else {
          type = "single";
          answer = "";
          warn("zhangyu " + f + "#q" + qno + ": 有选项但未解析出答案（" + JSON.stringify(ansTxt) + "）");
        }
        if (options.length !== 4) warn("zhangyu " + f + "#q" + qno + ": 选项数 " + options.length);
      } else if (/选择/.test(kind)) {
        drop("zhangyu", f + "#q" + qno, "标注为选择题但未解析出选项", stemOnly.slice(0, 50));
        continue;
      } else {
        type = "essay";
        answer = ansTxt;
      }
      const garbled = looksGarbled(stemOnly);
      if (garbled) { drop("zhangyu", f + "#q" + qno, "题干疑似损坏：" + garbled, stemOnly.slice(0, 60)); continue; }
      questions.push({
        no: qno, type, stem: stemOnly, options, answer, explanation: expl,
        kind, chapter: no + ". " + info.title, sourceNo: qno,
      });
    }
    if (info.count && questions.length !== info.count) {
      warn("zhangyu chapter-" + no + "(" + info.title + ") 声明 " + info.count + " 题，解析出 " + questions.length + " 题");
    }
    chapters.push(Object.assign({ no }, info, { questions }));
  }

  const SOURCE = {
    name: "jlshdsdk/zhangyu-1000t · 2026 张宇考研数学1000题（数学一）刷题版（题目与解析转录自原书）",
    url: "https://github.com/jlshdsdk/zhangyu-1000t",
  };
  const PUBLISHER = "张宇（来源：1000 题转录版）";
  const YEAR = 2026;
  const groups = [];
  const mkQuestions = (list, paperId) =>
    list.map((q, i) => ({
      id: paperId + "-q" + (i + 1),
      no: i + 1,
      type: q.type,
      stem: q.stem,
      options: q.options,
      answer: q.answer,
      explanation: q.explanation,
      score: q.type === "single" || q.type === "multiple" ? 5 : 0,
      topics: ["math1-2026-zhangyu1000"],
      images: [],
      chapter: q.chapter,
      sourceNo: q.sourceNo,
    }));

  const testChaps = chapters.filter((c) => /测试卷/.test(c.title));
  const drillChaps = chapters.filter((c) => !/测试卷/.test(c.title));
  const testPapers = [];
  testChaps.forEach((c, i) => {
    const paperId = "mock-math1-zhangyu1000-2026-test" + (i + 1);
    const questions = mkQuestions(c.questions, paperId);
    if (!questions.length) return;
    const paper = {
      id: paperId,
      subject: "math1",
      subjectName: "数学一",
      kind: "mock",
      mockName: "2026 张宇考研数学1000题 · " + c.title,
      publisher: PUBLISHER,
      year: YEAR,
      paperNo: i + 1,
      paperKind: "testPaper",
      title: "2026 张宇考研数学1000题（数学一）· " + c.title,
      duration: 180,
      totalScore: 150,
      quality: "unverified",
      source: SOURCE,
      sourceNote: "题目与解析由来源仓库转录自《2026 张宇考研数学1000题（数学一）》；本卷为书末测试卷，未逐题核对。",
      sections: [{ id: "all", name: c.title + "（" + questions.length + " 题）", questions }],
    };
    testPapers.push(writePaper(paper, { groupId: "math1-zhangyu1000-2026-test" }));
  });
  if (testPapers.length) {
    groups.push({
      id: "math1-zhangyu1000-2026-test",
      subject: "math1",
      subjectName: "数学一",
      publisher: PUBLISHER,
      name: "2026 张宇考研数学1000题 · 测试卷",
      year: YEAR,
      source: SOURCE,
      note: "整卷型素材（书末四套测试卷），题目与解析同步转录，未逐题核对。",
      papers: testPapers,
    });
  }

  const byPart = new Map();
  for (const c of drillChaps) byPart.set(c.part, [...(byPart.get(c.part) || []), c]);
  const drillPapers = [];
  let k = 1;
  for (const [part, list] of byPart) {
    const paperId = "mock-math1-zhangyu1000-2026-part" + k;
    const flat = list.flatMap((c) => c.questions);
    const questions = mkQuestions(flat, paperId);
    if (!questions.length) continue;
    const chNames = list.map((c) => c.no + "." + c.title).join(" / ");
    const paper = {
      id: paperId,
      subject: "math1",
      subjectName: "数学一",
      kind: "mock",
      mockName: "2026 张宇考研数学1000题 · " + part + "章节练习",
      publisher: PUBLISHER,
      year: YEAR,
      paperNo: k,
      paperKind: "chapterDrill",
      title: "2026 张宇考研数学1000题（数学一）· " + part + "（" + list.length + " 章合集）",
      duration: 0,
      totalScore: 0,
      quality: "unverified",
      source: SOURCE,
      sourceNote:
        "按来源站点章节合并的练习卷，章节范围：" + (chNames.length > 900 ? chNames.slice(0, 900) + "…" : chNames) +
        "。非正式出版物整卷；题目与解析由来源仓库转录。",
      sections: [{ id: "all", name: part + " · " + list.length + " 章（" + questions.length + " 题）", questions }],
    };
    drillPapers.push(writePaper(paper, { groupId: "math1-zhangyu1000-2026-chapters" }));
    k++;
  }
  if (drillPapers.length) {
    groups.push({
      id: "math1-zhangyu1000-2026-chapters",
      subject: "math1",
      subjectName: "数学一",
      publisher: PUBLISHER,
      name: "2026 张宇考研数学1000题 · 章节练习",
      year: YEAR,
      source: SOURCE,
      note: "题库型素材（按书的篇章合并），非整卷模拟卷。",
      papers: drillPapers,
    });
  }
  return groups;
}
// ================================================================ 3. 408 · 王道教材题库
function build408() {
  const dir = path.join(CACHE, "w408");
  if (!fs.existsSync(dir)) { console.log("[w408] 缺少缓存文件，跳过"); return []; }
  const MAP = [
    ["数据结构.json", "数据结构", "ds", "数据结构的逻辑/存储结构与算法"],
    ["计组.json", "计算机组成原理", "co", "计算机组成原理"],
    ["操作系统.json", "操作系统", "os", "操作系统"],
    ["计网.json", "计算机网络", "net", "计算机网络"],
  ];
  const SOURCE = {
    name: "zsc5725216-hub/408-quiz · 计算机考研408刷题网站（王道 2027 教材 OCR 题库）",
    url: "https://github.com/zsc5725216-hub/408-quiz",
  };
  const PUBLISHER = "王道（来源：2027 教材 OCR 题库）";
  const YEAR = 2027;
  const groups = [];
  const papers = [];
  for (const [f, subjName, code, label] of MAP) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) continue;
    let j;
    try { j = JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { drop("w408", f, "JSON 解析失败", e.message); continue; }
    const paperId = "mock-cs408-wangdao-2027-" + code;
    const sections = [];
    let n = 0;
    let answerNoteCount = 0;
    let truncatedOpts = 0;
    for (const [secKey, sec] of Object.entries(j.sections || {})) {
      const choiceQs = [];
      for (const q of sec.qs || []) {
        if (!Array.isArray(q) || q.length < 5) {
          drop("w408", code + "/" + secKey, "选择题条目结构异常", JSON.stringify(q).slice(0, 60));
          continue;
        }
        const srcNo = q[0], ans = q[1], stem = q[2], expl = q[3], opts = q[4];
        const stemTxt = stripLeadNo(String(stem || ""));
        const garbled = looksGarbled(stemTxt);
        if (garbled) { drop("w408", code + "/" + secKey + "#" + srcNo, "题干疑似 OCR 损坏：" + garbled, stemTxt.slice(0, 60)); continue; }
        const optList = Array.isArray(opts) ? opts.map((o) => String(o || "").trim()) : [];
        if (optList.length !== 4) {
          drop("w408", code + "/" + secKey + "#" + srcNo, "选项数 " + optList.length + " != 4", stemTxt.slice(0, 50));
          continue;
        }
        const parsedOpts = optList.map((o, i) => ({
          key: LETTERS[i],
          text: o.replace(/^\s*[A-D][.、．)）]?\s*/, "").trim(),
        }));
        if (parsedOpts.some((o) => !o.text)) {
          drop("w408", code + "/" + secKey + "#" + srcNo, "存在空选项", stemTxt.slice(0, 50));
          continue;
        }
        const nl = normalizeLetters(ans);
        const notes = [];
        if (!nl.letters) notes.push("来源未给出可解析答案");
        for (const c of nl.letters) if (!parsedOpts.some((o) => o.key === c)) notes.push("答案字母 " + c + " 不在选项中");
        if (notes.some((x) => x.includes("不在选项中"))) {
          drop("w408", code + "/" + secKey + "#" + srcNo, notes.join("；"), stemTxt.slice(0, 50));
          continue;
        }
        if (nl.changed) notes.push("来源答案串为 \"" + nl.raw + "\"，已按去重升序规范为 \"" + nl.letters + "\"（疑似 OCR 重复字符）");
        if (optList.length < 4) notes.push("来源仅给出 " + optList.length + " 个选项（王道选择题应为 4 个），选项内容缺失，答案字母与选项的对应关系未经核对");
        if (optList.length < 4) truncatedOpts++;
        if (notes.length) answerNoteCount++;
        const multiLetter = nl.letters.length > 1;
        if (multiLetter) notes.push("来源答案为多字母，已按「多选」入库（王道教材选择题存在个别多选/OCR 串扰，未经人工确认）");
        n++;
        choiceQs.push(Object.assign({
          id: paperId + "-q" + n,
          no: n,
          type: multiLetter ? "multiple" : "single",
          stem: stemTxt,
          options: parsedOpts,
          answer: nl.letters,
          explanation: String(expl || "").trim(),
          score: 2,
          topics: ["cs408-2027-wangdao-" + code + "-" + secKey],
          images: [],
          section: (secKey + " " + (sec.title || "")).trim(),
          sourceNo: Number(srcNo) || undefined,
        }, notes.length ? { answerNote: notes.join("；") } : {}));
      }
      const bigQs = [];
      for (const q of sec.bigq || []) {
        if (!Array.isArray(q) || q.length < 3) continue;
        const srcNo = q[0], stem = q[1], ans = q[2];
        const stemTxt = stripLeadNo(String(stem || ""));
        const garbled = looksGarbled(stemTxt);
        if (garbled) { drop("w408", code + "/" + secKey + " 综合#" + srcNo, "题干疑似 OCR 损坏：" + garbled, stemTxt.slice(0, 60)); continue; }
        n++;
        bigQs.push({
          id: paperId + "-q" + n,
          no: n,
          type: "essay",
          stem: stemTxt,
          options: [],
          answer: String(ans || "").trim(),
          explanation: "",
          score: 0,
          topics: ["cs408-2027-wangdao-" + code + "-" + secKey],
          images: [],
          section: (secKey + " " + (sec.title || "")).trim(),
          sourceNo: Number(srcNo) || undefined,
          kind: "综合应用题",
        });
      }
      const sid = secKey.replace(/\./g, "-");
      if (choiceQs.length) sections.push({ id: "ch-" + sid + "-single", name: secKey + " " + (sec.title || "") + " · 单项选择题", questions: choiceQs });
      if (bigQs.length) sections.push({ id: "ch-" + sid + "-big", name: secKey + " " + (sec.title || "") + " · 综合应用题", questions: bigQs });
    }
    if (!sections.length) continue;
    const paper = {
      id: paperId,
      subject: "cs408",
      subjectName: "408",
      kind: "mock",
      mockName: "2027 王道 408 " + subjName + " 题库",
      publisher: PUBLISHER,
      year: YEAR,
      paperNo: papers.length + 1,
      paperKind: "questionBank",
      title: "2027 王道 408 " + subjName + " 题库（" + label + "）",
      duration: 0,
      totalScore: 0,
      quality: "unverified",
      source: SOURCE,
      sourceNote:
        "来源为 GitHub 上的王道 408 教材 OCR 题库（按教材小节组织），非正式出版模拟卷。" +
        "题干来自 OCR，可能存在字符错误；个别题目的答案串在来源中为重复字符，已按去重升序规范化并在题目上标注 answerNote。",
      sections,
    };
    papers.push(writePaper(paper, { groupId: "cs408-wangdao-2027", answerNoteCount, truncatedOpts }));
  }
  if (papers.length) {
    groups.push({
      id: "cs408-wangdao-2027",
      subject: "cs408",
      subjectName: "408",
      publisher: PUBLISHER,
      name: "2027 王道 408 教材题库",
      year: YEAR,
      source: SOURCE,
      note: "题库型素材（按教材章节），非整卷模拟卷；题干为 OCR 结果，未逐题校对。",
      papers,
    });
  }
  return groups;
}

// ================================================================ main
console.log("=== build-mock ===");
const groups = [...buildPolitics(), ...buildZhangyu(), ...build408()];

const manifest = {
  version: 1,
  generatedAt: GENERATED_AT,
  note:
    "模拟卷来源为互联网公开渠道，未经逐题校验，仅供练习；请以正式出版物为准。" +
    "本区所有卷 quality 均为 unverified；其中部分素材为「题库型」（按章节组织，非整卷模拟卷），" +
    "已在各 group 的 note / 各卷的 paperKind 中标明。",
  failed: [],
  groups,
};

const fetchReport = path.join(CACHE, "fetch-report.json");
if (fs.existsSync(fetchReport)) {
  const fr = JSON.parse(fs.readFileSync(fetchReport, "utf8"));
  for (const f of fr.failures || []) {
    manifest.failed.push({
      name: f.repo + " :: " + f.path,
      source: f.repo,
      url: "https://github.com/" + f.repo,
      reason: "原始文件下载失败 HTTP " + f.status + (f.err ? " " + f.err : ""),
    });
  }
}

const byReason = {};
for (const d of dropped) {
  const k = d.reason.replace(/：.*/, "").replace(/\(.*/, "").trim();
  byReason[k] = (byReason[k] || 0) + 1;
}
const droppedByReason = Object.entries(byReason).sort((a, b) => b[1] - a[1]);
manifest.droppedSummary = {
  count: dropped.length,
  note: "以下为解析阶段主动丢弃、未写入题库的题目（依据「不乱码入库」纪律）。完整明细见 tools/cache/mock/build-report.json。",
  byReason: droppedByReason.map(([reason, count]) => ({ reason, count })),
  items: dropped,
};
fs.writeFileSync(path.join(OUT, "_manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

const summary = {
  generatedAt: GENERATED_AT,
  groups: groups.length,
  papers: paperRecords.length,
  questions: paperRecords.reduce((a, b) => a + b.questionCount, 0),
  withAnswer: paperRecords.reduce((a, b) => a + b.withAnswer, 0),
  droppedCount: dropped.length,
  droppedByReason,
  warningCount: warnings.length,
  papersList: paperRecords,
  dropped,
  warnings,
};
fs.writeFileSync(path.join(CACHE, "build-report.json"), JSON.stringify(summary, null, 2) + "\n");

console.log("\n=== 完成 ===");
console.log("分组 " + groups.length + "，卷 " + summary.papers + "，题目 " + summary.questions + "，有答案 " + summary.withAnswer);
console.log("丢弃 " + summary.droppedCount + " 题，理由分布：");
for (const [r, c] of summary.droppedByReason) console.log("   " + String(c).padStart(5) + "  " + r);
console.log("警告 " + summary.warningCount + " 条 -> tools/cache/mock/build-report.json");
