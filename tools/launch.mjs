#!/usr/bin/env node
/**
 * 一键启动器（由 启动刷题.cmd 调用）。
 *
 * 为什么逻辑放在 Node 而不是 .cmd 里：
 *   cmd.exe 按系统 OEM 代码页（中文 Windows 是 GBK）逐行读取批处理文件，
 *   如果 .cmd 里写了 UTF-8 中文、又用 chcp 改代码页，cmd 计算的文件字节偏移会错位，
 *   于是会跳到行中间执行，报出「'构建产物' 不是内部或外部命令」这种诡异错误。
 *   所以现在的约定是：.cmd 只放纯 ASCII，所有中文输出与判断都在这里做。
 *
 * 做四件事：
 *   1. 检查 Node 版本
 *   2. 缺依赖就装、缺 dist 就构建（有 dist 就跳过）
 *   3. 找一个空闲端口（默认 5199，被占用就往后试）
 *   4. 起静态服务并打开浏览器
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
process.chdir(ROOT);

const PREFERRED_PORT = Number(process.env.KQ_PORT || 5199);
const MAX_PORT_TRIES = 20;

const c = {
  reset: "\x1b[0m", dim: "\x1b[2m", bold: "\x1b[1m",
  green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m", cyan: "\x1b[36m",
};
const say = (...a) => console.log(...a);

function banner() {
  say("");
  say(c.bold + "  考研刷题  " + c.reset + c.dim + "政治 / 英语一 / 数学一 / 408" + c.reset);
  say(c.dim + "  " + "─".repeat(52) + c.reset);
}

/* ---------------------------- 1. Node 版本 ---------------------------- */
const major = Number(process.versions.node.split(".")[0]);
if (major < 18) {
  say(c.red + `\n  ✗ Node.js 版本过低（当前 ${process.versions.node}），请升级到 18 或更高。` + c.reset);
  process.exit(1);
}

/* ---------------------------- 2. 依赖与构建 ---------------------------- */
const hasModules = fs.existsSync(path.join(ROOT, "node_modules", "vite"));
const hasDist = fs.existsSync(path.join(ROOT, "dist", "index.html"));

function run(cmd, args, label) {
  say(c.dim + `  $ ${cmd} ${args.join(" ")}` + c.reset);
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" });
    p.on("close", (code) => resolve(code === 0));
    p.on("error", () => resolve(false));
  });
}

async function ensureReady() {
  if (!hasModules) {
    say(c.yellow + "  首次运行：正在安装依赖（可能要几分钟）…" + c.reset);
    let ok = await run("pnpm", ["install", "--node-linker=hoisted"], "pnpm install");
    if (!ok) ok = await run("npm", ["install"], "npm install");
    if (!ok) {
      say(c.red + "\n  ✗ 依赖安装失败。请先手动执行 pnpm install --node-linker=hoisted 看具体报错。" + c.reset);
      return false;
    }
  }

  if (!hasDist || process.argv.includes("--rebuild")) {
    say(c.yellow + "  正在构建前端…" + c.reset);
    let ok = await run("pnpm", ["run", "build"], "pnpm run build");
    if (!ok) ok = await run("npm", ["run", "build"], "npm run build");
    if (!ok || !fs.existsSync(path.join(ROOT, "dist", "index.html"))) {
      say(c.red + "\n  ✗ 构建失败。请手动执行 pnpm run build 看具体报错。" + c.reset);
      return false;
    }
  } else {
    say(c.dim + "  已有构建产物 dist/，跳过构建（要强制重建请运行：node tools/launch.mjs --rebuild）" + c.reset);
  }
  return true;
}

/* ---------------------------- 3. 找空闲端口 ---------------------------- */
function isFree(port) {
  return new Promise((resolve) => {
    const srv = http.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, "127.0.0.1");
  });
}
async function findPort() {
  for (let i = 0; i < MAX_PORT_TRIES; i++) {
    const p = PREFERRED_PORT + i;
    if (await isFree(p)) return p;
  }
  return 0;
}

/* ---------------------------- 4. 起服务 ---------------------------- */
const DIST = path.join(ROOT, "dist");
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2",
  ".ttf": "font/ttf", ".pdf": "application/pdf", ".txt": "text/plain; charset=utf-8",
};

async function main() {
  banner();
  if (!(await ensureReady())) process.exit(1);

  const port = await findPort();
  if (!port) {
    say(c.red + `\n  ✗ ${PREFERRED_PORT}–${PREFERRED_PORT + MAX_PORT_TRIES - 1} 端口都被占用，请先关掉占用的程序。` + c.reset);
    process.exit(1);
  }
  if (port !== PREFERRED_PORT) {
    say(c.yellow + `  注意：${PREFERRED_PORT} 已被占用，改用 ${port}。` + c.reset);
  }

  // 复用 tools/serve.mjs 的逻辑（带 brotli/gzip 压缩）
  const { spawn: sp } = await import("node:child_process");
  const server = sp(process.execPath, [path.join(HERE, "serve.mjs"), String(port), "dist"], {
    cwd: ROOT, stdio: "inherit",
  });
  server.on("close", (code) => {
    say(c.dim + `\n  服务已停止（exit ${code}）。` + c.reset);
  });

  const url = `http://127.0.0.1:${port}/`;
  // 等端口起来再开浏览器
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 150));
    if (!(await isFree(port))) break;
  }
  say("");
  say(c.green + c.bold + `  ✓ 已启动：${url}` + c.reset);
  say(c.dim + "    浏览器没自动打开的话，手动访问上面的地址。" + c.reset);
  say(c.dim + "    关闭这个窗口即可停止服务。" + c.reset);
  say("");

  if (!process.argv.includes("--no-open")) {
    try {
      if (process.platform === "win32") {
        sp("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
      } else if (process.platform === "darwin") {
        sp("open", [url], { detached: true, stdio: "ignore" }).unref();
      } else {
        sp("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
      }
    } catch {
      /* 打不开就算了，地址已经打印出来了 */
    }
  }

  const stop = () => { try { server.kill(); } catch {} process.exit(0); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main();
