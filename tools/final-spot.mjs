import fs from "node:fs";

function show408(year, nos) {
  const p = JSON.parse(fs.readFileSync(`public/data/cs408/${year}.json`, "utf8"));
  const qs = p.sections.flatMap((s) => s.questions);
  console.log(`\n══════════ 408 ${year}（题干/选项来源：neville papers-rebuild/${year}.pdf；答案：三源互证）══════════`);
  for (const no of nos) {
    const q = qs.find((x) => x.no === no);
    console.log(`\n--- Q${q.no} [${q.type}] answer=${JSON.stringify(String(q.answer).slice(0, 60))} score=${q.score} topics=${JSON.stringify(q.topics)}`);
    console.log("题干: " + q.stem.replace(/\s+/g, " "));
    for (const o of q.options) console.log(`  ${o.key}. ${o.text}`);
    console.log("解析(节选): " + String(q.explanation).replace(/\s+/g, " ").slice(0, 260));
  }
}

function showPolitics(year, nos) {
  const p = JSON.parse(fs.readFileSync(`public/data/politics/${year}.json`, "utf8"));
  const qs = p.sections.flatMap((s) => s.questions);
  console.log(`\n══════════ 政治 ${year}（来源 ${p.source.name}）══════════`);
  for (const no of nos) {
    const q = qs.find((x) => x.no === no);
    console.log(`\n--- Q${q.no} [${q.type}] answer=${JSON.stringify(String(q.answer).slice(0, 70))} verify=${q.verify} subjectHint=${q.subjectHint} chapterTopics=${JSON.stringify(q.chapterTopics)}`);
    if (q.answerDisputed) console.log("  ⚠ answerDisputed: " + q.answerNote);
    console.log("题干: " + q.stem.replace(/\s+/g, " ").slice(0, 400));
    for (const o of q.options) console.log(`  ${o.key}. ${o.text}`);
    if (q.type === "essay") console.log("参考答案(节选): " + String(q.answer).replace(/\s+/g, " ").slice(0, 320));
    else console.log("解析(节选): " + String(q.explanation).replace(/\s+/g, " ").slice(0, 200));
  }
}

show408(2024, [1, 2, 41]);
show408(2025, [1, 2, 41]);
showPolitics(2025, [1, 21, 34]);
