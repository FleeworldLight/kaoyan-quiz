import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { NotebookPen, Search, Download, Trash2, Pencil, Check, X, ChevronDown } from "lucide-react";
import { Badge, Button, Card, CardBody, Empty, IconButton, Segmented, Spinner, inputCls } from "../components/ui.jsx";
import RichText from "../components/RichText.jsx";
import QuestionView from "../components/QuestionView.jsx";
import { useStore, setNote } from "../lib/store.js";
import { resolveQuestions } from "../lib/locate.js";
import { cn, fmtDate } from "../lib/utils.js";

export default function Notes({ index }) {
  const s = useStore();
  const [subject, setSubject] = useState("all");
  const [kw, setKw] = useState("");
  const [pool, setPool] = useState(null);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState("");
  const [expanded, setExpanded] = useState(null);

  const entries = useMemo(() => Object.entries(s.notes).map(([qid, text]) => {
    const f = s.fav[qid], p = s.progress[qid];
    return { qid, text, loc: f?.loc || p?.loc, subject: f?.subject || p?.subject, at: f?.addedAt || p?.lastAt || 0 };
  }), [s.notes, s.fav, s.progress]);

  const counts = useMemo(() => {
    const m = new Map();
    for (const e of entries) m.set(e.subject, (m.get(e.subject) || 0) + 1);
    return m;
  }, [entries]);

  useEffect(() => {
    let alive = true;
    const list = entries.filter((e) => e.loc?.f);
    if (!list.length) { setPool(new Map()); return; }
    resolveQuestions(list).then((m) => alive && setPool(m));
    return () => { alive = false; };
  }, [entries]);

  const shown = useMemo(() => {
    const k = kw.trim().toLowerCase();
    return entries.filter((e) => {
      if (subject !== "all" && e.subject !== subject) return false;
      if (!k) return true;
      const q = pool?.get(e.qid);
      return (e.text + " " + (q?.stem || "")).toLowerCase().includes(k);
    }).sort((a, b) => (b.at || 0) - (a.at || 0));
  }, [entries, subject, kw, pool]);

  function doExport() {
    const lines = ["# 考研刷题 · 题目笔记\n", "导出时间：" + new Date().toLocaleString("zh-CN") + "\n"];
    for (const e of shown) {
      const q = pool?.get(e.qid);
      lines.push("## " + (q ? q.subjectName + " " + (q.year || "") + " 第 " + q.no + " 题" : e.qid) + "\n");
      if (q) lines.push("> 题干：" + String(q.stem).replace(/\n/g, " ").slice(0, 200) + "\n");
      lines.push(e.text + "\n\n---\n");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "题目笔记-" + new Date().toISOString().slice(0, 10) + ".md";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (!entries.length) {
    return (
      <Card>
        <Empty icon={NotebookPen} title="还没有写过笔记"
          desc="刷题时点题目右上角的笔记图标，可以记下易错点、公式和思路。"
          action={<Button variant="primary" asChild><Link to="/library">去刷题</Link></Button>} />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-serif text-[19px] font-bold text-ink-strong">题目笔记</h1>
        <Badge tone="brand">{entries.length} 条</Badge>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={doExport}><Download className="size-3.5" />导出 Markdown</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={subject} onChange={setSubject}
          options={[{ value: "all", label: "全部", count: entries.length },
            ...index.subjects.filter((x) => counts.get(x.id)).map((x) => ({ value: x.id, label: x.name, count: counts.get(x.id) }))]} />
        <div className="relative min-w-40 flex-1 sm:max-w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-faint" />
          <input className={cn(inputCls, "pl-8")} placeholder="搜索笔记或题干" value={kw} onChange={(e) => setKw(e.target.value)} />
        </div>
      </div>

      {!pool && <Spinner label="正在载入笔记…" />}

      <div className="grid gap-2.5 lg:grid-cols-2">
        {pool && shown.map((e) => {
          const q = pool.get(e.qid);
          const isEditing = editing === e.qid;
          return (
            <Card key={e.qid}>
              <div className="flex flex-wrap items-center gap-2 border-b border-line-subtle px-4 py-2">
                {q ? <span className="grid size-6 shrink-0 place-items-center rounded-md bg-brand-soft text-[12px] font-bold text-brand tabular-nums">{q.no}</span> : null}
                <Badge tone="outline">{q?.subjectName || e.subject || "—"}</Badge>
                {q?.year ? <span className="text-[11.5px] text-ink-faint">{q.year} 年</span> : null}
                <span className="text-[11px] text-ink-faint">{e.at ? fmtDate(e.at, false) : ""}</span>
                <span className="ml-auto flex items-center gap-0.5">
                  {q ? (
                    <Button variant="ghost" size="sm" onClick={() => setExpanded(expanded === e.qid ? null : e.qid)}>
                      <ChevronDown className={cn("size-3.5 transition-transform", expanded === e.qid && "rotate-180")} />题目
                    </Button>
                  ) : null}
                  {isEditing ? (
                    <>
                      <IconButton size="iconSm" onClick={() => { setNote(e.qid, draft); setEditing(null); }} aria-label="保存"><Check className="size-4 text-ok" /></IconButton>
                      <IconButton size="iconSm" onClick={() => setEditing(null)} aria-label="取消"><X className="size-4" /></IconButton>
                    </>
                  ) : (
                    <>
                      <IconButton size="iconSm" onClick={() => { setDraft(e.text); setEditing(e.qid); }} aria-label="编辑"><Pencil className="size-3.5" /></IconButton>
                      <IconButton size="iconSm" onClick={() => { if (confirm("删除这条笔记？")) setNote(e.qid, ""); }} aria-label="删除"><Trash2 className="size-3.5 text-bad" /></IconButton>
                    </>
                  )}
                </span>
              </div>
              <CardBody className="py-3">
                {isEditing ? (
                  <textarea className="min-h-24 w-full rounded-md border border-line px-3 py-2 text-[13px] leading-relaxed focus:border-brand focus:ring-2 focus:ring-brand/15 focus:outline-none"
                    value={draft} onChange={(ev) => setDraft(ev.target.value)} placeholder="支持 Markdown 与 $LaTeX$" />
                ) : (
                  <RichText text={e.text} subject={e.subject} className="text-[13px]" />
                )}
              </CardBody>
              {expanded === e.qid && q ? (
                <div className="border-t border-line-subtle px-4 py-3">
                  <QuestionView q={q} revealed picked={null} compact />
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>
      {pool && !shown.length && <Card><Empty icon={Search} title="没有匹配的笔记" desc="换个关键词试试。" /></Card>}
    </div>
  );
}
