import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { RefreshCw, Download, Trash2, Target, TrendingUp, CheckCircle2, XCircle, Play, Filter, ChevronDown } from "lucide-react";
import { Badge, Button, Card, CardBody, CardHead, Empty, IconButton, Progress, Segmented, Spinner, Tip } from "../components/ui.jsx";
import { DonutStat, AccuracyRank } from "../components/Charts.jsx";
import QuestionView from "../components/QuestionView.jsx";
import { useStore, clearWrong, exportWrong } from "../lib/store.js";
import { resolveQuestions } from "../lib/locate.js";
import { cn, accuracy, fmtDate, SUBJECT_TONE } from "../lib/utils.js";

export default function WrongRetest({ index }) {
  const s = useStore();
  const nav = useNavigate();
  const [subject, setSubject] = useState("all");
  const [sort, setSort] = useState("count");
  const [pool, setPool] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [limit, setLimit] = useState(20);

  const entries = useMemo(() => Object.entries(s.wrong).map(([qid, w]) => ({ qid, ...w })), [s.wrong]);
  const bySubject = useMemo(() => {
    const m = new Map();
    for (const e of entries) m.set(e.subject, (m.get(e.subject) || 0) + 1);
    return m;
  }, [entries]);

  const filtered = useMemo(() => {
    let list = subject === "all" ? entries : entries.filter((e) => e.subject === subject);
    list = [...list];
    if (sort === "count") list.sort((a, b) => (b.wrongCount || 0) - (a.wrongCount || 0));
    if (sort === "recent") list.sort((a, b) => (b.lastAt || b.addedAt || 0) - (a.lastAt || a.addedAt || 0));
    return list;
  }, [entries, subject, sort]);

  useEffect(() => {
    let alive = true;
    if (!filtered.length) { setPool(new Map()); return; }
    resolveQuestions(filtered).then((m) => alive && setPool(m));
    return () => { alive = false; };
  }, [filtered]);

  // 攻坚分析：按章节聚合错题
  const byTopic = useMemo(() => {
    const m = new Map();
    for (const e of entries) {
      const p = s.progress[e.qid];
      for (const t of p?.topics || []) m.set(t, (m.get(t) || 0) + 1);
    }
    return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [entries, s.progress]);

  const donut = useMemo(() => index.subjects
    .map((sub) => ({ name: sub.name, value: bySubject.get(sub.id) || 0, itemStyle: { color: sub.color } }))
    .filter((x) => x.value > 0), [bySubject, index]);

  const heavy = entries.filter((e) => (e.wrongCount || 1) >= 2).length;
  const retested = entries.filter((e) => (s.progress[e.qid]?.right || 0) > 0).length;

  if (!entries.length) {
    return (
      <Card>
        <Empty
          icon={CheckCircle2}
          title="错题本是空的"
          desc="刷题时答错的题会自动收进来，之后可以在这里集中复测。"
          action={<Button variant="primary" asChild><Link to="/library">去刷题</Link></Button>}
        />
      </Card>
    );
  }

  function doExport() {
    const data = exportWrong();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "错题本-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 概览 */}
      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHead icon={Target} title="错题复测" desc={"共 " + entries.length + " 道错题 · 其中 " + heavy + " 道错过 2 次以上 · " + retested + " 道复测过"} />
          <CardBody className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Mini label="错题总数" value={entries.length} tone="text-bad" />
              <Mini label="重复错题" value={heavy} tone="text-warn" />
              <Mini label="已复测" value={retested} tone="text-ok" />
              <Mini label="涉及章节" value={byTopic.length} tone="text-brand" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => nav("/practice?mode=wrong&order=random")}>
                <RefreshCw className="size-3.5" />随机复测全部
              </Button>
              {subject !== "all" && (
                <Button variant="secondary" onClick={() => nav("/practice?mode=wrong&subject=" + subject + "&order=random")}>
                  <Play className="size-3.5" />只复测 {index.subjects.find((x) => x.id === subject)?.name}
                </Button>
              )}
              <Button variant="secondary" onClick={doExport}><Download className="size-3.5" />导出 JSON</Button>
              <Button variant="danger" onClick={() => { if (confirm("确定清空整个错题本？此操作不可恢复。")) clearWrong(); }}>
                <Trash2 className="size-3.5" />清空
              </Button>
            </div>
            <div className="rounded-md border border-line-subtle bg-subtle px-3 py-2.5">
              <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-ink-muted">
                <TrendingUp className="size-3.5" />攻坚建议
              </div>
              <p className="text-[12px] leading-relaxed text-ink-subtle">
                {byTopic.length
                  ? "错题集中在「" + byTopic.slice(0, 3).map((t) => t.name).join("」「") + "」，建议先针对这些章节做 15 题专项，再做一次完整复测。"
                  : "先给错题补上知识点标签（或直接刷整套卷），之后这里会给出章节级的攻坚建议。"}
              </p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHead title="错题科目分布" />
          <CardBody>
            {donut.length ? <DonutStat data={donut} centerLabel={String(entries.length)} height={200} />
              : <p className="py-8 text-center text-[12.5px] text-ink-faint">暂无数据</p>}
          </CardBody>
        </Card>
      </div>

      {/* 章节排行 */}
      {byTopic.length > 1 && (
        <Card>
          <CardHead icon={Target} title="错题章节排行" desc="错题最多的章节，点柱子直接组卷专项练习"
            extra={<Badge tone="bad">Top {Math.min(12, byTopic.length)}</Badge>} />
          <CardBody>
            <AccuracyRank
              data={byTopic.slice(0, 12).map((t) => ({ name: t.name, accuracy: Math.min(1, t.count / Math.max(...byTopic.map((x) => x.count))), count: t.count }))}
              height={Math.max(180, Math.min(320, byTopic.slice(0, 12).length * 30))}
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {byTopic.slice(0, 8).map((t) => (
                <button key={t.name}
                  onClick={() => {
                    const hit = entries.find((e) => (s.progress[e.qid]?.topics || []).includes(t.name));
                    const sub = hit?.subject || "math1";
                    nav("/practice?mode=chapter&subject=" + sub + "&topic=" + encodeURIComponent(t.name) + "&count=15");
                  }}
                  className="rounded-md border border-line px-2 py-1 text-[12px] text-ink transition-colors hover:border-brand-line hover:bg-brand-soft/30">
                  {t.name} <span className="text-ink-faint">{t.count}</span>
                </button>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* 错题列表 */}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={subject} onChange={setSubject}
          options={[{ value: "all", label: "全部", count: entries.length },
            ...index.subjects.filter((x) => bySubject.get(x.id)).map((x) => ({ value: x.id, label: x.name, count: bySubject.get(x.id) }))]} />
        <Segmented value={sort} onChange={setSort}
          options={[{ value: "count", label: "错得最多" }, { value: "recent", label: "最近错的" }]} />
        <span className="ml-auto text-[12px] text-ink-faint">显示 {Math.min(limit, filtered.length)} / {filtered.length}</span>
      </div>

      {!pool && <Spinner label="正在载入错题…" />}

      <div className="flex flex-col gap-2.5">
        {pool && filtered.slice(0, limit).map((e) => {
          const q = pool.get(e.qid);
          if (!q) return null;
          const p = s.progress[e.qid];
          const open = expanded === e.qid;
          return (
            <Card key={e.qid}>
              <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <span className="grid size-6 shrink-0 place-items-center rounded-md bg-bad-soft text-[12px] font-bold text-bad tabular-nums">{q.no}</span>
                <Badge tone="outline">{q.subjectName}</Badge>
                {q.year ? <span className="text-[11.5px] text-ink-faint">{q.year} 年</span> : null}
                <Badge tone="bad">错 {e.wrongCount || 1} 次</Badge>
                {p?.right ? <Badge tone="ok">复测对 {p.right} 次</Badge> : null}
                {(q.topics || []).slice(0, 2).map((t) => <Badge key={t} tone="neutral">{t}</Badge>)}
                <span className="ml-auto flex items-center gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => setExpanded(open ? null : e.qid)}>
                    <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />{open ? "收起" : "看题与解析"}
                  </Button>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={"/practice?mode=paper&subject=" + q.subject + "&year=" + q.year + "&practice=1&focus=" + encodeURIComponent(q.id)}>回到原卷</Link>
                  </Button>
                  <Button variant="ghost" size="iconSm" onClick={() => clearWrong(e.qid)} aria-label="移出"><Trash2 className="size-4" /></Button>
                </span>
              </div>
              {open ? (
                <div className="border-t border-line-subtle px-4 py-3">
                  <QuestionView q={q} revealed picked={null} compact />
                </div>
              ) : (
                <div className="border-t border-line-subtle px-4 py-2.5 text-[12.5px] text-ink-subtle line-clamp-2">
                  {String(q.stem).replace(/\$/g, "").slice(0, 160)}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {pool && filtered.length > limit && (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={() => setLimit((v) => v + 20)}>再显示 20 条</Button>
        </div>
      )}
    </div>
  );
}

function Mini({ label, value, tone }) {
  return (
    <div className="rounded-lg border border-line bg-subtle px-3 py-2">
      <div className="text-[11.5px] text-ink-subtle">{label}</div>
      <div className={cn("mt-0.5 text-[20px] leading-none font-bold tabular-nums", tone)}>{value}</div>
    </div>
  );
}
