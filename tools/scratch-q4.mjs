import fs from "node:fs";
const file = process.argv[2];
const no = process.argv[3];
const h = fs.readFileSync(file, "utf8").replace(/<!--[\s\S]*?-->/g, "");
const i = h.indexOf(`id="question${no}"`);
const j = h.indexOf(`id="question${Number(no) + 1}"`);
const b = h.slice(i, j > 0 ? j : i + 12000);
const k = b.indexOf("subject-options");
console.log(b.slice(Math.max(0, b.lastIndexOf("<div", k)), k + 3000));
