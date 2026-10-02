import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..", process.argv[3] || "dist");
const PORT = Number(process.argv[2] || 5199);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf",
  ".pdf": "application/pdf", ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

// 可压缩的文本类型（题库 JSON 加起来 6MB+，压缩后约 1/4，首次搜索与组卷会快很多）
const COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".css", ".json", ".svg", ".txt", ".map"]);
const MIN_COMPRESS = 1024;
// 小型 LRU：同一个文件反复请求时不必重复压缩
const cache = new Map();
const CACHE_MAX = 40;

function pickEncoding(req) {
  const ae = String(req.headers["accept-encoding"] || "");
  if (/\bbr\b/.test(ae)) return "br";
  if (/\bgzip\b/.test(ae)) return "gzip";
  return null;
}

function compress(file, stat, enc) {
  const key = file + "|" + stat.mtimeMs + "|" + enc;
  if (cache.has(key)) return cache.get(key);
  const raw = fs.readFileSync(file);
  const buf = enc === "br"
    ? zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } })
    : zlib.gzipSync(raw, { level: 6 });
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, buf);
  return buf;
}

const server = http.createServer((req, res) => {
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname); }
  catch { res.writeHead(400); return res.end("bad request"); }

  let file = path.join(ROOT, urlPath);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end("forbidden"); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file)) file = path.join(ROOT, "index.html"); // SPA fallback
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end("not found"); }

  const ext = path.extname(file).toLowerCase();
  const stat = fs.statSync(file);
  const base = {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600",
    "Access-Control-Allow-Origin": "*",
    Vary: "Accept-Encoding",
  };

  const enc = COMPRESSIBLE.has(ext) && stat.size >= MIN_COMPRESS ? pickEncoding(req) : null;
  if (enc) {
    let buf;
    try { buf = compress(file, stat, enc); }
    catch { buf = null; }
    if (buf) {
      res.writeHead(200, { ...base, "Content-Encoding": enc, "Content-Length": buf.length });
      return res.end(req.method === "HEAD" ? undefined : buf);
    }
  }
  res.writeHead(200, { ...base, "Content-Length": stat.size });
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`kaoyan-quiz static server (brotli/gzip enabled)`);
  console.log(`root: ${ROOT}`);
  console.log(`url:  http://127.0.0.1:${PORT}/`);
});
