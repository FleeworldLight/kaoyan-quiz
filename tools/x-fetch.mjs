/**
 * x-fetch.mjs — 用 Node 的 fetch 抓 URL 并落盘（PowerShell 的 Invoke-WebRequest 在本机连不出去）
 * 用法：node tools/x-fetch.mjs <url> [outFile] [--binary] [--json]
 *   不给 outFile 时只打印前 800 字符
 */
import fs from "node:fs";
import path from "node:path";

const url = process.argv[2];
const out = process.argv[3];
const binary = process.argv.includes("--binary");
if (!url) { console.log("usage: node tools/x-fetch.mjs <url> [outFile] [--binary]"); process.exit(1); }

const HDR = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "accept": binary ? "*/*" : "text/html,application/xhtml+xml,application/json,*/*",
};

try {
  const res = await fetch(url, { headers: HDR, redirect: "follow" });
  console.log("status=" + res.status + " " + res.headers.get("content-type") + " len=" + (res.headers.get("content-length") || "?"));
  if (binary) {
    const buf = Buffer.from(await res.arrayBuffer());
    if (out) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, buf); console.log("saved " + out + " (" + buf.length + " bytes)"); }
    else console.log("binary, " + buf.length + " bytes: " + buf.slice(0, 16).toString("hex"));
  } else {
    const txt = await res.text();
    if (out) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, txt, "utf8"); console.log("saved " + out + " (" + txt.length + " chars)"); }
    else console.log(txt.slice(0, 1500));
  }
} catch (e) {
  console.log("ERR " + e.message);
}
