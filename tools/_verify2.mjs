/** 比较 snap1(改前) / snap2(build 之后) / snap3(build+attach 之后) */
import fs from "node:fs";
const rd = (dir, f) => JSON.parse(fs.readFileSync(`${dir}/${f}`, "utf8"));
const strip = (o) => { const c = JSON.parse(JSON.stringify(o)); for (const s of c.sections || []) for (const q of s.questions || []) delete q.images; return c; };
const files = fs.readdirSync("tools/cache/img/snap1").sort();
const cmp = (a, b, label) => {
  const A = rd("tools/cache/img/snap1", a), B = rd("tools/cache/img/snap3", b);
  const same = JSON.stringify(strip(A)) === JSON.stringify(strip(B));
  const full = JSON.stringify(A) === JSON.stringify(B);
  const imgs = (o) => o.sections.flatMap((s) => s.questions).map((q) => (q.images || []).length).reduce((x, y) => x + y, 0);
  console.log(`${a}: 去图后${same ? "一致" : "★不一致★"} 含图${full ? "一致" : "不同"} 图数 snap1=${imgs(A)} snap3=${imgs(B)}`);
};
console.log("=== snap1（改前） vs snap3（build+attach 后，含图） ===");
for (const f of files) cmp(f, f);
console.log("\n=== snap2（只跑 build，未挂图） vs snap3 ===");
for (const f of files) {
  const A = rd("tools/cache/img/snap2", f), B = rd("tools/cache/img/snap3", f);
  const same = JSON.stringify(strip(A)) === JSON.stringify(strip(B));
  if (!same) {
    console.log(`${f}: 去图后★不一致★`);
    for (const s of A.sections) for (const q of s.questions) {
      const q2 = (B.sections.find((x) => x.id === s.id) || {}).questions?.find((x) => x.no === q.no);
      const s1 = JSON.stringify({ ...q, images: 0 }), s2 = JSON.stringify({ ...q2, images: 0 });
      if (s1 !== s2) console.log(`   q${q.no}:\n     snap2=${s1.slice(0, 160)}\n     snap3=${s2.slice(0, 160)}`);
    }
    for (const k of Object.keys(A)) if (k !== "sections" && JSON.stringify(A[k]) !== JSON.stringify(B[k])) console.log(`   卷级 ${k} 不同`);
  }
}
console.log("\n=== snap1 vs snap2（只跑 build） 卷级/题目非图字段 ===");
for (const f of files) {
  const A = rd("tools/cache/img/snap1", f), B = rd("tools/cache/img/snap2", f);
  const same = JSON.stringify(strip(A)) === JSON.stringify(strip(B));
  if (!same) {
    console.log(`${f}: ★不一致★`);
    for (const k of Object.keys(A)) if (k !== "sections" && k !== "images" && JSON.stringify(A[k]) !== JSON.stringify(B[k])) console.log(`   卷级 ${k}: snap1=${JSON.stringify(A[k]).slice(0, 120)} | snap2=${JSON.stringify(B[k]).slice(0, 120)}`);
    let n = 0;
    for (const s of A.sections) for (const q of s.questions) {
      const q2 = (B.sections.find((x) => x.id === s.id) || {}).questions?.find((x) => x.no === q.no);
      if (JSON.stringify({ ...q, images: 0 }) !== JSON.stringify({ ...q2, images: 0 })) {
        n++;
        if (n <= 3) console.log(`   q${q.no}:\n     snap1=${JSON.stringify({ ...q, images: 0 }).slice(0, 150)}\n     snap2=${JSON.stringify({ ...q2, images: 0 }).slice(0, 150)}`);
      }
    }
    console.log(`   共 ${n} 题不同`);
  }
}
