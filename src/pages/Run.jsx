import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import RichText from "../components/RichText.jsx";
import { buildQueue, parseRunConfig } from "../lib/data.js";
import { useStore, getState, recordAnswer, addRecord, toggleFav, setNote, saveExam, resetExam } from "../lib/store.js";

const TYPE_LABEL = { single: "单选题", multiple: "多选题", blank: "填空题", essay: "解答/主观题" };

function normMultiple(a) {
  return String(a || "").split("").filter((c) => /[A-D]/.test(c)).sort().join("");
}
function isAutoGraded(q) {
  return (q.type === "single" || q.type === "multiple") && (q.options || []).length > 0;
}
function isCorrect(q, ans) {
  if (!isAutoGraded(q)) return null;
  if (ans === undefined || ans === null || ans === "") return null;
  if (q.type === "single") return String(ans) === String(q.answer || "").trim();
  if (q.type === "multiple") return normMultiple(ans) === normMultiple(q.answer);
  return null;
}
function seedFrom(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function permute(arr, seed) {
  const a = [...arr];
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function fmtTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s2 = sec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s2).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/* ------------------------------------------------------------------ */
export default function Run() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const cfg = useMemo(() => parseRunConfig(sp.toString()), [sp]);
  const store = useStore();

  const [queue, setQueue] = useState(null);
  const [err, setErr] = useState(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [revealed, setRevealed] = useState({});
  const [flags, setFlags] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const [left, setLeft] = useState(0);
  const [showSheet, setShowSheet] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");

  const recorded = useRef(new Set());
  const startedAt = useRef(Date.now());
  const examKey = cfg.mode === "paper" ? `${cfg.subject}-${cfg.year}` : null;

  /* --------------------------- 载入题目 --------------------------- */
  useEffect(() => {
    let alive = true;
    setQueue(null); setErr(null); setSubmitted(false); setIdx(0); setAnswers({}); setRevealed({}); setFlags([]);
    recorded.current = new Set();
    startedAt.current = Date.now();
    buildQueue(cfg)
      .then((q) => {
        if (!alive) return;
        if (!q.questions.length) { setErr("该条件下没有题目，换个章节或先积累一些错题吧。"); setQueue(q); return; }
        setQueue(q);
        if (q.exam) {
          setLeft((q.duration || 180) * 60);
          const saved = getState().exams[`${cfg.subject}-${cfg.year}`];
          if (saved && saved.answers && !saved.submittedAt) {
            setAnswers(saved.answers);
            setFlags(saved.flags || []);
            if (saved.startedAt) startedAt.current = saved.startedAt;
          }
        }
      })
      .catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
  }, [sp.toString()]);

  const questions = queue?.questions || [];
  const q = questions[idx];
  const isExam = !!queue?.exam;
  const settings = store.settings;

  /* --------------------------- 计时器 --------------------------- */
  useEffect(() => {
    if (!isExam || submitted || !queue) return;
    const t = setInterval(() => setLeft((v) => (v <= 1 ? 0 : v - 1)), 1000);
    return () => clearInterval(t);
  }, [isExam, submitted, queue]);
  useEffect(() => {
    if (isExam && left === 0 && queue && !submitted) doSubmit();
  }, [left, isExam, queue, submitted]);

  /* --------------------------- 考试状态持久化 --------------------------- */
  useEffect(() => {
    if (!isExam || !examKey || submitted) return;
    saveExam(examKey, { answers, flags, startedAt: startedAt.current, idx });
  }, [answers, flags, isExam, examKey, submitted, idx]);

  /* --------------------------- 记录作答 --------------------------- */
  const commit = useCallback((qq, ok, blank, ansOverride) => {
    if (recorded.current.has(qq.id)) return;
    recorded.current.add(qq.id);
    recordAnswer({
      qid: qq.id, subject: qq.subject, loc: { s: qq.subject, f: qq.file },
      topics: qq.topics || [], correct: ok === true, blank: blank || ok === null,
    });
  }, []);

  function answer(a) {
    if (!q) return;
    if (q.type === "multiple") {
      setAnswers((prev) => {
        const cur = new Set(String(prev[q.id] || "").split(""));
        if (cur.has(a)) cur.delete(a); else cur.add(a);
        return { ...prev, [q.id]: [...cur].sort().join("") };
      });
      return;
    }
    setAnswers((prev) => ({ ...prev, [q.id]: a }));
    if (!isExam && settings.instantReveal) {
      setRevealed((prev) => ({ ...prev, [q.id]: true }));
      commit(q, isCorrect(q, a), false);
    }
  }

  function confirmMultiple() {
    const a = answers[q.id];
    if (!a) return;
    setRevealed((prev) => ({ ...prev, [q.id]: true }));
    commit(q, isCorrect(q, a), false);
  }
  function selfGrade(ok) {
    setRevealed((prev) => ({ ...prev, [q.id]: true }));
    commit(q, ok, false);
  }
  function skipAsBlank() {
    setRevealed((prev) => ({ ...prev, [q.id]: true }));
    commit(q, false, true);
  }

  function doSubmit() {
    if (submitted || !queue) return;
    const answered = questions.filter((x) => answers[x.id]);
    for (const x of answered) commit(x, isCorrect(x, answers[x.id]), false);
    let correct = 0, total = 0;
    for (const x of answered) {
      if (isAutoGraded(x)) {
        total++;
        if (isCorrect(x, answers[x.id])) correct++;
      }
    }
    addRecord({
      subject: queue.questions[0]?.subject || cfg.subject || "mix",
      mode: "exam", paperId: queue.questions[0]?.paperId,
      total: answered.length, correct,
      durationSec: Math.round((Date.now() - startedAt.current) / 1000),
    });
    if (examKey) saveExam(examKey, { answers, flags, startedAt: startedAt.current, submittedAt: Date.now(), correct, total });
    setSubmitted(true);
    setShowSheet(false);
  }

  function finishPractice() {
    const answered = questions.filter((x) => answers[x.id]);
    let correct = 0;
    for (const x of answered) if (isCorrect(x, answers[x.id])) correct++;
    addRecord({
      subject: questions[0]?.subject || cfg.subject || "mix",
      mode: cfg.mode, topic: cfg.topic, paperId: questions[0]?.paperId,
      total: answered.length, correct,
      durationSec: Math.round((Date.now() - startedAt.current) / 1000),
    });
    nav("/stats");
  }

  /* --------------------------- 快捷键 --------------------------- */
  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
      if (!q || submitted) return;
      const k = e.key.toUpperCase();
      if (/^[A-D]$/.test(k)) { answer(k); return; }
      if (/^[1-4]$/.test(k) && q.options && q.options[k - 1]) { answer(q.options[k - 1].key); return; }
      if (e.key === "ArrowRight" || e.key === "Enter") { setIdx((v) => Math.min(v + 1, questions.length - 1)); }
      if (e.key === "ArrowLeft") { setIdx((v) => Math.max(v - 1, 0)); }
      if (k === "F") setFlags((f) => (f.includes(q.id) ? f.filter((x) => x !== q.id) : [...f, q.id]));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [q, submitted, questions.length, answers]);

  /* --------------------------- 渲染分支 --------------------------- */
  if (err) {
    return (
      <div className="card">
        <h2 className="page-title">加载失败</h2>
        <p className="muted">{err}</p>
        <Link className="btn" to="/">返回首页</Link>
      </div>
    );
  }
  if (!queue) return <div className="boot"><div className="spinner" /><p className="muted">正在组卷…</p></div>;

  if (submitted) {
    return <ExamResult queue={queue} answers={answers} cfg={cfg} examKey={examKey}
      onRetry={() => { if (examKey) resetExam(examKey); nav(0); }} nav={nav} />;
  }

  const optOrder = settings.shuffleOptions && q && q.options?.length
    ? permute(q.options, seedFrom(q.id)) : (q?.options || []);
  const curAns = q ? answers[q.id] : undefined;
  const isRevealed = q ? !!revealed[q.id] : false;
  const okState = isRevealed && q ? isCorrect(q, curAns) : null;
  const answeredCount = questions.filter((x) => answers[x.id]).length;

  return (
    <>
      <div className="runbar">
        <div className="inner">
          <button className="btn sm ghost" onClick={() => nav(-1)} title="返回">←</button>
          <div className="ttl">{queue.title}<span className="muted"> · {queue.subtitle}</span></div>
          {isExam ? (
            <>
              <span className={"timer" + (isExam && left < 300 ? " warn" : "")}>{fmtTime(left)}</span>
              <button className="btn sm" onClick={() => setShowSheet((v) => !v)}>答题卡</button>
              <button className="btn sm primary" onClick={doSubmit}>交卷</button>
            </>
          ) : (
            <>
              <span className="progress-line">{answeredCount}/{questions.length}</span>
              <button className="btn sm" onClick={() => setShowSheet((v) => !v)}>答题卡</button>
              <button className="btn sm primary" onClick={finishPractice}>完成</button>
            </>
          )}
        </div>
      </div>

      {showSheet && (
        <div className="card">
          <div className="row" style={{ marginBottom: 10, justifyContent: "space-between" }}>
            <b>答题卡</b>
            <span className="muted" style={{ fontSize: 13 }}>
              已答 {answeredCount} / {questions.length} · 标记 {flags.length}
            </span>
          </div>
          <div className="answer-sheet">
            {questions.map((x, i) => {
              const a = answers[x.id];
              let cls = "asq";
              if (a) cls += " done";
              if (flags.includes(x.id)) cls += " flag";
              if (i === idx) cls += " cur";
              if (!isExam && revealed[x.id]) {
                const r = isCorrect(x, a);
                if (r === true) cls += " right";
                if (r === false) cls += " wrong";
              }
              return (
                <button key={x.id + i} className={cls} onClick={() => { setIdx(i); setShowSheet(false); }}>
                  {x.no ?? i + 1}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {q && (
        <div className="qcard">
          <div className="qhead">
            <span className={"qno " + (q.type === "essay" ? "essay" : q.type === "blank" ? "blank" : "")}>
              {q.no ?? idx + 1}
            </span>
            <span className="qtype">{TYPE_LABEL[q.type] || q.type}{q.score ? ` · ${q.score}分` : ""}</span>
            {(q.topics || []).slice(0, 2).map((t) => <span className="tag" key={t}>{t}</span>)}
            {q.answerNote && <span className="tag q-note" title={q.answerNote}>答案存疑</span>}
            <span className="qactions">
              <button className="btn sm ghost" title="标记" onClick={() => setFlags((f) => (f.includes(q.id) ? f.filter((x) => x !== q.id) : [...f, q.id]))}>
                {flags.includes(q.id) ? "🚩" : "🏳️"}
              </button>
              <button className="btn sm ghost" title="收藏" onClick={() => toggleFav(q.id, q.subject, { s: q.subject, f: q.file })}>
                {store.fav[q.id] ? "⭐" : "☆"}
              </button>
              <button className="btn sm ghost" title="笔记" onClick={() => { setNoteDraft(store.notes[q.id] || ""); setNoteOpen((v) => !v); }}>📝</button>
            </span>
          </div>

          {q.material && (
            <div className="material">
              {q.materialTitle && <h4>{q.materialTitle}</h4>}
              <RichText text={q.material} subject={q.subject} />
            </div>
          )}

          <RichText text={q.stem} subject={q.subject} />

          {q.optionIssue && <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>⚠️ {q.optionIssue}</p>}

          {optOrder.length > 0 && (
            <div className="opts">
              {optOrder.map((o) => {
                const picked = q.type === "multiple"
                  ? String(curAns || "").includes(o.key)
                  : curAns === o.key;
                let cls = "opt";
                if (picked) cls += " on";
                if (isRevealed) {
                  const isAns = q.type === "multiple"
                    ? normMultiple(q.answer).includes(o.key)
                    : String(q.answer).trim() === o.key;
                  if (isAns) cls += " right";
                  else if (picked) cls += " wrong";
                }
                return (
                  <button key={o.key} className={cls} onClick={() => !isRevealed && answer(o.key)}>
                    <span className="key">{o.key}</span>
                    <span className="otext"><RichText text={o.text} subject={q.subject} inline /></span>
                  </button>
                );
              })}
            </div>
          )}

          {q.type === "multiple" && !isRevealed && (
            <div className="navrow"><button className="btn primary sm" onClick={confirmMultiple} disabled={!curAns}>确认答案</button></div>
          )}

          {isRevealed && (
            <div className="explain">
              <div className="label">
                {q.type === "single" || q.type === "multiple" ? (
                  <>正确答案 <span className="anskey">{q.answer || "—"}</span>
                    {okState === true && <span style={{ color: "var(--ok)" }}>答对了</span>}
                    {okState === false && <span style={{ color: "var(--bad)" }}>答错了</span>}
                  </>
                ) : (<>{q.answer ? "参考答案" : "解析"}</>)}
              </div>
              {q.type !== "single" && q.type !== "multiple" && q.answer && <RichText text={q.answer} subject={q.subject} />}
              {q.explanation && (
                <div style={{ marginTop: q.answer && q.type !== "single" ? 10 : 0 }}>
                  <div className="muted" style={{ fontSize: 12.5, marginBottom: 4 }}>解析</div>
                  <RichText text={q.explanation} subject={q.subject} />
                </div>
              )}
              {!q.answer && !q.explanation && <p className="muted">这份题库没有收录该题的参考答案。</p>}
              {q.answerNote && <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>⚠️ {q.answerNote}</p>}
            </div>
          )}

          {!isRevealed && (
            <div className="navrow">
              {!isAutoGraded(q) && (
                <button className="btn sm" onClick={() => setRevealed((p) => ({ ...p, [q.id]: true }))}>查看参考答案</button>
              )}
              <button className="btn sm ghost" onClick={skipAsBlank}>标记为未掌握</button>
            </div>
          )}

          {isRevealed && !isAutoGraded(q) && (
            <div className="navrow">
              <span className="muted" style={{ fontSize: 13 }}>自评：</span>
              <button className="btn sm" onClick={() => selfGrade(true)}>我答对了</button>
              <button className="btn sm danger" onClick={() => selfGrade(false)}>我答错了</button>
            </div>
          )}

          {noteOpen && (
            <div style={{ marginTop: 14 }}>
              <textarea value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder="写下你的笔记、易错点…" />
              <div className="navrow">
                <button className="btn sm primary" onClick={() => { setNote(q.id, noteDraft); setNoteOpen(false); }}>保存笔记</button>
                <button className="btn sm ghost" onClick={() => setNoteOpen(false)}>取消</button>
              </div>
            </div>
          )}
          {store.notes[q.id] && !noteOpen && (
            <div className="explain" style={{ marginTop: 12 }}>
              <div className="label">我的笔记</div>
              <RichText text={store.notes[q.id]} subject={q.subject} />
            </div>
          )}

          <div className="navrow">
            <button className="btn sm" disabled={idx === 0} onClick={() => setIdx((v) => v - 1)}>上一题</button>
            <button className="btn sm" disabled={idx >= questions.length - 1} onClick={() => setIdx((v) => v + 1)}>下一题</button>
            <span className="spacer" />
            <span className="muted" style={{ fontSize: 13 }}>{idx + 1} / {questions.length}</span>
          </div>
        </div>
      )}
      <div className="progress-line" style={{ marginTop: 14 }}>
        <div className="meter" style={{ flex: 1 }}><i style={{ width: `${(answeredCount / Math.max(1, questions.length)) * 100}%` }} /></div>
        <span>{Math.round((answeredCount / Math.max(1, questions.length)) * 100)}%</span>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
function ExamResult({ queue, answers, cfg, examKey, onRetry, nav }) {
  const qs = queue.questions;
  let correct = 0, wrong = 0, blank = 0, score = 0, autoTotal = 0;
  const bySection = new Map();
  for (const q of qs) {
    const a = answers[q.id];
    const sec = q.sectionName || "题目";
    if (!bySection.has(sec)) bySection.set(sec, { name: sec, right: 0, total: 0 });
    const rec = bySection.get(sec);
    if (isAutoGraded(q)) {
      autoTotal++;
      rec.total++;
      if (isCorrect(q, a)) { correct++; rec.right++; score += q.score || 0; }
      else if (!a) blank++;
      else wrong++;
    }
  }
  const rate = autoTotal ? correct / autoTotal : 0;
  const answered = qs.filter((x) => answers[x.id]).length;
  return (
    <>
      <div className="card result-hero">
        <div className="score">{Math.round(rate * 100)}<small style={{ fontSize: 20 }}>%</small></div>
        <p className="muted" style={{ marginTop: 6 }}>客观题正确率（{correct} / {autoTotal}）</p>
        <div className="row" style={{ justifyContent: "center", marginTop: 18 }}>
          <div className="stat"><div className="k">答对</div><div className="v" style={{ color: "var(--ok)" }}>{correct}</div></div>
          <div className="stat"><div className="k">答错</div><div className="v" style={{ color: "var(--bad)" }}>{wrong}</div></div>
          <div className="stat"><div className="k">未作答</div><div className="v">{blank}</div></div>
          <div className="stat"><div className="k">客观题得分</div><div className="v">{score}<small> 分</small></div></div>
        </div>
      </div>

      <div className="card">
        <b>分题型表现</b>
        <div style={{ marginTop: 12 }} className="grid c2">
          {[...bySection.values()].map((x) => (
            <div className="topic-item" key={x.name}>
              <span className="tname">{x.name}</span>
              <span className="muted">{x.right}/{x.total}</span>
              <div className="meter" style={{ width: 80 }}><i style={{ width: `${x.total ? (x.right / x.total) * 100 : 0}%` }} /></div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <b>逐题回顾</b>
        <div className="answer-sheet" style={{ marginTop: 12 }}>
          {qs.map((q, i) => {
            let cls = "asq";
            const r = isCorrect(q, answers[q.id]);
            if (r === true) cls += " right";
            else if (r === false) cls += " wrong";
            else if (answers[q.id]) cls += " done";
            return <span key={q.id} className={cls} title={q.type}>{q.no ?? i + 1}</span>;
          })}
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
          共作答 {answered} / {qs.length} 题。主观题不参与自动评分，可在错题本中自评复盘。
        </p>
        <div className="navrow">
          <button className="btn primary" onClick={onRetry}>重新作答</button>
          <Link className="btn" to={`/run?mode=paper&subject=${cfg.subject}&year=${cfg.year}`}>再练一遍</Link>
          <button className="btn" onClick={() => nav("/wrong")}>去错题本</button>
        </div>
      </div>
    </>
  );
}
