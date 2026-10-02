import fs from "node:fs";
const p = "G:/期末及简历和别的项目/考研资料/kaoyan-quiz/tools/build-cs408.mjs";
let t = fs.readFileSync(p, "utf8");
t = t.replace('  if (choiceCount < 40 || noAnswer > 0 || emptyOpt > 2) quality = "medium";',
              '  if (choiceCount < 40 || noAnswer > 0 || emptyOpt > 0) quality = "medium";');
t = t.replace('  const noTopic = questions.filter(q => q.topics.length === 0).length;',
              '  const noTopic = questions.filter(q => q.topics.length === 0).length;\n  const explMissing = questions.filter(q => q.type === "single" && !q.explanation).length;');
t = t.replace('    source: paper.source.name, sourceUrl: paper.source.url, answerSource: adesc,\n  });',
              '    source: paper.source.name, sourceUrl: paper.source.url, answerSource: adesc,\n    explanationMissing: explMissing, emptyOptionQuestions: emptyOpt,\n  });');
t = t.replace('  coverage: { years: YEARS, count: YEARS.length, note: "2009–2023 全部 15 年，每年 40 单选 + 7 综合" },',
              `  coverage: { years: YEARS, count: YEARS.length, note: "2009–2023 全部 15 年，每年 40 单选 + 7 综合" },
  knownLimitations: [
    "所有题目均未采集图片（images 为空）。408 真题中相当一部分题目带插图（树/图/表格/Cache 结构图等），此类题目的题干会以『如下图』『如下表』引用缺失的图，需查阅原卷 PDF。",
    "有 3 道单选题的 A/B/C/D 四个选项本身就是图片（2009 q4、2010 q3、2017 q8），options 文本为空字符串，题干保留原文。",
    "选项与题干为 PDF 文本层抽取结果，部分公式/上下标（如 log2n、2^n、n^2）在文本层中丢失上下标格式，显示为 log2n、O(n2) 等。",
    "少数解析在源 PDF 文本层中缺失（见各年 explanationMissing 字段）。",
  ],`);
fs.writeFileSync(p, t, "utf8");
console.log("patched manifest");
