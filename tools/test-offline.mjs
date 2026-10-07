#!/usr/bin/env node
/**
 * 弱网/断网可用性测试。
 *
 * 验证 Service Worker 是否真的解决了「国内手机访问 github.io 时，
 * 应用外壳能开、但题库数据和题目配图被 ERR_CONNECTION_RESET 打掉」的问题。
 *
 * 流程：
 *   1. 正常联网加载站点，进 408 带图题（让 SW 把 index.json、试卷 JSON、配图写进缓存）
 *   2. 用 CDP 把浏览器切成**完全离线**
 *   3. 重新加载 —— 断网状态下首页、题库、以及那张 408 配图都必须还能出来
 *
 * 用法: node tools/test-offline.mjs        （需要先 pnpm build）
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";

const EDGE = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
].find((p) => fs.existsSync(p));
if (!EDGE) { console.error("找不到 Edge"); process.exit(1); }

const ROOT = path.resolve(import.meta.dirname, "..");
const SITE_PORT = 5230;
const CDP_PORT = 9410;
const BASE = `http://127.0.0.1:${SITE_PORT}`;
const PROFILE = path.resolve(".edge-offline-profile-" + Date.now());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- 起站点 ---------- */
if (!fs.existsSync(path.join(ROOT, "dist", "index.html"))) {
  console.error("dist/ 不存在，请先执行 pnpm build");
  process.exit(1);
}
const server = spawn(process.execPath, [path.join(ROOT, "tools", "serve.mjs"), String(SITE_PORT), "dist"], {
  cwd: ROOT, stdio: "ignore",
});
const stopAll = () => { try { server.kill(); } catch {} };
process.on("exit", stopAll);

function reachable(url, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => { res.resume(); resolve(res.statusCode < 500); });
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(false); });
    req.on("error", () => resolve(false));
  });
}
for (let i = 0; i < 40; i++) { await sleep(200); if (await reachable(BASE + "/")) break; }

/* ---------- 起浏览器 ---------- */
const child = spawn(EDGE, [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run",
  `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${PROFILE}`,
  "--window-size=390,844", "about:blank",
], { stdio: "ignore" });

let ws, msgId = 0;
const pending = new Map();
const netFailures = [];
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
async function waitFor(expr, label, timeout = 30000) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < timeout) {
    try { last = await ev(expr); if (last) return true; } catch (e) { last = e.message; }
    await sleep(250);
  }
  throw new Error(`超时等待 ${label}（最后一次取值: ${JSON.stringify(last)}）`);
}

const results = [];
function check(name, ok, extra = "") {
  results.push({ name, ok });
  console.log((ok ? "  O " : "  X ") + name + (extra ? "  -- " + extra : ""));
}

const Q_URL = BASE + "/#/practice?mode=paper&subject=cs408&year=2020&practice=1&focus=cs408-2020-q5";
const IMG_OK = `(() => { const i = document.querySelector('article img'); return !!(i && i.complete && i.naturalWidth > 0); })()`;

try {
  let wsUrl;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json(); wsUrl = l.find((t) => t.type === "page")?.webSocketDebuggerUrl; } catch {}
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
    if (m.method === "Network.loadingFailed") netFailures.push(m.params.errorText);
  };
  await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });

  console.log("\n=== 第一步：正常联网，让 Service Worker 建立缓存 ===");
  await send("Page.navigate", { url: BASE + "/" });
  await waitFor(`document.body.innerText.length > 200`, "首页渲染");
  check("联网时首页正常", true, `文本 ${await ev(`document.body.innerText.length`)} 字`);

  const swState = await ev(`(async () => {
    if (!("serviceWorker" in navigator)) return "unsupported";
    const reg = await navigator.serviceWorker.ready;
    return reg.active ? reg.active.state : "no-active";
  })()`);
  check("Service Worker 已注册并激活", swState === "activated", String(swState));

  // 进 408 带图题，触发配图与试卷 JSON 缓存
  await send("Page.navigate", { url: Q_URL });
  await waitFor(`document.querySelectorAll('[data-testid="option"]').length >= 4`, "408 练习题");
  await waitFor(IMG_OK, "联网下配图加载", 45000);
  check("联网时 408 配图能加载", true, await ev(`(() => { const i = document.querySelector('article img'); return i.naturalWidth + "x" + i.naturalHeight; })()`));

  // 再进一次（这次 SW 已经在控制页面），让试卷 JSON 真正写进 Cache Storage
  await send("Page.navigate", { url: BASE + "/" });
  await waitFor(`document.body.innerText.length > 200`, "二次访问首页");
  await send("Page.navigate", { url: Q_URL });
  await waitFor(IMG_OK, "二次配图", 45000);
  await sleep(2500);

  // 必须断言「缓存里真的有数据」——只看页面能不能开会被浏览器 HTTP 缓存骗过去
  const cached = await ev(`(async () => {
    const names = await caches.keys();
    const out = {};
    for (const n of names) { const c = await caches.open(n); out[n] = (await c.keys()).map((r) => new URL(r.url).pathname); }
    return out;
  })()`);
  const dataKeys = Object.entries(cached).find(([n]) => n.includes("data"))?.[1] || [];
  const imgKeys = Object.entries(cached).find(([n]) => n.includes("img"))?.[1] || [];
  console.log("    缓存明细:");
  for (const [n, keys] of Object.entries(cached)) {
    console.log(`      ${n}: ${keys.length} 项${keys.length <= 6 ? "  " + keys.map((k) => k.split("/").pop()).join(", ") : ""}`);
  }
  check("Cache Storage 里有题库 JSON（不是靠 HTTP 缓存）",
    dataKeys.some((k) => k.endsWith("/index.json")) && dataKeys.some((k) => /\/cs408\/2020\.json$/.test(k)),
    `${dataKeys.length} 个 JSON`);
  check("Cache Storage 里有题目配图", imgKeys.some((k) => /\.png$/.test(k)), `${imgKeys.length} 张图`);

  console.log("\n=== 第二步：把浏览器切成完全离线 ===");
  await send("Network.emulateNetworkConditions", {
    offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0,
  });
  check("已切换到离线模式", true);

  console.log("\n=== 第三步：断网状态下重新访问 ===");
  netFailures.length = 0;
  await send("Page.navigate", { url: BASE + "/" });
  await waitFor(`document.body.innerText.length > 200`, "离线首页渲染", 40000);
  const offlineHome = await ev(`({ len: document.body.innerText.length, days: /(\\d+)\\s*天/.exec(document.body.innerText)?.[1] || null })`);
  check("断网后首页仍能打开", offlineHome.len > 200, `${offlineHome.len} 字 · 倒计时 ${offlineHome.days} 天`);

  await send("Page.navigate", { url: Q_URL });
  await waitFor(`document.querySelectorAll('[data-testid="option"]').length >= 4`, "离线练习题", 40000);
  check("断网后仍能进入练习页", true, `${await ev(`document.querySelectorAll('[data-testid="option"]').length`)} 个选项`);

  let offlineImgOk = false;
  try { await waitFor(IMG_OK, "离线配图", 40000); offlineImgOk = true; } catch {}
  const imgInfo = await ev(`(() => { const i = document.querySelector('article img');
    return i ? { w: i.naturalWidth, h: i.naturalHeight, failed: document.body.innerText.includes('图片加载失败') } : null; })()`);
  check("★ 断网后 408 配图仍能从缓存加载", offlineImgOk,
    imgInfo ? `${imgInfo.w}x${imgInfo.h}${imgInfo.failed ? "（却显示了失败提示）" : ""}` : "页面上没有 img 元素");

  // 顺带确认离线时不再依赖网络请求
  const dataOk = await ev(`fetch('./data/index.json').then(r => r.ok ? r.json() : null).then(j => j ? j.subjects.length : 0).catch(() => 0)`);
  check("断网后题库索引仍可读取（来自缓存）", dataOk >= 4, `${dataOk} 个科目`);
} catch (e) {
  check("离线测试执行完成", false, e.message);
} finally {
  try { ws?.close(); } catch {}
  child.kill();
  stopAll();
  await sleep(600);
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
}

const pass = results.filter((r) => r.ok).length;
console.log(`\n=== 结果: ${pass}/${results.length} 通过 ===`);
if (pass < results.length) {
  console.log("失败项: " + results.filter((r) => !r.ok).map((r) => r.name).join("、"));
  process.exit(1);
}
