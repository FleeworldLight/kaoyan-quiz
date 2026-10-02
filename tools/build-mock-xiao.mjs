#!/usr/bin/env node
/**
 * build-mock-xiao.mjs —— 把 N诺考研（noobdream.com）的 /Practice/exam_solution/<id>/ 页面
 * 解析成 public/data/mock/ 下的模拟卷 JSON（结构与 build-mock.mjs 完全一致）。
 *
 * 数据形态：exam_solution 页面是「某位用户做过这套卷子后的成绩/解析页」，
 * 公开可访问，包含：分节标题、题干、四个选项、正确答案、原书解析（答案解析折叠区）。
 *
 * 输入：tools/cache/mock-xiao/nnd/raw/<id>.html
 *       tools/cache/mock-xiao/sources.json  （由 fetch-mock-xiao.mjs 或人工维护）
 * 输出：public/data/mock/<paperId>.json
 *       tools/cache/mock-xiao/build-report.json
 *
 * 纪律：不编造。答案只取来源页里明确写着「正确答案 / 答案X / 标准答案为X / 参考答案」的内容；
 *      抽不到就留空串并在 sourceNote 说明。选项数不等于 4 的单选题直接丢弃并记入报告。
 *
 * 用法: node tools/build-mock-xiao.mjs [--dry]
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE = path.join(ROOT, "tools", "cache", "mock-xiao");
const RAW = path.join(CACHE, "nnd", "raw");
const OUTDIR = path.join(ROOT, "public", "data", "mock");
const DRY = process.argv.includes("--dry");

// ------------------------------------------------------------------ HTML 工具
const ENT = {
  nbsp: " ", ldquo: "\u201c", rdquo: "\u201d", lsquo: "\u2018", rsquo: "\u2019",
  hellip: "\u2026", mdash: "\u2014", ndash: "\u2013", amp: "&", lt: "<", gt: ">",
  quot: '"', apos: "'", middot: "\u00b7", times: "\u00d7", divide: "\u00f7",
  deg: "\u00b0", prime: "\u2032", Prime: "\u2033", rarr: "\u2192", larr: "\u2190",
  le: "\u2264", ge: "\u2265", ne: "\u2260", infin: "\u221e", sum: "\u2211",
  int: "\u222b", radic: "\u221a", alpha: "\u03b1", beta: "\u03b2", gamma: "\u03b3",
  delta: "\u03b4", Delta: "\u0394", mu: "\u03bc", sigma: "\u03c3", pi: "\u03c0",
  theta: "\u03b8", lambda: "\u03bb", omega: "\u03c9", phi: "\u03c6", pi2: "\u03c0",
  lceil: "\u2308", rceil: "\u2309", lfloor: "\u230a", rfloor: "\u230b",
  frac12: "\u00bd", frac14: "\u00bc", frac34: "\u00be", sup2: "\u00b2", sup3: "\u00b3",
  szlig: "ss", euro: "\u20ac", yen: "\u00a5", pound: "\u00a3", sect: "\u00a7",
  para: "\u00b6", dagger: "\u2020", permil: "\u2030", copy: "\u00a9", reg: "\u00ae",
  trade: "\u2122", bull: "\u2022", dagger2: "\u2021", loz: "\u25ca", oline: "\u203e",
  crarr: "\u21b5", harr: "\u2194", uarr: "\u2191", darr: "\u2193", hArr: "\u21d4",
  forall: "\u2200", exist: "\u2203", empty: "\u2205", isin: "\u2208", notin: "\u2209",
  sub: "\u2282", sup: "\u2283", nsub: "\u2284", sube: "\u2286", supe: "\u2287",
  oplus: "\u2295", otimes: "\u2297", perp: "\u22a5", ang: "\u2220", there4: "\u2234",
  sim: "\u223c", cong: "\u2245", asymp: "\u2248", equiv: "\u2261", prop: "\u221d",
};
function decodeEnt(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (m, n) => (ENT[n] !== undefined ? ENT[n] : m));
}
/** 去掉 HTML 标签、解码实体、压缩空白 */
function text(html) {
  return decodeEnt(
    String(html)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<li[^>]*>/gi, "  - ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\r/g, "")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
/** 取 <div ...> 起始处的配对内容（支持嵌套 div） */
function innerDiv(html, startIdx) {
  const open = html.indexOf(">", startIdx);
  let depth = 1;
  let i = open + 1;
  while (i < html.length && depth > 0) {
    const nxt = html.indexOf("<div", i);
    const cls = html.indexOf("</div", i);
    if (cls < 0) break;
    if (nxt >= 0 && nxt < cls) {
      depth++;
      i = nxt + 4;
    } else {
      depth--;
      if (depth === 0) return { body: html.slice(open + 1, cls), end: cls + 6 };
      i = cls + 5;
    }
  }
  return { body: html.slice(open + 1), end: html.length };
}

// ------------------------------------------------------------------ 单卷解析

/**
 * 从单个 <p> 段落里识别选项。来源页把选项排版成多种形态：
 *   "A.xxx"                    （一段一个选项）
 *   "A.投资和借贷    B.竞争和信用"   （一段两个选项）
 *   "A.3:1  B.4:1  C.5:1  D.2:1"  （一段四个选项）
 * 规则：字母必须严格递增，且第一个字母出现在段首、或正好接着已抓到的选项（A→B→C→D）。
 * 返回 null 表示这不是选项段落（归入题干）。
 */
function optionsFromPara(p, optMap) {
  const ms = [...p.matchAll(/([A-D])\s*[.．、,，]\s*/g)];
  if (!ms.length) return null;
  const keys = ms.map((m) => m[1]);
  for (let i = 1; i < keys.length; i++) if (keys[i] <= keys[i - 1]) return null;
  const expected = ["A", "B", "C", "D"][optMap.size] || null;
  const head = p.slice(0, ms[0].index);
  const atHead = /^[\s\u00a0]*$/.test(head);
  if (!atHead && keys[0] !== expected) return null;
  if (optMap.has(keys[keys.length - 1])) return null;
  const out = [];
  for (let k = 0; k < ms.length; k++) {
    const s = ms[k].index + ms[k][0].length;
    const e = k + 1 < ms.length ? ms[k + 1].index : p.length;
    const t = p.slice(s, e).replace(/[\s\u00a0]+/g, " ").replace(/^[\s]+|[\s]+$/g, "");
    if (!t) return null; // 有空选项 → 不认，整段进题干
    out.push([keys[k], t]);
  }
  return out;
}

const TYPE_BY_SECTION = [
  [/单项选择题|单选题|选择题/, "single"],
  [/多项选择题|多选题|多选题型/, "multiple"],
  [/填空题/, "blank"],
  [/材料分析题|分析题|解答题|计算题|论述题|综合题/, "essay"],
];

/**
 * 该来源站有多套页面模板（不同年份/不同上传者），分节标题的写法并不统一：
 *   <p><strong>一、单项选择题：…</strong></p>
 *   <p>二、多项选择题：…</p>            （无 strong）
 *   （数学卷）根本没有分节标题
 * 因此题型不能只靠标题判定，改用「内容驱动」：有选项 → 选择题（按答案字母数分单/多选）；
 * 无选项 → 看题面标签（填空题/本题满分…）→ blank / essay。
 */
/**
 * 考研卷的题型分布是固定的考试结构（不是内容判断）：
 *   政治：1–16 单选（1 分）／17–33 多选（2 分）／34–38 材料分析（10 分）
 *   数学一：1–10 选择／11–16 填空／17–22 解答
 * 来源站的分节标题时有时无，因此优先按题号定位题型，再用抓到的内容做交叉校验。
 */
function templateType(subject, no, maxNo) {
  if (subject === "politics" && maxNo >= 33) {
    if (no <= 16) return "single";
    if (no <= 33) return "multiple";
    return "essay";
  }
  if (subject === "math1" && maxNo >= 20) {
    if (no <= 10) return "single";
    if (no <= 16) return "blank";
    return "essay";
  }
  return null;
}

function inferType({ optCount, answer, stem, headerType }) {
  if (optCount >= 2) return answer && answer.length > 1 ? "multiple" : "single";
  if (optCount === 1) return answer && answer.length > 1 ? "multiple" : "single";
  if (/（填空题）|\(填空题\)|填空题/.test(stem)) return "blank";
  if (headerType === "blank") return "blank";
  if (headerType === "essay") return "essay";
  return "essay";
}

function parsePaper(html, meta) {
  // 去掉 HTML 注释（页面把旧版答案解析整段注释掉了，会干扰）与零宽字符（来源页里大量混入 U+200B）
  const h = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/[\u200b-\u200f\u2060\ufeff\u00ad]/g, "");
  const titleRaw = (html.match(/<title>\s*([\s\S]*?)\s*<\/title>/) || [])[1] || "";
  const pageTitle = decodeEnt(titleRaw.replace(/\s+/g, " ").trim()).replace(/__N诺考研$/, "");

  const marks = [...h.matchAll(/id="question(\d+)"/g)].map((m) => ({ no: Number(m[1]), at: m.index }));
  const maxNo = marks.reduce((a, x) => Math.max(a, x.no), 0);
  const dropped = [];
  const parsed = [];
  let curSecName = "";
  let curHdrType = "";

  for (let i = 0; i < marks.length; i++) {
    const block = h.slice(marks[i].at, i + 1 < marks.length ? marks[i + 1].at : h.length);
    const no = marks[i].no;

    // ---- 分节标题（一般只在该节第一题里出现；允许无 <strong> 的写法）
    const secM = block.match(/<p[^>]*>\s*(?:<strong>)?\s*([一二三四五六七八]、[^<]{0,140}?)\s*(?:<\/strong>)?\s*<\/p>/);
    if (secM) {
      curSecName = text(secM[1]);
      curHdrType = "";
      for (const [re, ty] of TYPE_BY_SECTION) if (re.test(curSecName)) { curHdrType = ty; break; }
    }

    // ---- 题目链接里的 article id（可溯源到单题页）
    const artM = block.match(/\/Practice\/article\/(\d+)\//);
    const articleId = artM ? Number(artM[1]) : null;

    // ---- subject-options 里的题干 + 选项
    let stemHtml = "";
    const soIdx = block.indexOf('class="subject-options"');
    if (soIdx >= 0) stemHtml = innerDiv(block, block.lastIndexOf("<div", soIdx)).body;
    const parasRaw = [...stemHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => text(m[1])).filter((s) => s.length);
    // 有些页面（如 2025 张宇 8 套卷）题干是直接写在 div 里的裸文本，没有 <p>
    const paras = parasRaw.length ? parasRaw : (text(stemHtml) ? [text(stemHtml)] : []);
    const secHeaderText = secM ? text(secM[1]) : null;
    const bodyParas = paras.filter((p) => p !== secHeaderText);

    const optMap = new Map();
    const stemParas = [];
    for (const p of bodyParas) {
      const got = optionsFromPara(p, optMap);
      if (got) {
        for (const [k, v] of got) if (!optMap.has(k)) optMap.set(k, v);
        continue;
      }
      stemParas.push(p);
    }

    // ---- 折叠区 id=show_answerN（注释已剥离）
    let explainHtml = "";
    const saIdx = block.indexOf(`id="show_answer${no}"`);
    if (saIdx >= 0) explainHtml = innerDiv(block, block.lastIndexOf("<div", saIdx)).body;
    const explainText = text(explainHtml);

    // ---- 题目 id 顺序：题干先拼出来，才能据「（填空题）」「本题满分 X 分」判题型
    let stem = "", material, materialTitle;
    const tmpStem = stemParas.join("\n\n");
    const tpl = templateType(meta.subject, no, maxNo);
    let type = tpl || inferType({ optCount: optMap.size, answer: "", stem: tmpStem, headerType: curHdrType });
    const optionIssue = optMap.size > 0 && optMap.size < 4 ? `来源页只抓到 ${optMap.size} 个选项（疑似图题/选项为图片）` : "";

    if (type === "essay") {
      const qStart = stemParas.findIndex((p) => /^[（(]\s*\d\s*[）)]/.test(p));
      if (qStart > 0) {
        material = stemParas.slice(0, qStart).join("\n\n");
        materialTitle = "材料";
        stem = stemParas.slice(qStart).join("\n\n");
      } else stem = tmpStem;
    } else {
      stem = tmpStem.replace(/^[（(]\s*(单项|多项)选择题\s*[）)]\s*/, "").trim();
    }
    if (secHeaderText && stem.startsWith(secHeaderText)) stem = stem.slice(secHeaderText.length).trim();

    // ---- 答案：只取来源页明确写出的内容，绝不推断
    let answer = "";
    let answerFrom = "";
    let refExplanation = "";
    let answerNote = "";
    const isChoiceNow = type === "single" || type === "multiple";

    if (isChoiceNow) {
      const caM = block.match(/class="correct-answer"[^>]*>\s*([A-D]{1,4})\s*</);
      if (caM) { answer = caM[1]; answerFrom = "correct-answer"; }
      if (!answer) {
        // 兼容「答案A」「【答案】C」「[答案] D」「标准答案为AB」「正确答案是B」
        const pats = [
          [/[【\[（(]?\s*标准答案为\s*[】\]）)]?\s*[:：]?\s*([A-D]{1,4})(?![A-Za-z])/, "标准答案为"],
          [/[【\[（(]?\s*正确答案\s*[】\]）)]?\s*[是为:：]?\s*([A-D]{1,4})(?![A-Za-z])/, "正确答案"],
          [/[【\[（(]?\s*答案\s*[】\]）)]?\s*[:：]?\s*([A-D]{1,4})(?![A-Za-z])/, "答案解析"],
        ];
        for (const [re, from] of pats) {
          const m = explainText.match(re) || block.match(re);
          if (m) { answer = m[1]; answerFrom = from; break; }
        }
      }
      // 「A、B、C正确，D错误」这类简析里的明确表述（必须列出 ≥2 个字母才采用）
      if (!answer) {
        const m = explainText.match(/((?:[A-D][、,，]\s*){1,3}[A-D])\s*(?:均|都)?(?:正确|对)\b?/);
        if (m) {
          const letters = [...new Set(m[1].match(/[A-D]/g))].sort().join("");
          if (letters.length >= 2) { answer = letters; answerFrom = "简析中「…正确」表述"; }
        }
      }
    } else if (explainText) {
      const sp = splitRefAnswer(explainText);
      answer = sp.answer;
      if (answer) answerFrom = "答案解析（参考答案）";
      if (sp.explanation) refExplanation = sp.explanation;
    }

    // ---- 与题号模板交叉校验：多选只拿到 1 个字母 → 视为来源未给全，答案留空并标注
    if (type === "multiple" && answer && answer.length < 2) {
      answerNote = `来源页只给出 1 个字母（${answer}），与多选题型不符，按「不猜答案」纪律未采用。`;
      answer = "";
      answerFrom = "";
    }
    if (type === "single" && answer.length > 1) {
      answerNote = `来源页给出的答案为 ${answer}（多于 1 个字母），与单选题型不符，已按多选入库。`;
      type = "multiple";
    }

    let explanation = refExplanation;
    if (isChoiceNow && explainText) {
      explanation = explainText.replace(/^[【\[（(]?\s*答案\s*[】\]）)]?\s*[:：]?\s*[A-D]{1,4}\s*/, "").replace(/^简析\s*/, "简析：").trim();
    }

    // ---- 组装题目
    const opts = ["A", "B", "C", "D"].map((k) => ({ key: k, text: optMap.get(k) || "" })).filter((o) => o.text.length);
    const q = {
      id: `${meta.paperId}-q${no}`,
      no,
      type,
      stem,
      options: isChoiceNow ? opts : [],
      answer,
      explanation,
      score: type === "single" ? 1 : type === "multiple" ? 2 : 0,
      topics: [],
      images: [],
      _articleId: articleId,
      _answerFrom: answerFrom,
      _answerNote: answerNote,
      _optionIssue: optionIssue,
      _hdr: curSecName,
    };
    if (material) { q.material = material; q.materialTitle = materialTitle; }

    // 选择题必须凑齐选项才入库（validate-mock 要求 single 恰好 4 个选项）；
    // 缺选项的按纪律丢弃并记入报告，而不是补造选项。
    if (isChoiceNow && type === "single" && opts.length !== 4) {
      dropped.push({ ref: `${meta.paperId}#${no}`, reason: `选项数 ${opts.length} != 4`, detail: stem.slice(0, 60) });
      continue;
    }
    if (isChoiceNow && type === "multiple" && opts.length < 2) {
      dropped.push({ ref: `${meta.paperId}#${no}`, reason: `多选题选项数 ${opts.length} < 2`, detail: stem.slice(0, 60) });
      continue;
    }
    if (!stem) {
      dropped.push({ ref: `${meta.paperId}#${no}`, reason: "题干为空", detail: "" });
      continue;
    }
    if (isChoiceNow && answer && !/^[A-D]+$/.test(answer)) {
      dropped.push({ ref: `${meta.paperId}#${no}`, reason: `答案格式非法 ${answer.slice(0, 20)}`, detail: stem.slice(0, 50) });
      continue;
    }
    if (isChoiceNow && answer) {
      if (new Set(answer.split("")).size !== answer.length) answer = [...new Set(answer.split(""))].join("");
      answer = [...answer].sort().join("");
      q.answer = answer;
    }
    parsed.push(q);
  }

  // ---- 按题型归并成分节（来源站模板不一致，分节标题不可靠；题型已由内容判定）
  const ORDER = ["single", "multiple", "blank", "essay"];
  const CN = "一二三四五六七八九十";
  const sections = [];
  let seq = 0;
  for (const t of ORDER) {
    const qs = parsed.filter((q) => q.type === t).sort((a, b) => a.no - b.no);
    if (!qs.length) continue;
    const hdr = qs.map((q) => q._hdr).find((x) => x && LABEL_MATCH[t] && LABEL_MATCH[t].test(x)) || "";
    const base = hdr ? sectionLabel(hdr) : DEFAULT_LABEL[t];
    const name = `${CN[seq] || seq + 1}、${base.replace(/^[一二三四五六七八九十]、\s*/, "")}`;
    seq++;
    for (const q of qs) {
      delete q._hdr;
      if (q._articleId) q.sourceUrl = `https://noobdream.com/Practice/article/${q._articleId}/`;
      delete q._articleId;
      if (!q._answerFrom) delete q._answerFrom;
      if (!q._answerNote) delete q._answerNote;
      if (!q._optionIssue) delete q._optionIssue;
    }
    sections.push({ id: t, name, questions: qs });
  }
  return { pageTitle, sections, dropped };
}

const LABEL_MATCH = {
  single: /单项|单选|选择题/,
  multiple: /多项|多选/,
  blank: /填空/,
  essay: /材料分析|分析|解答|计算|论述|综合/,
};
const DEFAULT_LABEL = { single: "单项选择题", multiple: "多项选择题", blank: "填空题", essay: "材料分析题" };

function cleanRefAnswer(t) {
  let s = String(t)
    .replace(/^[\s\u3000]*[【\[（(]?\s*(参考答案|答案)\s*[】\]）)]?\s*[:：]?\s*/, "")
    .replace(/\n?题目总分[:：][^\n]*$/g, "")
    .trim();
  return s;
}

/** 把「【答案】…【分析】…」拆成 answer / explanation */
function splitRefAnswer(t) {
  const s = String(t).replace(/^[\s\u3000]*[【\[（(]?\s*(参考答案|答案)\s*[】\]）)]?\s*[:：]?\s*/, "").trim();
  const m = s.match(/^\s*([\s\S]*?)\s*[【\[]\s*(分析|解析|详解|解)\s*[】\]]\s*([\s\S]*)$/);
  if (m) return { answer: m[1].trim(), explanation: (m[3] || "").trim() };
  return { answer: s, explanation: "" };
}
function secIdOf(name, type) {
  if (/单项/.test(name)) return "single";
  if (/多项/.test(name)) return "multiple";
  if (/填空/.test(name)) return "blank";
  if (/材料分析|解答|计算|分析|论述|综合/.test(name)) return "essay";
  return type === "single" ? "choice" : type;
}
function sectionLabel(name) {
  const m = name.match(/^([一二三四五六七八])、\s*([^：:]{2,20})/);
  if (m) return `${m[1]}、${m[2]}`;
  return name.slice(0, 40);
}

// ------------------------------------------------------------------ 主流程
const sourcesFile = path.join(CACHE, "sources.json");
if (!fs.existsSync(sourcesFile)) {
  console.error(`缺少 ${path.relative(ROOT, sourcesFile)}`);
  process.exit(1);
}
const sources = JSON.parse(fs.readFileSync(sourcesFile, "utf8"));

const report = { at: new Date().toISOString(), papers: [], dropped: [], skipped: [], candidates: [] };
const questionIds = new Set();
const built = [];

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
/** 按需补齐缓存（同一套卷的多个上传里挑最好的那个） */
async function ensureRaw(examId) {
  const out = path.join(RAW, `${examId}.html`);
  if (fs.existsSync(out) && fs.statSync(out).size > 1000) return fs.readFileSync(out, "utf8");
  fs.mkdirSync(RAW, { recursive: true });
  for (let t = 0; t < 2; t++) {
    try {
      const r = await fetch(`https://noobdream.com/Practice/exam_solution/${examId}/`, {
        headers: { "User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9", Referer: "https://noobdream.com/" },
        signal: AbortSignal.timeout(40000),
        redirect: "follow",
      });
      if (r.status !== 200) {
        await r.arrayBuffer().catch(() => {});
        return null;
      }
      const buf = Buffer.from(await r.arrayBuffer());
      fs.writeFileSync(out, buf);
      await new Promise((res) => setTimeout(res, 300));
      return buf.toString("utf8");
    } catch {
      await new Promise((res) => setTimeout(res, 1200));
    }
  }
  return null;
}

for (const sp of sources.papers) {
  // 同一套卷可能有多个上传页面（完成度不同）：逐个试，取「实解题数 + 选择题数」最高者
  const cands = sp.examIds && sp.examIds.length ? sp.examIds : [sp.examId];
  let best = null;
  for (const cid of cands) {
    const html = await ensureRaw(cid);
    if (!html) continue;
    const meta = { paperId: sp.paperId };
    const parsed = parsePaper(html, meta);
    const qn = parsed.sections.reduce((a, s) => a + s.questions.length, 0);
    const ch = parsed.sections.reduce((a, s) => a + s.questions.filter((q) => q.type === "single" || q.type === "multiple").length, 0);
    const sc = qn + ch;
    if (!best || sc > best.sc) best = { cid, html, parsed, qn, ch, sc };
    if (qn >= 22 && ch >= 10) break; // 已是完整卷
  }
  if (!best) {
    report.skipped.push({ id: sp.paperId, reason: `所有候选页面均抓取失败（examIds=${cands.join(",")}）` });
    continue;
  }
  const { cid: chosenId, parsed, qn, ch: choice } = best;
  const { pageTitle, sections, dropped } = parsed;
  sp.examId = chosenId;
  if (!qn) {
    report.skipped.push({ id: sp.paperId, reason: "解析出 0 题", pageTitle });
    continue;
  }
  if (cands.length > 1)
    report.candidates.push({ paperId: sp.paperId, examIds: cands, chosen: chosenId, questionCount: qn, choiceCount: choice });
  const ans = sections.reduce((a, s) => a + s.questions.filter((q) => q.answer).length, 0);

  for (const s of sections) {
    for (const q of s.questions) {
      if (questionIds.has(q.id)) throw new Error(`题目 id 重复: ${q.id}`);
      questionIds.add(q.id);
    }
  }

  const doc = {
    id: sp.paperId,
    subject: sp.subject,
    subjectName: sp.subjectName,
    kind: "mock",
    mockName: sp.mockName,
    publisher: sp.publisher,
    year: sp.year,
    paperNo: sp.paperNo,
    paperKind: sp.paperKind || "testPaper",
    title: sp.title,
    duration: sp.duration ?? 180,
    totalScore: sp.totalScore ?? 100,
    quality: "unverified",
    source: { name: sp.sourceName, url: `https://noobdream.com/Practice/exam_solution/${sp.examId}/` },
    sourceNote: sp.sourceNote,
    sections: sections.map((s) => ({
      id: s.id,
      name: `${s.name}（${s.questions.length} 题）`,
      questions: s.questions,
    })),
  };
  report.papers.push({
    paperId: sp.paperId,
    examId: sp.examId,
    pageTitle,
    title: sp.title,
    questionCount: qn,
    choiceCount: choice,
    withAnswer: ans,
    answerRate: Number((ans / qn).toFixed(4)),
    sections: sections.map((s) => `${s.id}:${s.questions.length}`).join(" "),
    answerFrom: sections
      .flatMap((s) => s.questions)
      .reduce((a, q) => {
        const k = q._answerFrom || "(essay/其他)";
        a[k] = (a[k] || 0) + 1;
        return a;
      }, {}),
  });
  for (const d of dropped) report.dropped.push({ source: `nnd/${sp.examId}`, ...d });

  if (!DRY) {
    fs.mkdirSync(OUTDIR, { recursive: true });
    fs.writeFileSync(path.join(OUTDIR, `${sp.paperId}.json`), JSON.stringify(doc, null, 2) + "\n");
  }
  built.push({
    sp,
    doc,
    stat: { questionCount: qn, choiceCount: choice, withAnswer: ans },
  });
  console.log(
    `OK ${sp.paperId.padEnd(44)} ${String(qn).padStart(3)} 题  选择 ${String(choice).padStart(3)}  有答案 ${String(ans).padStart(3)}  (${sections.map((s) => s.id + ":" + s.questions.length).join(" ")})`,
  );
}

// ------------------------------------------------------------------ 合并进 _manifest.json
function mergeManifest() {
  const mfPath = path.join(OUTDIR, "_manifest.json");
  let mf;
  try {
    mf = JSON.parse(fs.readFileSync(mfPath, "utf8"));
  } catch {
    mf = { version: 1, generatedAt: new Date().toISOString(), note: "", failed: [], groups: [] };
  }
  const isMine = (id) => /^nnd-/.test(String(id || ""));
  // 1) 移除本脚本此前写入的组（按 groupId 前缀 nnd-），保留其它来源
  const kept = (mf.groups || []).filter((g) => !isMine(g.id));

  // 2) 按 groupId 汇总本次产出
  const byGroup = new Map();
  for (const b of built) {
    const gid = b.sp.groupId || `nnd-${b.sp.subject}-${b.sp.paperId}`;
    if (!byGroup.has(gid)) {
      byGroup.set(gid, {
        id: gid,
        subject: b.sp.subject,
        subjectName: b.sp.subjectName,
        publisher: b.sp.publisher,
        name: b.sp.mockName,
        year: b.sp.year,
        source: { name: b.sp.sourceName.replace(/（.+?）练习解析页$/, " 系列练习解析页"), url: `https://noobdream.com/Practice/exam_solution/${b.sp.examId}/` },
        note: "整卷型模拟卷（按套组织）。每卷题干/选项/正确答案/原书解析均逐字来自 N诺考研公开练习页；答案为网页明确标注的正确答案，未经逐题人工核对。",
        papers: [],
      });
    }
    const g = byGroup.get(gid);
    const cn = "一二三四五六七八九十"[b.sp.paperNo - 1] || String(b.sp.paperNo);
    g.papers.push({
      id: b.sp.paperId,
      file: `mock/${b.sp.paperId}.json`,
      title: b.sp.title,
      paperKind: "testPaper",
      questionCount: b.stat.questionCount,
      choiceCount: b.stat.choiceCount,
      withAnswer: b.stat.withAnswer,
      answerRate: Number((b.stat.withAnswer / b.stat.questionCount).toFixed(4)),
      duration: b.doc.duration,
      quality: "unverified",
      groupId: gid,
      paperNo: b.sp.paperNo,
      examId: b.sp.examId,
      sourceUrl: `https://noobdream.com/Practice/exam_solution/${b.sp.examId}/`,
    });
  }
  const mine = [...byGroup.values()].sort((a, b) => a.id.localeCompare(b.id));
  for (const g of mine) g.papers.sort((a, b) => a.paperNo - b.paperNo);

  mf.groups = [...kept, ...mine];
  mf.generatedAt = new Date().toISOString();

  // 3) failed：保留旧的，去掉本脚本旧的记录，再追加本次跳过/失败的
  const oldFailed = (mf.failed || []).filter((f) => !isMine(f.groupId) && !/^noobdream|N诺/.test(f.source || ""));
  const newFailed = [
    ...report.skipped.map((s) => {
      const sp = sources.papers.find((p) => p.paperId === s.id) || {};
      return {
        name: `${s.id}（${sp.title || ""}）`,
        groupId: sp.groupId,
        source: "N诺考研 noobdream.com",
        url: sp.examId ? `https://noobdream.com/Practice/exam_solution/${sp.examId}/` : "https://noobdream.com/Practice/",
        reason: s.reason + (s.pageTitle ? `（页面标题：${s.pageTitle}）` : ""),
      };
    }),
    ...(report.fetchFailed || []),
  ];
  mf.failed = [...oldFailed, ...newFailed];

  // 4) 本次丢弃明细（不覆盖 build-mock.mjs 的 droppedSummary）
  mf.droppedSummaryNnd = {
    count: report.dropped.length,
    note: "本轮（N诺考研来源）解析阶段主动丢弃、未写入题库的题目。依据「不乱码/不编造」纪律。完整明细见 tools/cache/mock-xiao/build-report.json。",
    byReason: Object.entries(
      report.dropped.reduce((a, d) => {
        a[d.reason.replace(/\s*\d+.*$/, "").trim()] = (a[d.reason.replace(/\s*\d+.*$/, "").trim()] || 0) + 1;
        return a;
      }, {}),
    ).map(([reason, count]) => ({ reason, count })),
    items: report.dropped.slice(0, 200),
  };

  fs.writeFileSync(mfPath, JSON.stringify(mf, null, 2) + "\n");
  return { groups: mine.length, papers: mine.reduce((a, g) => a + g.papers.length, 0), failed: newFailed.length };
}

if (!DRY) {
  const m = mergeManifest();
  console.log(`\n[_manifest.json] 本次并入 ${m.groups} 个系列 / ${m.papers} 套卷；新增 failed ${m.failed} 条（旧组与旧 failed 保留）`);
}

fs.mkdirSync(CACHE, { recursive: true });
fs.writeFileSync(path.join(CACHE, "build-report.json"), JSON.stringify(report, null, 2));
console.log(`\n[done] 卷 ${report.papers.length}，题 ${report.papers.reduce((a, p) => a + p.questionCount, 0)}，` +
  `有答案 ${report.papers.reduce((a, p) => a + p.withAnswer, 0)}，丢弃 ${report.dropped.length}，跳过 ${report.skipped.length}`);
if (report.skipped.length) for (const s of report.skipped) console.log(`  skip: ${s.id} — ${s.reason}`);
if (DRY) console.log("（--dry：未写出文件）");
