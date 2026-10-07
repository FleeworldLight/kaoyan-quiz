import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9402;
const PROFILE = path.resolve(".edge-livemob-" + Date.now());
const BASE = "https://fleeworldlight.github.io/kaoyan-quiz";
const child = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox","--no-first-run",`--remote-debugging-port=${PORT}`,`--user-data-dir=${PROFILE}`,"about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const pending = new Map();
const reqs = []; const failed = []; const errs = [];
const send = (m, p = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method: m, params: p })); return new Promise((res, rej) => pending.set(i, { res, rej })); };
const ev = async (e) => { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return { __err: String(r.exceptionDetails.exception?.description||r.exceptionDetails.text).slice(0,200) }; return r.result?.value; };
const shot = async (name) => { try { const r = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(name, Buffer.from(r.data, "base64")); return true; } catch { return false; } };
try {
  let url;
  for (let i = 0; i < 60 && !url; i++) { try { const l = await (await fetch("http://127.0.0.1:" + PORT + "/json/list")).json(); url = l.find((t) => t.type === "page")?.webSocketDebuggerUrl; } catch {} if (!url) await sleep(400); }
  ws = new WebSocket(url);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("ws")); });
  ws.onmessage = (e) => { const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
    if (m.method === "Network.responseReceived") reqs.push(m.params.response.status + " " + m.params.response.url);
    if (m.method === "Network.loadingFailed") failed.push(m.params.errorText + " " + (m.params.type||"") + " canceled=" + m.params.canceled);
    if (m.method === "Runtime.exceptionThrown") errs.push(String(m.params.exceptionDetails.exception?.description||"").slice(0,200));
  };
  await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  await send("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });

  // 先开首页（和用户路径一致），再进练习页
  await send("Page.navigate", { url: BASE + "/" });
  let homeOk = false;
  for (let i = 0; i < 60; i++) { await sleep(500); const t = await ev(`document.body.innerText.length`); if (typeof t === "number" && t > 200) { homeOk = true; break; } }
  console.log("首页加载:", homeOk ? "成功" : "失败");
  console.log("  首页文本长度:", await ev(`document.body.innerText.length`));
  console.log("  倒计时:", await ev(`(/(\\d+)\\s*天/.exec(document.body.innerText)||[])[1] || "无"`));

  await send("Page.navigate", { url: BASE + "/#/practice?mode=paper&subject=cs408&year=2020&practice=1&focus=cs408-2020-q5" });
  let qOk = false;
  for (let i = 0; i < 70; i++) { await sleep(500); const n = await ev(`document.querySelectorAll('[data-testid="option"]').length`); if (n >= 4) { qOk = true; break; } }
  console.log("\n408 练习页:", qOk ? "题目已渲染" : "未渲染");
  const state = await ev(`(() => {
    const img = document.querySelector('article img');
    return { imgFound: !!img, complete: img?.complete ?? null, naturalW: img?.naturalWidth ?? null,
      clientW: img?.clientWidth ?? null, src: img?.getAttribute('src') || null,
      optCount: document.querySelectorAll('[data-testid="option"]').length,
      bodyLen: document.body.innerText.length };
  })()`);
  console.log("  " + JSON.stringify(state));
  await shot(".edge-livemob-shot.png");
  console.log("\n--- 请求（后 12 条）---");
  reqs.slice(-12).forEach((r) => console.log("  " + r));
  console.log("--- 失败请求 ---");
  failed.slice(-10).forEach((f) => console.log("  " + f));
  console.log("--- JS 异常 ---");
  errs.slice(0, 3).forEach((e) => console.log("  " + e));
} catch (e) { console.log("ERR", e.message); }
finally { try { ws?.close(); } catch {} child.kill(); await sleep(400); try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {} }
