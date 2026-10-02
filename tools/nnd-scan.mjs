#!/usr/bin/env node
/**
 * nnd-scan.mjs —— 扫描 noobdream.com /Practice/exam_solution/<id>/ 的 ID 区间，
 * 提取页标题（<title>）与题量/答案数/分节标题，用于发现全部肖四/肖八套卷。
 *
 * 增量写 JSONL（可断点续跑），并把完整 HTML 按 id 缓存到 cache/nnd/raw/（可选 --save-html）。
 *
 * 用法:
 *   node tools/nnd-scan.mjs <from> <to> [--concurrency=N] [--save-html]
 * 输出:
 *   tools/cache/mock-xiao/nnd/scan.jsonl          （每行一条）
 *   tools/cache/mock-xiao/nnd/raw/<id>.html       （--save-html 时）
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "tools", "cache", "mock-xiao", "nnd");
const RAW = path.join(OUT, "raw");
fs.mkdirSync(OUT, { recursive: true });
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const args = process.argv.slice(2);
const from = Number(args[0]);
const to = Number(args[1]);
const CONC = Number((args.find((a) => a.startsWith("--concurrency=")) || "").split("=")[1] || 8);
const SAVE = args.includes("--save-html");
if (SAVE) fs.mkdirSync(RAW, { recursive: true });

const JSONL = path.join(OUT, "scan.jsonl");
const done = new Set();
if (fs.existsSync(JSONL)) {
  for (const line of fs.readFileSync(JSONL, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      done.add(JSON.parse(line).id);
    } catch {}
  }
}

function summarize(id, html) {
  const m = html.match(/<title>\s*([\s\S]*?)\s*<\/title>/);
  const title = m ? m[1].replace(/\s+/g, " ").trim() : "";
  const qIds = [...new Set([...html.matchAll(/\/Practice\/article\/(\d+)\//g)].map((x) => Number(x[1])))];
  const ansCount = (html.match(/class="correct-answer"/g) || []).length;
  const sec = [...html.matchAll(/<p><strong>([一二三四]、[^<]{0,40})/g)].map((x) => x[1]);
  const stdAnswers = [...html.matchAll(/标准答案为([A-D]{1,4})/g)].map((x) => x[1]);
  const qTypes = [...html.matchAll(/单选题|多项选择题|材料分析题|填空题|计算题/g)].length;
  return { id, title, articleIds: qIds, qLinks: qIds.length, ansCount, stdAnswerInText: stdAnswers, sections: sec, typeTokens: qTypes };
}

async function one(id) {
  const url = `https://noobdream.com/Practice/exam_solution/${id}/`;
  for (let t = 0; t < 2; t++) {
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9", Referer: "https://noobdream.com/" },
        signal: AbortSignal.timeout(30000),
        redirect: "follow",
      });
      if (r.status !== 200) {
        await r.arrayBuffer().catch(() => {});
        return { id, status: r.status };
      }
      const buf = Buffer.from(await r.arrayBuffer());
      const html = buf.toString("utf8");
      const s = summarize(id, html);
      s.status = 200;
      s.bytes = buf.length;
      if (SAVE && /肖秀荣|肖四|肖八|终极预测|四套卷|八套卷|米鹏|腿姐|徐涛/.test(s.title)) {
        fs.writeFileSync(path.join(RAW, `${id}.html`), buf);
      }
      return s;
    } catch (e) {
      if (t === 1) return { id, status: 0, err: e.cause?.code || e.message };
      await new Promise((r2) => setTimeout(r2, 800));
    }
  }
}

const ids = [];
for (let i = from; i <= to; i++) if (!done.has(i)) ids.push(i);
console.error(`[scan] ${from}..${to}  待抓 ${ids.length}（已完成 ${done.size}）  conc=${CONC} saveHtml=${SAVE}`);

const stream = fs.createWriteStream(JSONL, { flags: "a" });
const hits = [];
let n = 0;
let idx = 0;
await Promise.all(
  Array.from({ length: CONC }, async () => {
    while (true) {
      const i = idx++;
      if (i >= ids.length) return;
      const r = await one(ids[i]);
      stream.write(JSON.stringify(r) + "\n");
      n++;
      if (r.status === 200 && /肖秀荣|肖四|肖八|终极预测|四套卷|八套卷|米鹏|腿姐|徐涛/.test(r.title || "")) {
        hits.push(r);
        console.log(`HIT  ${r.id}\t${r.title}\tq=${r.qLinks} ans=${r.ansCount} std=${r.stdAnswerInText.length}`);
      } else {
        console.log(`     ${r.id}\t${r.status}\t${(r.title || r.err || "").slice(0, 60)}`);
      }
    }
  }),
);
await new Promise((res) => stream.end(res));

console.log(`\n[done] ${n} 条已写入 ${path.relative(ROOT, JSONL)}；命中 ${hits.length}`);
const seen = new Map();
for (const h of hits) {
  const key = h.title.replace(/__N诺考研$/, "");
  if (!seen.has(key)) seen.set(key, []);
  seen.get(key).push(`${h.id}(q=${h.qLinks},ans=${h.ansCount})`);
}
for (const [k, v] of [...seen].sort((a, b) => a[0].localeCompare(b[0], "zh"))) {
  console.log(`  ${k}  => ${v.join(", ")}`);
}
