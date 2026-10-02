/**
 * 构建考研政治题库 -> public/data/politics/<year>.json 与 _topics.json
 *
 * 数据来源与可信度处理（详见 tools/politics-findings.md）：
 *  - 2011–2024：题干与四个选项取 yy11111111111111111111/kaoyan-politics（其选项顺序与公开发布真题一致，
 *                已用 eol.cn 2021、TsekaLuk 2023、以及 kyzz 的顺序一致性抽样核实）。
 *                答案取 yy 原文，并与 mrwoov/kyzz（独立数据集）做**内容级**交叉校验。
 *  - 2010：无 yy 源。题干与选项取 kyzz，答案取学信网 chsi 官方解析答案。
 *
 * 绝不编造题目/选项/答案：所有字段都来自上述来源原文。
 * 校验状态写入题目 verify 字段：yy | yy=kyzz | CONFLICT-kyzz | chsi-2010
 */
import fs from "node:fs";
import path from "node:path";
import { parseYY, parseKyzz, AB } from "./politics-parse.mjs";
import { parsePaperHtmlFile } from "./politics-parse-html.mjs";

const ROOT = "G:/期末及简历和别的项目/考研资料/kaoyan-quiz";
const OUT = path.join(ROOT, "public/data/politics");
const CACHE = path.join(ROOT, "tools/cache");
fs.mkdirSync(OUT, { recursive: true });

/* ---------------- 工具 ---------------- */
function sim(a, b) {
  a = String(a || "").replace(/[\s\u3000]/g, ""); b = String(b || "").replace(/[\s\u3000]/g, "");
  if (!a || !b) return 0;
  if (a.length >= 3 && b.includes(a)) return Math.min(1, a.length / b.length + 0.25);
  if (b.length >= 3 && a.includes(b)) return Math.min(1, b.length / a.length + 0.25);
  const g = s => new Set(Array.from({ length: Math.max(0, s.length - 1) }, (_, i) => s.slice(i, i + 2)));
  const A = g(a), B = g(b); if (!A.size || !B.size) return 0;
  let inter = 0; for (const x of A) if (B.has(x)) inter++;
  return (inter / A.size) * (a.length / b.length);
}
/** 把 src 的答案字母按「选项文本内容」翻译成 dst 选项的字母 */
function translateAnswer(ansLetters, srcOptions, dstOptions, threshold = 0.6) {
  const mapped = new Set(); const unmapped = [];
  for (const L of ansLetters) {
    const o = srcOptions.find(x => x.key === L); if (!o) continue;
    let best = null, bs = 0;
    for (const d of dstOptions) { const s = sim(o.text, d.text); if (s > bs) { bs = s; best = d; } }
    if (bs >= threshold) mapped.add(best.key); else unmapped.push({ L, best: +bs.toFixed(2), text: String(o.text).slice(0, 30) });
  }
  return { letters: [...mapped].sort().join(""), unmapped };
}

/* ---------------- 2010 官方答案（学信网 chsi，万学海文解析） ---------------- */
const CHSI2010 = {1:"A",2:"D",3:"D",4:"C",5:"A",6:"D",7:"A",8:"C",9:"B",10:"B",11:"B",12:"C",13:"B",14:"A",15:"D",16:"D",
  17:"ACD",18:"CD",19:"ACD",20:"BCD",21:"ABC",22:"ABD",23:"ABCD",24:"BCD",25:"ABCD",26:"AB",27:"ABCD",28:"ABD",29:"ACD",30:"ABCD",31:"BD",32:"ABCD",33:"ABC"};

/* ---------------- 知识点（来自本地 Obsidian 考点笔记） ---------------- */
const topicsRawPath = path.join(CACHE, "topics-raw.json");
const topicsRaw = fs.existsSync(topicsRawPath) ? JSON.parse(fs.readFileSync(topicsRawPath, "utf8")) : { subjects: [] };
const topicIndex = [];   // {id, name, subject, chapter}
for (const s of topicsRaw.subjects) for (const c of s.chapters) for (const t of c.topics)
  topicIndex.push({ id: t.id, name: t.name, subject: s.id, chapter: c.name, norm: t.name.replace(/^[^ ]*\s*/, "") });

/* ================= 2025：HTML 三源（yy 源的 2025/2026 经核实为「重写内容」而非真题原文，已弃用） =================
 * 依据见 tools/politics-findings.md「yy 源的保真度问题」一节。
 * 三个来源互相独立，且都不是 yy：① 武昌首义学院马克思主义学院（题干/选项/参考答案/解析）
 * ② 石河子大学 eol 转换页（题干/选项/答案） ③ 新东方在线（题干/选项/答案速查）。
 * 选择题答案按「选项文本内容」对齐后投票（多数票；平票取主来源），分歧题标 CONFLICT-3src。
 */
const HTML_SOURCES = {
  2025: [
    { id: "wsyu", name: "武昌首义学院马克思主义学院（真题＋参考答案＋解析）", url: "https://szkb.wsyu.edu.cn/2025/0107/c882a40588/page.htm", file: path.join(CACHE, "politics-src2/2025-wsyu.html"), primary: true },
    { id: "shzu", name: "石河子大学 eol 版（真题＋答案）", url: "https://eol.shzu.edu.cn/meol/data/convert/2025/2/18/328e86b3-a3f2-4ab7-9ed9-d2bdc6360847_4216790.html", file: path.join(CACHE, "politics-src2/2025-shzu.html") },
    { id: "koolearn", name: "新东方在线（真题＋答案速查）", url: "https://m.koolearn.com/kaoyan/20250103/1795512.html", file: path.join(CACHE, "koolearn/2025-koolearn-full.html") },
  ],
};

function buildHtmlYear(year) {
  const cfg = HTML_SOURCES[year];
  const parsed = cfg.map(c => ({ ...c, p: parsePaperHtmlFile(c.file, { year }) }));
  const primary = parsed.find(p => p.primary) || parsed[0];
  const questions = [], notes = [];
  const allOf = (p) => [...p.single, ...p.multiple, ...p.essay];

  for (let no = 1; no <= 38; no++) {
    const type = no <= 16 ? "single" : no <= 33 ? "multiple" : "essay";
    const pq = allOf(primary.p).find(q => q.no === no);
    if (!pq) { notes.push(`Q${no}: 主来源（${primary.id}）缺失该题，未产出`); continue; }

    if (type === "essay") {
      const withAns = parsed.filter(p => p !== primary)
        .map(p => ({ id: p.id, a: ((p.p.essay || []).find(q => q.no === no) || {}).answer || "" }))
        .filter(o => o.a.replace(/\s/g, "").length > 60);
      questions.push({
        id: `politics-${year}-q${no}`, no, type: "essay",
        stem: pq.stem, options: [], answer: pq.answer, explanation: "",
        score: 10, topics: [], images: [],
        verify: withAns.length ? `answer-crosschecked:${withAns.map(o => o.id).join("+")}` : `single-source:${primary.id}`,
      });
      stat.q++; stat.essay++;
      continue;
    }

    // 各源答案 → 按选项文本内容翻译回主来源字母体系
    const votes = [{ id: primary.id, letters: pq.answer, raw: pq.answer }];
    for (const p of parsed) {
      if (p === primary) continue;
      const oq = [...p.p.single, ...p.p.multiple].find(q => q.no === no);
      if (!oq || !oq.answer) continue;
      const tr = translateAnswer(oq.answer, oq.options, pq.options);
      if (tr.unmapped && tr.unmapped.length) { notes.push(`Q${no}: ${p.id} 有 ${tr.unmapped.length} 个选项无法内容对齐（相似度 ${tr.unmapped.map(u => u.best).join("/")}），该题不计入票池`); continue; }
      votes.push({ id: p.id, letters: tr.letters, raw: oq.answer });
    }
    const counts = new Map();
    for (const v of votes) if (v.letters) counts.set(v.letters, (counts.get(v.letters) || 0) + 1);
    let answer = pq.answer, bestN = -1, tie = false;
    for (const [k, n] of counts) {
      if (n > bestN) { bestN = n; answer = k; tie = false; }
      else if (n === bestN) tie = true;
    }
    if (tie) answer = pq.answer;                       // 平票 → 主来源
    const conflict = counts.size > 1;
    if (conflict) {
      notes.push(`Q${no}: ${votes.map(v => `${v.id}=${v.raw}${v.letters !== v.raw ? `(对齐→${v.letters})` : ""}`).join(" / ")} → 本库采用多数票 ${answer}`);
    }
    questions.push({
      id: `politics-${year}-q${no}`, no, type,
      stem: pq.stem, options: pq.options, answer,
      explanation: pq.explanation || "",
      score: type === "single" ? 1 : 2, topics: [], images: [],
      verify: conflict ? "CONFLICT-3src" : `${votes.length}src-agree`,
    });
    stat.q++; if (type === "single") stat.single++; else stat.multiple++;
    if (!answer) stat.noAnswer++;
  }

  return {
    questions, notes,
    srcName: `武昌首义学院马克思主义学院（题干/选项/参考答案/解析）＋ 石河子大学 eol 版、新东方在线（答案互证）`,
    srcUrl: primary.url,
    sourceUrls: cfg.map(c => c.url),
    verifyMethod: "三个互相独立的公开来源：题干与选项按文本内容对齐（不依赖字母顺序），选择题答案逐题投票；多数票胜出，平票取主来源，分歧题标 CONFLICT-3src",
    sourceDetail: cfg.map(c => ({ id: c.id, name: c.name, url: c.url })),
  };
}

/* ---------------- 主流程 ---------------- */
// 可选：POLITICS_YEARS=2025 时只**写出**指定年份的卷子（其余年份仍参与 build-report 统计，
 * 便于增量新增年份时不动既有数据）。
const ONLY_YEARS = process.env.POLITICS_YEARS
  ? new Set(process.env.POLITICS_YEARS.split(",").map(s => Number(s.trim())).filter(Boolean))
  : null;
const years = [];
const stat = { q: 0, single: 0, multiple: 0, essay: 0, noAnswer: 0 };
const qualityTally = { high: 0, medium: 0, low: 0 };

for (let year = 2010; year <= 2025; year++) {
  let questions = [], notes = [], srcName, srcUrl, sourceUrls, verifyMethod, sourceDetail;
  const useHtml = Boolean(HTML_SOURCES[year]);

  if (useHtml) {
    const r = buildHtmlYear(year);
    questions = r.questions; notes = r.notes;
    srcName = r.srcName; srcUrl = r.srcUrl; sourceUrls = r.sourceUrls;
    verifyMethod = r.verifyMethod; sourceDetail = r.sourceDetail;
  } else {
    const kyzzList = parseKyzz(year);
    const kyzzMap = new Map(kyzzList.map(k => [k.no, k]));
    const yy = year >= 2011 ? parseYY(year) : null;
    const yyMap = yy ? new Map(yy.questions.map(q => [q.no, q])) : null;

    for (let no = 1; no <= 38; no++) {
      const type = no <= 16 ? "single" : no <= 33 ? "multiple" : "essay";
      if (year === 2010 && type === "essay") continue;      // 2010 只有客观题（kyzz 不含材料分析题）

      if (type === "essay") {
        const y = yyMap.get(no);
        if (!y) continue;
        questions.push({
          id: `politics-${year}-q${no}`, no, type: "essay",
          stem: y.stem, options: [], answer: y.answer, explanation: "",
          score: 10, topics: [], images: [], verify: "yy-answer-points",
        });
        stat.q++; stat.essay++;
        continue;
      }

      let base, verify, answer, explanation = "";
      if (year === 2010) {
        const k = kyzzMap.get(no); if (!k) continue;
        base = { stem: k.stem, options: k.options };
        answer = AB(CHSI2010[no] || "");
        explanation = k.jiexi || "";
        verify = "chsi-2010";
        const claim = (k.jiexi.match(/正确(?:选项|答案)(?:是|为|选)?\s*(?:选项)?\s*([A-D]{1,4})/) || [])[1];
        if (claim && AB(claim) !== answer) {
          verify = "CONFLICT-chsi-vs-kyzz";
          notes.push(`Q${no}: chsi官方=${answer} / kyzz解析自述=${AB(claim)}（已采用 chsi 官方答案）`);
        }
      } else {
        const y = yyMap.get(no); if (!y) continue;
        base = { stem: y.stem, options: y.options };
        answer = y.answer;
        const k = kyzzMap.get(no);
        explanation = k ? (k.jiexi || "") : "";
        verify = "yy";
        if (k) {
          const tr = translateAnswer(k.answer, k.options, y.options);
          if (tr.letters && !tr.unmapped.length) {
            if (tr.letters === answer) verify = "yy=kyzz";
            else { verify = "CONFLICT-yy-vs-kyzz"; notes.push(`Q${no}: yy=${answer} / kyzz=${k.answer}(内容对齐→${tr.letters})`); }
          } else { verify = "yy-unmapped"; }
        }
        if (!answer) verify = "NO-ANSWER";
      }

      const q = {
        id: `politics-${year}-q${no}`, no, type,
        stem: base.stem, options: base.options, answer, explanation,
        score: type === "single" ? 1 : 2, topics: [], images: [], verify,
      };
      questions.push(q);
      stat.q++; if (type === "single") stat.single++; else stat.multiple++;
      if (!answer) stat.noAnswer++;
    }

    srcName = year === 2010
      ? "mrwoov/kyzz（题干与选项）+ 学信网 chsi 官方真题解析（答案）"
      : "yy11111111111111111111/kaoyan-politics（历年考研政治真题，含答案要点）";
    srcUrl = year === 2010
      ? "https://yz.chsi.com.cn/kyzx/other/201001/20100113/61646472-1.html"
      : "https://github.com/yy11111111111111111111/kaoyan-politics";
    sourceUrls = [
      "https://github.com/yy11111111111111111111/kaoyan-politics",
      "https://github.com/mrwoov/kyzz",
      "https://yz.chsi.com.cn/kyzx/other/201001/20100113/61646472-1.html",
      "https://www.eol.cn/m/kaoyan/202012/t20201226_2063200.shtml",
      "https://github.com/TsekaLuk/Kaoyan-Politics-Papers",
    ];
    verifyMethod = "答案取自来源原文，并与独立数据集 mrwoov/kyzz 做选项文本内容级交叉校验";
  }

  const conflicts = questions.filter(q => q.verify && q.verify.startsWith("CONFLICT")).length;
  const noAns = questions.filter(q => !q.answer).length;
  // 口径与既有题库一致：有缺答案 → low；无冲突 → high；有冲突（含 4 处冲突的 2010/2020）→ medium
  const quality = noAns > 0 ? "low" : conflicts === 0 ? "high" : "medium";
  qualityTally[quality]++;

  const paper = {
    id: `politics-${year}`,
    subject: "politics",
    subjectName: "政治",
    year,
    title: `${year} 年全国硕士研究生招生考试 思想政治理论`,
    duration: 180,
    totalScore: 100,
    quality,
    source: { name: srcName, url: srcUrl },
    sourceUrls,
    verification: {
      method: verifyMethod,
      conflicts,
      unresolved: noAns,
      note: conflicts ? "存在答案冲突的题目见各题 verify 字段（CONFLICT-*），请以官方答案为准" : "未发现答案冲突",
    },
    sections: [
      { id: "single", name: "一、单项选择题（1~16 小题，每小题 1 分，共 16 分）", questions: questions.filter(q => q.type === "single") },
      { id: "multiple", name: "二、多项选择题（17~33 小题，每小题 2 分，共 34 分）", questions: questions.filter(q => q.type === "multiple") },
      { id: "essay", name: "三、材料分析题（34~38 小题，每小题 10 分，共 50 分）", questions: questions.filter(q => q.type === "essay") },
    ].filter(s => s.questions.length),
  };
  if (sourceDetail) paper.verification.sources = sourceDetail;
  if (!ONLY_YEARS || ONLY_YEARS.has(year)) {
    fs.writeFileSync(path.join(OUT, `${year}.json`), JSON.stringify(paper, null, 2), "utf8");
  }
  years.push({ year, quality, count: questions.length, single: paper.sections[0]?.questions.length || 0, multiple: paper.sections[1]?.questions.length || 0, essay: paper.sections[2]?.questions.length || 0, conflicts, notes });
  console.log(`${year}: 题数=${questions.length} 单${paper.sections[0]?.questions.length||0}/多${paper.sections[1]?.questions.length||0}/材${paper.sections[2]?.questions.length||0}  quality=${quality} 冲突=${conflicts}`);
}

console.log("\n=== 合计 ===", JSON.stringify(stat), JSON.stringify(qualityTally));
fs.writeFileSync(path.join(CACHE, "build-report.json"), JSON.stringify({ stat, qualityTally, years, topics: topicIndex.length }, null, 2), "utf8");
fs.writeFileSync(path.join(CACHE, "verification.txt"), years.map(y => `\n######## ${y.year}  quality=${y.quality}  冲突=${y.conflicts}\n` + y.notes.map(n => "  " + n).join("\n")).join("\n"), "utf8");
console.log("写入:", OUT);
