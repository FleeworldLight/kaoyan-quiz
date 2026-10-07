import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9400;
const PROFILE = path.resolve(".edge-mob-" + Date.now());
const child = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox","--no-first-run",`--remote-debugging-port=${PORT}`,`--user-data-dir=${PROFILE}`,"about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const pending = new Map();
const send = (m, p = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method: m, params: p })); return new Promise((res, rej) => pending.set(i, { res, rej })); };
const ev = async (e) => { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return { __err: String(r.exceptionDetails.exception?.description||r.exceptionDetails.text).slice(0,300) }; return r.result?.value; };
try {
  let url;
  for (let i = 0; i < 60 && !url; i++) { try { const l = await (await fetch("http://127.0.0.1:" + PORT + "/json/list")).json(); url = l.find((t) => t.type === "page")?.webSocketDebuggerUrl; } catch {} if (!url) await sleep(400); }
  ws = new WebSocket(url);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("ws")); });
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } };
  await send("Runtime.enable"); await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 3, mobile: true });
  await send("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
  const BASE = process.argv[2] || "http://127.0.0.1:5199";
  await send("Page.navigate", { url: BASE + "/#/practice?mode=paper&subject=cs408&year=2020&practice=1&focus=cs408-2020-q5" });
  await sleep(7000);
  const r = await ev(`(() => {
    const img = document.querySelector('article img');
    if (!img) return { found: false, q: (document.querySelector('[data-testid="question"]')||{}).innerText?.slice(0,60) };
    const b = img.closest('button');
    const cs = getComputedStyle(img);
    const rb = b ? b.getBoundingClientRect() : null;
    const ri = img.getBoundingClientRect();
    return { found: true, complete: img.complete, naturalW: img.naturalWidth, naturalH: img.naturalHeight,
      clientW: img.clientWidth, clientH: img.clientHeight,
      rectW: Math.round(ri.width), rectH: Math.round(ri.height),
      btnW: rb ? Math.round(rb.width) : null,
      style: { maxW: cs.maxWidth, maxH: cs.maxHeight, w: cs.width, h: cs.height, display: cs.display },
      src: img.getAttribute('src'),
      viewport: window.innerWidth };
  })()`);
  console.log("移动端视口", r.viewport, "px");
  console.log(JSON.stringify(r, null, 1));
} catch (e) { console.log("ERR", e.message); }
finally { try { ws?.close(); } catch {} child.kill(); await sleep(400); try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {} }
