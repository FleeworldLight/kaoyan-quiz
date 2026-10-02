import { loadPaper, flatten } from "./data.js";

/** 根据 { qid, loc:{s,f} } 列表批量还原题目对象 */
export async function resolveQuestions(entries) {
  const byFile = new Map();
  for (const e of entries) {
    const loc = e.loc || (e.file ? { f: e.file } : null);
    if (!loc || !loc.f) continue;
    if (!byFile.has(loc.f)) byFile.set(loc.f, new Set());
    byFile.get(loc.f).add(e.qid || e.id);
  }
  const out = new Map();
  await Promise.all(
    [...byFile.entries()].map(async ([file, ids]) => {
      const paper = await loadPaper(file).catch(() => null);
      if (!paper) return;
      paper.file = file;
      for (const q of flatten(paper)) if (ids.has(q.id)) out.set(q.id, q);
    })
  );
  return out;
}
