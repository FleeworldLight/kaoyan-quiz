/** 对比 dist/data 里的旧快照与当前 public/data，确认差异只在 images 字段 */
import fs from "node:fs";
const strip = (o) => {
  const c = JSON.parse(JSON.stringify(o));
  for (const s of c.sections || []) for (const q of s.questions || []) delete q.images;
  return c;
};
for (let y = 2009; y <= 2025; y++) {
  const a = JSON.parse(fs.readFileSync(`dist/data/cs408/${y}.json`, "utf8"));
  const b = JSON.parse(fs.readFileSync(`public/data/cs408/${y}.json`, "utf8"));
  const sa = JSON.stringify(strip(a)), sb = JSON.stringify(strip(b));
  const imgA = a.sections.flatMap((s) => s.questions).flatMap((q) => q.images || []).length;
  const imgB = b.sections.flatMap((s) => s.questions).flatMap((q) => q.images || []).length;
  console.log(`${y}: 去 images 后${sa === sb ? "完全一致" : "★不一致★"}  图数 dist=${imgA} 现在=${imgB}`);
  if (sa !== sb) {
    // 逐题找差异
    for (const s of a.sections) for (const q of s.questions) {
      const q2 = (b.sections.find((x) => x.id === s.id) || {}).questions?.find((x) => x.no === q.no);
      if (!q2) { console.log(`   ${y} q${q.no} 在新文件中缺失`); continue; }
      const s1 = JSON.stringify({ ...q, images: 0 }), s2 = JSON.stringify({ ...q2, images: 0 });
      if (s1 !== s2) console.log(`   ${y} q${q.no} 不同:\n     dist: ${s1.slice(0, 200)}\n     now : ${s2.slice(0, 200)}`);
    }
    const ka = Object.keys(a).filter((k) => k !== "sections");
    for (const k of ka) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) console.log(`   卷级字段 ${k} 不同:\n     dist: ${JSON.stringify(a[k]).slice(0, 200)}\n     now : ${JSON.stringify(b[k]).slice(0, 200)}`);
  }
}
