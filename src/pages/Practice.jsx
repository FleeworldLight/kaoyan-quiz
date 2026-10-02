import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, Keyboard, LayoutList, Square, CheckSquare, ListChecks, Timer,
  Flag, Play, Save, X, AlertTriangle, TrendingUp, RotateCcw, NotebookPen, Settings2, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Badge, Button, Card, CardBody, CardHead, IconButton, Kbd, Modal, Progress, Segmented, Spinner, Switch, Tip } from "../components/ui.jsx";
import QuestionView from "../components/QuestionView.jsx";
import { buildQueue, parseRunConfig } from "../lib/data.js";
import { useStore, getState, recordAnswer, addRecord, toggleFav, setNote, saveExam, resetExam, setSettings } from "../lib/store.js";
import { isAutoGraded, isCorrect, isAnswered, scoreOf } from "../lib/question.js";
import { cn, fmtClock, fmtDuration } from "../lib/utils.js";

export default function Practice({ index }) {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const cfg = useMemo(() => parseRunConfig(sp.toString()), [sp]);
  const store = useStore();
  const settings = store.settings;

  const [queue, setQueue] = useState(null);
  const [err, setErr] = useState(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [revealed, setRevealed] = useState({});
  const [flags, setFlags] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const [left, setLeft] = useState(0);
  const [sheet, setSheet] = useState(false);
  const [noteFor, setNoteFor] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [layout, setLayout] = useState("single");
  const [showSettings, setShowSettings] = useState(false);
  const [qElapsed, setQElapsed] = useState(0);

  const recorded = useRef(new Set());
  const startedAt = useRef(Date.now());
  const qTimer = useRef(null);
  const cardRefs = useRef({});
  const examKey = cfg.mode === "paper" && cfg.subject && cfg.year ? cfg.subject + "-" + cfg.year : cfg.mode === "mock" ? "mock-" + cfg.file : null;

  /* ------------------------------ 载入 ------------------------------ */
  useEffect(() => {
    let alive = true;
    setQueue(null); setErr(null); setSubmitted(false); setIdx(0); setAnswers({}); setRevealed({}); setFlags([]);
    recorded.current = new Set();
    startedAt.current = Date.now();
    buildQueue(cfg)
      .then((q) => {
        if (!alive) return;
        setQueue(q);
        if (!q.questions.length) { setErr("该条件下没有题目，换个章节或先积累一些错题。"); return; }
        if (cfg.focus) {
          const i = q.questions.findIndex((x) => x.id === cfg.focus);
          if (i >= 0) setIdx(i);
        }
        if (q.exam) {
          setLeft((q.duration || 180) * 60);
          const saved = examKey ? getState().exams[examKey] : null;
          if (saved && saved.answers && !saved.submittedAt) {
            setAnswers(saved.answers);
            setFlags(saved.flags || []);
            if (saved.startedAt) startedAt.current = saved.startedAt;
            if (saved.idx) setIdx(saved.idx);
          }
        }
      })
      .catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
  }, [sp.toString()]);

  const questions = queue?.questions || [];
  const q = questions[idx];
  const isExam = !!queue?.exam;

  /* ------------------------------ 计时 ------------------------------ */
  useEffect(() => {
    if (!isExam || submitted || !queue) return;
    const t = setInterval(() => setLeft((v) => (v <= 1 ? 0 : v - 1)), 1000);
    return () => clearInterval(t);
  }, [isExam, submitted, queue]);
  useEffect(() => {
    if (isExam && left === 0 && queue && !submitted) submit();
  }, [left, isExam, queue, submitted]);

  // 单题计时（超时提醒用）
  useEffect(() => {
    setQElapsed(0);
    if (!q || submitted) return;
    const t = setInterval(() => setQElapsed((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, [q?.id, submitted]);

  /* --------------------------- 考试状态持久化 --------------------------- */
  useEffect(() => {
    if (!isExam || !examKey || submitted) return;
    saveExam(examKey, { answers, flags, startedAt: startedAt.current, idx });
  }, [answers, flags, isExam, examKey, submitted, idx]);

  /* ------------------------------ 记录 ------------------------------ */
  const commit = useCallback((qq, ok, blank) => {
    if (!qq || recorded.current.has(qq.id)) return;
    recorded.current.add(qq.id);
    recordAnswer({
      qid: qq.id, subject: qq.subject, loc: { s: qq.subject, f: qq.file },
      topics: qq.topics || [], correct: ok === true, blank: blank || ok === null,
    });
  }, []);

  function answer(key) {
    if (!q) return;
    if (q.type === "multiple") {
      setAnswers((prev) => {
        const cur = new Set(String(prev[q.id] || "").split(""));
        if (cur.has(key)) cur.delete(key); else cur.add(key);
        return { ...prev, [q.id]: [...cur].sort().join("") };
      });
      return;
    }
    setAnswers((prev) => ({ ...prev, [q.id]: key }));
    if (!isExam && settings.instantReveal) {
      setRevealed((prev) => ({ ...prev, [q.id]: true }));
      commit(q, isCorrect(q, key), false);
      if (settings.autoScroll && layout === "list") setTimeout(() => go(1, true), 260);
    }
  }
  function confirmMultiple() {
    if (!q || !answers[q.id]) return;
    setRevealed((prev) => ({ ...prev, [q.id]: true }));
    commit(q, isCorrect(q, answers[q.id]), false);
    if (!isExam && settings.autoScroll && layout === "list") setTimeout(() => go(1, true), 260);
  }
  function reveal() {
    if (!q) return;
    setRevealed((prev) => ({ ...prev, [q.id]: true }));
  }
  function selfGrade(ok) {
    if (!q) return;
    setRevealed((prev) => ({ ...prev, [q.id]: true }));
    commit(q, ok, false);
    if (settings.autoScroll && layout === "list") setTimeout(() => go(1, true), 260);
  }
  function skipBlank() {
    if (!q) return;
    setRevealed((prev) => ({ ...prev, [q.id]: true }));
    commit(q, false, true);
  }
  function toggleFlag() {
    if (!q) return;
    setFlags((f) => (f.includes(q.id) ? f.filter((x) => x !== q.id) : [...f, q.id]));
  }
  function go(delta, scroll) {
    setIdx((v) => {
      const n = Math.min(questions.length - 1, Math.max(0, v + delta));
      if (scroll && layout === "list") {
        setTimeout(() => cardRefs.current[questions[n]?.id]?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
      }
      return n;
    });
  }

  function submit() {
    if (submitted || !queue) return;
    for (const x of questions) if (isAnswered(x, answers[x.id])) commit(x, isCorrect(x, answers[x.id]), false);
    const st = scoreOf(questions, answers);
    addRecord({
      subject: questions[0]?.subject || cfg.subject || "mix",
      mode: isExam ? "exam" : cfg.mode,
      topic: cfg.topic, paperId: questions[0]?.paperId,
      total: st.answered, correct: st.correct,
      durationSec: Math.round((Date.now() - startedAt.current) / 1000),
    });
    if (examKey) saveExam(examKey, { answers, flags, startedAt: startedAt.current, submittedAt: Date.now(), correct: st.correct, total: st.auto });
    setSubmitted(true);
    setSheet(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function finish() {
    const st = scoreOf(questions, answers);
    addRecord({
      subject: questions[0]?.subject || cfg.subject || "mix",
      mode: cfg.mode, topic: cfg.topic, paperId: questions[0]?.paperId,
      total: st.answered, correct: st.correct,
      durationSec: Math.round((Date.now() - startedAt.current) / 1000),
    });
    nav("/records");
  }

  /* ------------------------------ 快捷键 ------------------------------ */
  useEffect(() => {
    function onKey(e) {
      const tag = e.target.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT" || e.metaKey || e.ctrlKey) return;
      if (!q || submitted) return;
      const k = e.key.toUpperCase();
      if (/^[A-D]$/.test(k)) { answer(k); return; }
      if (/^[1-4]$/.test(k) && q.options?.[k - 1]) { answer(q.options[k - 1].key); return; }
      if (e.key === "ArrowRight") go(1, true);
      if (e.key === "ArrowLeft") go(-1, true);
      if (e.key === "Enter" && q.type !== "multiple") go(1, true);
      if (k === "F") toggleFlag();
      if (k === "R") reveal();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [q, submitted, questions.length, answers, layout]);

  /* ------------------------------ 渲染 ------------------------------ */
  if (err && !questions.length) {
    return (
      <Card><CardBody className="flex flex-col items-center gap-3 py-14 text-center">
        <AlertTriangle className="size-6 text-warn" />
        <p className="text-[13.5px] font-semibold text-ink">{err}</p>
        <Button variant="primary" size="sm" asChild><Link to="/library">去题库看看</Link></Button>
      </CardBody></Card>
    );
  }
  if (!queue) return <Spinner label="正在组卷…" />;

  const answeredN = questions.filter((x) => isAnswered(x, answers[x.id])).length;
  const overtime = !isExam && !submitted && qElapsed >= (q?.type === "single" || q?.type === "multiple" ? 150 : 360);

  if (submitted) {
    return <ResultView queue={queue} answers={answers} cfg={cfg} index={index} nav={nav}
      onRetry={() => { if (examKey) resetExam(examKey); nav(0); }} />;
  }

  const footer = (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" size="sm" disabled={idx === 0} onClick={() => go(-1, true)}>
        <ChevronLeft className="size-3.5" />上一题
      </Button>
      <Button variant="secondary" size="sm" disabled={idx >= questions.length - 1} onClick={() => go(1, true)}>
        下一题<ChevronRight className="size-3.5" />
      </Button>
      {q?.type === "multiple" && !revealed[q.id] ? (
        <Button variant="primary" size="sm" onClick={confirmMultiple} disabled={!answers[q.id]}>
          <ListChecks className="size-3.5" />确认答案
        </Button>
      ) : null}
      <span className="ml-auto text-[11.5px] text-ink-faint">快捷键 <Kbd>A</Kbd>-<Kbd>D</Kbd> 选择 · <Kbd>←</Kbd><Kbd>→</Kbd> 切题 · <Kbd>F</Kbd> 标记 · <Kbd>R</Kbd> 看答案</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {/* 运行条 */}
      <div className="sticky top-12 z-10 -mx-3 border-b border-line bg-surface/95 px-3 py-2 backdrop-blur-md sm:-mx-5 sm:px-5 lg:top-12">
        <div className="flex flex-wrap items-center gap-2">
          <IconButton size="iconSm" onClick={() => nav(-1)} aria-label="返回"><ArrowLeft className="size-4" /></IconButton>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-ink">{queue.title}</div>
            <div className="truncate text-[11px] text-ink-faint">
              {queue.subtitle}
              {queue.source ? " · 来源 " + (queue.source.name || "—") : ""}
            </div>
          </div>
          {overtime ? (
            <Badge tone="warn" dot>本题已耗时 {fmtClock(qElapsed)}</Badge>
          ) : null}
          {isExam ? (
            <span data-testid="timer" className={cn("rounded-md px-2.5 py-1 text-[13.5px] font-bold tabular-nums",
              left < 300 ? "bg-bad-soft text-bad" : "bg-sunken text-ink")}>
              {fmtClock(left)}
            </span>
          ) : (
            <span className="rounded-md bg-sunken px-2.5 py-1 text-[12.5px] font-semibold tabular-nums text-ink-muted">
              {answeredN}/{questions.length}
            </span>
          )}
          <Segmented size="sm" value={layout} onChange={setLayout}
            options={[{ value: "single", label: "单题" }, { value: "list", label: "连续" }]} />
          <Button variant="secondary" size="sm" onClick={() => setSheet(true)}>答题卡</Button>
          <IconButton size="iconSm" onClick={() => setShowSettings(true)} aria-label="设置"><Settings2 className="size-4" /></IconButton>
          {isExam
            ? <Button variant="primary" size="sm" onClick={submit}>交卷</Button>
            : <Button variant="primary" size="sm" onClick={finish}><Save className="size-3.5" />完成</Button>}
        </div>
        <div className="mt-1.5"><Progress value={answeredN / Math.max(1, questions.length)} height={3} /></div>
      </div>

      {/* 题目 */}
      {layout === "single" ? (
        q ? (
          <QuestionView
            q={q} index={idx} total={questions.length}
            picked={answers[q.id]} revealed={!!revealed[q.id]}
            onPick={answer} onConfirmMultiple={confirmMultiple} onReveal={reveal}
            onSelfGrade={selfGrade} onSkipBlank={skipBlank}
            flagged={flags.includes(q.id)} onToggleFlag={toggleFlag}
            favorited={!!store.fav[q.id]} onToggleFav={() => toggleFav(q.id, q.subject, { s: q.subject, f: q.file })}
            onOpenNote={() => { setNoteDraft(store.notes[q.id] || ""); setNoteFor(q); }}
            note={store.notes[q.id]}
            footer={footer}
          />
        ) : <Card><CardBody><p className="text-center text-[13px] text-ink-subtle">这套卷子没有题目。</p></CardBody></Card>
      ) : (
        <div className="flex flex-col gap-3">
          {questions.map((x, i) => (
            <div key={x.id} ref={(el) => { cardRefs.current[x.id] = el; }}>
              <QuestionView
                q={x} index={i} total={questions.length} compact
                picked={answers[x.id]} revealed={!!revealed[x.id]}
                onPick={(k) => { setIdx(i); answer(k); }}
                onConfirmMultiple={() => { setIdx(i); confirmMultiple(); }}
                onReveal={() => { setIdx(i); reveal(); }}
                onSelfGrade={(ok) => { setIdx(i); selfGrade(ok); }}
                onSkipBlank={() => { setIdx(i); skipBlank(); }}
                flagged={flags.includes(x.id)} onToggleFlag={() => setFlags((f) => (f.includes(x.id) ? f.filter((y) => y !== x.id) : [...f, x.id]))}
                favorited={!!store.fav[x.id]} onToggleFav={() => toggleFav(x.id, x.subject, { s: x.subject, f: x.file })}
                onOpenNote={() => { setNoteDraft(store.notes[x.id] || ""); setNoteFor(x); }}
                note={store.notes[x.id]}
              />
            </div>
          ))}
          <div className="flex justify-center gap-2 py-2">
            {isExam
              ? <Button variant="primary" onClick={submit}>交卷</Button>
              : <Button variant="primary" onClick={finish}><Save className="size-3.5" />完成练习</Button>}
          </div>
        </div>
      )}

      {/* 答题卡 */}
      <Modal open={sheet} onOpenChange={setSheet} title="答题卡" width="max-w-2xl"
        desc={"已答 " + answeredN + " / " + questions.length + " · 标记 " + flags.length}>
        <div className="flex flex-wrap gap-1.5">
          {questions.map((x, i) => {
            const a = answers[x.id];
            const r = revealed[x.id] ? isCorrect(x, a) : null;
            return (
              <button key={x.id} data-testid="sheet-item" onClick={() => { setIdx(i); setSheet(false); if (layout === "list") setTimeout(() => cardRefs.current[x.id]?.scrollIntoView({ behavior: "smooth", block: "start" }), 40); }}
                className={cn("grid size-8 place-items-center rounded-md border text-[12px] font-semibold tabular-nums transition-colors",
                  i === idx && "ring-2 ring-brand ring-offset-1",
                  r === true ? "border-ok-line bg-ok-soft text-ok"
                    : r === false ? "border-bad-line bg-bad-soft text-bad"
                    : a ? "border-brand-line bg-brand-soft text-brand"
                    : "border-line bg-surface text-ink-faint",
                  flags.includes(x.id) && "border-warn")}>
                {x.no ?? i + 1}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex items-center gap-3 text-[11.5px] text-ink-faint">
          <span className="flex items-center gap-1"><i className="size-2.5 rounded-sm bg-brand-soft ring-1 ring-brand-line" />已答</span>
          <span className="flex items-center gap-1"><i className="size-2.5 rounded-sm bg-ok-soft ring-1 ring-ok-line" />正确</span>
          <span className="flex items-center gap-1"><i className="size-2.5 rounded-sm bg-bad-soft ring-1 ring-bad-line" />错误</span>
          <span className="flex items-center gap-1"><i className="size-2.5 rounded-sm bg-warn-soft ring-1 ring-warn-line" />已标记</span>
        </div>
      </Modal>

      {/* 设置 */}
      <Modal open={showSettings} onOpenChange={setShowSettings} title="作答设置" width="max-w-md">
        <div className="flex flex-col gap-3.5">
          <Switch checked={settings.instantReveal} onCheckedChange={(v) => setSettings({ instantReveal: v })}
            label="作答后立即显示答案" desc="练习模式下选择选项后直接弹出解析" />
          <Switch checked={settings.autoScroll} onCheckedChange={(v) => setSettings({ autoScroll: v })}
            label="作答后自动跳到下一题" desc="仅在「连续」布局下生效；单题布局会停留在原题看解析" />
          <Switch checked={settings.shuffleOptions} onCheckedChange={(v) => setSettings({ shuffleOptions: v })}
            label="打乱选项顺序" desc="避免靠位置记答案" />
          <Switch checked={settings.overtimeHint !== false} onCheckedChange={(v) => setSettings({ overtimeHint: v })}
            label="超时提醒" desc="单题耗时超过 2.5 分钟（主观题 6 分钟）时提示" />
        </div>
      </Modal>

      {/* 笔记 */}
      <Modal open={!!noteFor} onOpenChange={(v) => !v && setNoteFor(null)} title="题目笔记" width="max-w-lg"
        desc={noteFor ? (noteFor.subjectName || "") + " " + (noteFor.year || "") + " 第 " + noteFor.no + " 题" : ""}
        footer={<>
          <Button variant="ghost" size="sm" onClick={() => setNoteFor(null)}>取消</Button>
          <Button variant="primary" size="sm" onClick={() => { setNote(noteFor.id, noteDraft); setNoteFor(null); }}>保存笔记</Button>
        </>}>
        <textarea
          className="min-h-32 w-full rounded-md border border-line bg-surface px-3 py-2 text-[13px] leading-relaxed focus:border-brand focus:ring-2 focus:ring-brand/15 focus:outline-none"
          placeholder="记下易错点、公式、思路…支持 Markdown 与 $LaTeX$"
          value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)}
        />
        {noteFor && store.notes[noteFor.id] ? (
          <Button variant="danger" size="sm" className="mt-2" onClick={() => { setNote(noteFor.id, ""); setNoteDraft(""); }}>
            删除这条笔记
          </Button>
        ) : null}
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function ResultView({ queue, answers, cfg, nav, onRetry }) {
  const st = useMemo(() => scoreOf(queue.questions, answers), [queue, answers]);
  const wrongList = queue.questions.filter((x) => isAutoGraded(x) && isCorrect(x, answers[x.id]) === false);
  const durationSec = 0;

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardBody className="flex flex-col items-center gap-4 py-7">
          <div className="text-center">
            <div className="font-serif text-[44px] leading-none font-bold text-ink-strong tabular-nums">
              {Math.round(st.accuracy * 100)}<span className="text-[22px]">%</span>
            </div>
            <p className="mt-1.5 text-[13px] text-ink-subtle">
              客观题正确率 · 答对 {st.correct} / {st.auto} 题
            </p>
          </div>
          <div className="grid w-full max-w-lg grid-cols-2 gap-2.5 sm:grid-cols-4">
            <MiniResult label="答对" value={st.correct} tone="text-ok" />
            <MiniResult label="答错" value={st.wrong} tone="text-bad" />
            <MiniResult label="未作答" value={st.blank} tone="text-ink-muted" />
            <MiniResult label="客观题得分" value={st.score} tone="text-brand" unit="分" />
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="primary" onClick={onRetry}><RotateCcw className="size-3.5" />重新作答</Button>
            <Button variant="secondary" asChild><Link to="/wrong-retest"><Flag className="size-3.5" />去错题复测</Link></Button>
            <Button variant="ghost" onClick={() => nav("/records")}>查看学习记录</Button>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHead title="分题型表现" icon={TrendingUp} />
          <CardBody className="flex flex-col gap-3">
            {st.bySection.filter((x) => x.auto > 0).map((x) => (
              <div key={x.name}>
                <div className="mb-1 flex items-center justify-between text-[12.5px]">
                  <span className="text-ink">{x.name}</span>
                  <span className="text-ink-subtle tabular-nums">{x.right}/{x.auto}</span>
                </div>
                <Progress value={x.auto ? x.right / x.auto : 0} tone={x.right / x.auto >= 0.8 ? "ok" : x.right / x.auto >= 0.6 ? "brand" : "warn"} />
              </div>
            ))}
            {!st.bySection.some((x) => x.auto > 0) && <p className="text-[12.5px] text-ink-faint">这套卷子没有可自动评分的客观题。</p>}
          </CardBody>
        </Card>

        <Card>
          <CardHead title={"错题清单（" + wrongList.length + "）"} icon={X}
            extra={wrongList.length ? <Button variant="secondary" size="xs" asChild><Link to="/wrong-retest">去复测</Link></Button> : null} />
          <CardBody className="p-0">
            {!wrongList.length ? (
              <p className="px-4 py-8 text-center text-[12.5px] text-ink-faint">全部答对，漂亮！</p>
            ) : (
              <ul className="max-h-72 divide-y divide-line-subtle overflow-y-auto">
                {wrongList.map((x) => (
                  <li key={x.id} className="flex items-center gap-3 px-4 py-2">
                    <span className="w-6 shrink-0 text-right text-[12px] tabular-nums text-ink-faint">{x.no}</span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{String(x.stem).replace(/\$/g, "").slice(0, 60)}</span>
                    <span className="shrink-0 text-[12px] text-bad">你选 {answers[x.id]}</span>
                    <span className="shrink-0 text-[12px] text-ok">正确 {x.answer}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function MiniResult({ label, value, tone, unit }) {
  return (
    <div className="rounded-lg border border-line bg-subtle px-3 py-2 text-center">
      <div className="text-[11.5px] text-ink-subtle">{label}</div>
      <div className={cn("mt-0.5 text-[20px] leading-none font-bold tabular-nums", tone)}>
        {value}{unit ? <span className="text-[11.5px] font-medium text-ink-subtle"> {unit}</span> : null}
      </div>
    </div>
  );
}
