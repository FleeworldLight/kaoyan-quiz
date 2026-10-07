import fs from "node:fs";
const CACHE = "<项目根目录>/tools/cache";
const YEARS = [2009,2010,2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023];

function cleanPaper(raw) {
  const chunks = raw.split("<<PAGE>>");
  const out = [];
  for (const ch of chunks) {
    let c = ch;
    const i = c.indexOf("（共");
    if (i >= 0) { const j = c.indexOf("页）", i); if (j >= 0) c = c.slice(j + 2); }
    c = c.replace(/^\s*\d{4}\s*[^，。]{0,90}?(?:试题|真题)/, "");
    out.push(c);
  }
  let t = out.join("").replace(/\s+/g, " ");
  t = t.replace(/\d{4}\s*年[^，。]{0,90}?试题/g, " ");
  t = t.replace(/\d{4}\s*考研\s*408\s*真题/g, " ");
  t = t.replace(/\d{4}\s*全国硕士研究生招生考试计算机学科专业基础试题/g, " ");
  t = t.replace(/一、\s*单项选择题[（(][^）)]*[）)]/g, " §SINGLE§ ");
  t = t.replace(/二、\s*综合应用题[（(][^）)]*[）)]/g, " §ESSAY§ ");
  return t.replace(/\s+/g, " ").trim();
}

function findOptions(seg) {
  const marks = [];
  const re = /([ABCD])[.．]\s*/g;
  let m;
  while ((m = re.exec(seg))) marks.push({ key: m[1], idx: m.index, end: re.lastIndex });
  for (let i = marks.length - 4; i >= 0; i--) {
    if (marks[i].key !== "A") continue;
    const a = marks[i];
    const b = marks.find(x => x.key === "B" && x.idx > a.idx); if (!b) continue;
    const c = marks.find(x => x.key === "C" && x.idx > b.idx); if (!c) continue;
    const d = marks.find(x => x.key === "D" && x.idx > c.idx); if (!d) continue;
    const between = marks.filter(x => x.idx > a.idx && x.idx < d.idx && x !== b && x !== c);
    if (between.length) continue;
    return { a, b, c, d };
  }
  return null;
}

function splitBody(t, tag) {
  const s = t.indexOf(tag);
  if (s < 0) return null;
  let b = t.slice(s + tag.length);
  b = b.replace(/^[\s]*/, "");
  const e = b.indexOf("§ESSAY§");
  return e < 0 ? b : b.slice(0, e);
}

function parseNumbered(body, nums, optsRequired) {
  const res = {};
  let cursor = 0;
  for (const n of nums) {
    let found = null;
    const re = new RegExp(`${n}[.．](?![0-9])`, "g");
    re.lastIndex = cursor;
    let m;
    while ((m = re.exec(body))) {
      const r2 = new RegExp(`${nums[nums.indexOf(n) + 1] ?? 99}[.．](?![0-9])`, "g");
      r2.lastIndex = m.index + m[0].length;
      const mm = r2.exec(body);
      const segEnd = mm ? mm.index : body.length;
      const seg = body.slice(m.index + m[0].length, segEnd);
      const opt = optsRequired ? findOptions(seg) : true;
      if (opt && seg.trim().length > 4) { found = { start: m.index, end: m.index + m[0].length, seg, opt }; break; }
    }
    res[n] = found;
    if (found) cursor = found.end;
  }
  return res;
}

const report = [];
const store = {};
for (const y of YEARS) {
  const raw = fs.readFileSync(`${CACHE}/rebuild-${y}.txt`, "utf8");
  const t = cleanPaper(raw);
  const sBody = splitBody(t, "§SINGLE§");
  const eBody = splitBody(t, "§ESSAY§");
  const singleNums = Array.from({length:40},(_,i)=>i+1);
  const r = parseNumbered(sBody, singleNums, true);
  const er = eBody ? parseNumbered(eBody, [41,42,43,44,45,46,47], false) : {};
  const ok = Object.values(r).filter(Boolean).length;
  const miss = Object.entries(r).filter(([,v])=>!v).map(([k])=>k);
  const eok = Object.values(er).filter(Boolean).length;
  const emiss = Object.entries(er).filter(([,v])=>!v).map(([k])=>k);
  report.push(`${y}: single ${ok}/40 miss=[${miss.join(",")}]  essay ${eok}/7 miss=[${emiss.join(",")}]`);
  store[y] = {
    singles: Object.fromEntries(Object.entries(r).map(([k,v])=>[k, v ? { stem: v.seg.slice(0, v.opt.a.idx).trim(), options: [v.seg.slice(v.opt.a.end, v.opt.b.idx), v.seg.slice(v.opt.b.end, v.opt.c.idx), v.seg.slice(v.opt.c.end, v.opt.d.idx), v.seg.slice(v.opt.d.end)].map(x=>x.trim()) } : null])),
    essays: Object.fromEntries(Object.entries(er).map(([k,v])=>[k, v ? v.seg.trim() : null])),
  };
}
fs.writeFileSync(`${CACHE}/parse-report.txt`, report.join("\n"), "utf8");
fs.writeFileSync(`${CACHE}/parse-store.json`, JSON.stringify(store, null, 1), "utf8");
console.log(report.join("\n"));
