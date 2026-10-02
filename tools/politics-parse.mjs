import fs from "node:fs";

export const YY = "G:/期末及简历和别的项目/考研资料/kaoyan-quiz/tools/cache/yy";
export const KYZZ = "G:/期末及简历和别的项目/考研资料/kaoyan-quiz/tools/cache/kyzz";

// 归一化：去掉空白、标点、字母选项前缀，便于跨源比较文本
export function norm(s) {
  return String(s ?? "")
    .replace(/^[A-D]\s*[\.、．)）]\s*/, "")
    .replace(/[\s\u3000]+/g, "")
    .replace(/[，。、；：！？（）()\[\]【】"'"'“”‘’《》…—\-—_,.;:!?"']/g, "")
    .toLowerCase();
}
export const AB = s => String(s ?? "").split("").filter(c => /[A-D]/.test(c)).sort().join("");

/** 解析 yy 的一份 md 卷子 -> { year, questions: [{no, type, stem, options:[{key,text}], answer, rawTail}] } */
export function parseYY(year) {
  const raw = fs.readFileSync(`${YY}/${year}.md`, "utf8");
  // 切块：以 **n.** 为分隔
  const parts = raw.split(/\n(?=\*\*\d{1,2}\.\*\*)/);
  const questions = [];
  for (const p of parts) {
    const m = p.match(/^\*\*(\d{1,2})\.\*\*\s*([\s\S]*)$/);
    if (!m) continue;
    const no = Number(m[1]);
    let body = m[2];
    // 答案
    let answer = "";
    const am = body.match(/【答案】\s*([A-D]{1,4})/);
    if (am) answer = AB(am[1]);
    const km = body.match(/【(?:答案要点|参考答案|答案)】\s*([\s\S]*)$/);
    // 选项：行首 A. / B. / C. / D.
    const opts = [];
    const lines = body.split("\n");
    let stemLines = [];
    let optText = {};
    let inOpts = false;
    let tail = null;
    for (const L0 of lines) {
      const L = L0.trim();
      if (!L) continue;
      if (/^---$/.test(L)) continue;
      if (/^【答案】/.test(L)) { inOpts = false; continue; }
      if (/^【(?:答案要点|参考答案)】/.test(L)) { inOpts = false; tail = [L.replace(/^【[^】]*】/, "")]; continue; }
      if (tail) { tail.push(L); continue; }
      const om = L.match(/^([A-D])\s*[\.、．)）]\s*(.+)$/);
      if (om && !optText[om[1]]) { optText[om[1]] = om[2].trim(); inOpts = true; continue; }
      if (inOpts && optText[Object.keys(optText).pop()]) {
        // 续行：接在上一个选项后面
        const last = Object.keys(optText).pop();
        optText[last] += " " + L;
        continue;
      }
      stemLines.push(L);
    }
    for (const k of ["A", "B", "C", "D"]) if (optText[k]) opts.push({ key: k, text: optText[k] });
    const type = no <= 16 ? "single" : no <= 33 ? "multiple" : "essay";
    questions.push({
      no, type,
      stem: stemLines.join(" ").trim(),
      options: type === "essay" ? [] : opts,
      answer: type === "essay" ? (tail ? tail.join("\n").trim() : "") : answer,
      hasTail: !!tail,
    });
  }
  return { year, questions };
}

/** 解析 kyzz 一年的 json */
export function parseKyzz(year) {
  const j = JSON.parse(fs.readFileSync(`${KYZZ}/${year}.json`, "utf8"));
  return j.detail.timu.map(t => {
    const opts = JSON.parse(t.xuanxiang);
    return {
      no: Number(t.num),
      type: t.type === "单选" ? "single" : "multiple",
      stem: String(t.title || "").trim(),
      options: ["A", "B", "C", "D"].filter(k => opts[k] !== undefined).map(k => ({ key: k, text: String(opts[k]).replace(/^[A-D]\s*[\.、．]\s*/, "").trim() })),
      answer: AB(String(t.right_text || "").trim()),
      jiexi: String(t.jiexi || "").replace(/<[^>]+>/g, " ").replace(/&ldquo;/g, "“").replace(/&rdquo;/g, "”").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim(),
      top: t.top_kaodian_text || "", p: t.p_kaodian_text || "", lvl: t.kaodian_level_text || "",
      chuchu: t.chuchu || "",
    };
  });
}
