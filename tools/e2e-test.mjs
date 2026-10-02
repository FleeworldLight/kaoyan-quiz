/**
 * 端到端交互测试：用 CDP 驱动无头 Edge，真实点击选项、验证错题本与本地存储。
 * 用法: node tools/e2e-test.mjs   （需要先跑起 dist 静态服务）
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const EDGE = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
].find((p) => fs.existsSync(p));
if (!EDGE) { console.error("找不到 Edge"); process.exit(1); }

const PORT = 9333;
const BASE = process.env.KQ_URL || "http://127.0.0.1:5199";
const PROFILE = path.resolve(".edge-e2e-profile");
fs.rmSync(PROFILE, { recursive: true, force: true });

const child = spawn(EDGE, [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run",
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  "--window-size=1280,1000", "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targetUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(300);
  }
  throw new Error("CDP 未就绪");
}

let ws, msgId = 0;
const pending = new Map();
function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { res, rej }));
}
async function evaluate(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " :: " + expr.slice(0, 80));
  return r.result?.value;
}
async function waitFor(expr, label, timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { if (await evaluate(expr)) return true; } catch {}
    await sleep(250);
  }
  throw new Error(`超时等待: ${label}`);
}

const results = [];
function check(name, ok, extra = "") {
  results.push({ name, ok });
  console.log(`${ok ? "  O" : "  X"} ${name}${extra ? "  -- " + extra : ""}`);
}

try {
  const wsUrl = await targetUrl();
  ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    }
  };
  await send("Runtime.enable");
  await send("Page.enable");

  console.log("=== 1. 首页 ===");
  await send("Page.navigate", { url: `${BASE}/#/` });
  await waitFor(`document.querySelectorAll('.subject-card').length >= 4`, "4 个科目卡片");
  const homeStats = await evaluate(`(() => {
    const v = [...document.querySelectorAll('.hero .stat .v')].map(e => e.textContent.trim());
    return { cards: document.querySelectorAll('.subject-card').length, stats: v };
  })()`);
  check("首页渲染 4 个科目", homeStats.cards === 4, JSON.stringify(homeStats.stats));

  await evaluate(`localStorage.clear()`);

  console.log("=== 2. 数学 2015 卷 · 答错第一题 ===");
  await send("Page.navigate", { url: `${BASE}/#/run?mode=paper&subject=math1&year=2015&practice=1` });
  await waitFor(`document.querySelectorAll('.opt').length === 4`, "4 个选项");
  check("题干正确渲染（含“拐点”）", !!(await evaluate(`document.querySelector('.qcard .richtext')?.textContent.includes('拐点')`)));
  check("KaTeX 公式已渲染", (await evaluate(`document.querySelectorAll('.qcard .katex').length`)) > 0);

  await evaluate(`document.querySelectorAll('.opt')[0].click()`);   // 正确答案是 C，点 A 必错
  await waitFor(`document.querySelector('.explain') !== null`, "解析出现");
  const explainText = (await evaluate(`document.querySelector('.explain').textContent`)) || "";
  check("答错后展示正确答案", /正确答案/.test(explainText) && /C/.test(explainText), explainText.slice(0, 40).replace(/\s+/g, " "));
  check("所选错误项被标红", !!(await evaluate(`document.querySelectorAll('.opt')[0].className.includes('wrong')`)));

  console.log("=== 3. 本地存储写入 ===");
  await sleep(900);   // 等 store 的 250ms 写盘防抖
  const st = await evaluate(`(() => { const s = JSON.parse(localStorage.getItem('kq:state:v1') || '{}'); return {
      progress: Object.keys(s.progress || {}).length, wrong: Object.keys(s.wrong || {}).length,
      wrongId: Object.keys(s.wrong || {})[0], w: Object.values(s.progress || {})[0]?.wrong }; })()`);
  check("进度已记录", st.progress === 1, JSON.stringify(st));
  check("错题已收录", st.wrong === 1 && st.wrongId === "math1-2015-q1", String(st.wrongId));

  console.log("=== 4. 收藏 + 笔记 ===");
  await evaluate(`[...document.querySelectorAll('.qactions button')].find(b => b.title === '收藏').click()`);
  await sleep(300);
  await evaluate(`[...document.querySelectorAll('.qactions button')].find(b => b.title === '笔记').click()`);
  await waitFor(`document.querySelector('textarea') !== null`, "笔记输入框");
  await evaluate(`(() => { const ta = document.querySelector('textarea');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, '这是一条测试笔记'); ta.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('保存笔记')).click()`);
  await sleep(900);
  const fav = await evaluate(`(() => { const s = JSON.parse(localStorage.getItem('kq:state:v1') || '{}');
    return { fav: Object.keys(s.fav || {}).length, note: (s.notes || {})['math1-2015-q1'] || null }; })()`);
  check("收藏已保存", fav.fav === 1);
  check("笔记已保存", fav.note === "这是一条测试笔记", String(fav.note));

  console.log("=== 5. 错题本页面 ===");
  await send("Page.navigate", { url: `${BASE}/#/wrong` });
  await waitFor(`document.body.textContent.includes('错题本')`, "错题本页面");
  await waitFor(`document.querySelectorAll('.qno').length >= 1`, "错题卡片");
  const wrongPage = await evaluate(`(() => ({ txt: document.body.textContent.slice(0, 160).replace(/\\s+/g, ' '),
      qno: document.querySelector('.qno')?.textContent }))()`);
  check("错题本列出该题", wrongPage.qno === "1", wrongPage.txt.slice(0, 70));

  console.log("=== 6. 统计页面 ===");
  await send("Page.navigate", { url: `${BASE}/#/stats` });
  await waitFor(`document.body.textContent.includes('学习统计')`, "统计页");
  const stats = await evaluate(`(() => { const v = [...document.querySelectorAll('.stat .v')].map(e => e.textContent.trim());
      return { vals: v, heat: document.querySelectorAll('.heat i').length }; })()`);
  check("统计页有数据与热力图", stats.vals.length === 4 && stats.heat > 100, JSON.stringify(stats.vals) + " heat=" + stats.heat);

  console.log("=== 7. 章节练习（408 数据结构） ===");
  await send("Page.navigate", { url: `${BASE}/#/run?mode=chapter&subject=cs408&topic=${encodeURIComponent("ds-树与二叉树")}&count=10` });
  await waitFor(`document.querySelector('.runbar .ttl') !== null`, "章节练习加载");
  const chap = await evaluate(`document.querySelector('.runbar .ttl')?.textContent || ''`);
  check("章节练习可组卷", /章节练习/.test(chap), chap.slice(0, 60));

  console.log("=== 8. 随机组卷（四科混合） ===");
  await send("Page.navigate", { url: `${BASE}/#/run?mode=random&mix=${encodeURIComponent('{"math1":2,"english1":2,"politics":2,"cs408":2}')}&seed=42` });
  await waitFor(`document.querySelector('.runbar .ttl') !== null`, "随机组卷");
  const mix = await evaluate(`document.querySelector('.runbar .ttl')?.textContent || ''`);
  check("随机组卷加载", /随机组卷/.test(mix), mix.slice(0, 40));

  console.log("=== 9. 模考模式（计时 + 答题卡 + 交卷） ===");
  await send("Page.navigate", { url: `${BASE}/#/run?mode=paper&subject=cs408&year=2020` });
  await waitFor(`document.querySelector('.timer') !== null`, "计时器");
  const timer = (await evaluate(`document.querySelector('.timer').textContent`)) || "";
  check("模考计时器出现", /^\d{1,2}:\d{2}(:\d{2})?$/.test(timer.trim()), timer.trim());
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent === '答题卡').click()`);
  await waitFor(`document.querySelectorAll('.asq').length >= 40`, "答题卡格子");
  const asq = await evaluate(`document.querySelectorAll('.asq').length`);
  check("答题卡显示 47 个格子", asq === 47, String(asq));
  await evaluate(`document.querySelectorAll('.asq')[0].click()`);
  await sleep(300);
  await evaluate(`document.querySelectorAll('.opt')[0].click()`);
  await sleep(300);
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent === '交卷').click()`);
  await waitFor(`document.querySelector('.result-hero') !== null`, "成绩页");
  const score = (await evaluate(`document.querySelector('.result-hero .score')?.textContent || ''`)) || "";
  check("交卷后显示成绩", /\d/.test(score), score.trim());
} catch (e) {
  check("测试执行", false, e.message);
} finally {
  try { ws?.close(); } catch {}
  child.kill();
  await sleep(300);
  fs.rmSync(PROFILE, { recursive: true, force: true });
}

const fail = results.filter((r) => !r.ok).length;
console.log(`\n=== 结果: ${results.length - fail}/${results.length} 通过 ===`);
process.exit(fail ? 1 : 0);
