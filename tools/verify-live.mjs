#!/usr/bin/env node
/**
 * 线上站点验收（部署到 GitHub Pages 之后跑）。
 *
 * 用无头 Edge 直接访问线上地址，验证真实部署环境下：
 *   · 首屏能渲染、题库能加载（走真实 CDN，能暴露路径 / base 配错的问题）
 *   · Hash 路由能直接进入子页面（刷新/分享链接不 404）
 *   · KaTeX 公式、408 配图这类静态资源能加载
 *   · 数据说明页（公开站点的免责声明）在位
 *   · 全程没有 4xx 资源请求、没有 JS 运行时异常
 *
 * 用法:
 *   node tools/verify-live.mjs                                   # 默认查 Pages 地址
 *   node tools/verify-live.mjs https://example.com/path/         # 指定地址
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const URL_BASE = (process.argv[2] || "https://fleeworldlight.github.io/kaoyan-quiz/").replace(/\/?$/, "/");
const EDGE = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
].find((p) => fs.existsSync(p));
if (!EDGE) { console.error("找不到 Edge"); process.exit(1); }

const PORT = 9345;
const PROFILE = path.resolve(".edge-live-profile-" + Date.now());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- 前置连通性检查（国内访问 github.io 常被重置，要和站点故障区分开）---------- */
async function ping(tries = 6) {
  for (let i = 1; i <= tries; i++) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 20000);
      const r = await fetch(URL_BASE, { signal: ctl.signal, headers: { "User-Agent": "Mozilla/5.0" } });
      clearTimeout(t);
      if (r.ok) return { ok: true, status: r.status, html: await r.text(), tries: i };
      return { ok: false, status: r.status, tries: i };
    } catch (e) {
      if (i < tries) { console.log(`  [网络] 第 ${i} 次连接失败（${e.message}），重试…`); await sleep(2500); }
      else return { ok: false, err: e.message, tries: i };
    }
  }
}

const pre = await ping();
if (!pre.ok) {
  console.error(`\n✗ 无法访问 ${URL_BASE}`);
  console.error(`  ${pre.err ? "网络错误: " + pre.err : "HTTP " + pre.status}`);
  console.error("  这不代表站点有问题 —— 国内直连 github.io 经常被重置/超时。");
  console.error("  请用浏览器打开上面的地址确认，或挂代理后重跑本脚本。");
  process.exit(2);
}
console.log(`\n验收目标: ${URL_BASE}`);
console.log(`  [网络] 连通正常（HTTP ${pre.status}，第 ${pre.tries} 次尝试）`);
const titleOk = /<title>([^<]*)<\/title>/.exec(pre.html || "");
console.log(`  [首屏] HTML 标题: ${titleOk ? titleOk[1] : "（无 title）"}`);
if (!/考研刷题/.test(pre.html || "")) {
  console.error("\n✗ 返回的 HTML 不是本站内容（可能是 Pages 尚未部署完成，或路径不对）");
  console.error("  HTML 前 300 字: " + String(pre.html || "").slice(0, 300));
  process.exit(2);
}

const child = spawn(EDGE, [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run",
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  "--window-size=1360,1000", "about:blank",
], { stdio: "ignore" });

let ws, msgId = 0;
const pending = new Map();
const runtimeErrors = [];
const badResponses = [];
const okResponses = [];

function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { res, rej }));
}
async function ev(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200));
  return r.result?.value;
}
async function waitFor(expr, label, timeout = 45000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { if (await ev(expr)) return true; } catch {}
    await sleep(300);
  }
  throw new Error("超时等待: " + label);
}

const results = [];
function check(name, ok, extra = "") {
  results.push({ name, ok });
  console.log((ok ? "  O " : "  X ") + name + (extra ? "  -- " + extra : ""));
}

const short = (u) => u.replace(URL_BASE, "").replace(/^https?:\/\/[^/]+/, "…") || "/";

try {
  let wsUrl;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); wsUrl = l.find((t) => t.type === "page")?.webSocketDebuggerUrl; } catch {}
    if (!wsUrl) await sleep(400);
  }
  if (!wsUrl) throw new Error("CDP 未就绪");

  ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("连接 CDP 失败")); });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id); pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    }
    if (m.method === "Runtime.exceptionThrown") {
      runtimeErrors.push(String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 220));
    }
    if (m.method === "Network.responseReceived") {
      const st = m.params.response.status, u = m.params.response.url;
      if (st >= 400) badResponses.push(st + " " + short(u));
      else if (/\.(json|png|svg|js|css)($|\?)/.test(u)) okResponses.push(st + " " + short(u));
    }
  };
  await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");


  /* ---------- 1. 首屏 ---------- */
  await send("Page.navigate", { url: URL_BASE });
  await waitFor(`document.body.innerText.includes('离考研还有') || document.body.innerText.includes('学习区')`, "首屏渲染");
  const home = await ev(`({ days: /(\\d+)\\s*天/.exec(document.body.innerText)?.[1] || null,
    nav: document.querySelectorAll('a').length, len: document.getElementById('root').innerHTML.length,
    title: document.title })`);
  check("线上首屏渲染成功", home.len > 20000, `root ${home.len} B · 导航 ${home.nav} 项`);
  check("首页倒计时可用（题库已加载）", !!home.days, `${home.days} 天`);

  /* ---------- 2. 题库数据真的能取到 ---------- */
  const api = await ev(`fetch('./data/index.json').then(r => r.ok ? r.json() : null).then(j => j ? {
    subjects: j.subjects.map(s => ({ n: s.name, q: s.questionCount, p: s.papers.length })),
    mock: (j.mockGroups || []).reduce((a, g) => a + g.questionCount, 0),
    mockSets: (j.mockGroups || []).reduce((a, g) => a + g.papers.length, 0),
    total: j.subjects.reduce((a, s) => a + s.questionCount, 0)
  } : null).catch(() => null)`);
  check("线上能取到题库索引", !!api && api.total > 3000,
    api ? `真题 ${api.total} 题（${api.subjects.map(s => s.n + s.p).join(" ")}）+ 模拟 ${api.mock} 题/${api.mockSets} 套` : "取不到");

  /* ---------- 3. 子路由直接访问（分享链接场景）---------- */
  await send("Page.navigate", { url: URL_BASE + "#/library?subject=math1" });
  await waitFor(`document.body.innerText.includes('考研数学（一）')`, "题库页", 30000);
  check("深链 #/library 能直接打开", true);

  await send("Page.navigate", { url: URL_BASE + "#/mock" });
  await waitFor(`document.body.innerText.includes('模拟卷')`, "模拟卷页", 30000);
  const mock = await ev(`({ xiao: document.body.innerText.includes('肖秀荣'), head: /(\\d+) 个系列[^。]*/.exec(document.body.innerText)?.[0] || '' })`);
  check("模拟卷页含肖秀荣 4/8 套卷", mock.xiao, mock.head);

  /* ---------- 4. KaTeX 公式 ---------- */
  await send("Page.navigate", { url: URL_BASE + "#/practice?mode=paper&subject=math1&year=2015&practice=1" });
  await waitFor(`document.querySelectorAll('[data-testid="option"]').length >= 4`, "练习题", 30000);
  const math = await ev(`({ katex: document.querySelectorAll('.katex').length })`);
  check("数学题的 KaTeX 公式渲染", math.katex > 0, math.katex + " 个公式节点");

  /* ---------- 5. 408 配图（相对路径在子路径下是否正确）---------- */
  await send("Page.navigate", { url: URL_BASE + "#/practice?mode=paper&subject=cs408&year=2020&practice=1&focus=cs408-2020-q5" });
  await waitFor(`document.querySelector('article img') !== null`, "408 配图元素", 40000);
  // 跨网络时图片可能还在下载，必须轮询等它真正 decode 完，不能只查一次 complete
  let imgLoaded = false;
  try {
    await waitFor(`(() => { const i = document.querySelector('article img'); return !!(i && i.complete && i.naturalWidth > 0); })()`, "408 配图下载", 60000);
    imgLoaded = true;
  } catch {}
  const img = await ev(`(() => { const i = document.querySelector('article img');
    return { ok: !!(i && i.complete && i.naturalWidth > 0), w: i?.naturalWidth || 0, h: i?.naturalHeight || 0,
      src: i?.getAttribute('src') || '' }; })()`);
  check("408 题目配图在线加载", imgLoaded && img.ok, `${(img.src || "").split("/").pop()} ${img.w}x${img.h}`);

  /* ---------- 6. 数据说明页 ---------- */
  await send("Page.navigate", { url: URL_BASE + "#/about" });
  await waitFor(`document.body.innerText.includes('数据来源与说明')`, "数据说明页", 30000);
  const about = await ev(`(() => { const t = document.body.innerText;
    return { disc: t.includes('个人学习用途'), risk: t.includes('商业出版物'),
      privacy: t.includes('localStorage'), links: document.querySelectorAll('a[target="_blank"]').length,
      dead: [...document.querySelectorAll('a[target="_blank"]')].filter(a => !/^https?:/.test(a.getAttribute('href')||'')).length }; })()`);
  check("数据说明页含免责声明 / 风险提示 / 隐私说明", about.disc && about.risk && about.privacy, `外部来源链接 ${about.links} 个`);
  check("数据说明页没有死链", about.dead === 0, `非 http 链接 ${about.dead} 个`);

  /* ---------- 6.5 Service Worker 与弱网可用性 ---------- */
  // ready 会在 active worker 出现时兑现，但此时状态可能还是 activating，
  // 所以要轮询等它真正 activated（曾在这里误报过一次失败）
  const swState = await ev(`(async () => {
    if (!("serviceWorker" in navigator)) return "unsupported";
    try {
      const reg = await navigator.serviceWorker.ready;
      for (let i = 0; i < 60; i++) {
        const w = reg.active || reg.installing || reg.waiting;
        if (w && w.state === "activated") return "activated";
        await new Promise((r) => setTimeout(r, 250));
      }
      return (reg.active && reg.active.state) || "unknown";
    } catch (e) { return "error:" + e.message; }
  })()`);
  check("Service Worker 已注册并激活", swState === "activated", String(swState));

  // 2018 第 44 题：一整幅大图（缓存/TLB/页表），用于确认「被切碎的图已合并成单张」
  await send("Page.navigate", { url: URL_BASE + "#/practice?mode=paper&subject=cs408&year=2018&practice=1&focus=cs408-2018-q44" });
  await waitFor(`document.querySelector('article img') !== null`, "2018 大图元素", 40000);
  let bigOk = false;
  try {
    await waitFor(`(() => { const i = document.querySelector('article img'); return !!(i && i.complete && i.naturalWidth > 0); })()`, "2018 大图下载", 60000);
    bigOk = true;
  } catch {}
  const big = await ev(`(() => { const imgs = document.querySelectorAll('article img');
    const i = imgs[0]; return { n: imgs.length, w: i?.naturalWidth || 0, h: i?.naturalHeight || 0, src: i?.getAttribute('src') || '' }; })()`);
  check("被切碎的 2018 大图已合并为单张且能加载", bigOk && big.n === 1,
    `${(big.src || "").split("/").pop()} ${big.w}x${big.h} · 页面上 ${big.n} 个 img`);

  // 断网往返：这是手机端「图片出不来」的根因场景
  await send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  let offlineOk = false;
  try {
    await send("Page.navigate", { url: URL_BASE + "#/practice?mode=paper&subject=cs408&year=2020&practice=1&focus=cs408-2020-q5" });
    await waitFor(`document.querySelectorAll('[data-testid="option"]').length >= 4`, "断网练习页", 40000);
    await waitFor(`(() => { const i = document.querySelector('article img'); return !!(i && i.complete && i.naturalWidth > 0); })()`, "断网配图", 40000);
    offlineOk = true;
  } catch {}
  await send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  check("★ 断网后仍能刷题、配图来自缓存", offlineOk);

  /* ---------- 7. 资源与异常 ---------- */
  check("线上没有 4xx/5xx 资源请求", badResponses.length === 0,
    badResponses.length ? badResponses.slice(0, 4).join(" | ") : `${okResponses.length} 个静态资源全部 200`);
  check("线上没有 JS 运行时异常", runtimeErrors.length === 0, runtimeErrors.slice(0, 1).join(""));
} catch (e) {
  check("验收流程执行完成", false, e.message);
} finally {
  try { ws?.close(); } catch {}
  child.kill();
  await sleep(500);
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
}

const pass = results.filter((r) => r.ok).length;
console.log(`\n=== 结果: ${pass}/${results.length} 通过 ===`);
if (pass < results.length) {
  console.log("失败项: " + results.filter((r) => !r.ok).map((r) => r.name).join("、"));
  process.exit(1);
}
