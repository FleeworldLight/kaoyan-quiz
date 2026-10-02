#!/usr/bin/env node
/**
 * fetch-mock.mjs —— 抓取考研模拟卷 / 题库原始素材到 tools/cache/mock/
 *
 * 设计：只负责「下载」，不解析。解析与落库见 build-mock.mjs。
 * GitHub 走 jsDelivr CDN 优先（快、稳），失败回退 raw.githubusercontent.com。
 * 已存在且非空的文件默认跳过（加 --force 重新下载）。
 *
 * 用法：
 *   node tools/fetch-mock.mjs               # 抓全部
 *   node tools/fetch-mock.mjs politics408   # 只抓指定组
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE = path.join(ROOT, "tools", "cache", "mock");
const FORCE = process.argv.includes("--force");
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ---------------------------------------------------------------- 数据源清单
export const SOURCES = {
  politics2027: {
    // 已核验：4.0MB 单页应用，内嵌 6 段 <script type="application/json" id="__data__sN">
    // 共 1224 题（单选 573 / 多选 651），每题含 options/answer/answerInferred/选项级解析
    repo: "SatoriSatori555/Kaoyan_Politics2027",
    branch: "main",
    files: [{ p: "yantu徐涛 袁·杰的题目.html", out: "politics2027/qbank.html" }],
  },
  zhangyu1000: {
    // 2026 张宇考研数学1000题（数学一）静态刷题站：71 章 + 2 套测试卷，共 1307 题
    repo: "jlshdsdk/zhangyu-1000t",
    branch: "main",
    files: [
      { p: "index.html", out: "zhangyu/index.html" },
      { p: "README.md", out: "zhangyu/README.md" },
      ...Array.from({ length: 73 }, (_, i) => ({
        p: `chapters/chapter-${String(i + 1).padStart(2, "0")}.html`,
        out: `zhangyu/chapters/chapter-${String(i + 1).padStart(2, "0")}.html`,
      })),
    ],
  },
  wangdao408: {
    // 王道 408 教材 OCR 题库（分章节，含选择+综合应用题）
    repo: "zsc5725216-hub/408-quiz",
    branch: "main",
    files: [
      { p: "data/数据结构.json", out: "w408/数据结构.json" },
      { p: "data/计组.json", out: "w408/计组.json" },
      { p: "data/操作系统.json", out: "w408/操作系统.json" },
      { p: "data/计网.json", out: "w408/计网.json" },
      { p: "README.md", out: "w408/README.md" },
    ],
  },
};

// ---------------------------------------------------------------- 下载工具
function cdn(repo, branch, p) {
  return `https://cdn.jsdelivr.net/gh/${repo}@${branch}/${p.split("/").map(encodeURIComponent).join("/")}`;
}
function raw(repo, branch, p) {
  return `https://raw.githubusercontent.com/${repo}/${branch}/${p.split("/").map(encodeURIComponent).join("/")}`;
}

async function fetchUrl(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "*/*", Referer: "https://github.com/" },
        signal: AbortSignal.timeout(120000),
        redirect: "follow",
      });
      if (r.status !== 200) return { status: r.status };
      return { status: 200, buf: Buffer.from(await r.arrayBuffer()) };
    } catch (e) {
      if (i === tries - 1) return { status: 0, err: e.cause?.code || e.message };
      await new Promise((r) => setTimeout(r, 1500 + i * 1500));
    }
  }
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let idx = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (true) {
        const i = idx++;
        if (i >= items.length) return;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

// ---------------------------------------------------------------- 主流程
const stats = { ok: 0, skip: 0, fail: 0, bytes: 0 };
const failures = [];

for (const [name, src] of Object.entries(SOURCES)) {
  if (only.length && !only.includes(name)) continue;
  console.log(`\n=== [${name}] ${src.repo} (${src.files.length} files)`);
  const results = await pool(src.files, 6, async (f) => {
    const out = path.join(CACHE, f.out);
    if (!FORCE && fs.existsSync(out) && fs.statSync(out).size > 0) {
      stats.skip++;
      return { f, status: "skip", size: fs.statSync(out).size };
    }
    fs.mkdirSync(path.dirname(out), { recursive: true });
    let r = await fetchUrl(cdn(src.repo, src.branch, f.p));
    let via = "jsdelivr";
    if (r.status !== 200) {
      r = await fetchUrl(raw(src.repo, src.branch, f.p));
      via = "raw";
    }
    if (r.status === 200 && r.buf.length) {
      fs.writeFileSync(out, r.buf);
      stats.ok++;
      stats.bytes += r.buf.length;
      return { f, status: "ok", size: r.buf.length, via };
    }
    stats.fail++;
    failures.push({ source: name, repo: src.repo, path: f.p, status: r.status, err: r.err });
    return { f, status: "fail", status0: r.status, err: r.err };
  });
  for (const r of results) {
    const tag = r.status === "ok" ? "OK  " : r.status === "skip" ? "skip" : "FAIL";
    console.log(`  ${tag} ${String(r.size ?? r.status0 ?? "").padStart(9)}  ${r.f.out}${r.via ? "  (" + r.via + ")" : ""}${r.err ? "  " + r.err : ""}`);
  }
}

console.log(
  `\n[done] ok=${stats.ok} skip=${stats.skip} fail=${stats.fail} downloaded=${(stats.bytes / 1048576).toFixed(2)}MB`,
);
fs.writeFileSync(path.join(CACHE, "fetch-report.json"), JSON.stringify({ at: new Date().toISOString(), stats, failures }, null, 2));
if (failures.length) {
  console.log("未成功的文件已写入 tools/cache/mock/fetch-report.json");
}
