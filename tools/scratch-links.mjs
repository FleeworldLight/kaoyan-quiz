import fs from "node:fs";
const files = process.argv.slice(2);
for (const f of files) {
  const h = fs.readFileSync(f, "utf8");
  const es = [...new Set([...h.matchAll(/exam_solution\/(\d+)/g)].map((m) => m[1]))];
  const links = [...new Set([...h.matchAll(/href="(\/(?:Practice|post|News|Course)[^"]*)"/g)].map((m) => m[1]))];
  console.log("=== " + f);
  console.log("  exam_solution refs: " + es.join(","));
  console.log("  other links (" + links.length + "): " + links.slice(0, 60).join(" | "));
}
