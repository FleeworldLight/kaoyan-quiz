import fs from "node:fs";
import path from "node:path";
const CACHE = "<项目根目录>/tools/cache";
const OUTDIR = "<项目根目录>/public/data/cs408";
const NEVILLE_ANS = { 2009: "neville-ans-2009.txt", 2010: "neville-ans-2010.txt", 2011: "neville-ans-2011.txt", 2013: "neville-ans-2013.txt" };
// 2009–2023：本地/公开 PDF 文本层答案；2024–2025：官方答案 PDF 为扫描件，改用多源互证答案（见 ANS_CFG / ESSAY_CFG）
const YEARS = Array.from({ length: 17 }, (_, i) => 2009 + i);

/* ================= 试卷解析 ================= */
function cleanPaper(raw) {
  const chunks = raw.split("<<PAGE>>"); const out = [];
  for (const ch of chunks) {
    let c = ch;
    const i = c.indexOf("（共");
    if (i >= 0) { const j = c.indexOf("页）", i); if (j >= 0) c = c.slice(j + 2); }
    c = c.replace(/^\s*\d{4}\s*[^，。]{0,90}?(?:试题|真题)/, "");
    out.push(c);
  }
  let t = out.join("").replace(/\s+/g, " ");
  t = t.replace(/\d{4}\s*年[^，。]{0,90}?试题/g, " ");
  t = t.replace(/\d{4}\s*考研\s*408\s*真题/g, " ");
  t = t.replace(/\d{4}\s*全国硕士研究生招生考试计算机学科专业基础试题/g, " ");
  t = t.replace(/一、\s*单项选择题[（(][^）)]*[）)]/g, " \u00a7SINGLE\u00a7 ");
  t = t.replace(/二、\s*综合应用题[（(][^）)]*[）)]/g, " \u00a7ESSAY\u00a7 ");
  return t.replace(/\s+/g, " ").trim();
}
function findOptions(seg) {
  const marks = []; const re = /([ABCD])[.．]\s*/g; let m;
  while ((m = re.exec(seg))) marks.push({ key: m[1], idx: m.index, end: re.lastIndex });
  for (let i = marks.length - 4; i >= 0; i--) {
    if (marks[i].key !== "A") continue;
    const a = marks[i];
    const b = marks.find(x => x.key === "B" && x.idx > a.idx); if (!b) continue;
    const c = marks.find(x => x.key === "C" && x.idx > b.idx); if (!c) continue;
    const d = marks.find(x => x.key === "D" && x.idx > c.idx); if (!d) continue;
    if (marks.filter(x => x.idx > a.idx && x.idx < d.idx && x !== b && x !== c).length) continue;
    return { a, b, c, d };
  }
  return null;
}
function markerCands(body, nums, loose) {
  const cand = {};
  for (const n of nums) {
    const re = new RegExp(`${n}[.．]`, "g"); let m; const arr = [];
    while ((m = re.exec(body))) {
      const after = body[m.index + m[0].length] || "";
      const digitAfter = /[0-9]/.test(after);
      if (digitAfter && !loose) continue;
      arr.push({ n, start: m.index, end: m.index + m[0].length, loose: digitAfter });
    }
    arr.sort((a, b) => (a.loose - b.loose) || (a.start - b.start));
    cand[n] = arr;
  }
  return cand;
}
function splitByMarkers(text, nums, loose) {
  const cand = markerCands(text, nums, loose === undefined ? true : loose); const memo = new Map();
  const dfs = (i, cursor) => {
    const key = i + ":" + cursor; if (memo.has(key)) return memo.get(key);
    if (i >= nums.length) return [];
    for (const c of cand[nums[i]]) {
      if (c.start < cursor) continue;
      const rest = dfs(i + 1, c.end);
      if (rest) { const r = [c, ...rest]; memo.set(key, r); return r; }
    }
    memo.set(key, null); return null;
  };
  const chain = dfs(0, 0); if (!chain) return null;
  const out = new Map();
  for (let i = 0; i < chain.length; i++) out.set(chain[i].n, text.slice(chain[i].end, i + 1 < chain.length ? chain[i + 1].start : text.length));
  return out;
}
function pickChain(body, nums, loose, maxLen) {
  const cand = markerCands(body, nums, loose);
  const memo = new Map();
  const dfs = (i, cursor) => {
    const key = i + ":" + cursor; if (memo.has(key)) return memo.get(key);
    if (i >= nums.length) { const r = { count: 0, arr: [] }; memo.set(key, r); return r; }
    const sk = dfs(i + 1, cursor);
    let best = { count: sk.count, arr: [null, ...sk.arr] };
    for (const c of cand[nums[i]]) {
      if (c.start < cursor) continue;
      let nextStart = body.length;
      for (const m2 of (cand[nums[i + 1]] || [])) if (m2.start > c.end && m2.start < nextStart) nextStart = m2.start;
      const seg = body.slice(c.end, nextStart);
      const opt = findOptions(seg);
      const okOpt = opt && seg.slice(0, opt.a.idx).trim().length > 3;
      const ok = okOpt || (seg.trim().length > 4 && seg.trim().length <= (maxLen || 320) && /[\u4e00-\u9fff]/.test(seg));
      if (!ok) continue;
      const rest = dfs(i + 1, c.end);
      if (1 + rest.count > best.count) best = { count: 1 + rest.count, arr: [{ ...c, seg, opt: okOpt ? opt : null }, ...rest.arr] };
    }
    memo.set(key, best); return best;
  };
  const r = dfs(0, 0);
  return { chain: r.arr, count: r.count };
}
function bestChain(body, nums, maxLen) {
  const strict = pickChain(body, nums, false, maxLen);
  if (strict.count >= nums.length) return strict;
  const loose = pickChain(body, nums, true, maxLen);
  return loose.count > strict.count ? loose : strict;
}

/* ================= 答案解析 ================= */
const norm = (t) => t.replace(/<<PAGE>>/g, " ").replace(/\s+/g, " ").trim();
function hitsToMap(hits) { const m = new Map(); for (const h of hits) if (!m.has(h.n)) m.set(h.n, h); return m; }
function regexMap(text, re, lo, hi) {
  const r = new RegExp(re.source, "g"); let m; const hits = [];
  while ((m = r.exec(text))) { const n = Number(m[1]); if (n >= lo && n <= hi) hits.push({ n, letter: (m[2] || "").toUpperCase(), start: m.index, end: m.index + m[0].length }); }
  return hitsToMap(hits);
}
function explFromMap(text, map) {
  const arr = [...map.values()].sort((a, b) => a.start - b.start); const out = new Map();
  for (let i = 0; i < arr.length; i++) {
    let s = text.slice(arr[i].end, i + 1 < arr.length ? arr[i + 1].start : text.length).trim();
    s = s.replace(/^[。．.、\s]*(?:【答案解析】|【解析】|答案解析|解析)[:：]?\s*/, "").trim();
    out.set(arr[i].n, s);
  }
  return out;
}
const PQ_PATTERNS = [
  /【参考答案】\s*([A-Da-d])/, /解答[:：]\s*([A-Da-d])\s*[。．]/, /答案[:：]\s*([A-Da-d])\s*[。．]/,
  /^\s*([A-Da-d])\s*[。．]\s*(?:【解析】|解析[:：])/, /([A-Da-d])\s*[。．]\s*【解析】/, /([A-Da-d])\s*解析[:：]/,
];
function perQuestion(text, nums) {
  const segs = splitByMarkers(text, nums);
  if (!segs) return { map: new Map(), expl: new Map() };
  const map = new Map(), expl = new Map();
  for (const [n, seg] of segs) for (const p of PQ_PATTERNS) {
    const m = seg.match(p);
    if (m) { map.set(n, { n, letter: m[1].toUpperCase(), start: -(1e6 - n), end: 0 }); expl.set(n, seg.slice(m.index + m[0].length).trim()); break; }
  }
  return { map, expl };
}
const EXPL_OVERRIDE = { 2009: "neville-ans-2009.txt" };
function extractAnswers(text, year) {
  let start = Math.max(text.lastIndexOf("参考答案"), text.lastIndexOf("答案及解析")); if (start < 0) start = 0;
  const region = text.slice(start);
  const sum = (() => {
    const re = /(?<![0-9])(\d{1,2})\s*[.．]\s*([A-Da-d])(?![A-Za-z])/g; let m; const hits = [];
    while ((m = re.exec(text))) { const n = Number(m[1]); if (n >= 1 && n <= 40) hits.push({ n, letter: m[2].toUpperCase(), start: m.index, end: m.index + m[0].length }); }
    let best = null;
    for (let i = 0; i < hits.length; i++) {
      if (hits[i].n !== 1) continue;
      const run = [hits[i]]; let expect = 2;
      for (let j = i + 1; j < hits.length; j++) if (hits[j].n === expect) { run.push(hits[j]); expect++; }
      if (!best || run.length > best.length) best = run;
    }
    const mm = new Map(); if (best) for (const h of best) mm.set(h.n, h); return mm;
  })();
  const pq = perQuestion(text, Array.from({ length: 40 }, (_, i) => i + 1));
  const strats = [
    { tag: "B1-【参考答案】", map: regexMap(text, /(\d{1,2})\s*[.．]\s*【参考答案】\s*([A-Da-d])/, 1, 40) },
    { tag: "B2-字母+【解析】", map: regexMap(text, /(\d{1,2})\s*[.．]\s*([A-Da-d])\s*[。．]?\s*【解析[】）)]/, 1, 40) },
    { tag: "B3-字母+解析：", map: regexMap(text, /(\d{1,2})\s*[.．]\s*([A-Da-d])\s*解析[:：]/, 1, 40) },
    { tag: "B4-答案区首字母", map: regexMap(region, /(\d{1,2})\s*[.．]\s*([A-Da-d])(?![A-Za-z])/, 1, 40) },
    { tag: "P-逐题", map: pq.map },
    { tag: "S-答案清单", map: sum },
  ];
  let chosen = strats.find(s => s.map.size >= 40) || strats.slice().sort((a, b) => b.map.size - a.map.size)[0];
  // 冲突检查
  const conflicts = [];
  for (const s of strats) {
    if (s === chosen) continue;
    for (let n = 1; n <= 40; n++) {
      const a = chosen.map.get(n), b = s.map.get(n);
      if (a && b && a.letter !== b.letter) conflicts.push(`q${n}:${chosen.tag.slice(0,2)}=${a.letter}/${s.tag.slice(0,2)}=${b.letter}`);
    }
  }
  // ---- 解析文本：多来源取"有实质内容"最多者 ----
  const meaningful = (mp) => [...mp.values()].filter(v => typeof v === "string" && v.replace(/\s/g, "").length >= 15).length;
  const stripExpl = (s) => s.trim().replace(/^[.．、]?\s*[A-Da-d]?\s*(?:【答案解析】|【解析】|答案解析|解析|考查)[:：]?\s*/, "").trim();
  const explFromRegion = (tx, start) => {
    if (start < 0) return new Map();
    const segs = splitByMarkers(tx.slice(start), Array.from({ length: 40 }, (_, i) => i + 1), true);
    if (!segs) return new Map();
    const out = new Map();
    for (const [n, seg] of segs) { const s = stripExpl(seg); if (s.length > 5) out.set(n, s); }
    return out;
  };
  const headerStart = (tx) => {
    let start = -1;
    for (const k of ["（二）", "选择题解析", "单项选择题解析", "答案解析", "参考答案及解析", "真题答案解析", "答案及解析", "试题参考答案及解析"]) {
      const i = tx.lastIndexOf(k); if (i > start) start = i;
    }
    return start;
  };
  const markerStart = (tx) => {
    const m = tx.match(/\d{1,2}\s*[.．]\s*(?:【答案解析】|【解析】|答案解析|解析[:：])/);
    return m ? m.index : -1;
  };
  const explByParserMarker = (tx) => {
    const re = /(\d{1,2})\s*[.．]\s*(?:【答案解析】|【解析】|答案解析|解析)[:：]?/g;
    let m; const arr = [];
    while ((m = re.exec(tx))) { const n = Number(m[1]); if (n >= 1 && n <= 40) arr.push({ n, start: m.index, end: m.index + m[0].length }); }
    const out = new Map();
    for (let i = 0; i < arr.length; i++) {
      const e = arr[i + 1] ? arr[i + 1].start : tx.length;
      const s = tx.slice(arr[i].end, e).trim();
      if (s.length > 5 && !out.has(arr[i].n)) out.set(arr[i].n, s);
    }
    return out;
  };
  const explSet = (tx, prefix) => [
    { tag: prefix + "E1-随答案块", map: explFromMap(tx, chosen.map) },
    { tag: prefix + "E3-解析区(标题)", map: explFromRegion(tx, headerStart(tx)) },
    { tag: prefix + "E5-解析区(标记)", map: explFromRegion(tx, markerStart(tx)) },
    { tag: prefix + "E6-解析标记", map: explByParserMarker(tx) },
  ];
  let candidates = explSet(text, "");
  candidates.push({ tag: "E2-逐题首段", map: pq.expl });
  if (EXPL_OVERRIDE[year]) {
    try {
      const ot = norm(fs.readFileSync(`${CACHE}/${EXPL_OVERRIDE[year]}`, "utf8"));
      candidates = candidates.concat(explSet(ot, "O:" + EXPL_OVERRIDE[year] + " "));
    } catch (e) { /* ignore */ }
  }
  candidates.sort((a, b) => meaningful(b.map) - meaningful(a.map));
  const cleanup = (s) => s.replace(/(?:\d{1,2}\s*[.．]\s*){2,}/g, " ").replace(/\s{2,}/g, " ").trim();
  const expl = new Map([...candidates[0].map.entries()].map(([k, v]) => [k, cleanup(v)]));
  return { letters: chosen.map, expl, mode: chosen.tag, explMode: candidates[0].tag, explCount: meaningful(expl), conflicts, stratSizes: strats.map(s => `${s.tag}=${s.map.size}`).join(" ") };
}
const ANS_CFG = {
  2009: ["qa-2009.txt", "本地 2009年计算机408真题及答案解析.pdf（题干+答案）"],
  2010: ["ans-2010.txt", "本地 2009-2023答案/2010答案.pdf"],
  2011: ["ans-2011.txt", "本地 2011年计算机408真题及答案.pdf"],
  2012: ["ans-2012.txt", "本地 2009-2023答案/2012答案.pdf"],
  2013: ["qa-2013.txt", "本地 2013年计算机408真题及答案.pdf"],
  2014: ["ans-2014.txt", "本地 2009-2023答案/2014答案.pdf"],
  2015: ["ans-2015.txt", "本地 2009-2023答案/2015答案.pdf"],
  2016: ["ans-2016.txt", "本地 2009-2023答案/2016答案.pdf"],
  2017: ["ans-2017.txt", "本地 2009-2023答案/2017答案.pdf"],
  2018: ["ans-2018.txt", "本地 2009-2023答案/2018答案.pdf"],
  2019: ["ans-2019.txt", "本地 2009-2023答案/2019答案.pdf"],
  2020: ["ans-2020.txt", "本地 2009-2023答案/2020答案.pdf"],
  2021: ["jdc-ans-2021.txt", "JDC2001/408 答案/2021答案.pdf（本地 2021答案.pdf 为扫描件不可用）"],
  2022: ["ans-2022.txt", "本地 2009-2023答案/2022答案.pdf"],
  2023: ["ans-2023.txt", "本地 2009-2023答案/2023答案.pdf"],
  2024: ["ans-2425-2024.txt", "csgraduates.com 408 真题精讲（dyuebug/csgraduates）+ 408os.cn 题库（kaichan-kc/408-questions），已与 neville-studio answers/2024-answer.pdf（官方参考答案扫描件）OCR 逐题互证"],
  2025: ["ans-2425-2025.txt", "csgraduates.com 408 真题精讲（dyuebug/csgraduates）+ 408os.cn 题库（kaichan-kc/408-questions），已与 neville-studio answers/2025-answer.pdf（官方参考答案扫描件）OCR 逐题互证"],
};
// 2024/2025 的综合题参考答案单独成文件（来源同上，csgraduates「解答题」章节）
const ESSAY_CFG = {
  2024: "ans-2425-2024-essay.txt",
  2025: "ans-2425-2025-essay.txt",
};
// 2024/2025 综合题科目：由 csgraduates 的「解答题」章节分组实证
const ESSAY_SUBJ = {
  2024: { 41: "ds", 42: "ds", 43: "co", 44: "co", 45: "os", 46: "os", 47: "cn" },
  2025: { 41: "ds", 42: "ds", 43: "co", 44: "co", 45: "os", 46: "os", 47: "cn" },
};
const ANS_URL = {
  jdc: "https://github.com/JDC2001/408",
  local: "https://github.com/suhan42/cs-408",
  csgrad: "https://github.com/dyuebug/csgraduates",
  os408: "https://github.com/kaichan-kc/408-questions",
};
function answerSourcesFor(y) {
  const [afile, adesc] = ANS_CFG[y];
  const base = [
    { role: "题干与选项", name: `papers-rebuild/${y}.pdf（重构版真题）`, url: `https://github.com/neville-studio/408-exam-paper/blob/main/papers-rebuild/${y}.pdf` },
    { role: "答案与解析", name: adesc, url: afile.startsWith("jdc") ? ANS_URL.jdc : afile.startsWith("ans-2425") ? ANS_URL.csgrad : ANS_URL.local },
  ];
  if (afile.startsWith("ans-2425")) {
    base.push({ role: "答案第二来源（互证）", name: "408os.cn 题库 kaichan-kc/408-questions 408_questions_by_year/" + y + ".json", url: ANS_URL.os408 });
    base.push({ role: "答案仲裁来源（官方参考答案扫描件，Windows OCR）", name: `answers/${y}-answer.pdf`, url: `https://github.com/neville-studio/408-exam-paper/blob/main/answers/${y}-answer.pdf` });
    base.push({ role: "综合题参考答案", name: `tools/cache/${ESSAY_CFG[y]}（csgraduates.com「解答题」章节）`, url: ANS_URL.csgrad });
  }
  return base;
}
// 2024/2025 答案互证结论（由 tools/compare-2425.mjs 计算，写入卷级 answerVerification）
const ANSWER_VERIFICATION = {
  2024: { officialScannable: 26, sources: ["csgraduates.com 408 真题精讲（单选 40/40 + 41–47 参考解答 7/7）", "408os.cn 题库（单选 40/40）", "neville-studio answers/2024-answer.pdf（官方参考答案扫描件，OCR 可读 26/40）"] },
  2025: { officialScannable: 30, sources: ["csgraduates.com 408 真题精讲（单选 40/40 + 41–47 参考解答 7/7）", "408os.cn 题库（单选 40/40）", "neville-studio answers/2025-answer.pdf（官方参考答案扫描件，OCR 可读 30/40）"] },
};

/* ================= 知识点 ================= */
const SUBJ_RANGE = (n) => (n <= 11 ? "ds" : n <= 22 ? "co" : n <= 32 ? "os" : "cn");
const SUBJ_KEY = [
  ["ds", ["二叉树","结点","树","森林","栈","队列","链表","顺序表","图","顶点","邻接","拓扑","最短路径","关键路径","排序","堆","查找","散列","哈希","B 树","B+树","B树","折半","哈夫曼","时间复杂度","空间复杂度","遍历","中序","先序","后序","平衡","邻接矩阵","矩阵","串","模式匹配","KMP","算法","数组","叶子"]],
  ["co", ["CPU","Cache","cache","主存","存储器","指令","寻址","寄存器","流水线","总线","中断","DMA","补码","浮点","IEEE","溢出","字长","编址","磁盘","TLB","页表","I/O","微程序","控制器","数据通路","CPI","主频","校验","芯片","存储","运算","加法器","冯","程序计数器"]],
  ["os", ["进程","线程","调度","信号量","死锁","同步","互斥","临界","银行家","管程","饥饿","页","段","内存","虚拟","缺页","置换","抖动","工作集","文件","目录","索引结点","FAT","位示图","设备","缓冲","SPOOLing","系统调用","内核态","用户态","特权指令","操作系统","时间片","共享","并发","地址变换","逻辑地址","物理地址"]],
  ["cn", ["OSI","TCP","UDP","IP","路由","子网","掩码","ARP","ICMP","DHCP","DNS","HTTP","FTP","SMTP","以太网","交换机","集线器","帧","CSMA","滑动窗口","停止-等待","后退 N 帧","选择重传","PPP","域名","报文段","拥塞","带宽","波特率","码元","香农","奈奎斯特","调制","曼彻斯特","局域网","网络层","传输层","应用层","物理层","数据链路层","NAT","TTL","分组","端口"]],
];
const TOPICS = {
  ds: [
    ["ds-绪论", ["时间复杂度","空间复杂度","算法","问题规模"]],
    ["ds-线性表", ["顺序表","单链表","双链表","循环链表","线性表","链表","顺序存储"]],
    ["ds-栈与队列", ["栈","队列","中缀","后缀","前缀表达式","表达式","入栈","出栈","入队","出队"]],
    ["ds-串", ["模式匹配","KMP","next 数组"]],
    ["ds-树与二叉树", ["二叉树","二叉排序树","平衡二叉树","哈夫曼","树","森林","线索","遍历","结点","叶子","叶结点","中序","先序","后序","层次遍历","孩子","兄弟"]],
    ["ds-图", ["图","顶点","邻接","拓扑","最短路径","关键路径","生成树","Dijkstra","连通","深度优先","广度优先","入度","出度","回路","AOE","AOV"]],
    ["ds-查找", ["查找","散列","哈希","B 树","B+树","B树","折半","查找长度","装填因子","冲突"]],
    ["ds-排序", ["排序","堆","快速排序","归并","插入排序","选择排序","基数排序","希尔","冒泡","稳定性"]],
  ],
  co: [
    ["co-计算机系统概述", ["CPI","MIPS","MFLOPS","主频","性能指标","冯","机器字长","时钟周期","基准程序"]],
    ["co-数据的表示和运算", ["补码","浮点","IEEE","溢出","定点","原码","反码","移码","进制","无符号","带符号","加法器","ALU"]],
    ["co-存储系统", ["Cache","cache","主存","存储器","存储","DRAM","SRAM","TLB","页表","虚拟","磁盘","编址","芯片","映射","ROM","RAM","闪存","容量","块"]],
    ["co-指令系统", ["指令","寻址","操作码","寄存器","CISC","RISC","指令格式","形式地址","偏移"]],
    ["co-中央处理器", ["CPU","流水线","控制器","数据通路","冒险","指令周期","微程序","微指令","异常","PC","IR","控制信号","硬布线","程序计数器"]],
    ["co-总线", ["总线","猝发","突发","仲裁","传输率"]],
    ["co-输入输出系统", ["I/O","DMA","接口","设备","程序查询","通道","串行","波特"]],
  ],
  os: [
    ["os-计算机系统概述", ["用户态","内核态","核心态","系统调用","特权指令","操作系统","批处理","分时","实时","微内核","虚拟机"]],
    ["os-进程管理", ["进程","线程","调度","信号量","死锁","同步","互斥","临界","银行家","管程","饥饿","时间片","PV","wait","signal","优先级"]],
    ["os-内存管理", ["页","分段","内存","虚拟","缺页","置换","抖动","工作集","地址变换","逻辑地址","物理地址","TLB","快表","页框","覆盖","交换","分区","连续分配"]],
    ["os-文件管理", ["文件","目录","索引结点","FCB","FAT","位示图","成组链接","链接分配","索引分配","簇","磁盘块","文件系统","硬链接","软链接"]],
    ["os-输入输出管理", ["设备","缓冲","SPOOLing","磁盘调度","驱动","中断处理","通道","IO","SCAN","CSCAN","FCFS","SSTF","格式化"]],
  ],
  cn: [
    ["cn-计算机网络体系结构", ["OSI","TCP/IP","体系结构","分层","协议","参考模型","语义","语法","时序"]],
    ["cn-物理层", ["波特率","码元","香农","奈奎斯特","调制","曼彻斯特","编码","传输介质","带宽","信噪比","双绞线","光纤","中继器","集线器","Hub"]],
    ["cn-数据链路层", ["帧","以太网","交换机","网桥","CSMA","滑动窗口","停止-等待","后退 N 帧","选择重传","PPP","MAC","冲突域","广播域","CRC","差错","GBN"]],
    ["cn-网络层", ["IP","路由","子网","掩码","ARP","ICMP","DHCP","分组","NAT","距离向量","OSPF","RIP","分片","TTL","IPv4","IPv6","BGP","转发表","网络前缀"]],
    ["cn-传输层", ["TCP","UDP","拥塞","端口","序号","确认","报文段","握手","连接","慢开始","超时","重传","流量控制"]],
    ["cn-应用层", ["DNS","HTTP","FTP","SMTP","电子邮件","WWW","域名","万维网","POP3","URL","Web"]],
  ],
};
function pickTopic(subject, text) {
  let bestT = null, bestScore = 0, ties = 0;
  for (const [tid, kws] of TOPICS[subject]) {
    let s = 0; for (const k of kws) if (text.includes(k)) s += k.length >= 3 ? 2 : 1;
    if (s > bestScore) { bestScore = s; bestT = tid; ties = 1; }
    else if (s === bestScore && s > 0) ties++;
  }
  if (!bestT || bestScore < 3) return [];
  if (ties > 1 && bestScore < 6) return [];
  return [bestT];
}
function pickSubjectByContent(text) {
  let best = null, bestScore = 0;
  for (const [sid, kws] of SUBJ_KEY) { let s = 0; for (const k of kws) if (text.includes(k)) s++; if (s > bestScore) { bestScore = s; best = sid; } }
  return bestScore >= 3 ? best : null;
}

/* ================= 主流程 ================= */
fs.mkdirSync(OUTDIR, { recursive: true });
const diagnostics = [], papers = [], topicCount = new Map(), defectsAll = [];
for (const y of YEARS) {
  const t = cleanPaper(fs.readFileSync(`${CACHE}/rebuild-${y}.txt`, "utf8"));
  const sBody = (() => { const i = t.indexOf("\u00a7SINGLE\u00a7"); let b = t.slice(i + 9); const e = b.indexOf("\u00a7ESSAY\u00a7"); return e < 0 ? b : b.slice(0, e); })();
  const eBody = (() => { const i = t.indexOf("\u00a7ESSAY\u00a7"); return i < 0 ? "" : t.slice(i + 8); })();
  const sChain = (bestChain(sBody, Array.from({ length: 40 }, (_, i) => i + 1)).chain) || [];
  const eChain = (bestChain(eBody, [41, 42, 43, 44, 45, 46, 47], 6000).chain) || [];

  const [afile, adesc] = ANS_CFG[y];
  const atext = norm(fs.readFileSync(`${CACHE}/${afile}`, "utf8"));
  const A = extractAnswers(atext, y);
  // 综合题参考答案：2024/2025 单独成文件；其余年份从答案 PDF 的 41–47 段落切分
  const essaySrcText = ESSAY_CFG[y] ? norm(fs.readFileSync(`${CACHE}/${ESSAY_CFG[y]}`, "utf8")) : atext;
  const eSegs = splitByMarkers(essaySrcText, [41, 42, 43, 44, 45, 46, 47]) || new Map();
  const essayAns = new Map();
  for (const [n, seg] of eSegs) {
    let s = seg.trim();
    const m = s.match(/^[（(]?\s*(?:【答案解析】|【参考答案】|【参考答案及解析】|【答案】|【解析】|解答|解析)[:：]?\s*[）)]?/);
    if (m) s = s.slice(m[0].length).trim();
    essayAns.set(n, s);
  }

  const questions = [], defects = [];
  for (let n = 1; n <= 40; n++) {
    const c = sChain[n - 1];
    const L = A.letters.get(n)?.letter || "";
    if (!c) { defects.push({ no: n, issue: "题干解析失败" }); continue; }
    let stem, options;
    if (c.opt) {
      stem = c.seg.slice(0, c.opt.a.idx).trim();
      options = [c.seg.slice(c.opt.a.end, c.opt.b.idx), c.seg.slice(c.opt.b.end, c.opt.c.idx), c.seg.slice(c.opt.c.end, c.opt.d.idx), c.seg.slice(c.opt.d.end)]
        .map((x, i) => ({ key: "ABCD"[i], text: x.trim() }));
    } else {
      stem = c.seg.trim();
      options = ["A", "B", "C", "D"].map(k => ({ key: k, text: "" }));
      defects.push({ no: n, issue: "选项为图片/未采集，options 文本为空" });
    }
    if (!L) defects.push({ no: n, issue: "答案缺失" });
    const subj = pickSubjectByContent(stem) || SUBJ_RANGE(n);
    const topics = pickTopic(subj, stem + " " + options.map(o => o.text).join(" "));
    for (const tp of topics) topicCount.set(tp, (topicCount.get(tp) || 0) + 1);
    questions.push({ id: `cs408-${y}-q${n}`, no: n, type: "single", stem, options, answer: L, explanation: A.expl.get(n) || "", score: 2, topics, images: [] });
  }
  for (let n = 41; n <= 47; n++) {
    const c = eChain[n - 41];
    if (!c) { defects.push({ no: n, issue: "综合题题干解析失败" }); continue; }
    const stem = c.seg.trim();
    const m = stem.match(/^[（(]\s*(?:本题\s*)?(\d+)\s*分\s*[）)]\s*/);
    const score = m ? Number(m[1]) : 0;
    const cleanStem = m ? stem.slice(m[0].length).trim() : stem;
    const subj = (ESSAY_SUBJ[y] && ESSAY_SUBJ[y][n]) || pickSubjectByContent(cleanStem);
    const topics = subj ? pickTopic(subj, cleanStem) : [];
    for (const tp of topics) topicCount.set(tp, (topicCount.get(tp) || 0) + 1);
    const ans = essayAns.get(n) || "";
    if (!ans) defects.push({ no: n, issue: "综合题参考答案缺失" });
    questions.push({ id: `cs408-${y}-q${n}`, no: n, type: "essay", stem: cleanStem, options: [], answer: ans, explanation: "", score, topics, images: [] });
  }
  const choiceCount = questions.filter(q => q.type === "single").length;
  const noAnswer = questions.filter(q => !q.answer).length;
  const emptyOpt = questions.filter(q => q.type === "single" && q.options.some(o => !o.text)).length;
  const noTopic = questions.filter(q => q.topics.length === 0).length;
  const explMissing = questions.filter(q => q.type === "single" && !q.explanation).length;
  let quality = "high";
  if (choiceCount < 40 || noAnswer > 0 || emptyOpt > 0) quality = "medium";
  if (choiceCount < 35) quality = "low";

  const paper = {
    id: `cs408-${y}`, subject: "cs408", subjectName: "408", year: y,
    title: `${y} 年全国硕士研究生招生考试 计算机学科专业基础综合（408）`,
    duration: 180, totalScore: 150, quality,
    source: { name: "neville-studio/408-exam-paper", url: "https://github.com/neville-studio/408-exam-paper" },
    sources: answerSourcesFor(y),
    sections: [
      { id: "choice", name: "一、单项选择题", questions: questions.filter(q => q.type === "single") },
      { id: "essay", name: "二、综合应用题", questions: questions.filter(q => q.type === "essay") },
    ],
  };
  if (ANSWER_VERIFICATION[y]) {
    paper.answerVerification = {
      method: "多源互证（两个独立文本来源 + 官方参考答案扫描件 OCR 仲裁）",
      sources: ANSWER_VERIFICATION[y].sources,
      officialScanReadable: `${ANSWER_VERIFICATION[y].officialScannable}/40`,
      conflicts: [],
      note: `三个来源在可读范围内逐题一致，0 冲突。官方参考答案 PDF（answers/${y}-answer.pdf）无文本层，经 Windows OCR 识别出的 ${ANSWER_VERIFICATION[y].officialScannable} 道选择题答案与上述文本源完全相同。综合题参考答案来自 csgraduates.com「解答题」章节，与官方扫描件「答案要点」内容一致。`,
      reproducedBy: "node tools/build-ans-2425.mjs && node tools/compare-2425.mjs",
    };
  }
  fs.writeFileSync(path.join(OUTDIR, `${y}.json`), JSON.stringify(paper, null, 1), "utf8");
  papers.push({
    id: `cs408-${y}`, year: y, title: paper.title, file: `cs408/${y}.json`,
    questionCount: questions.length, choiceCount, essayCount: questions.length - choiceCount,
    totalScore: 150, duration: 180, quality,
    source: paper.source.name, sourceUrl: paper.source.url, answerSource: adesc,
    explanationMissing: explMissing, emptyOptionQuestions: emptyOpt,
  });
  if (defects.length) defectsAll.push({ year: y, items: defects });
  let xc = "";
  if (NEVILLE_ANS[y]) {
    try {
      const nt = norm(fs.readFileSync(`${CACHE}/${NEVILLE_ANS[y]}`, "utf8"));
      const nA = extractAnswers(nt);
      const diff = [];
      for (let n = 1; n <= 40; n++) { const a = A.letters.get(n)?.letter, b = nA.letters.get(n)?.letter; if (a && b && a !== b) diff.push(`q${n}:${a}vs${b}`); }
      xc = ` neville=${nA.letters.size} xconflicts=[${diff.join(",")}]`;
    } catch (e) { xc = " neville=ERR"; }
  }
diagnostics.push(`${y}: single=${choiceCount}/40 essay=${questions.length - choiceCount}/7 letters=${A.letters.size}[${A.mode}] expl=${A.explCount}(${A.explMode}) essayAns=${essayAns.size} noAnswer=${noAnswer} emptyOpt=${emptyOpt} noTopic=${noTopic} quality=${quality} conflicts=[${A.conflicts.join(",")}]${xc}`);
}
const manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  subject: {
    id: "cs408", name: "408", fullName: "计算机学科专业基础综合（408）",
    color: "#0ea5e9", icon: "💻", examDuration: 180, examTotalScore: 150,
    sections: [{ id: "choice", name: "单项选择题" }, { id: "essay", name: "综合应用题" }],
    papers,
    topics: [...topicCount.entries()].map(([id, count]) => ({ id, name: id.split("-").slice(1).join("-"), count })).sort((a, b) => b.count - a.count),
  },
  coverage: { years: YEARS, count: YEARS.length, note: "2009–2025 全部 17 年，每年 40 单选 + 7 综合" },
  knownLimitations: [
    "所有题目均未采集图片（images 为空）。408 真题中相当一部分题目带插图（树/图/表格/Cache 结构图等），此类题目的题干会以『如下图』『如下表』引用缺失的图，需查阅原卷 PDF。",
    "有 3 道单选题的 A/B/C/D 四个选项本身就是图片（2009 q4、2010 q3、2017 q8），options 文本为空字符串，题干保留原文。",
    "选项与题干为 PDF 文本层抽取结果，部分公式/上下标（如 log2n、2^n、n^2）在文本层中丢失上下标格式，显示为 log2n、O(n2) 等。",
    "少数解析在源 PDF 文本层中缺失（见各年 explanationMissing 字段）。",
    "2024 / 2025 的官方参考答案 PDF（answers/2024-answer.pdf、answers/2025-answer.pdf）是**扫描图片**，没有文本层，因此这两年的答案改用两个独立文本来源（csgraduates.com 408 真题精讲、408os.cn 题库）并已与官方扫描件 OCR 结果逐题互证；详见各年 JSON 的 answerVerification 字段。",
  ],
  answerSourceNote: "2009–2023：答案与解析取自本地 PDF（2009-2023答案/、2009-2016真题&答案/）；本地 2021 答案 PDF 为扫描件无法提取文本，2021 年答案改用 JDC2001/408 仓库的 2021答案.pdf。2024–2025：neville-studio answers/<year>-answer.pdf 为扫描件（无文本层），答案改用 csgraduates.com 408 真题精讲（dyuebug/csgraduates）+ 408os.cn 题库（kaichan-kc/408-questions）双文本源，并以官方扫描件 OCR 结果仲裁，三方 0 冲突。",
  verificationSummary: {
    2024: { singleAnswers: "40/40", sources: 3, conflicts: 0, officialScanReadable: "26/40", essayAnswers: "7/7" },
    2025: { singleAnswers: "40/40", sources: 3, conflicts: 0, officialScanReadable: "30/40", essayAnswers: "7/7" },
    method: "tools/build-ans-2425.mjs（生成+一致性断言，分歧即中止）、tools/compare-2425.mjs（多源比对报告）",
  },
  diagnostics, defects: defectsAll,
};
fs.writeFileSync(path.join(OUTDIR, "_manifest.json"), JSON.stringify(manifest, null, 1), "utf8");
fs.writeFileSync(`${CACHE}/build-diag.txt`, diagnostics.join("\n"), "utf8");
console.log(diagnostics.join("\n"));
