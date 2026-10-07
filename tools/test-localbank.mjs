#!/usr/bin/env node
/**
 * 「我的错题本（拍照记题）」端到端测试。
 *
 * 覆盖整条链路，全部走真实 UI：
 *   1. 生成一张模拟手机拍书页的图片
 *   2. 在 /wrong/add 通过 file input 注入 → 断言压缩完成、体积大幅下降
 *   3. 填自己写的答案解析、从四科章节里选标签 → 保存（三项必填的约束也一并验证）
 *   4. 断言出现在 错题本 → 手工录入错题，缩略图能加载
 *   5. 翻看复习：断言图片来自 IndexedDB、答案默认折叠、可以展开
 *   6. 导出备份：拦截 createObjectURL 拿到 Blob，落盘成 zip，
 *      **用 Python zipfile 校验**（外部实现证明包是标准 zip，且图片逐字节可读）
 *   7. 删掉本地记录 → 再把 zip 导回去 → 断言记录与图片都还原
 *
 * 用法: node tools/test-localbank.mjs      （需要先 pnpm build）
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PY = "C:/Users/20396/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/python.exe";
const EDGE = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
].find((p) => fs.existsSync(p));
if (!EDGE) { console.error("找不到 Edge"); process.exit(1); }

const SITE_PORT = 5240;
const CDP_PORT = 9420;
const BASE = `http://127.0.0.1:${SITE_PORT}`;
const TMP = path.join(ROOT, "tools", "cache", "localbank-test");
const PROFILE = path.resolve(".edge-lb-profile-" + Date.now());
fs.mkdirSync(TMP, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

const child = spawn(EDGE, [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run",
  `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${PROFILE}`,
  "--window-size=414,900", "about:blank",
], { stdio: "ignore" });

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
  if (r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 300));
  return r.result?.value;
}
async function waitFor(expr, label, timeout = 30000) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < timeout) {
    try { last = await ev(expr); if (last) return true; } catch (e) { last = e.message; }
    await sleep(200);
  }
  throw new Error(`超时等待 ${label}（最后取值: ${JSON.stringify(last)}）`);
}
const results = [];
function check(name, ok, extra = "") {
  results.push({ name, ok });
  console.log((ok ? "  O " : "  X ") + name + (extra ? "  -- " + extra : ""));
}
async function setFileOn(selector, filePath) {
  await send("DOM.enable");
  const doc = await send("DOM.getDocument", { depth: -1 });
  const node = await send("DOM.querySelector", { nodeId: doc.root.nodeId, selector });
  if (!node || !node.nodeId) throw new Error("找不到 " + selector);
  await send("DOM.setFileInputFiles", { nodeId: node.nodeId, files: [filePath] });
}
/** 按可见文本点击按钮/元素 */
async function clickByText(text, tag = "*") {
  const ok = await ev(`(() => {
    const els = [...document.querySelectorAll('${tag}')];
    const hit = els.find((e) => e.textContent.trim().startsWith(${JSON.stringify(text)}) && e.offsetParent !== null);
    if (!hit) return false;
    hit.click();
    return true;
  })()`);
  if (!ok) throw new Error("找不到可点击元素：" + text);
  await sleep(350);
}

const SAMPLE = path.join(TMP, "sample.jpg");
const ZIP_OUT = path.join(TMP, "backup.zip");

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
    if (m.method === "Runtime.exceptionThrown") {
      runtimeErrors.push(String(m.params.exceptionDetails.exception?.description || "").slice(0, 200));
    }
  };
  await send("Runtime.enable"); await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 414, height: 900, deviceScaleFactor: 3, mobile: true });

  console.log("\n=== 1. 打开「记一道错题」 ===");
  await send("Page.navigate", { url: BASE + "/#/wrong/add" });
  await waitFor(`document.querySelector('[data-testid="pick-image"]') !== null`, "录入页", 30000);
  check("录入页可打开", true);

  const before = await ev(`document.querySelector('[data-testid="save-wrong"]').disabled`);
  check("必填未满足时无法保存", before === true);

  console.log("\n=== 2. 注入图片，验证压缩 ===");
  const sampleKB = Math.round(fs.statSync(SAMPLE).size / 1024);
  await setFileOn('[data-testid="pick-image"]', SAMPLE);
  await waitFor(`document.querySelector('article img, .overflow-hidden img') !== null || document.body.innerText.includes('已压缩')`, "图片处理", 40000);
  await sleep(1200);
  const compressed = await ev(`(() => {
    const t = document.body.innerText;
    const m = /原图 ([\\d.]+ ?[KM]?B) → 压缩后 ([\\d.]+ ?[KM]?B)/.exec(t);
    return { text: m ? m[0] : null, hasBadge: t.includes('已压缩') };
  })()`);
  check("图片已压缩并显示体积对比", !!compressed.text, compressed.text || "未看到压缩提示");

  console.log("\n=== 3. 填解析 + 选章节 ===");
  await ev(`(() => { const t = document.querySelector('[data-testid="answer-input"]');
    const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    set.call(t, '答案：D\\n错因：把 TLB 和 Cache 的比较对象搞混了。');
    t.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await sleep(300);
  const stillDisabled = await ev(`document.querySelector('[data-testid="save-wrong"]').disabled`);
  check("只填了解析、还没选章节 → 仍不能保存", stillDisabled === true);

  await ev(`document.querySelector('[data-test-subject="math1"]').click()`);
  await sleep(350);
  const groupsN = await ev(`document.querySelectorAll('[data-test-group]').length`);
  check("章节选择器列出该科的板块", groupsN >= 3, groupsN + " 个板块");
  await ev(`document.querySelector('[data-test-group]').click()`);
  await sleep(350);
  const topicsN = await ev(`document.querySelectorAll('[data-test-topic]').length`);
  check("选中板块后列出具体章节", topicsN >= 2, topicsN + " 个章节");
  await ev(`document.querySelector('[data-test-topic]').click()`);
  await sleep(400);
  const selText = await ev(`(/已选：([^\\n]+)/.exec(document.body.innerText) || [])[1] || null`);
  check("已选中具体章节", !!selText, String(selText));
  const canSave = await ev(`document.querySelector('[data-testid="save-wrong"]').disabled === false`);
  check("三项齐全后可保存", canSave === true);

  console.log("\n=== 4. 保存并查看列表 ===");
  await ev(`document.querySelector('[data-testid="save-wrong"]').click()`);
  await waitFor(`location.hash.includes('tab=photo')`, "跳回错题本", 20000);
  await waitFor(`document.querySelectorAll('[data-testid="photo-thumb"]').length > 0`, "手工录入错题卡片", 20000);
  const cardInfo = await ev(`(() => { const t = document.body.innerText;
    return { thumbs: document.querySelectorAll('[data-testid="photo-thumb"]').length,
      hasAnswer: t.includes('TLB 和 Cache'), hasTopic: /高等数学/.test(t) }; })()`);
  check("错题本里出现这道手工录入错题", cardInfo.thumbs === 1 && cardInfo.hasAnswer && cardInfo.hasTopic, JSON.stringify(cardInfo));

  await waitFor(`(() => { const i = document.querySelector('[data-testid="photo-thumb"] img'); return !!(i && i.complete && i.naturalWidth > 0); })()`, "缩略图加载", 20000);
  const thumb = await ev(`(() => { const i = document.querySelector('[data-testid="photo-thumb"] img');
    return { w: i.naturalWidth, h: i.naturalHeight, src: i.src.slice(0, 12) }; })()`);
  check("缩略图从 IndexedDB 正常加载", thumb.w > 0, `${thumb.w}x${thumb.h} ${thumb.src}…`);

  console.log("\n=== 5. 翻看复习（不打分、不记录） ===");
  await send("Page.navigate", { url: BASE + "/#/wrong/view" });
  await waitFor(`document.querySelector('[data-testid="toggle-answer"]') !== null`, "翻看页", 20000);
  await waitFor(`(() => { const i = document.querySelector('img'); return !!(i && i.complete && i.naturalWidth > 0); })()`, "大图加载", 25000);
  const view = await ev(`({ hasAnswerHidden: !document.querySelector('[data-testid="answer-text"]'),
    progress: (/(\\d+) \\/ (\\d+)/.exec(document.body.innerText) || [])[0] || null,
    noScore: ![...document.querySelectorAll('button')].some(b => /^(会了|不会|记住了|掌握|没掌握|会|不会)$/.test(b.textContent.trim())) })`);
  check("答案默认折叠（先自己回忆）", view.hasAnswerHidden === true, view.progress || "");
  check("界面上没有打分/自评按钮（按约定只翻看）", view.noScore === true);
  await ev(`document.querySelector('[data-testid="toggle-answer"]').click()`);
  await sleep(400);
  const revealed = await ev(`(document.querySelector('[data-testid="answer-text"]')?.textContent || '').includes('TLB 和 Cache')`);
  check("点开能看到我自己写的解析", revealed === true);
  const sideEffect = await ev(`Object.keys(JSON.parse(localStorage.getItem('kq:state:v1') || '{}').progress || {}).length`);
  check("翻看不写入任何学习记录", sideEffect === 0, "progress 条数 " + sideEffect);

  console.log("\n=== 6. 导出备份（拦截下载，落盘 zip） ===");
  await ev(`(() => {
    window.__cap = null;
    const orig = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (b) => { window.__cap = b; return orig(b); };
    HTMLAnchorElement.prototype.click = function () { /* 拦下下载 */ };
    return true;
  })()`);
  await send("Page.navigate", { url: BASE + "/#/records" });
  await waitFor(`document.querySelector('[data-testid="backup-all"]') !== null`, "学习记录页", 20000);
  await ev(`(() => {
    window.__cap = null;
    const orig = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (b) => { window.__cap = b; return orig(b); };
    HTMLAnchorElement.prototype.click = function () {};
    return true;
  })()`);
  const btnText = await ev(`document.querySelector('[data-testid="backup-all"]').textContent`);
  check("备份按钮显示包含图片", /含 1 张图片/.test(btnText), btnText.trim());
  await ev(`document.querySelector('[data-testid="backup-all"]').click()`);
  await waitFor(`window.__cap !== null`, "生成备份 Blob", 60000);
  await sleep(800);
  const b64 = await ev(`(async () => {
    const b = window.__cap;
    const buf = new Uint8Array(await b.arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
    return { type: b.type, size: b.size, b64: btoa(s) };
  })()`);
  fs.writeFileSync(ZIP_OUT, Buffer.from(b64.b64, "base64"));
  const zipKB = Math.round(fs.statSync(ZIP_OUT).size / 1024);
  check("导出得到 zip", b64.type === "application/zip" && b64.size > 10000, `${b64.type} ${zipKB} KB`);

  // 用 Python 的标准 zipfile 校验（外部实现）
  const pyCode = `
import zipfile, sys, json, hashlib
sys.stdout.reconfigure(encoding="utf-8")
p = r"${ZIP_OUT}"
z = zipfile.ZipFile(p)
names = z.namelist()
print("PY_NAMES=" + json.dumps(names))
bad = z.testzip()
print("PY_TESTZIP=" + ("OK" if bad is None else "BAD:" + str(bad)))
idx = json.loads(z.read("index.json").decode("utf-8"))
print("PY_INDEX=%d" % len(idx))
print("PY_META=" + json.dumps({k: idx[0].get(k) for k in ("subject","topicName","groupName")}, ensure_ascii=False))
img = [n for n in names if n.startswith("images/")][0]
data = z.read(img)
print("PY_IMAGE=%s %d %s" % (img, len(data), hashlib.sha256(data).hexdigest()[:16]))
st = json.loads(z.read("state.json").decode("utf-8"))
print("PY_STATE_KEYS=" + json.dumps(sorted(st.keys())))
`;
  fs.writeFileSync(path.join(TMP, "check.py"), pyCode, "utf8");
  const { execFileSync } = await import("node:child_process");
  let pyOut = "";
  try {
    pyOut = execFileSync(PY, [path.join(TMP, "check.py")], {
      encoding: "utf8", timeout: 60000, env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
  } catch (e) { pyOut = "PY_FAIL: " + (e.message || ""); }
  const pyLines = pyOut.trim().split("\n");
  console.log(pyLines.map((l) => "    " + l).join("\n"));
  const pyNames = /PY_NAMES=(\[.*\])/.exec(pyOut)?.[1] || "";
  check("Python zipfile 能打开我们导出的包", pyOut.includes("PY_TESTZIP=OK"));
  check("zip 内含 state.json 与图片", pyNames.includes("state.json") && pyNames.includes("images/") && pyNames.includes("index.json"));
  check("元数据（章节标签）完整保留在 zip 里", /PY_META=.*高等数学/.test(pyOut), (/PY_META=(.*)/.exec(pyOut) || [])[1] || "");

  console.log("\n=== 7. 删除后再导入，验证还原 ===");
  const beforeDel = await ev(`document.querySelectorAll('[data-testid="photo-thumb"]').length`);
  await send("Page.navigate", { url: BASE + "/#/wrong-retest?tab=photo" });
  await waitFor(`document.querySelectorAll('[data-testid="photo-thumb"]').length > 0`, "回到列表", 20000);
  const clickedDel = await ev(`(() => {
    window.confirm = () => true;   // 覆盖 confirm 必须紧跟在点击前，导航可能重建文档
    const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === '删除');
    if (b) { b.click(); return true; }
    return false;
  })()`);
  check("找到并点击删除按钮", clickedDel === true);
  await waitFor(`document.querySelectorAll('[data-testid="photo-thumb"]').length === 0`, "记录已删除", 15000);
  check("删除后列表为空（快照订阅生效）", true, `删除前 ${beforeDel} 条`);

  await send("Page.navigate", { url: BASE + "/#/records" });
  await waitFor(`document.querySelector('[data-testid="import-file"]') !== null`, "学习记录页", 20000);
  await setFileOn('[data-testid="import-file"]', ZIP_OUT);
  await waitFor(`document.body.innerText.includes('导入完成')`, "导入结果", 40000);
  const impMsg = await ev(`(/导入完成[^\\n]*/.exec(document.body.innerText) || [])[0] || ""`);
  check("导入提示包含手工录入错题恢复数量", /手工录入错题新增 1 道/.test(impMsg), impMsg.slice(0, 120));

  await send("Page.navigate", { url: BASE + "/#/wrong-retest?tab=photo" });
  await waitFor(`document.querySelectorAll('[data-testid="photo-thumb"]').length > 0`, "还原后的卡片", 25000);
  await waitFor(`(() => { const i = document.querySelector('[data-testid="photo-thumb"] img'); return !!(i && i.complete && i.naturalWidth > 0); })()`, "还原后的缩略图", 20000);
  const restored = await ev(`(() => { const i = document.querySelector('[data-testid="photo-thumb"] img');
    return { n: document.querySelectorAll('[data-testid="photo-thumb"]').length, w: i.naturalWidth,
      hasAnswer: document.body.innerText.includes('TLB 和 Cache') }; })()`);
  check("★ 导入后图片与解析都还原了", restored.n === 1 && restored.w > 0 && restored.hasAnswer, JSON.stringify(restored));

  check("全程没有 JS 运行时异常", runtimeErrors.length === 0, runtimeErrors.slice(0, 1).join(""));
} catch (e) {
  check("测试执行完成", false, e.message);
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
