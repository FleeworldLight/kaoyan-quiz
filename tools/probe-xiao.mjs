#!/usr/bin/env node
/**
 * probe-xiao.mjs —— 轮次3：为肖四/肖八等考研政治模拟卷做来源侦察（只探测，不入库）
 *
 * 用法: node tools/probe-xiao.mjs <group>
 *   groups: gitee | gh | web | all
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "tools", "cache", "mock-xiao");
fs.mkdirSync(OUT, { recursive: true });

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function get(url, opt = {}) {
  const tries = opt.tries ?? 2;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, {
        headers: {
          "User-Agent": UA,
          Accept: opt.accept || "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          ...(opt.headers || {}),
        },
        signal: AbortSignal.timeout(opt.timeout ?? 30000),
        redirect: "follow",
        method: opt.method || "GET",
        body: opt.body,
      });
      const buf = Buffer.from(await r.arrayBuffer());
      return { status: r.status, url: r.url, buf, text: () => buf.toString(opt.enc || "utf8"), headers: r.headers };
    } catch (e) {
      if (i === tries - 1) return { status: 0, err: e.cause?.code || e.message };
      await new Promise((r) => setTimeout(r, 1000 + i * 1500));
    }
  }
}

export function log(...a) {
  console.log(...a);
}

// ------------------------------------------------------------------ Gitee
async function gitee() {
  const qs = ["肖四", "肖八", "肖秀荣", "考研政治", "考研政治题库", "考研政治刷题", "腿姐", "徐涛"];
  const res = [];
  for (const q of qs) {
    const url = `https://gitee.com/api/v5/search/repositories?q=${encodeURIComponent(q)}&per_page=20&order=stars_count`;
    const r = await get(url, { accept: "application/json", tries: 2, timeout: 25000 });
    let body = "-";
    if (r.status === 200) {
      try {
        const j = JSON.parse(r.text());
        body = j.map((x) => `${x.full_name} | ★${x.stargazers_count} | ${(x.description || "").slice(0, 70)}`).join("\n    ");
        if (!j.length) body = "(0 results)";
      } catch (e) {
        body = "JSON parse fail: " + r.text().slice(0, 200);
      }
    } else body = r.err || `HTTP ${r.status} :: ` + (r.buf ? r.text().slice(0, 200) : "");
    res.push(`--- gitee api q="${q}" => ${r.status}\n    ${body}`);
    log(`[gitee api] ${q} => ${r.status}`);
    await new Promise((r2) => setTimeout(r2, 800));
  }
  // HTML 搜索页
  for (const q of ["肖四", "肖秀荣", "考研政治题库"]) {
    const url = `https://search.gitee.com/?q=${encodeURIComponent(q)}&type=repository`;
    const r = await get(url, { timeout: 25000 });
    res.push(`--- gitee web search q="${q}" => ${r.status} len=${r.buf?.length ?? 0}`);
    if (r.status === 200) fs.writeFileSync(path.join(OUT, `gitee-search-${q}.html`), r.buf);
    log(`[gitee web] ${q} => ${r.status} len=${r.buf?.length ?? 0}`);
  }
  fs.writeFileSync(path.join(OUT, "probe-gitee.txt"), res.join("\n\n"), "utf8");
}

// ------------------------------------------------------------------ GitHub
async function gh() {
  const qs = [
    "肖秀荣",
    "肖四",
    "肖八",
    "徐涛",
    "腿姐",
    "米鹏",
    "考研政治",
    "考研政治 押题",
    "考研政治 模拟题",
    "politics mock kaoyan",
    "kaoyan zhengzhi",
    "肖1000",
    "1000题",
    "肖秀荣1000题",
    "考研政治 题库",
    "考研政治 刷题",
    "考研政治 小程序",
    "考研政治 背诵",
  ];
  const res = [];
  for (const q of qs) {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=20&sort=stars`;
    const r = await get(url, { accept: "application/vnd.github+json", tries: 2, timeout: 25000 });
    let body = "-";
    if (r.status === 200) {
      try {
        const j = JSON.parse(r.text());
        body =
          `total=${j.total_count}\n    ` +
          (j.items || []).map((x) => `${x.full_name} | ★${x.stargazers_count} | ${(x.description || "").slice(0, 80)}`).join("\n    ");
      } catch (e) {
        body = "JSON parse fail";
      }
    } else body = r.err || `HTTP ${r.status} :: ` + (r.buf ? r.text().slice(0, 200) : "");
    res.push(`--- gh q="${q}" => ${r.status}\n    ${body}`);
    log(`[gh] ${q} => ${r.status}`);
    await new Promise((r2) => setTimeout(r2, 2500));
  }
  fs.writeFileSync(path.join(OUT, "probe-gh.txt"), res.join("\n\n"), "utf8");
}

// ------------------------------------------------------------------ Web
async function web() {
  const res = [];
  const targets = [
    ["kaoyan.com 搜索", "https://www.kaoyan.com/search/?q=%E8%82%96%E5%9B%9B"],
    ["exam8", "https://www.exam8.com/"],
    ["zgkao", "http://www.kaoyan365.cn/zhengzhi/"],
    ["wendu", "https://www.wendu.com/"],
    [
      "csdn search 肖四选择题",
      "https://so.csdn.net/api/v3/search?q=%E8%82%96%E5%9B%9B%E9%80%89%E6%8B%A9%E9%A2%98&t=blog&p=1&s=0&tm=0&lv=-1&ft=0&l=&u=&ct=-1&pnt=-1&ry=-1&ss=-1&dct=-1&vco=-1&cc=-1&sc=-1&akt=-1&art=-1&ca=-1&prs=&pre=&ecc=-1&ebc=-1&urw=&ia=1&dId=&cl=-1&scl=-1&tcl=-1",
    ],
    ["jianshu search", "https://www.jianshu.com/search?q=%E8%82%96%E5%9B%9B&page=1&type=note"],
    [
      "sogou weixin",
      "https://weixin.sogou.com/weixin?type=2&query=%E8%82%96%E7%A7%80%E8%8D%A3%E5%9B%9B%E5%A5%97%E5%8D%B7%E9%80%89%E6%8B%A9%E9%A2%98&ie=utf8",
    ],
    ["wenku search", "https://wenku.baidu.com/search?word=%E8%82%96%E7%A7%80%E8%8D%A3%E5%9B%9B%E5%A5%97%E5%8D%B7"],
    ["doc88 search", "https://www.doc88.com/search?q=%E8%82%96%E7%A7%80%E8%8D%A3%E5%9B%9B%E5%A5%97%E5%8D%B7"],
    ["docin search", "https://www.docin.com/search.do?searchcat=2&nkey=%E8%82%96%E7%A7%80%E8%8D%A3%E5%9B%9B%E5%A5%97%E5%8D%B7"],
    ["renrendoc", "https://www.renrendoc.com/search.html?kw=%E8%82%96%E7%A7%80%E8%8D%A3%E5%9B%9B%E5%A5%97%E5%8D%B7"],
    [
      "bili article api",
      "https://api.bilibili.com/x/web-interface/search/type?search_type=article&keyword=%E8%82%96%E5%9B%9B%E9%80%89%E6%8B%A9%E9%A2%98&page=1",
    ],
    [
      "zhihu search api",
      "https://www.zhihu.com/api/v4/search_v3?t=general&q=%E8%82%96%E5%9B%9B%E9%80%89%E6%8B%A9%E9%A2%98&correction=1&offset=0&limit=20",
    ],
  ];
  for (const [name, url] of targets) {
    const r = await get(url, { timeout: 25000, tries: 1 });
    const len = r.buf?.length ?? 0;
    res.push(
      `--- ${name} => ${r.status} len=${len} ${r.err || ""}\n    ${r.buf ? r.text().slice(0, 500).replace(/\s+/g, " ") : ""}`,
    );
    log(`[web] ${name} => ${r.status} len=${len} ${r.err || ""}`);
    if (r.status === 200 && len)
      fs.writeFileSync(path.join(OUT, `web-${name.replace(/[^\w\u4e00-\u9fa5]+/g, "_")}.html`), r.buf);
  }
  fs.writeFileSync(path.join(OUT, "probe-web.txt"), res.join("\n\n"), "utf8");
}

const group = process.argv[2] || "all";
if (group === "gitee" || group === "all") await gitee();
if (group === "gh" || group === "all") await gh();
if (group === "web" || group === "all") await web();
console.log("\n[done] ->", path.relative(ROOT, OUT));
