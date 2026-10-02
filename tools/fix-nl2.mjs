import fs from "node:fs";
const p = "G:/期末及简历和别的项目/考研资料/kaoyan-quiz/tools/build-cs408.mjs";
let t = fs.readFileSync(p, "utf8");
t = t.replace(/\.join\("\n"\)/g, '.join("\\n")');
fs.writeFileSync(p, t, "utf8");
console.log("fixed join");
