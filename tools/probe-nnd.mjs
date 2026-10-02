#!/usr/bin/env node
/** probe-nnd.mjs —— 侦察 noobdream.com（N诺考研）刷题站结构
 * 用法: node tools/probe-nnd.mjs <url...>
 */
import fs from "node:fs";
import path from "node:path";
const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "tools", "cache", "mock-xiao", "nnd");
fs.mkdirSync(OUT, { recursive: true });
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function get(url, opt = {}) {
  for (let i = 0; i < (opt.tries ?? 2); i++) {
    try {
      const r = await fetch(url, {
        headers: {
          "User-Agent": UA,
          "Accept-Language": "zh-CN,zh;q=0.9",
          Referer: "https://noobdream.com/",
          ...(opt.headers || {}),
        },
        signal: AbortSignal.timeout(opt.timeout ?? 30000),
        redirect: "follow",
      });
      return { status: r.status, url: r.url, buf: Buffer.from(await r.arrayBuffer()) };
    } catch (e) {
      if (i === (opt.tries ?? 2) - 1) return { status: 0, err: e.cause?.code || e.message };
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
}

const urls = process.argv.slice(2);
for (const u of urls) {
  const r = await get(u);
  const name = u.replace(/^https?:\/\//, "").replace(/[^\w.\-]+/g, "_").slice(0, 90) + ".html";
  if (r.buf) fs.writeFileSync(path.join(OUT, name), r.buf);
  console.log(`${r.status} len=${r.buf?.length ?? 0} ${r.err || ""}  ${u}`);
}
