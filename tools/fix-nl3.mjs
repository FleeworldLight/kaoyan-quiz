import fs from "node:fs";
const p = "G:/期末及简历和别的项目/考研资料/kaoyan-quiz/tools/build-cs408.mjs";
let t = fs.readFileSync(p, "utf8");
t = t.replace("function extractAnswers(text) {", "function extractAnswers(text, year) {");
t = t.replace("const A = extractAnswers(atext);", "const A = extractAnswers(atext, y);");
fs.writeFileSync(p, t, "utf8");
console.log("patched year param");
