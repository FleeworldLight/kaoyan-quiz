/** 为冲突题目补 note 字段，并在卷级写入校验摘要 */
import fs from "node:fs";
import path from "node:path";
const ROOT = "G:/期末及简历和别的项目/考研资料/kaoyan-quiz";
const DIR = path.join(ROOT, "public/data/politics");
const rep = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/cache/build-report.json"), "utf8"));
const byYear = new Map(rep.years.map(y => [y.year, y]));

const EXTRA = {
  "2010-31": "学信网 chsi 官方答案为 BD；mrwoov/kyzz 自带解析自述为 AB。两者对「政治权利和自由」的界定不同，公开真题答案以 BD 为准。",
  "2010-2": "学信网 chsi 官方答案为 D；kyzz 解析主张量变质变故为 C。本题考查「坚持就是胜利」的哲理，公开真题答案以 D 为准。",
  "2010-25": "学信网 chsi 官方答案为 ABCD；kyzz 解析为 ACD（认为 B 属世界潮流而非历史文化传统）。以 chsi 官方答案为准。",
  "2010-26": "学信网 chsi 官方答案为 AB；kyzz 解析为 ABD。以 chsi 官方答案为准。",
  "2021-23": "中国教育在线 eol.cn 官方答案给 AB，但 kyzz 解析明确「数字经济已成为新引擎」属正确项、仅排除 D，本库取 ABC。请以当年官方答案卡为准。",
  "2020-2": "新东方 2020 真题解析（选项顺序与本题不同）给 D「价值性评价」；kyzz 解析亦主张「价值评价」，但 kyzz 的字母标注为 C。本库沿用来原始源（yy）的 C，此项存疑。",
  "2020-17": "kyzz 答案与本题一致（BCD），但其选项顺序不同，内容对齐后出现分歧，未能判定。",
  "2020-19": "kyzz 答案与本题一致（BCD），但其选项顺序不同，内容对齐后出现分歧，未能判定。",
  "2020-21": "kyzz 答案与本题一致（BCD），但其选项顺序不同，内容对齐后出现分歧，未能判定。",
};

let n = 0;
for (const f of fs.readdirSync(DIR).filter(x => /^\d{4}\.json$/.test(x))) {
  const p = path.join(DIR, f);
  const paper = JSON.parse(fs.readFileSync(p, "utf8"));
  const r = byYear.get(paper.year);
  paper.verification.conflictList = (r.notes || []);
  for (const sec of paper.sections) for (const q of sec.questions) {
    const key = `${paper.year}-${q.no}`;
    if (q.verify && q.verify.startsWith("CONFLICT")) {
      q.note = EXTRA[key] || "本题在独立数据集 mrwoov/kyzz 中的答案与本库不一致（两库选项顺序不同，已按选项文本内容对齐后仍冲突）。本库暂用来原始源答案，请以官方答案为准。";
      n++;
    }
  }
  fs.writeFileSync(p, JSON.stringify(paper, null, 2), "utf8");
}
console.log("已为", n, "道冲突题补 note");
