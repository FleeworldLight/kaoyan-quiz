import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import RichText from "../components/RichText.jsx";
import { useStore, clearWrong, exportWrong, setNote } from "../lib/store.js";
import { resolveQuestions } from "../lib/locate.js";

const TYPE_LABEL = { single: "单选题", multiple: "多选题", blank: "填空题", essay: "主观题" };

export default function Wrong({ index }) {
  const s = useStore();
  const nav = useNavigate();
  const [qs, setQs] = useState(null);
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(null);

  const entries = useMemo(
    () => Object.entries(s.wrong).map(([qid, w]) => ({ qid, ...w })),
    [s.wrong]
  );
  const filtered = useMemo(
    () => (filter === "all" ? entries : entries.filter((e) => e.subject === filter)),
    [entries, filter]
  );

  useEffect(() => {
    let alive = true;
    if (!filtered.length) { setQs(new Map()); return; }
    resolveQuestions(filtered).then((m) => alive && setQs(m));
    return () => { alive = false; };
  }, [filtered]);

  function doExport() {
    const data = exportWrong();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `错题本-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const counts = useMemo(() => {
    const m = new Map();
    for (const e of entries) m.set(e.subject, (m.get(e.subject) || 0) + 1);
    return m;
  }, [entries]);

  if (!entries.length) {
    return (
      <div className="card empty">
        <p style={{ fontSize: 40, margin: 0 }}>🎉</p>
        <p>错题本还是空的。去刷几道题，答错的会自动收进来。</p>
        <Link className="btn primary" to="/">开始刷题</Link>
      </div>
    );
  }

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
        <h1 className="page-title">错题本 <span className="muted" style={{ fontSize: 15 }}>{entries.length} 题</span></h1>
        <div className="row">
          <button className="btn sm" onClick={() => nav("/run?mode=wrong")}>重做全部错题</button>
          <button className="btn sm" onClick={doExport}>导出 JSON</button>
          <button className="btn sm danger" onClick={() => { if (confirm("确定清空整个错题本？")) clearWrong(); }}>清空</button>
        </div>
      </div>
      <p className="page-sub">按科目筛选，点开可以看正确答案和解析。</p>

      <div className="row" style={{ marginBottom: 14 }}>
        <button className={"chip" + (filter === "all" ? " on" : "")} onClick={() => setFilter("all")}>全部 {entries.length}</button>
        {index.subjects.map((sub) => {
          const c = counts.get(sub.id) || 0;
          if (!c) return null;
          return (
            <button key={sub.id} className={"chip" + (filter === sub.id ? " on" : "")} onClick={() => setFilter(sub.id)}>
              {sub.name} {c}
            </button>
          );
        })}
      </div>

      {!qs && <div className="boot"><div className="spinner" /></div>}

      <div className="grid" style={{ gap: 12 }}>
        {qs && filtered.map((e) => {
          const q = qs.get(e.qid);
          if (!q) return null;
          const isOpen = open === e.qid;
          return (
            <div className="card" key={e.qid}>
              <div className="qhead">
                <span className={"qno " + (q.type === "essay" ? "essay" : q.type === "blank" ? "blank" : "")}>{q.no}</span>
                <span className="qtype">{TYPE_LABEL[q.type]} · {q.subjectName} {q.year}</span>
                <span className="tag q-low">错 {e.wrongCount || 1} 次</span>
                {q.answerNote && <span className="tag q-note" title={q.answerNote}>答案存疑</span>}
                <span className="qactions">
                  <button className="btn sm ghost" onClick={() => setOpen(isOpen ? null : e.qid)}>{isOpen ? "收起" : "查看答案"}</button>
                  <button className="btn sm ghost" onClick={() => clearWrong(e.qid)}>移出</button>
                </span>
              </div>
              {q.material && isOpen && (
                <div className="material"><RichText text={q.material} subject={q.subject} /></div>
              )}
              <RichText text={q.stem} subject={q.subject} />
              {isOpen && q.options?.length > 0 && (
                <div className="opts">
                  {q.options.map((o) => (
                    <div key={o.key} className={"opt" + (String(q.answer).includes(o.key) ? " right" : "")}>
                      <span className="key">{o.key}</span>
                      <span className="otext"><RichText text={o.text} subject={q.subject} inline /></span>
                    </div>
                  ))}
                </div>
              )}
              {isOpen && (
                <div className="explain">
                  <div className="label">正确答案 <span className="anskey">{q.answer || "见解析"}</span></div>
                  {q.explanation && <RichText text={q.explanation} subject={q.subject} />}
                  {!q.explanation && !q.answer && <p className="muted">该题没有收录答案。</p>}
                  <div className="row" style={{ marginTop: 10 }}>
                    <button className="btn sm" onClick={() => nav(`/run?mode=paper&subject=${q.subject}&year=${q.year}`)}>
                      去原卷（{q.year}）第 {q.no} 题
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
