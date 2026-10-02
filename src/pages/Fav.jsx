import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import RichText from "../components/RichText.jsx";
import { useStore, toggleFav, setNote } from "../lib/store.js";
import { resolveQuestions } from "../lib/locate.js";

const TYPE_LABEL = { single: "单选题", multiple: "多选题", blank: "填空题", essay: "主观题" };

export default function Fav() {
  const s = useStore();
  const [tab, setTab] = useState("fav");
  const [qs, setQs] = useState(null);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState("");

  const favEntries = useMemo(() => Object.entries(s.fav).map(([qid, v]) => ({ qid, ...v })), [s.fav]);
  const noteEntries = useMemo(
    () => Object.entries(s.notes).map(([qid, text]) => {
      const f = s.fav[qid];
      const p = s.progress[qid];
      return { qid, text, loc: f?.loc || p?.loc, subject: f?.subject || p?.subject, addedAt: f?.addedAt || p?.lastAt };
    }),
    [s.notes, s.fav, s.progress]
  );
  const entries = tab === "fav" ? favEntries : noteEntries;

  useEffect(() => {
    let alive = true;
    if (!entries.length) { setQs(new Map()); return; }
    resolveQuestions(entries).then((m) => alive && setQs(m));
    return () => { alive = false; };
  }, [entries]);

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
        <h1 className="page-title">收藏与笔记</h1>
        <div className="row">
          <button className="btn sm" onClick={() => import("../lib/data.js")} style={{ display: "none" }} />
        </div>
      </div>
      <div className="tabs">
        <button className={"tab-btn" + (tab === "fav" ? " active" : "")} onClick={() => setTab("fav")}>⭐ 收藏 {favEntries.length}</button>
        <button className={"tab-btn" + (tab === "note" ? " active" : "")} onClick={() => setTab("note")}>📝 笔记 {noteEntries.length}</button>
      </div>

      {!entries.length && (
        <div className="card empty">
          <p>还没有{tab === "fav" ? "收藏的题目" : "写下的笔记"}。刷题时点题目右上角的 ⭐ / 📝 就会出现在这里。</p>
          <Link className="btn primary" to="/">去刷题</Link>
        </div>
      )}

      {!qs && entries.length > 0 && <div className="boot"><div className="spinner" /></div>}

      <div className="grid" style={{ gap: 12 }}>
        {qs && entries.map((e) => {
          const q = qs.get(e.qid);
          if (!q) return null;
          return (
            <div className="card" key={e.qid}>
              <div className="qhead">
                <span className={"qno " + (q.type === "essay" ? "essay" : q.type === "blank" ? "blank" : "")}>{q.no}</span>
                <span className="qtype">{TYPE_LABEL[q.type]} · {q.subjectName} {q.year}</span>
                <span className="qactions">
                  <button className="btn sm ghost" onClick={() => toggleFav(e.qid, q.subject, { s: q.subject, f: q.file })}>
                    {s.fav[e.qid] ? "⭐ 取消收藏" : "☆ 收藏"}
                  </button>
                  <button className="btn sm ghost" onClick={() => { setEditing(editing === e.qid ? null : e.qid); setDraft(s.notes[e.qid] || ""); }}>
                    📝 笔记
                  </button>
                </span>
              </div>
              <RichText text={q.stem} subject={q.subject} />
              {q.options?.length > 0 && (
                <div className="opts">
                  {q.options.map((o) => (
                    <div key={o.key} className={"opt" + (String(q.answer).includes(o.key) ? " right" : "")}>
                      <span className="key">{o.key}</span>
                      <span className="otext"><RichText text={o.text} subject={q.subject} inline /></span>
                    </div>
                  ))}
                </div>
              )}
              {(s.notes[e.qid] || editing === e.qid) && (
                <div className="explain" style={{ marginTop: 12 }}>
                  <div className="label">我的笔记</div>
                  {editing === e.qid ? (
                    <>
                      <textarea value={draft} onChange={(ev) => setDraft(ev.target.value)} />
                      <div className="navrow">
                        <button className="btn sm primary" onClick={() => { setNote(e.qid, draft); setEditing(null); }}>保存</button>
                        <button className="btn sm ghost" onClick={() => setEditing(null)}>取消</button>
                      </div>
                    </>
                  ) : (
                    <RichText text={s.notes[e.qid]} subject={q.subject} />
                  )}
                </div>
              )}
              {q.explanation && (
                <details style={{ marginTop: 10 }}>
                  <summary className="muted" style={{ cursor: "pointer", fontSize: 13 }}>展开解析</summary>
                  <div style={{ marginTop: 8 }}><RichText text={q.explanation} subject={q.subject} /></div>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
