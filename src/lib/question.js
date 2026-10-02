/** 题目相关的纯函数与常量，供练习页/错题本/收藏本等多处复用 */

export const TYPE_META = {
  single: { label: "单选题", short: "单选" },
  multiple: { label: "多选题", short: "多选" },
  blank: { label: "填空题", short: "填空" },
  essay: { label: "主观题", short: "主观" },
};

export function normMultiple(a) {
  return String(a || "").split("").filter((c) => /[A-D]/.test(c)).sort().join("");
}

/** 只有“有选项的客观题”才自动评分 */
export function isAutoGraded(q) {
  return (q?.type === "single" || q?.type === "multiple") && (q?.options || []).length > 0;
}

/** 返回 true / false / null(无法判定：未作答或主观题) */
export function isCorrect(q, ans) {
  if (!isAutoGraded(q)) return null;
  if (ans === undefined || ans === null || ans === "") return null;
  if (q.type === "single") return String(ans) === String(q.answer || "").trim();
  if (q.type === "multiple") return normMultiple(ans) === normMultiple(q.answer);
  return null;
}

export function isAnswered(q, ans) {
  if (q.type === "multiple") return !!String(ans || "").length;
  return ans !== undefined && ans !== null && ans !== "";
}

/** 统计一组题目的客观题得分与正确率 */
export function scoreOf(questions, answers) {
  let correct = 0, wrong = 0, blank = 0, auto = 0, score = 0, full = 0;
  const bySection = new Map();
  for (const x of questions) {
    const autoQ = isAutoGraded(x);
    const sec = x.sectionName || "题目";
    if (!bySection.has(sec)) bySection.set(sec, { name: sec, right: 0, total: 0, auto: 0 });
    const rec = bySection.get(sec);
    if (autoQ) {
      auto++; rec.auto++;
      full += x.score || 0;
      const r = isCorrect(x, answers[x.id]);
      if (r === true) { correct++; rec.right++; rec.total++; score += x.score || 0; }
      else if (r === false) { wrong++; rec.total++; }
      else blank++;
    }
  }
  return {
    correct, wrong, blank, auto, score, full,
    answered: questions.filter((x) => isAnswered(x, answers[x.id])).length,
    total: questions.length,
    accuracy: auto ? correct / auto : 0,
    bySection: [...bySection.values()],
  };
}

export function optionKeysOf(q) {
  return (q.options || []).map((o) => o.key);
}

/** 题干提到图（「如下图」「如图所示」等）但没有配图时，前端要提示对照原卷 */
export function figureMissing(q) {
  if (!q) return false;
  if ((q.images || []).length > 0) return false;
  return /如下图|如图|下图|上图|图\s*\d+\s*所示|见\s*图|图示/.test(String(q.stem || ""));
}