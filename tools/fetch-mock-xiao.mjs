#!/usr/bin/env node
/**
 * fetch-mock-xiao.mjs —— 抓取 N诺考研（noobdream.com）/Practice/exam_solution/<id>/ 页面到
 * tools/cache/mock-xiao/nnd/raw/<id>.html（解析见 build-mock-xiao.mjs）。
 *
 * 页面为「某用户做过该套卷后的成绩+答案解析页」，公开可访问，含题干/选项/正确答案/原书简析。
 *
 * 用法：
 *   node tools/fetch-mock-xiao.mjs                       # 按 tools/cache/mock-xiao/sources.json 抓
 *   node tools/fetch-mock-xiao.mjs --ids 39886,39888     # 指定 id
 *   node tools/fetch-mock-xiao.mjs --force               # 忽略已有缓存重新抓
 *   node tools/fetch-mock-xiao.mjs --discover <from> <to> # 扫描 id 区间找肖秀荣/张宇等卷（等同 nnd-scan）
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE = path.join(ROOT, "tools", "cache", "mock-xiao");
const RAW = path.join(CACHE, "nnd", "raw");
fs.mkdirSync(RAW, { recursive: true });
const FORCE = process.argv.includes("--force");
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const args = process.argv.slice(2);
const idsFlag = args.find((a) => a.startsWith("--ids=")) || (args[args.indexOf("--ids") + 1] || "");

let examIds = [];
if (args.includes("--ids")) {
  examIds = idsFlag.split(",").map((x) => Number(x.trim())).filter(Boolean);
} else {
  const sf = path.join(CACHE, "sources.json");
  if (!fs.existsSync(sf)) {
    console.error(`缺少 ${path.relative(ROOT, sf)}，或用 --ids 指定`);
    process.exit(1);
  }
  const s = JSON.parse(fs.readFileSync(sf, "utf8"));
  examIds = [...new Set(s.papers.map((p) => p.examId))];
}

const CONC = 6;
let idx = 0;
const report = [];
await Promise.all(
  Array.from({ length: CONC }, async () => {
    while (true) {
      const i = idx++;
      if (i >= examIds.length) return;
      const id = examIds[i];
      const out = path.join(RAW, `${id}.html`);
      if (!FORCE && fs.existsSync(out) && fs.statSync(out).size > 1000) {
        report.push({ id, status: "skip", size: fs.statSync(out).size });
        console.log(`skip ${id}`);
        continue;
      }
      const url = `https://noobdream.com/Practice/exam_solution/${id}/`;
      let done = false;
      for (let t = 0; t < 3 && !done; t++) {
        try {
          const r = await fetch(url, {
            headers: { "User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9", Referer: "https://noobdream.com/" },
            signal: AbortSignal.timeout(40000),
            redirect: "follow",
          });
          if (r.status !== 200) {
            await r.arrayBuffer().catch(() => {});
            report.push({ id, status: r.status });
            console.log(`FAIL ${id} HTTP ${r.status}`);
            done = true;
            break;
          }
          const buf = Buffer.from(await r.arrayBuffer());
          const title = (buf.toString("utf8").match(/<title>\s*([\s\S]*?)\s*<\/title>/) || [])[1] || "";
          if (/用户登录/.test(title)) {
            report.push({ id, status: "login-wall" });
            console.log(`FAIL ${id} 登录墙`);
            done = true;
            break;
          }
          fs.writeFileSync(out, buf);
          report.push({ id, status: "ok", size: buf.length, title: title.replace(/\s+/g, " ").trim() });
          console.log(`OK   ${id} ${(buf.length / 1024).toFixed(0)}KB  ${title.replace(/\s+/g, " ").trim()}`);
          done = true;
        } catch (e) {
          if (t === 2) {
            report.push({ id, status: 0, err: e.cause?.code || e.message });
            console.log(`FAIL ${id} ${e.cause?.code || e.message}`);
          } else await new Promise((r2) => setTimeout(r2, 1500));
        }
      }
    }
  }),
);

fs.writeFileSync(path.join(CACHE, "fetch-report.json"), JSON.stringify({ at: new Date().toISOString(), report }, null, 2));
const ok = report.filter((r) => r.status === "ok").length;
const skip = report.filter((r) => r.status === "skip").length;
console.log(`\n[done] ok=${ok} skip=${skip} fail=${report.length - ok - skip}`);
