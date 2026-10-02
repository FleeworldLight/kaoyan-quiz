import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useStore, subjectStats, streak } from "../lib/store.js";

export default function Home({ index }) {
  const nav = useNavigate();
  const s = useStore();

  const overall = useMemo(() => {
    let q = 0, choice = 0, papers = 0;
    for (const sub of index.subjects) {
      q += sub.questionCount || 0;
      choice += sub.choiceCount || 0;
      papers += sub.papers?.length || 0;
    }
    const done = Object.keys(s.progress).length;
    let right = 0, wrong = 0;
    for (const p of Object.values(s.progress)) { right += p.right || 0; wrong += p.wrong || 0; }
    return { q, choice, papers, done, right, wrong, acc: right + wrong ? right / (right + wrong) : 0 };
  }, [index, s.progress]);

  return (
    <>
      <div className="hero">
        <h1>考研刷题 · 政治 / 英语一 / 数学一 / 408</h1>
        <p>历年真题为主，KaTeX 公式渲染，错题本与统计看板全在本地浏览器里，不联网也能刷。</p>
        <div className="row">
          <div className="stat"><div className="k">题库总量</div><div className="v">{overall.q}<small> 题</small></div></div>
          <div className="stat"><div className="k">已练题目</div><div className="v">{overall.done}<small> 题</small></div></div>
          <div className="stat"><div className="k">累计正确率</div><div className="v">{Math.round(overall.acc * 100)}<small>%</small></div></div>
          <div className="stat"><div className="k">连续学习</div><div className="v">{streak(s)}<small> 天</small></div></div>
        </div>
      </div>

      <div className="grid c2">
        {index.subjects.map((sub) => {
          const st = subjectStats(s, sub.id);
          const pct = sub.questionCount ? Math.min(100, (st.done / sub.questionCount) * 100) : 0;
          return (
            <div className="card subject-card" key={sub.id} onClick={() => nav(`/s/${sub.id}`)}>
              <div className="sicon" style={{ background: sub.color || "#4f46e5" }}>{sub.icon || sub.name[0]}</div>
              <h3>{sub.fullName || sub.name}</h3>
              <div className="meta">
                {sub.papers?.length || 0} 套卷 · {sub.questionCount || 0} 题 · 选择题 {sub.choiceCount || 0} 题
              </div>
              <div className="progress-line" style={{ marginTop: 12 }}>
                <div className="meter" style={{ flex: 1 }}><i style={{ width: `${pct}%` }} /></div>
                <span>{Math.round(pct)}%</span>
              </div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
                已练 {st.done} 题{st.right + st.wrong > 0 ? ` · 正确率 ${Math.round(st.accuracy * 100)}%` : ""}
              </div>
            </div>
          );
        })}
      </div>

      {index.subjects.length === 0 && (
        <div className="card empty">题库还没有数据，请先生成题库。</div>
      )}
    </>
  );
}
