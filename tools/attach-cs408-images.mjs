#!/usr/bin/env node
/**
 * 408 真题配图：从 tools/cache/rebuild/<year>.pdf 抽出嵌入图 → 编码 PNG →
 * 按「题号 y 区间」定位到题目 → 写回 public/data/cs408/<year>.json 的 images 字段。
 *
 * 用法（必须在 kaoyan-quiz 目录下运行）：
 *   node tools/attach-cs408-images.mjs           # 抽图 + 挂图 + 产出报告
 *   node tools/attach-cs408-images.mjs --dry     # 只扫描/定位，不写 PNG、不改 JSON
 *
 * 只做「抽图 + 挂图」，绝不改动题干/选项/答案/解析。详见 tools/cs408-findings.md 第十节。
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const OPS = pdfjs.OPS;
const PDF_DIR = "tools/cache/rebuild";
const DATA_DIR = "public/data/cs408";
const IMG_DIR = path.join(DATA_DIR, "images");
const CACHE_DIR = "tools/cache/img";
const REPORT_TXT = path.join(CACHE_DIR, "attach-cs408-report.txt");
const MAP_MD = path.join(CACHE_DIR, "attach-cs408-map.md");

const YEARS = Array.from({ length: 17 }, (_, i) => 2009 + i);
const DRY = process.argv.includes("--dry");

/* ---------- 过滤阈值 ---------- */
const FULLPAGE_AREA_RATIO = 0.55; // 覆盖 ≥55% 页面面积 → 视为整页背景/扫描底图，丢弃
const MIN_PIXELS = 12 * 12; // 像素面积过小 → 装饰性小图，丢弃
const MIN_PT = 5; // bbox 任一边 < 5pt → 丢弃
const BLANK_NONWHITE_RATIO = 0.002; // 非白像素占比 < 0.2% → 空白图，丢弃

const IDENT = [1, 0, 0, 1, 0, 0];
const mul = (a, b) => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
];
const applyM = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
function aabb(m, x0, y0, x1, y1) {
  const pts = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => applyM(m, x, y));
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
const isect = (a, b) => (a && b ? [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])] : a || b);
const areaOf = (r) => (r && r[2] > r[0] && r[3] > r[1] ? (r[2] - r[0]) * (r[3] - r[1]) : 0);
const r1 = (v) => Math.round(v * 10) / 10;

/* ---------- PNG 编码（无第三方依赖） ---------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
/** img = { width, height, data, kind } → { png, colorType, nonWhiteRatio } */
function encodeImage(img) {
  const { width: w, height: h } = img;
  const src = Buffer.from(img.data.buffer || img.data, img.data.byteOffset || 0, img.data.length);
  const n = w * h;
  let px; // 归一化为 RGB 或 RGBA
  let colorType;
  if (src.length === n * 4) {
    // 检查是否全不透明 → 丢 alpha 省体积
    let opaque = true;
    for (let i = 3; i < src.length; i += 4) if (src[i] !== 255) { opaque = false; break; }
    if (opaque) {
      px = Buffer.alloc(n * 3);
      for (let i = 0, j = 0; i < src.length; i += 4) { px[j++] = src[i]; px[j++] = src[i + 1]; px[j++] = src[i + 2]; }
      colorType = 2;
    } else { px = src; colorType = 6; }
  } else if (src.length === n * 3) { px = src; colorType = 2; }
  else if (src.length === n) {
    px = Buffer.alloc(n);
    for (let i = 0; i < n; i++) px[i] = src[i];
    colorType = 0;
  } else if (src.length === Math.ceil(w / 8) * h) {
    px = Buffer.alloc(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const byte = src[y * Math.ceil(w / 8) + (x >> 3)];
      px[y * w + x] = byte & (0x80 >> (x & 7)) ? 255 : 0;
    }
    colorType = 0;
  } else {
    throw new Error(`无法识别的像素格式 kind=${img.kind} len=${src.length} ${w}x${h}`);
  }
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const stride = w * bpp;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: None
    px.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = colorType; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  // 非白像素统计（RGB/RGBA 用三通道任一 < 240 判定；灰度用 < 240）
  let nonWhite = 0, tot = 0;
  if (colorType === 6 || colorType === 2) {
    for (let i = 0; i < n; i++) {
      const o = i * bpp;
      tot++;
      if (px[o] < 240 || px[o + 1] < 240 || px[o + 2] < 240) nonWhite++;
    }
  } else {
    for (let i = 0; i < n; i++) { tot++; if (px[i] < 240) nonWhite++; }
  }
  return { png, colorType, nonWhiteRatio: tot ? nonWhite / tot : 0 };
}

/* ---------- 懒加载取图 ---------- */
function getObj(store, name, timeoutMs = 15000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; clearTimeout(t); resolve(v); } };
    const t = setTimeout(() => finish(null), timeoutMs);
    try {
      const v = store.get(name, finish);
      if (v) finish(v);
    } catch { /* 尚未解析：回调会被调用 */ }
  });
}

/* ---------- 文本里的题号定位 ---------- */
const MARKER_RE = /^\s*(\d{1,2})\s*[.．]/;
/**
 * 扫描一页的文本层：
 *  - excludedTop/excludedBottom：页眉页脚带（题号不会出现在那里）
 *  - 题号必须顶格（x ≈ 正文最小 x）
 */
function scanPageText(items, pageH) {
  const body = items.filter((it) => it.str && it.str.trim() && it.transform && it.transform[5] > 70 && it.transform[5] < pageH - 30);
  const xs = body.map((it) => it.transform[4]);
  const minX = xs.length ? Math.min(...xs) : 0;
  const markers = [];
  for (const it of body) {
    const m = it.str.match(MARKER_RE);
    if (!m) continue;
    const n = Number(m[1]);
    if (n < 1 || n > 47) continue;
    if (Math.abs(it.transform[4] - minX) > 3) continue;
    markers.push({ no: n, x: r1(it.transform[4]), y: r1(it.transform[5]), str: it.str.slice(0, 60) });
  }
  return { markers, minX: r1(minX), textCount: body.length };
}

/* ---------- 主扫描 ---------- */
async function scanPdf(year) {
  const file = path.join(PDF_DIR, `${year}.pdf`);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), useSystemFonts: true, isEvalSupported: false }).promise;
  const pages = [];
  let setTransformCount = 0;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const pageW = vp.width, pageH = vp.height;
    const ol = await page.getOperatorList();
    let ctm = IDENT.slice();
    const st = [];
    let clip = null;
    const clipStack = [];
    let idx = 0;
    const images = [];
    for (let i = 0; i < ol.fnArray.length; i++) {
      const fn = ol.fnArray[i];
      const args = ol.argsArray[i];
      if (fn === OPS.save) st.push({ ctm: ctm.slice(), clip });
      else if (fn === OPS.restore) { const s = st.pop(); if (s) { ctm = s.ctm; clip = s.clip; } else { ctm = IDENT.slice(); clip = null; } }
      else if (fn === OPS.transform) ctm = mul(ctm, args);
      else if (fn === OPS.setTransform) { setTransformCount++; ctm = args.slice(); }
      else if (fn === OPS.paintFormXObjectBegin) {
        st.push({ ctm: ctm.slice(), clip });
        if (Array.isArray(args[0]) && args[0].length === 6) ctm = mul(ctm, args[0]);
        if (Array.isArray(args[1]) && args[1].length === 4) clip = isect(clip, aabb(ctm, args[1][0], args[1][1], args[1][2], args[1][3]));
      } else if (fn === OPS.paintFormXObjectEnd) { const s = st.pop(); if (s) { ctm = s.ctm; clip = s.clip; } }
      else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject) {
        idx++;
        const name = fn === OPS.paintImageXObject ? args[0] : null;
        const box = aabb(ctm, 0, 0, 1, 1);
        const vis = clip ? isect(box, clip) : box;
        let data = null, err = null;
        if (name) {
          try { data = await getObj(page.objs, name); if (!data || !data.data) { err = "未解析"; data = null; } }
          catch (e) { err = e.message; }
        } else err = "inline/mask（无 XObject 名）";
        images.push({
          year, page: p, idx, name, op: fn,
          inline: fn === OPS.paintInlineImageXObject, mask: fn === OPS.paintImageMaskXObject,
          box: box.map(r1), visible: vis.map(r1), clipped: areaOf(vis) < areaOf(box) * 0.999,
          px: data ? data.width : (args[1] || null), py: data ? data.height : (args[2] || null),
          kind: data ? data.kind : null, len: data && data.data ? data.data.length : null,
          data: data ? { width: data.width, height: data.height, data: data.data, kind: data.kind } : null,
          err,
        });
      }
    }
    const tc = await page.getTextContent();
    const { markers, minX, textCount } = scanPageText(tc.items, pageH);
    pages.push({ page: p, pageW, pageH, countOps: ol.fnArray.length, images, markers, minX, textCount });
  }
  await doc.destroy();
  return { year, pages, setTransformCount };
}

/* ---------- 题号链 ---------- */
function buildMarkerChain(pages) {
  const cands = [];
  for (const pg of pages) for (const m of pg.markers) cands.push({ ...m, page: pg.page });
  cands.sort((a, b) => (a.page - b.page) || (b.y - a.y) || (a.x - b.x)); // 阅读序：页 → 页内自上而下（y 递减）
  const chain = [];
  let expect = 1;
  const skipped = [];
  for (const c of cands) {
    if (c.no === expect) { chain.push(c); expect++; }
    else skipped.push(c);
  }
  return { chain, skipped, missing: Array.from({ length: 47 }, (_, i) => i + 1).filter((n) => !chain.some((c) => c.no === n)) };
}

/* ---------- 挂图 ---------- */
function assignImages(pages, chain) {
  // 阅读序位置：(page, -y)
  const markers = chain.map((c) => ({ no: c.no, page: c.page, y: c.y }));
  const imgs = [];
  for (const pg of pages) for (const im of pg.images) imgs.push(im);
  imgs.sort((a, b) => (a.page - b.page) || (b.visible[3] - a.visible[3]) || (a.visible[0] - b.visible[0]));
  const out = [];
  for (const im of imgs) {
    const y = im.visible[3];
    let owner = null, prev = null, next = null;
    for (const m of markers) {
      if (m.page < im.page || (m.page === im.page && m.y >= y)) { if (!prev || (m.page > prev.page) || (m.page === prev.page && m.y < prev.y)) prev = m; }
      else if (!next) next = m;
    }
    // prev 应是「阅读序上最后一个不晚于该图」的题号
    let best = null;
    for (const m of markers) {
      const before = m.page < im.page || (m.page === im.page && m.y >= y);
      if (!before) continue;
      if (!best || m.page > best.page || (m.page === best.page && m.y < best.y)) best = m;
    }
    owner = best;
    out.push({ ...im, owner: owner ? owner.no : null, ownerMarker: owner, nextMarker: next, prevMarker: prev });
  }
  return out;
}

/* ---------- 主流程 ---------- */
const log = [];
const push = (s = "") => { log.push(s); console.log(s); };

fs.mkdirSync(CACHE_DIR, { recursive: true });
if (!DRY) fs.mkdirSync(IMG_DIR, { recursive: true });

const papers = {};
for (const y of YEARS) {
  const f = path.join(DATA_DIR, `${y}.json`);
  papers[y] = JSON.parse(fs.readFileSync(f, "utf8"));
  papers[y]._path = f;
}
const stemOf = (y, no) => {
  for (const sec of papers[y].sections) for (const q of sec.questions) if (q.no === no) return q.stem || "";
  return null;
};

push("=== 408 真题配图抽取报告 ===");
push(`生成时间: ${new Date().toISOString()}`);
push("");

const yearStats = {};
const allAssigned = [];
const allUnassigned = [];
const allDropped = [];

for (const y of YEARS) {
  const { pages, setTransformCount } = await scanPdf(y);
  const { chain, skipped, missing } = buildMarkerChain(pages);
  const imgs = assignImages(pages, chain);
  let kept = 0, droppedBg = 0, droppedSmall = 0, droppedBlank = 0, unresolved = 0;
  const files = [];
  let n = 0;
  for (const im of imgs) {
    const pageArea = pages.find((p) => p.page === im.page);
    const ratio = areaOf(im.visible) / (pageArea.pageW * pageArea.pageH);
    const reasons = [];
    if (!im.data) reasons.push(im.mask ? "掩膜图（paintImageMaskXObject）" : im.inline ? "内联图" : "取不到像素数据(" + (im.err || "?") + ")");
    if (im.data) {
      if (areaOf(im.visible) <= 0) reasons.push("被完全裁剪");
      else if (ratio >= FULLPAGE_AREA_RATIO) reasons.push(`整页背景（占页 ${(ratio * 100).toFixed(1)}%）`);
      else if (im.data.width * im.data.height < MIN_PIXELS) reasons.push(`像素过小 ${im.data.width}x${im.data.height}`);
      else if (im.visible[2] - im.visible[0] < MIN_PT || im.visible[3] - im.visible[1] < MIN_PT) reasons.push("显示尺寸过小");
    }
    if (!reasons.length) {
      let enc = null;
      try { enc = encodeImage(im.data); } catch (e) { reasons.push("PNG 编码失败: " + e.message); }
      if (enc && enc.nonWhiteRatio < BLANK_NONWHITE_RATIO) reasons.push(`近空白图（非白像素 ${(enc.nonWhiteRatio * 100).toFixed(2)}%）`);
      if (enc && !reasons.length) {
        n++;
        const fname = `cs408-${y}-p${im.page}-${n}.png`;
        im.file = fname;
        im.pngBytes = enc.png.length;
        im.nonWhiteRatio = enc.nonWhiteRatio;
        im.png = enc.png;
        files.push({ im, fname });
        kept++;
      }
    }
    if (reasons.length) {
      droppedBg += reasons.some((r) => r.startsWith("整页背景")) ? 1 : 0;
      droppedSmall += reasons.some((r) => r.includes("过小")) ? 1 : 0;
      droppedBlank += reasons.some((r) => r.includes("空白")) ? 1 : 0;
      if (reasons.some((r) => r.includes("像素数据") || r.includes("掩膜") || r.includes("内联"))) unresolved++;
      im.dropReasons = reasons;
      allDropped.push(im);
    } else {
      allAssigned.push(im);
    }
    im.pageAreaRatio = ratio;
  }

  // 写盘
  let yearBytes = 0;
  if (!DRY) {
    for (const { im, fname } of files) {
      fs.writeFileSync(path.join(IMG_DIR, fname), im.png);
      yearBytes += im.png.length;
    }
    delete papers[y]._path;
  }
  yearStats[y] = { total: imgs.length, kept, droppedBg, droppedSmall, droppedBlank, unresolved, markers: chain.length, missing, skippedMarkers: skipped.length, setTransformCount, bytes: yearBytes, pageCount: pages.length };
}

/* ---------- 分配一致性检查 ---------- */
function figKeywords(stem) {
  const kws = ["如下图", "如图", "下图", "上图", "图中", "所示图", "如下表", "下表", "表所示", "如题", "图示", "图 1", "图1", "树形", "结构图", "示意图", "流程图", "时序图", "编码图"];
  return kws.filter((k) => stem.includes(k));
}

const assignments = []; // { year, no, file, page, stem40, kw, ratio, pages }
for (const im of allAssigned) {
  if (!im.file) continue;
  const stem = stemOf(im.year, im.owner) || "";
  assignments.push({
    year: im.year, no: im.owner, file: im.file, page: im.page, idx: im.idx,
    stem40: stem.replace(/\s+/g, " ").slice(0, 40), kw: figKeywords(stem).join("/"),
    visible: im.visible, px: `${im.px}x${im.py}`, bytes: im.pngBytes,
    nonWhite: im.nonWhiteRatio, pageRatio: im.pageAreaRatio, clipped: im.clipped,
    nextNo: im.nextMarker ? im.nextMarker.no : null,
  });
}
// 同一题可能多图：按 (year, no, page) 排序
assignments.sort((a, b) => (a.year - b.year) || (a.no - b.no) || (a.page - b.page));

/* ---------- 写回 JSON ---------- */
const writeLog = [];
if (!DRY) {
  const byYearNo = new Map();
  for (const a of assignments) {
    const k = `${a.year}|${a.no}`;
    if (!byYearNo.has(k)) byYearNo.set(k, []);
    byYearNo.get(k).push(a.file);
  }
  for (const y of YEARS) {
    const doc = JSON.parse(fs.readFileSync(papers[y]._path, "utf8"));
    let changed = 0;
    for (const sec of doc.sections) for (const q of sec.questions) {
      const want = byYearNo.get(`${y}|${q.no}`) || [];
      const cur = Array.isArray(q.images) ? q.images : [];
      if (JSON.stringify(cur) !== JSON.stringify(want)) { q.images = want; changed++; }
    }
    // 安全校验：除 images 外一切字段必须与改写前完全一致
    const before = JSON.parse(fs.readFileSync(papers[y]._path, "utf8"));
    const strip = (o) => { const c = JSON.parse(JSON.stringify(o)); for (const s of c.sections) for (const q of s.questions) delete q.images; return JSON.stringify(c); };
    if (strip(before) !== strip(doc)) throw new Error(`${y}: 除 images 外字段被改动，已中止写入`);
    fs.writeFileSync(papers[y]._path, JSON.stringify(doc, null, 1), "utf8");
    writeLog.push(`${y}: ${changed} 道题的 images 变更`);
  }
}

/* ---------- 仍缺图（题干提到图但没挂上） ---------- */
const missingFig = [];
for (const y of YEARS) {
  for (const sec of papers[y].sections) for (const q of sec.questions) {
    const stem = q.stem || "";
    const kws = figKeywords(stem);
    const got = assignments.filter((a) => a.year === y && a.no === q.no).length;
    if (kws.length && got === 0) missingFig.push({ year: y, no: q.no, type: q.type, kw: kws.join("/"), stem40: stem.replace(/\s+/g, " ").slice(0, 40) });
  }
}

/* ---------- 报告 ---------- */
push("--- 一、逐年抽图结果 ---");
push("年份  图算子  采用  丢弃(整页)  丢弃(过小)  丢弃(空白)  无数据  题号定位  未定位题号  体积");
let totalImg = 0, totalBytes = 0;
for (const y of YEARS) {
  const s = yearStats[y];
  totalImg += s.kept; totalBytes += s.bytes;
  push(`${y}  ${String(s.total).padStart(4)}  ${String(s.kept).padStart(5)}  ${String(s.droppedBg).padStart(9)}  ${String(s.droppedSmall).padStart(9)}  ${String(s.droppedBlank).padStart(9)}  ${String(s.unresolved).padStart(5)}  ${String(s.markers).padStart(6)}  ${String(s.missing.length).padStart(8)}  ${(s.bytes / 1024).toFixed(0)}KB`);
}
push(`合计: 图算子 ${Object.values(yearStats).reduce((a, s) => a + s.total, 0)} / 采用 ${totalImg} / 体积 ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
push("");
push("--- 二、未定位题号的年份 ---");
for (const y of YEARS) if (yearStats[y].missing.length) push(`  ${y}: 缺 ${yearStats[y].missing.join(",")}（共 ${yearStats[y].missing.length}）`);
push("");
push("--- 三、挂图对照表 (year / 题号 / 图文件 / 页码 / 图尺寸pt / 像素 / 非白% / 题干关键词 / 题干前40字) ---");
for (const a of assignments) {
  push(`${a.year}  q${String(a.no).padStart(2)}  ${a.file.padEnd(26)} p${String(a.page).padStart(2)}  ${a.visible[2] - a.visible[0]}x${a.visible[3] - a.visible[1]}pt  ${a.px.padEnd(10)}  ${(a.nonWhite * 100).toFixed(1)}%  [${a.kw || "无关键词"}]  ${a.stem40}`);
}
push("");
push(`挂图题数: ${new Set(assignments.map((a) => a.year + "|" + a.no)).size} 道（共 ${assignments.length} 张图）`);
push("");
push("--- 四、未定位到题目的图 ---");
for (const im of allUnassigned) if (!im.file) { /* 未采用 */ }
for (const im of allAssigned) if (!im.owner) push(`  [无题号] ${im.year} p${im.page} #${im.idx} ${im.name} ${im.px}x${im.py} box=${im.box.join(",")}（未写盘/未挂）`);
for (const im of allDropped) push(`  [丢弃] ${im.year} p${im.page} #${im.idx} ${im.name || "(无名)"} ${im.px || "?"}x${im.py || "?"} box=${im.box.join(",")} → ${im.dropReasons.join("; ")}`);
push("");
push("--- 五、仍缺图的题（题干含『图/表』关键词但 images 为空） ---");
for (const m of missingFig) push(`  ${m.year} q${m.no} (${m.type}) [${m.kw}] ${m.stem40}`);
push(`共 ${missingFig.length} 道`);
push("");
push("--- 六、写回 JSON ---");
push(writeLog.length ? writeLog.join("\n") : (DRY ? "(dry-run，未写)" : "(无变更)"));

fs.writeFileSync(REPORT_TXT, log.join("\n"), "utf8");
console.log(`\n报告已写入 ${REPORT_TXT}`);
if (!DRY) {
  fs.writeFileSync(MAP_MD, [
    "# 408 真题配图对照表", "",
    "| 年份 | 题号 | 图文件 | 页码 | 显示尺寸(pt) | 像素 | 非白像素比 | 题干关键词 | 题干前 40 字 |",
    "|---|---|---|---|---|---|---|---|---|",
    ...assignments.map((a) => `| ${a.year} | ${a.no} | \`${a.file}\` | p${a.page} | ${(a.visible[2] - a.visible[0]).toFixed(0)}×${(a.visible[3] - a.visible[1]).toFixed(0)} | ${a.px} | ${(a.nonWhite * 100).toFixed(1)}% | ${a.kw || "—"} | ${a.stem40.replace(/\|/g, "\\|")} |`),
    "",
    `共 ${new Set(assignments.map((a) => a.year + "|" + a.no)).size} 道题挂图，${assignments.length} 张图。`,
    `仍缺图（题干提到图/表但无图）：${missingFig.length} 道。`,
    "",
    "## 仍缺图",
    "",
    "| 年份 | 题号 | 类型 | 关键词 | 题干前 40 字 |",
    "|---|---|---|---|---|",
    ...missingFig.map((m) => `| ${m.year} | ${m.no} | ${m.type} | ${m.kw} | ${m.stem40.replace(/\|/g, "\\|")} |`),
    "",
    "## 丢弃/未定位的图",
    "",
    "| 年份 | 页 | 序号 | 名称 | 像素 | box(pt) | 原因 |",
    "|---|---|---|---|---|---|---|",
    ...allDropped.map((im) => `| ${im.year} | p${im.page} | #${im.idx} | ${im.name || "—"} | ${im.px || "?"}×${im.py || "?"} | ${im.box.join(", ")} | ${im.dropReasons.join("; ")} |`),
    ...allAssigned.filter((im) => !im.owner).map((im) => `| ${im.year} | p${im.page} | #${im.idx} | ${im.name} | ${im.px}×${im.py} | ${im.box.join(", ")} | 未能定位到题号 |`),
    "",
  ].join("\n"), "utf8");
  console.log(`对照表已写入 ${MAP_MD}`);
}
