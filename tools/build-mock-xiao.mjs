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

const TYPE_BY_SECTION = [  [/单项选择题|单选题|选择题/, "single"],
  [/多项选择题|多选题|多选题型/, "multiple"],
  [/填空题/, "blank"],
  [/材料分析题|分析题|解答题|计算题|论述题|综合题/, "essay"],
];

function parsePaper(html, meta) {
  // 去掉 HTML 注释（页面把旧版答案解析整段注释掉了，会干扰)。
  const h = html.replace(/<!--[\s\S]*?-->/g, "");
  const titleRaw = (html.match(/<title>\s*([\s\S]*?)\s*<\/title>/) || [])[1] || "";
  const pageTitle = decodeEnt(titleRaw.replace(/\s+/g, " ").trim()).replace(/__N诺考研$/, "");

  const marks = [...h.matchAll(/id="question(\d+)"/g)].map((m) => ({ no: Number(m[1]), at: m.index }));
  const dropped = [];
  const sections = [];
  const secIndex = new Map();
  let curSecKey = null;
  let curType = "single";
  let curSecName = "";

  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].at;
    const end = i + 1 < marks.length ? marks[i + 1].at : h.length;
    const block = h.slice(start, end);
    const no = marks[i].no;

    // ---- 分节标题（只在该节第一题里出现）
    const secM = block.match(/<p>\s*<strong>\s*([一二三四五六七八]、[^<]{0,120}?)\s*<\/strong>\s*<\/p>/);
    if (secM) {
      const name = text(secM[1]);
      curSecName = name;
      curSecKey = name.replace(/[：:].*$/, "");
      let t = "single";
      for (const [re, ty] of TYPE_BY_SECTION) if (re.test(name)) { t = ty; break; }
      curType = t;
      if (!secIndex.has(curSecKey)) {
        secIndex.set(curSecKey, sections.length);
        sections.push({ id: secIdOf(name, t), name: sectionLabel(name), questions: [], _types: new Set(), _sawTypes: [] });
      }
    }
    if (curSecKey === null) {
      // 首个分节标题之前的内容（页面顶部说明）跳过，但若第一题前没有任何分节标题，则兜底建节
      curSecKey = "默认";
      if (!secIndex.has("默认")) {
        secIndex.set("默认", 0);
        sections.push({ id: "default", name: "题目", questions: [], _types: new Set(), _sawTypes: [] });
      }
      curSecName = "默认";
      curType = "single";
    }
    const sec = sections[secIndex.get(curSecKey)];

    // ---- 题号下方紧跟的类型标签（可能有多个 span.tag）
    const tagTypes = [...block.matchAll(/<span[^>]*>\s*(单选题|多选题|多项选择题|综合题|填空题|解答题|计算题|判断题)\s*<\/span>/g)].map((m) => m[1]);
    let type = curType;
    if (type === "single" && tagTypes.some((t) => /多项选择题|多选题/.test(t))) type = "multiple";

    // ---- 题目链接里的 article id（可溯源到单题页）
    const artM = block.match(/\/Practice\/article\/(\d+)\//);
    const articleId = artM ? Number(artM[1]) : null;

    // ---- subject-options 里的题干 + 选项
    let stemHtml = "";
    const soIdx = block.indexOf('class="subject-options"');
    if (soIdx >= 0) {
      const divStart = block.lastIndexOf("<div", soIdx);
      stemHtml = innerDiv(block, divStart).body;
    }

    // ---- 正确答案：三处来源，按可靠性排序
    let answer = "";
    let answerFrom = "";
    const caM = block.match(/class="correct-answer"[^>]*>\s*([A-D]{1,4})\s*</);
    if (caM) { answer = caM[1]; answerFrom = "correct-answer"; }

    // 折叠区 id=show_answerN（注释已剥离）
    let explainHtml = "";
    const saIdx = block.indexOf(`id="show_answer${no}"`);
    if (saIdx >= 0) {
      const divStart = block.lastIndexOf("<div", saIdx);
      explainHtml = innerDiv(block, divStart).body;
    }
    const explainText = text(explainHtml);

    const isChoice = type === "single" || type === "multiple";
    if (!answer && isChoice) {
      const m1 = explainText.match(/答案\s*[:：]?\s*([A-D]{1,4})\b/);
      const m2 = explainText.match(/标准答案为\s*([A-D]{1,4})/);
      const pick = m2 || m1;
      if (pick) { answer = pick[1]; answerFrom = pick === m2 ? "答案解析内标准答案为" : "答案解析"; }
    }
    if (!answer && isChoice) {
      const m = block.match(/标准答案为\s*([A-D]{1,4})/);
      if (m) { answer = m[1]; answerFrom = "评分理由"; }
    }

    // ---- 题干 / 选项
    const paras = [...stemHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => text(m[1])).filter((s) => s.length);
    const secHeaderText = secM ? text(secM[1]) : null;
    const bodyParas = paras.filter((p) => p !== secHeaderText);

    const wantOptions = curType === "single" || curType === "multiple";
    const optMap = new Map();
    const stemParas = [];
    for (const p of bodyParas) {
      if (wantOptions) {
        const got = optionsFromPara(p, optMap);
        if (got) {
          for (const [k, v] of got) if (!optMap.has(k)) optMap.set(k, v);
          continue;
        }
      }
      stemParas.push(p);
    }

    // ---- 材料分析题：把材料与设问拆开
    let stem = "";
    let material, materialTitle;
    if (type === "essay") {
      const qStart = stemParas.findIndex((p) => /^[（(]\s*\d\s*[）)]/.test(p));
      if (qStart > 0) {
        material = stemParas.slice(0, qStart).join("\n\n");
        materialTitle = "材料";
        stem = stemParas.slice(qStart).join("\n\n");
      } else {
        // 有些卷子设问不带序号：整段都进 stem
        stem = stemParas.join("\n\n");
      }
      // 参考答案
      if (!answer && explainText) answer = cleanRefAnswer(explainText);
    } else if (type === "blank") {
      stem = stemParas.join("\n\n").trim();
      if (!answer && explainText) answer = cleanRefAnswer(explainText);
    } else {
      stem = stemParas.join("\n\n").replace(/^[（(]\s*(单项|多项)选择题\s*[）)]\s*/, "").trim();
    }
    if (secHeaderText && stem.startsWith(secHeaderText)) stem = stem.slice(secHeaderText.length).trim();

    // ---- 解析（去掉开头的「答案X」重复）
    let explanation = "";
    if (type !== "essay" && explainText) {
      explanation = explainText.replace(/^答案\s*[:：]?\s*[A-D]{1,4}\s*/, "").replace(/^简析\s*/, "简析：").trim();
    } else if (type === "essay" && explainText) {
      explanation = "";
    }

    // ---- 组装题目
    const opts = ["A", "B", "C", "D"].map((k) => ({ key: k, text: optMap.get(k) || "" })).filter((o) => o.text.length);
    const sectionType = curType;
    let finalType = type;
    // 分节说单选但抓到 4 个以上答案字母 → 按多选处理（来源侧题型标注错误）
    if (sectionType === "single" && answer.length > 1) finalType = "multiple";

    const q = {
      id: `${meta.paperId}-q${no}`,
      no,
      type: finalType,
      stem,
      options: finalType === "single" || finalType === "multiple" ? opts : [],
      answer,
      explanation,
      score: finalType === "single" ? 1 : finalType === "multiple" ? 2 : finalType === "essay" ? 5 : 0,
      topics: [],
      images: [],
      _articleId: articleId,
      _answerFrom: answerFrom,
    };
    if (material) { q.material = material; q.materialTitle = materialTitle; }

    // 单选题必须 4 选项；不合格丢弃
    if (finalType === "single" && opts.length !== 4) {
      dropped.push({ ref: `${meta.paperId}#${no}`, reason: `选项数 ${opts.length} != 4`, detail: stem.slice(0, 60) });
      continue;
    }
    if (finalType === "multiple" && opts.length < 2) {
      dropped.push({ ref: `${meta.paperId}#${no}`, reason: `多选题选项数 ${opts.length} < 2`, detail: stem.slice(0, 60) });
      continue;
    }
    if (!stem) {
      dropped.push({ ref: `${meta.paperId}#${no}`, reason: "题干为空", detail: "" });
      continue;
    }
    if (finalType === "multiple" && answer.length === 1) {
      // 多选只给一个字母 → 不猜，按来源照存但标记（验证脚本要求 multiple 至少 2 字母）
      dropped.push({ ref: `${meta.paperId}#${no}`, reason: `多选答案仅 1 个字母（来源 ${answerFrom}）`, detail: stem.slice(0, 50) });
      continue;
    }
    if (answer && isChoice && !/^[A-D]+$/.test(answer)) {
      dropped.push({ ref: `${meta.paperId}#${no}`, reason: `答案格式非法 ${answer.slice(0, 20)}`, detail: stem.slice(0, 50) });
      continue;
    }
    if (answer && isChoice && new Set(answer.split("")).size !== answer.length)
      answer = [...new Set(answer.split(""))].sort().join("");
    if (answer && isChoice) answer = [...answer].sort().join("");

    sec.questions.push(q);
  }

  // 清理临时字段
  for (const s of sections) {
    s.questions.sort((a, b) => a.no - b.no);
    for (const q of s.questions) {
      if (q._articleId) q.sourceUrl = `https://noobdream.com/Practice/article/${q._articleId}/`;
      delete q._articleId;
      if (!q._answerFrom) delete q._answerFrom;
    }
  }
  const used = sections.filter((s) => s.questions.length);
  return { pageTitle, sections: used, dropped };
}

function cleanRefAnswer(t) {
  let s = t.replace(/^参考答案\s*/, "").trim();
  // 去掉末尾的「题目总分：X分」之类评分尾巴
  s = s.replace(/\n?题目总分[:：][^\n]*$/g, "").trim();
  return s;
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

const report = { at: new Date().toISOString(), papers: [], dropped: [], skipped: [] };
const questionIds = new Set();

for (const sp of sources.papers) {
  const rawFile = path.join(RAW, `${sp.examId}.html`);
  if (!fs.existsSync(rawFile)) {
    report.skipped.push({ id: sp.paperId, reason: `缺少缓存 ${path.relative(ROOT, rawFile)}` });
    continue;
  }
  const html = fs.readFileSync(rawFile, "utf8");
  const meta = { paperId: sp.paperId };
  const { pageTitle, sections, dropped } = parsePaper(html, meta);
  const qn = sections.reduce((a, s) => a + s.questions.length, 0);
  if (!qn) {
    report.skipped.push({ id: sp.paperId, reason: "解析出 0 题", pageTitle });
    continue;
  }
  const ans = sections.reduce((a, s) => a + s.questions.filter((q) => q.answer).length, 0);
  const choice = sections.reduce((a, s) => a + s.questions.filter((q) => q.type === "single" || q.type === "multiple").length, 0);

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
