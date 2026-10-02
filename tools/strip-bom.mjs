/**
 * 去掉源码里的 UTF-8 BOM。
 *
 * 为什么需要：在某些 Windows 环境下用 PowerShell 的 Set-Content -Encoding UTF8
 * 写文件会带上 BOM。带 BOM 的 package.json 会让 Vite 报 JSON 解析错误，
 * 带 BOM 的 vite.config.js 会让 Vite 把它当成 CJS 加载（进而报
 * "@tailwindcss/vite resolved to an ESM file"）。
 *
 * 已挂在 prebuild / predev 上自动执行，也可以手动 `pnpm fix:bom`。
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SKIP = ["node_modules", "dist", ".pnpm-store", "tools/cache", "shots", ".git"];
const EXT = new Set([".js", ".jsx", ".mjs", ".cjs", ".json", ".css", ".html", ".md", ".yaml", ".yml"]);

const fixed = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!EXT.has(path.extname(e.name).toLowerCase())) continue;
    let buf;
    try { buf = fs.readFileSync(p); } catch { continue; }
    if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
      fs.writeFileSync(p, buf.subarray(3));
      fixed.push(path.relative(ROOT, p));
    }
  }
}

walk(ROOT);
if (fixed.length) {
  console.log(`[strip-bom] 已移除 ${fixed.length} 个文件的 UTF-8 BOM：`);
  for (const f of fixed) console.log("  - " + f);
} else {
  console.log("[strip-bom] 没有发现 BOM，源码干净。");
}
