import fs from "node:fs";
const ALT = "tools/cache/alt";
for (const y of [2024, 2025]) {
  const t = fs.readFileSync(`${ALT}/csgrad-study_methods__408quiz__${y}__content.md`, "utf8");
  const blocks = t.split(/\n(?=#####\s*\d{1,3}\s*$)/m);
  console.log(`=== ${y} blocks=${blocks.length}`);
  for (const b of blocks) {
    const h = b.match(/^#####\s*(\d{1,3})\s*$/m);
    if (!h) continue;
    const n = Number(h[1]);
    if (n < 41) continue;
    const lines = b.split("\n");
    const tagIdx = [];
    lines.forEach((L, i) => { if (/^\[[^\]]+\]\(\/study_methods\/tags\//.test(L.trim())) tagIdx.push(i); });
    const last = tagIdx.length ? tagIdx[tagIdx.length - 1] : -1;
    // 规则：答案起点 = 最后一个 tag 链接行之后，或题干结束（“请回答下列问题”）之后，
    // 取二者较晚者，再向后找第一个形如 1）/（1）/(1)/一、 的行
    let anchor = last;
    const stemEnd = lines.findIndex((L) => /请回答下列问题|要求[:：]\s*$/.test(L));
    if (stemEnd > anchor) anchor = stemEnd;
    let start = -1;
    for (let i = anchor + 1; i < lines.length; i++) {
      if (/^\s*[（(]?\s*1\s*[）)]\s*\S/.test(lines[i]) || /^\s*一[、.]\s*\S/.test(lines[i])) { start = i; break; }
    }
    console.log(` q${n} lines=${lines.length} tagLines=${JSON.stringify(tagIdx)} stemEnd=${stemEnd} start=${start}`);
    console.log(`    START: ${JSON.stringify((lines[start] || "").slice(0, 130))}`);
    console.log(`    START+1: ${JSON.stringify((lines[start + 1] || "").slice(0, 130))}`);
  }
}
