import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Library as LibIcon, Play, Timer, Eye, ListTree, CalendarRange, Search,
  Sparkles, ChevronRight, Layers, FileText,
} from "lucide-react";
import { Badge, Button, Card, CardBody, CardHead, Empty, IconButton, Modal, Progress, Segmented, Spinner, Tip, inputCls } from "../components/ui.jsx";
import RichText from "../components/RichText.jsx";
import { useStore, subjectStats, topicStats } from "../lib/store.js";
import { loadPaper, flatten } from "../lib/data.js";
import { cn, accuracy, masteryTier, QUALITY_META, SUBJECT_TONE } from "../lib/utils.js";

export default function Library({ index }) {
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const s = useStore();

  const subjectId = sp.get("subject") || index.subjects[0]?.id;
  const view = sp.get("view") || "paper";      // paper | chapter
  const scope = sp.get("scope") || "all";      // all | selected | real
  const [kw, setKw] = useState("");
  const [preview, setPreview] = useState(null);

  const sub = index.subjects.find((x) => x.id === subjectId) || index.subjects[0];
  const st = useMemo(() => (sub ? subjectStats(s, sub.id) : null), [s, sub]);
  const tstats = useMemo(() => (sub ? topicStats(s, sub.id) : []), [s, sub]);
  const topicAcc = useMemo(() => new Map(tstats.map((t) => [t.topic, t])), [tstats]);

  const setParam = (patch) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) { if (v == null) next.delete(k); else next.set(k, v); }
    setSp(next, { replace: true });
  };

  if (!sub) return <Empty title="还没有题库数据" desc="请先运行数据管线生成 public/data/index.json" />;

  const allPapers = [...(sub.mocks || []).map((p) => ({ ...p, isMock: true })), ...sub.papers.map((p) => ({ ...p, isMock: false }))];
  const papers = allPapers.filter((p) => {
    if (scope === "real" && p.isMock) return false;
    if (scope === "selected" && p.quality !== "high") return false;
    if (kw && !(String(p.year) + " " + p.title).toLowerCase().includes(kw.toLowerCase())) return false;
    return true;
  }).sort((a, b) => (b.year || 0) - (a.year || 0) || String(a.title).localeCompare(String(b.title), "zh"));

  const groups = useMemo(() => {
    const m = new Map();
    for (const t of sub.topics || []) {
      const g = t.groupName || t.group || "其他";
      if (!m.has(g)) m.set(g, []);
      m.get(g).push(t);
    }
    return [...m.entries()];
  }, [sub]);

  return (
    <div className="flex flex-col gap-4">
      {/* 科目切换 */}
      <div className="flex flex-wrap items-center gap-2">
        {index.subjects.map((x) => {
          const tone = SUBJECT_TONE[x.id] || {};
          const active = x.id === subjectId;
          return (
            <button
              key={x.id}
              onClick={() => setParam({ subject: x.id })}
              className={cn("flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition-colors",
                active ? "border-transparent text-white" : "border-line bg-surface text-ink-muted hover:border-line-strong")}
              style={active ? { background: x.color } : undefined}
            >
              <span className="font-bold">{x.icon || x.name[0]}</span>
              {x.name}
              <span className={cn("rounded px-1 text-[11px] tabular-nums", active ? "bg-white/20" : "bg-sunken")}>{x.questionCount}</span>
            </button>
          );
        })}
      </div>

      {/* 科目概览 */}
      <Card>
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl text-[18px] font-bold text-white" style={{ background: sub.color }}>
            {sub.icon || sub.name[0]}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-[17px] font-bold text-ink-strong">{sub.fullName || sub.name}</h2>
            <p className="mt-0.5 text-[12.5px] text-ink-subtle">
              {sub.papers.length} 套真题{(sub.mocks || []).length ? " · " + sub.mocks.length + " 套模拟卷" : ""} · 共 {sub.questionCount} 题
              {" · 客观题 " + sub.choiceCount + " 题"} · 答案覆盖 {sub.answerCoverage}%
            </p>
          </div>
          <div className="w-full sm:w-44">
            <div className="mb-1 flex justify-between text-[11.5px] text-ink-faint">
              <span>练习进度</span><span className="tabular-nums">{st.done}/{sub.questionCount}</span>
            </div>
            <Progress value={sub.questionCount ? st.done / sub.questionCount : 0} showLabel
                      tone={st.accuracy >= 0.8 ? "ok" : st.accuracy >= 0.6 ? "brand" : "warn"} />
          </div>
        </CardBody>
      </Card>

      {/* 工具条 */}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={view} onChange={(v) => setParam({ view: v })}
          options={[{ value: "paper", label: "按年份" }, { value: "chapter", label: "按章节" }]} />
        <Segmented value={scope} onChange={(v) => setParam({ scope: v })}
          options={[{ value: "all", label: "完整" }, { value: "selected", label: "严选" }, { value: "real", label: "真题" }]} />
        {view === "paper" && (
          <div className="relative min-w-40 flex-1 sm:max-w-56">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-faint" />
            <input className={cn(inputCls, "pl-8")} placeholder="搜索年份或卷名" value={kw} onChange={(e) => setKw(e.target.value)} />
          </div>
        )}
        <span className="ml-auto text-[12px] text-ink-faint">
          {view === "paper" ? papers.length + " 套" : (sub.topics || []).length + " 个知识点"}
        </span>
      </div>

      {/* 内容 */}
      {view === "paper" ? (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line-subtle">
            {papers.map((p) => {
              const q = QUALITY_META[p.quality] || QUALITY_META.medium;
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 transition-colors hover:bg-subtle">
                  <span className="w-11 shrink-0 text-[15px] font-bold tabular-nums text-ink-strong">{p.year || "—"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-medium text-ink">{p.title}</span>
                      {p.isMock ? <Badge tone="navy">模拟</Badge> : null}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2 text-[11.5px] text-ink-faint">
                      <span>{p.questionCount} 题</span>
                      <span>客观题 {p.choiceCount}</span>
                      <span className="flex items-center gap-0.5"><Timer className="size-3" />{p.duration || 180} 分</span>
                    </span>
                  </span>
                  {p.quality !== "high" ? <Badge tone={q.tone}>{q.label}</Badge> : null}
                  <span className="flex shrink-0 items-center gap-1.5">
                    <Tip label="看一眼这套卷的题目清单">
                      <Button variant="ghost" size="iconSm" onClick={() => setPreview(p)} aria-label="速览"><Eye className="size-4" /></Button>
                    </Tip>
                    <Button variant="secondary" size="xs" asChild>
                      {p.isMock
                        ? <Link to={"/practice?mode=mock&file=" + encodeURIComponent(p.file) + "&practice=1"}><Play className="size-3" />练习</Link>
                        : <Link to={"/practice?mode=paper&subject=" + sub.id + "&year=" + p.year + "&practice=1"}><Play className="size-3" />练习</Link>}
                    </Button>
                    <Button variant="primary" size="xs" asChild>
                      {p.isMock
                        ? <Link to={"/practice?mode=mock&file=" + encodeURIComponent(p.file)}><Timer className="size-3" />模考</Link>
                        : <Link to={"/practice?mode=paper&subject=" + sub.id + "&year=" + p.year}><Timer className="size-3" />模考</Link>}
                    </Button>
                  </span>
                </li>
              );
            })}
            {!papers.length && <Empty icon={LibIcon} title="没有符合条件的卷子" desc="试试把范围切回「完整」，或清空搜索词。" />}
          </ul>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-[12.5px] text-ink-subtle">按知识点跨年份抽题，括号里是题库中的题量。</p>
            <Button variant="soft" size="sm" asChild>
              <Link to={"/practice?mode=chapter&subject=" + sub.id + "&topic=__all__&count=20"}>
                <Sparkles className="size-3.5" />全部章节混合练
              </Link>
            </Button>
          </div>
          {!groups.length && <Card><Empty icon={ListTree} title="这个科目还没有知识点标签" desc="可以用「按年份」直接刷整套卷。" /></Card>}
          {groups.map(([g, list]) => (
            <Card key={g}>
              <CardHead title={g} desc={list.length + " 个知识点"} icon={Layers} />
              <CardBody className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((t) => {
                  const acc = topicAcc.get(t.id);
                  const attempts = acc ? acc.right + acc.wrong : 0;
                  const tier = masteryTier(acc ? acc.accuracy : 0, attempts);
                  const tone = tier.tone === "ok" ? "ok" : tier.tone === "brand" ? "brand" : tier.tone === "warn" ? "warn" : tier.tone === "bad" ? "bad" : "neutral";
                  return (
                    <button key={t.id} onClick={() => nav("/practice?mode=chapter&subject=" + sub.id + "&topic=" + encodeURIComponent(t.id) + "&count=15")}
                      className="flex flex-col gap-1.5 rounded-md border border-line px-3 py-2 text-left transition-colors hover:border-brand-line hover:bg-brand-soft/30">
                      <span className="flex items-start gap-2">
                        <span className="min-w-0 flex-1 text-[13px] font-medium text-ink">{t.name}</span>
                        <Badge tone={tone}>{tier.label}</Badge>
                      </span>
                      <span className="flex items-center gap-2 text-[11.5px] text-ink-faint">
                        <span>{t.count} 题</span>
                        {attempts > 0 && <span>· 做过 {attempts} 题 · {Math.round(acc.accuracy * 100)}%</span>}
                      </span>
                    </button>
                  );
                })}
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <PaperPreview paper={preview} onClose={() => setPreview(null)} sub={sub} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
function PaperPreview({ paper, onClose, sub }) {
  const [data, setData] = useState(null);
  const nav = useNavigate();
  useEffect(() => {
    if (!paper) { setData(null); return; }
    let alive = true;
    setData(null);
    loadPaper(paper.file).then((p) => alive && setData(flatten({ ...p, file: paper.file }))).catch(() => alive && setData([]));
    return () => { alive = false; };
  }, [paper]);

  return (
    <Modal
      open={!!paper} onOpenChange={(v) => !v && onClose()}
      title={paper ? paper.title : ""} width="max-w-3xl"
      desc={paper ? paper.questionCount + " 题 · " + (paper.duration || 180) + " 分钟" + (paper.isMock ? " · 模拟卷" : " · 真题") : ""}
      footer={paper ? (
        <>
          <Button variant="secondary" size="sm" asChild>
            {paper.isMock
              ? <Link to={"/practice?mode=mock&file=" + encodeURIComponent(paper.file) + "&practice=1"}>练习模式</Link>
              : <Link to={"/practice?mode=paper&subject=" + sub.id + "&year=" + paper.year + "&practice=1"}>练习模式</Link>}
          </Button>
          <Button variant="primary" size="sm" asChild>
            {paper.isMock
              ? <Link to={"/practice?mode=mock&file=" + encodeURIComponent(paper.file)}>开始模考</Link>
              : <Link to={"/practice?mode=paper&subject=" + sub.id + "&year=" + paper.year}>开始模考</Link>}
          </Button>
        </>
      ) : null}
    >
      {!data ? <Spinner label="正在载入试卷…" /> : (
        <ul className="divide-y divide-line-subtle">
          {data.map((q, i) => (
            <li key={q.id}>
              <button
                onClick={() => {
                  onClose();
                  const base = paper.isMock
                    ? "/practice?mode=mock&file=" + encodeURIComponent(paper.file) + "&practice=1"
                    : "/practice?mode=paper&subject=" + sub.id + "&year=" + paper.year + "&practice=1";
                  nav(base + "&focus=" + encodeURIComponent(q.id));
                }}
                className="flex w-full items-start gap-2.5 px-1 py-2 text-left transition-colors hover:bg-subtle"
              >
                <span className="w-7 shrink-0 pt-0.5 text-right text-[12px] tabular-nums text-ink-faint">{q.no}</span>
                <Badge tone={q.type === "single" ? "brand" : q.type === "multiple" ? "navy" : q.type === "blank" ? "ok" : "warn"} className="mt-0.5 shrink-0">
                  {q.type === "single" ? "单选" : q.type === "multiple" ? "多选" : q.type === "blank" ? "填空" : "主观"}
                </Badge>
                <span className="min-w-0 flex-1">
                  <RichText text={q.stem} subject={q.subject} inline className="line-clamp-2 block text-[13px] text-ink" />
                </span>
                <ChevronRight className="mt-1 size-3.5 shrink-0 text-ink-faint" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
