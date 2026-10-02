/**
 * 端到端交互测试（第二版，对应重做后的界面）
 * 用法: node tools/e2e-test.mjs     需要先跑起 dist 静态服务
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const EDGE = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
].find((p) => fs.existsSync(p));
if (!EDGE) { console.error("找不到 Edge"); process.exit(1); }

const PORT = 9340;
const BASE = process.env.KQ_URL || "http://127.0.0.1:5199";
const PROFILE = path.resolve(".edge-e2e-profile-" + Date.now());
fs.rmSync(PROFILE, { recursive: true, force: true });

const child = spawn(EDGE, [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run",
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  "--window-size=1360,1000", "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws, msgId = 0;
const pending = new Map();
const runtimeErrors = [];

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
async function waitFor(expr, label, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { if (await ev(expr)) return true; } catch {}
    await sleep(220);
  }
  throw new Error("超时等待: " + label);
}
const results = [];
function check(name, ok, extra = "") {
  results.push({ name, ok });
  console.log((ok ? "  O " : "  X ") + name + (extra ? "  -- " + extra : ""));
}
async function goto(hash) {
  await send("Page.navigate", { url: BASE + "/" + hash });
  await sleep(2600);
}

try {
  let wsUrl;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try { const l = await (await fetch("http://127.0.0.1:" + PORT + "/json/list")).json(); wsUrl = l.find((t) => t.type === "page")?.webSocketDebuggerUrl; } catch {}
    if (!wsUrl) await sleep(400);
  }
  if (!wsUrl) throw new Error("CDP 未就绪");
  ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("ws error")); });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
    if (m.method === "Runtime.exceptionThrown") runtimeErrors.push(String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 200));
  };
  await send("Runtime.enable");
  await send("Page.enable");

  /* ---------------- 1. 学习区首页 ---------------- */
  await goto("#/");
  await waitFor(`document.body.innerText.includes('离考研还有')`, "首页渲染");
  const home = await ev(`({
    days: /离考研还有\\s*(\\d+)/.exec(document.body.innerText)?.[1],
    heat: document.querySelectorAll('[data-testid="heat-cell"]').length,
    nav: document.querySelectorAll('aside .nav-entry').length,
    subjects: document.body.innerText.includes('考研数学（一）') && document.body.innerText.includes('考研思想政治理论'),
  })`);
  check("首页显示考研倒计时", !!home.days, home.days + " 天");
  check("每日作答热力图渲染", home.heat > 150, home.heat + " 格");
  check("侧栏导航完整", home.nav >= 10, home.nav + " 项");
  check("四科信息出现在首页", !!home.subjects);

  /* ---------------- 2. 题库 ---------------- */
  await goto("#/library?subject=math1");
  await waitFor(`document.body.innerText.includes('考研数学（一）')`, "题库渲染");
  const lib = await ev(`({
    rows: document.querySelectorAll('li').length,
    has2024: document.body.innerText.includes('2024'),
    hasQuality: document.body.innerText.includes('质量高') || document.body.innerText.includes('个别瑕疵') || document.body.innerText.includes('OCR'),
  })`);
  check("题库列出试卷", lib.rows > 20, lib.rows + " 行");

  // 章节视图
  await ev(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '按章节')?.click()`);
  await sleep(900);
  const chap = await ev(`document.body.innerText.includes('高等数学') && document.body.innerText.includes('线性代数')`);
  check("章节视图按学科分组", !!chap);

  /* ---------------- 2.5 模拟卷 ---------------- */
  await goto("#/mock");
  await waitFor(`document.body.innerText.includes('模拟卷')`, "模拟卷页");
  const mock = await ev(`({
    txt: document.body.innerText.replace(/\\s+/g, ' '),
    groups: document.querySelectorAll('section').length,
    practice: [...document.querySelectorAll('a,button')].filter(b => b.textContent.trim() === '练习').length,
  })`);
  check("模拟卷按系列分组展示", mock.groups >= 5 && /未校验/.test(mock.txt), mock.groups + " 个分组");
  check("模拟卷可进入练习", mock.practice >= 5, mock.practice + " 个练习入口");

  /* ---------------- 3. 练习：答错 → 解析 → 错题本 ---------------- */
  await ev(`localStorage.clear()`);
  await goto("#/practice?mode=paper&subject=math1&year=2015&practice=1");
  await waitFor(`document.querySelectorAll('[data-testid="option"]').length >= 4`, "选项渲染");
  const katex = await ev(`document.querySelectorAll('.katex').length`);
  check("KaTeX 公式渲染", katex > 0, katex + " 个公式节点");
  await ev(`document.querySelector('[data-testid="option"][data-key="A"]').click()`);   // 2015 第 1 题答案是 C
  await waitFor(`document.querySelector('[data-testid="explanation"]') !== null`, "解析出现");
  const ex = await ev(`document.querySelector('[data-testid="explanation"]').innerText`);
  check("答错后显示正确答案", /正确答案/.test(ex) && /C/.test(ex), ex.slice(0, 30).replace(/\s+/g, " "));
  // 回归保护：单题布局下答完不能自动跳题，否则用户看不到解析
  await sleep(1300);
  const stillThere = await ev(`({ exp: !!document.querySelector('[data-testid="explanation"]'), qno: document.querySelector('[data-testid="question"]')?.innerText.slice(0, 4).replace(/\\s/g, "") })`);
  check("单题布局答完不跳题（解析保持可见）", stillThere.exp === true, "题号 " + stillThere.qno);
  await sleep(900);
  const st = await ev(`(() => { const s = JSON.parse(localStorage.getItem('kq:state:v1') || '{}');
    return { p: Object.keys(s.progress || {}).length, w: Object.keys(s.wrong || {}).length, id: Object.keys(s.wrong || {})[0] }; })()`);
  check("进度与错题写入本地", st.p === 1 && st.w === 1, JSON.stringify(st));

  /* ---------------- 4. 键盘盲操 ---------------- */
  await ev(`document.body.focus()`);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 });
  await sleep(500);
  const afterKey = await ev(`document.querySelector('[data-testid="question"]')?.innerText.slice(0, 20)`);
  check("方向键可切题", /2\\s*单选题|2单选题/.test(afterKey.replace(/\s/g, " ")) || afterKey.includes("2"), afterKey.replace(/\s+/g, " ").slice(0, 24));

  /* ---------------- 5. 收藏 + 笔记 ---------------- */
  await ev(`document.querySelectorAll('header button[aria-label]')[0]?.click()`);
  await sleep(200);
  await ev(`document.querySelector('button[aria-label="收藏"]')?.click()`);
  await sleep(300);
  await ev(`document.querySelector('button[aria-label="笔记"]')?.click()`);
  await waitFor(`document.querySelector('textarea') !== null`, "笔记弹窗");
  await ev(`(() => { const ta = document.querySelector('textarea');
    const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    set.call(ta, '端到端测试笔记'); ta.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await ev(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('保存笔记'))?.click()`);
  await sleep(900);
  const fn = await ev(`(() => { const s = JSON.parse(localStorage.getItem('kq:state:v1') || '{}');
    return { fav: Object.keys(s.fav || {}).length, note: Object.values(s.notes || {})[0] || null }; })()`);
  check("收藏写入本地", fn.fav >= 1, String(fn.fav));
  check("笔记写入本地", fn.note === "端到端测试笔记", String(fn.note));

  /* ---------------- 6. 连续布局 ---------------- */
  await ev(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '连续')?.click()`);
  await sleep(900);
  const listN = await ev(`document.querySelectorAll('[data-testid="question"]').length`);
  check("连续布局一次渲染全部题目", listN >= 20, listN + " 张题卡");
  await ev(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '单题')?.click()`);
  await sleep(600);

  /* ---------------- 7. 错题复测 ---------------- */
  await goto("#/wrong-retest");
  await waitFor(`document.body.innerText.includes('错题复测')`, "错题复测渲染");
  const wr = await ev(`({ txt: document.body.innerText, secs: document.querySelectorAll('section').length })`);
  check("错题本列出错题", /错 1 次/.test(wr.txt) && wr.txt.includes("拐点"), wr.secs + " 个区块");

  /* ---------------- 8. 掌握地图 ---------------- */
  await goto("#/mastery");
  await waitFor(`document.body.innerText.includes('掌握地图')`, "掌握地图渲染");
  const mm = await ev(`({ canvas: document.querySelectorAll('canvas').length, rows: document.querySelectorAll('tbody tr').length })`);
  check("掌握地图渲染图表", mm.canvas >= 1, mm.canvas + " 个 canvas");
  check("章节明细表渲染", mm.rows > 5, mm.rows + " 行");

  /* ---------------- 9. 知识图谱 ---------------- */
  await goto("#/graph");
  await waitFor(`document.body.innerText.includes('知识图谱')`, "知识图谱渲染");
  const kg = await ev(`document.querySelectorAll('canvas').length`);
  check("知识图谱渲染", kg >= 1, kg + " 个 canvas");

  /* ---------------- 10. 智能组卷 ---------------- */
  await goto("#/smart-compose");
  await waitFor(`document.body.innerText.includes('智能组卷')`, "智能组卷渲染");
  await ev(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('四科均衡'))?.click()`);
  await sleep(600);
  const preset = await ev(`document.body.innerText.match(/合计\\s*(\\d+)\\s*题/)?.[1]`);
  check("模板套用后题量正确", preset === "100", "合计 " + preset + " 题");
  await ev(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('生成试卷'))?.click()`);
  await sleep(3200);
  const genTitle = await ev(`document.body.innerText.slice(0, 60).replace(/\\s+/g, ' ')`);
  check("能跳到生成的试卷", /智能组卷/.test(genTitle), genTitle.slice(0, 40));

  /* ---------------- 11. 模考 + 答题卡 + 交卷 ---------------- */
  await goto("#/practice?mode=paper&subject=cs408&year=2020");
  await waitFor(`document.querySelector('[data-testid="timer"]') !== null`, "模考计时器");
  const timer = await ev(`document.querySelector('[data-testid="timer"]').innerText`);
  check("模考计时器显示", /^\d{1,2}:\d{2}(:\d{2})?$/.test(timer.trim()), timer.trim());
  await ev(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '答题卡')?.click()`);
  await waitFor(`document.querySelectorAll('[data-testid="sheet-item"]').length >= 40`, "答题卡格子");
  const asq = await ev(`document.querySelectorAll('[data-testid="sheet-item"]').length`);
  check("答题卡格子数量正确", asq === 47, asq + " 格");
  await ev(`document.querySelectorAll('[data-testid="sheet-item"]')[0].click()`);
  await sleep(400);
  await ev(`document.querySelector('[data-testid="option"]')?.click()`);
  await sleep(500);
  const noReveal = await ev(`document.querySelector('[data-testid="explanation"]') === null`);
  check("模考中不立即显示答案", !!noReveal);
  await ev(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '交卷')?.click()`);
  await waitFor(`document.body.innerText.includes('客观题正确率')`, "成绩页");
  const result = await ev(`({ txt: document.body.innerText.replace(/\\s+/g, ' '), pct: /(\\d+)%/.exec(document.body.innerText)?.[1] })`);
  check("交卷后出成绩页", /客观题正确率/.test(result.txt) && !!result.pct, "正确率 " + result.pct + "%");

  /* ---------------- 12. 学习记录 / 收藏本 / 笔记 ---------------- */
  await goto("#/records");
  await waitFor(`document.body.innerText.includes('学习记录')`, "记录页");
  const rec = await ev(`({ rows: document.querySelectorAll('tbody tr').length, heat: document.querySelectorAll('[data-testid="heat-cell"]').length })`);
  check("学习记录有明细与热力图", rec.rows >= 1 && rec.heat > 150, rec.rows + " 行 / " + rec.heat + " 格");

  // 备份 / 导入：写一份快照文件，通过 CDP 塞进 file input，验证合并写入 localStorage
  const snapPath = path.resolve("tools/cache/e2e-import.json");
  fs.mkdirSync(path.dirname(snapPath), { recursive: true });
  fs.writeFileSync(snapPath, JSON.stringify({
    kind: "kaoyan-quiz-state", version: 1,
    state: {
      progress: { "e2e-imported-q1": { seen: 3, right: 2, wrong: 1, lastAt: Date.now(), subject: "math1", topics: ["e2e"], loc: { s: "math1", f: "math1/2015.json" } } },
      wrong: { "e2e-imported-q1": { addedAt: Date.now(), subject: "math1", loc: { s: "math1", f: "math1/2015.json" }, wrongCount: 1 } },
      fav: {}, notes: { "e2e-imported-q1": "导入进来的笔记" },
      records: [{ id: "e2e-imported-r1", at: Date.now(), subject: "math1", mode: "chapter", total: 3, correct: 2, durationSec: 60 }],
      exams: {}, settings: {},
    },
  }), "utf8");
  await send("DOM.enable");
  const doc = await send("DOM.getDocument", { depth: -1 });
  const node = await send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: 'input[type="file"]' });
  if (node && node.nodeId) {
    await send("DOM.setFileInputFiles", { nodeId: node.nodeId, files: [snapPath] });
    await waitFor(`document.body.innerText.includes('导入完成')`, "导入结果提示", 9000);
    await sleep(800);
    const imported = await ev(`(() => { const s = JSON.parse(localStorage.getItem('kq:state:v1') || '{}');
      return { note: (s.notes || {})['e2e-imported-q1'] || null,
        rec: (s.records || []).some((r) => r.id === 'e2e-imported-r1'),
        progress: Object.keys(s.progress || {}).length }; })()`);
    check("能导入备份数据并合并", imported.note === "导入进来的笔记" && imported.rec === true, JSON.stringify(imported));
  } else {
    check("能导入备份数据并合并", false, "页面上找不到 file input");
  }

  await goto("#/favorites");
  await waitFor(`document.body.innerText.includes('收藏本')`, "收藏本");
  const favPage = await ev(`(() => { const s = JSON.parse(localStorage.getItem('kq:state:v1') || '{}');
    return { txt: document.body.innerText.replace(/\\s+/g, ' '), secs: document.querySelectorAll('section').length,
      stored: Object.keys(s.fav || {}).length }; })()`);
  check("收藏本列出题目", favPage.stored >= 1 && favPage.secs >= 1 && /2015/.test(favPage.txt) && /单选|多选|填空|主观/.test(favPage.txt),
    "本地收藏 " + favPage.stored + " 条 / 页面 " + favPage.secs + " 个区块");

  await goto("#/notes");
  await waitFor(`document.body.innerText.includes('题目笔记')`, "笔记页");
  check("笔记页列出笔记", (await ev(`document.body.innerText.includes('端到端测试笔记')`)) === true);

  /* ---------------- 13. 全局搜索 ---------------- */
  await goto("#/");
  await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))`);
  await waitFor(`document.querySelector('input[placeholder*="关键词"]') !== null`, "搜索弹窗");
  await ev(`(() => { const i = document.querySelector('input[placeholder*="关键词"]');
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    set.call(i, '拐点'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(2200);
  const hits = await ev(`document.body.innerText.includes('拐点') && document.querySelectorAll('[class*="line-clamp-2"]').length`);
  check("全局搜索能搜到题目", hits >= 1, hits + " 条结果");

  /* ---------------- 14. 移动端 ---------------- */
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await goto("#/");
  const mob = await ev(`({
    tab: !!document.querySelector('nav.fixed.bottom-0'),
    aside: getComputedStyle(document.querySelector('aside')).display,
  })`);
  check("移动端出现底部 Tab 栏", !!mob.tab);
  check("移动端隐藏桌面侧栏", mob.aside === "none", mob.aside);
  await send("Emulation.clearDeviceMetricsOverride");

  /* ---------------- 15. 无运行时报错 ---------------- */
  check("全程无 JS 运行时异常", runtimeErrors.length === 0, runtimeErrors.slice(0, 2).join(" | "));
} catch (e) {
  check("测试执行", false, e.message);
} finally {
  try { ws?.close(); } catch {}
  child.kill();
  await sleep(400);
  try { fs.rmSync(PROFILE, { recursive: true, force: true, maxRetries: 3 }); } catch {}
}

const fail = results.filter((r) => !r.ok).length;
console.log("\n=== 结果: " + (results.length - fail) + "/" + results.length + " 通过 ===");
if (fail) console.log("失败项: " + results.filter((r) => !r.ok).map((r) => r.name).join("、"));
process.exit(fail ? 1 : 0);
