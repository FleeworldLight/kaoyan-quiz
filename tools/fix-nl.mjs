import fs from "node:fs";
const p = "G:/期末及简历和别的项目/考研资料/kaoyan-quiz/tools/build-cs408.mjs";
let t = fs.readFileSync(p, "utf8");
const before = (t.match(/\\n/g) || []).length;
t = t.split("\\n").join("\n");
t = t.split("/\\\\s/g").join("/\\s/g");
fs.writeFileSync(p, t, "utf8");
console.log("replaced", before, "literal \\n");
