/**
 * neville-studio 的 answers/2024-answer.pdf、2025-answer.pdf 是扫描件（无文本层），
 * 但内部是 DCTDecode(JPEG) 图像。本脚本把每张扫描图抽出来，供人工/视觉核对。
 * 用法: node tools/extract-ans-images.mjs
 */
import fs from "node:fs";

const OUT = "tools/cache/alt/scan";
fs.mkdirSync(OUT, { recursive: true });

function extractJpegs(buf) {
  const out = [];
  const latin = buf.toString("latin1");
  let i = 0;
  while (true) {
    const f = latin.indexOf("/DCTDecode", i);
    if (f < 0) break;
    const s = latin.indexOf("stream", f);
    if (s < 0) break;
    let p = s + 6;
    if (latin[p] === "\r") p++;
    if (latin[p] === "\n") p++;
    const e = latin.indexOf("endstream", p);
    if (e < 0) break;
    // JPEG 以 FFD9 结束，砍掉尾部填充
    const slice = buf.subarray(p, e);
    let last = -1;
    for (let k = slice.length - 2; k >= 0; k--) if (slice[k] === 0xff && slice[k + 1] === 0xd9) { last = k + 2; break; }
    if (last > 0) out.push(slice.subarray(0, last));
    i = e + 9;
  }
  return out;
}

const report = [];
for (const y of [2024, 2025]) {
  const buf = fs.readFileSync(`tools/cache/rebuild-ans/${y}.pdf`);
  const imgs = extractJpegs(buf);
  let n = 0;
  for (const im of imgs) {
    if (im.length < 5000) continue; // 跳过装饰性小图
    n++;
    const name = `${OUT}/${y}-scan-${String(n).padStart(2, "0")}.jpg`;
    fs.writeFileSync(name, im);
  }
  report.push(`${y}: jpeg=${imgs.length} saved=${n} sizes=[${imgs.map((x) => x.length).join(",")}]`);
}
console.log(report.join("\n"));
fs.writeFileSync(`${OUT}/extract-report.txt`, report.join("\n"), "utf8");
