import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Star, Search, Trash2, Play, ChevronDown, Download } from "lucide-react";
import { Badge, Button, Card, CardBody, CardHead, Empty, IconButton, Segmented, Spinner, inputCls } from "../components/ui.jsx";
import QuestionView from "../components/QuestionView.jsx";
import { useStore, toggleFav } from "../lib/store.js";
import { resolveQuestions } from "../lib/locate.js";
import { cn } from "../lib/utils.js";

export default function Favorites({ index }) {
  const s = useStore();
  const nav = useNavigate();
  const [subject, setSubject] = useState("all");
  const [kw, setKw] = useState("");
  const [pool, setPool] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const entries = useMemo(() => Object.entries(s.fav).map(([qid, v]) => ({ qid, ...v })), [s.fav]);
  const counts = useMemo(() => {
    const m = new Map();
    for (const e of entries) m.set(e.subject, (m.get(e.subject) || 0) + 1);
    return m;
  }, [entries]);

  const base = useMemo(() => (subject === "all" ? entries : entries.filter((e) => e.subject === subject)), [entries, subject]);

  useEffect(() => {
    let alive = true;
    if (!entries.length) { setPool(new Map()); return; }
    resolveQuestions(entries).then((m) => alive && setPool(m));
    return () => { alive = false; };
  }, [entries]);

  const shown = useMemo(() => {
    if (!pool) return [];
    const k = kw.trim().toLowerCase();
    return base.filter((e) => {
      if (!k) return true;
      const q = pool.get(e.qid);
      return q ? (q.stem + (q.options || []).map((o) => o.text).join(" ")).toLowerCase().includes(k) : false;
    });
  }, [base, kw, pool]);

  function doExport() {
    const lines = [];
    for (const e of base) {
      const q = pool?.get(e.qid);
      if (!q) continue;
      lines.push("## " + q.subjectName + " " + (q.year || "") + " 第 " + q.no + " 题\n");
      if (q.material) lines.push("> " + String(q.material).replace(/\n/g, "\n> ") + "\n");
      lines.push(q.stem + "\n");
      for (const o of q.options || []) lines.push("- " + o.key + ". " + o.text);
      lines.push("\n**答案：" + (q.answer || "—") + "**\n");
      if (q.explanation) lines.push(q.explanation + "\n");
      if (s.notes[e.qid]) lines.push("**我的笔记：** " + s.notes[e.qid] + "\n");
      lines.push("\n---\n");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "收藏本-" + new Date().toISOString().slice(0, 10) + ".md";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (!entries.length) {
    return (
      <Card>
        <Empty icon={Star} title="收藏本还是空的"
          desc="刷题时点题目右上角的星标就能收藏，方便之后集中复习。"
          action={<Button variant="primary" asChild><Link to="/library">去刷题</Link></Button>} />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-serif text-[19px] font-bold text-ink-strong">收藏本</h1>
        <Badge tone="brand">{entries.length} 题</Badge>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="primary" size="sm" onClick={() => nav("/practice?mode=fav")}>
            <Play className="size-3.5" />练习收藏题
          </Button>
          <Button variant="secondary" size="sm" onClick={doExport}><Download className="size-3.5" />导出 Markdown</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={subject} onChange={setSubject}
          options={[{ value: "all", label: "全部", count: entries.length },
            ...index.subjects.filter((x) => counts.get(x.id)).map((x) => ({ value: x.id, label: x.name, count: counts.get(x.id) }))]} />
        <div className="relative min-w-40 flex-1 sm:max-w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-faint" />
          <input className={cn(inputCls, "pl-8")} placeholder="在收藏的题目里搜索" value={kw} onChange={(e) => setKw(e.target.value)} />
        </div>
        <span className="text-[12px] text-ink-faint">{shown.length} 条</span>
      </div>

      {!pool && <Spinner label="正在载入收藏…" />}

      <div className="flex flex-col gap-2.5">
        {pool && shown.map((e) => {
          const q = pool.get(e.qid);
          if (!q) return null;
          const open = expanded === e.qid;
          return (
            <Card key={e.qid}>
              <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <span className="grid size-6 shrink-0 place-items-center rounded-md bg-brand-soft text-[12px] font-bold text-brand tabular-nums">{q.no}</span>
                <Badge tone="outline">{q.subjectName}</Badge>
                {q.year ? <span className="text-[11.5px] text-ink-faint">{q.year} 年</span> : null}
                <Badge tone={q.type === "single" ? "brand" : q.type === "multiple" ? "navy" : q.type === "blank" ? "ok" : "warn"}>
                  {q.type === "single" ? "单选" : q.type === "multiple" ? "多选" : q.type === "blank" ? "填空" : "主观"}
                </Badge>
                {s.notes[e.qid] ? <Badge tone="neutral">有笔记</Badge> : null}
                <span className="ml-auto flex items-center gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => setExpanded(open ? null : e.qid)}>
                    <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />{open ? "收起" : "展开"}
                  </Button>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={"/practice?mode=paper&subject=" + q.subject + "&year=" + q.year + "&practice=1&focus=" + encodeURIComponent(q.id)}>原卷</Link>
                  </Button>
                  <IconButton size="iconSm" onClick={() => toggleFav(e.qid, q.subject, { s: q.subject, f: q.file })} aria-label="取消收藏">
                    <Star className="size-4 fill-warn text-warn" />
                  </IconButton>
                </span>
              </div>
              {open ? (
                <div className="border-t border-line-subtle px-4 py-3">
                  <QuestionView q={q} revealed picked={null} compact note={s.notes[e.qid]} />
                </div>
              ) : (
                <div className="border-t border-line-subtle px-4 py-2.5 text-[12.5px] text-ink-subtle line-clamp-2">
                  {String(q.stem).replace(/\$/g, "").slice(0, 160)}
                </div>
              )}
            </Card>
          );
        })}
        {pool && !shown.length && <Card><Empty icon={Search} title="没有匹配的收藏题" desc="换个关键词试试。" /></Card>}
      </div>
    </div>
  );
}
