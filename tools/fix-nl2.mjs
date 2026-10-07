import fs from "node:fs";
const p = "<项目根目录>/tools/build-cs408.mjs";
let t = fs.readFileSync(p, "utf8");
t = t.replace(/\.join\("\n"\)/g, '.join("\\n")');
fs.writeFileSync(p, t, "utf8");
console.log("fixed join");
