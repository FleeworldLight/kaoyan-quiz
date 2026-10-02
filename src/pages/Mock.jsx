import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FileStack, Play, Timer, Search, Layers, Eye, Info, AlertTriangle } from "lucide-react";
import { Badge, Button, Card, CardBody, CardHead, Empty, Modal, Segmented, Spinner, inputCls } from "../components/ui.jsx";
import RichText from "../components/RichText.jsx";
import { loadPaper, flatten } from "../lib/data.js";
import { cn, QUALITY_META, SUBJECT_TONE } from "../lib/utils.js";

export default function Mock({ index }) {
  const nav = useNavigate();
  const groups = index.mockGroups || [];
  const [subject, setSubject] = useState("all");
  const [kw, setKw] = useState("");
  const [preview, setPreview] = useState(null);

  const subjects = useMemo(() => {
    const ids = [...new Set(groups.map((g) => g.subject))];
    return ids.map((id) => index.subjects.find((s) => s.id === id) || { id, name: id, color: "#356fe5" });
  }, [groups, index]);

  const shown = groups.filter((g) => {
    if (subject !== "all" && g.subject !== subject) return false;
    if (kw && !(g.name + " " + (g.publisher || "") + " " + (g.year || "")).toLowerCase().includes(kw.toLowerCase())) return false;
    return true;
  });

  const totalPapers = groups.reduce((a, g) => a + g.papers.length, 0);
  const inferredTotal = groups.reduce((a, g) => a + (g.inferredCount || 0), 0);
  const totalQ = groups.reduce((a, g) => a + g.papers.reduce((b, p) => b + (p.questionCount || 0), 0), 0);

  if (!groups.length) {
    return (
      <Card>
        <Empty
          icon={FileStack}
          title="还没有模拟卷数据"
          desc="模拟卷由 tools/fetch-mock.mjs 抓取后写入 public/data/mock/。抓取到内容后，这里会按出版方与套数分组展示。"
          action={<Button variant="primary" asChild><Link to="/library">先去刷真题</Link></Button>}
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-navy text-white"><FileStack className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-[17px] font-bold text-ink-strong">模拟卷</h2>
            <p className="mt-0.5 text-[12.5px] text-ink-subtle">
              {groups.length} 个系列 · {totalPapers} 套 · 约 {totalQ} 题
            </p>
          </div>
          <p className="flex max-w-md items-start gap-1.5 rounded-md bg-warn-soft px-2.5 py-2 text-[11.5px] leading-relaxed text-warn">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              模拟卷来自互联网公开渠道，<b>尚未逐题校验</b>，请以正式出版物为准。
              {inferredTotal > 0 ? (
                <>其中 <b>{inferredTotal}</b> 题的答案是来源推算而非官方原文，已在题目上标「答案非原文」。</>
              ) : null}
            </span>
          </p>
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={subject} onChange={setSubject}
          options={[{ value: "all", label: "全部", count: groups.length },
            ...subjects.map((s) => ({ value: s.id, label: s.name, count: groups.filter((g) => g.subject === s.id).length }))]} />
        <div className="relative min-w-40 flex-1 sm:max-w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-faint" />
          <input className={cn(inputCls, "pl-8")} placeholder="搜索系列 / 出版方 / 年份" value={kw} onChange={(e) => setKw(e.target.value)} />
        </div>
      </div>

      {!shown.length && <Card><Empty icon={Search} title="没有匹配的模拟卷" desc="换个关键词或切回「全部」。" /></Card>}

      <div className="grid gap-3 lg:grid-cols-2">
        {shown.map((g) => {
          const sub = index.subjects.find((s) => s.id === g.subject);
          const tone = SUBJECT_TONE[g.subject] || {};
          return (
            <Card key={g.id}>
              <CardHead
                icon={Layers}
                title={g.name}
                desc={[g.publisher, g.year ? g.year + " 考研" : null, g.papers.length + " 套"].filter(Boolean).join(" · ")}
                extra={<span className="flex items-center gap-1.5">
                  {g.inferredRatio > 0.5 ? <Badge tone="warn">答案多为推算</Badge> : null}
                  <Badge tone="navy" style={{ background: tone.bg, color: tone.fg, borderColor: tone.line }}>{sub?.name || g.subject}</Badge>
                </span>}
              />
              <CardBody className="p-0">
                <ul className="divide-y divide-line-subtle">
                  {g.papers.map((p) => {
                    const q = QUALITY_META[p.quality] || QUALITY_META.unverified;
                    return (
                      <li key={p.id} className="flex items-center gap-2.5 px-4 py-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-medium text-ink">{p.title}</span>
                          <span className="mt-0.5 block text-[11px] text-ink-faint">
                            {p.questionCount || 0} 题{p.choiceCount ? " · 客观题 " + p.choiceCount : ""}{p.duration ? " · " + p.duration + " 分" : ""}
                          </span>
                        </span>
                        <Badge tone={q.tone}>{q.label}</Badge>
                        <Button variant="ghost" size="iconSm" onClick={() => setPreview({ paper: p, group: g })} aria-label="速览"><Eye className="size-4" /></Button>
                        <Button variant="secondary" size="xs" onClick={() => nav("/practice?mode=mock&file=" + encodeURIComponent(p.file) + "&practice=1")}>
                          <Play className="size-3" />练习
                        </Button>
                        <Button variant="primary" size="xs" onClick={() => nav("/practice?mode=mock&file=" + encodeURIComponent(p.file))}>
                          <Timer className="size-3" />模考
                        </Button>
                      </li>
                    );
                  })}
                </ul>
                {g.source ? (
                  <p className="border-t border-line-subtle px-4 py-2 text-[11px] text-ink-faint">
                    来源：{g.source.url
                      ? <a className="underline decoration-dotted hover:text-brand" href={g.source.url} target="_blank" rel="noreferrer">{g.source.name || g.source.url}</a>
                      : g.source.name}
                  </p>
                ) : null}
              </CardBody>
            </Card>
          );
        })}
      </div>

      <MockPreview item={preview} onClose={() => setPreview(null)} onJump={(file, id) => {
        setPreview(null);
        nav("/practice?mode=mock&file=" + encodeURIComponent(file) + "&practice=1&focus=" + encodeURIComponent(id));
      }} />
    </div>
  );
}

function MockPreview({ item, onClose, onJump }) {
  const [data, setData] = useState(null);
  React.useEffect(() => {
    if (!item) { setData(null); return; }
    let alive = true;
    setData(null);
    loadPaper(item.paper.file).then((p) => alive && setData(flatten({ ...p, file: item.paper.file }))).catch(() => alive && setData([]));
    return () => { alive = false; };
  }, [item]);
  return (
    <Modal open={!!item} onOpenChange={(v) => !v && onClose()} width="max-w-3xl"
      title={item ? item.group.name + " · " + item.paper.title : ""}
      desc={item ? (item.paper.questionCount || 0) + " 题 · 质量未校验" : ""}>
      {!data ? <Spinner label="正在载入…" /> : (
        <ul className="divide-y divide-line-subtle">
          {data.map((q, i) => (
            <li key={q.id}>
              <button onClick={() => onJump(item.paper.file, q.id)} className="flex w-full items-start gap-2.5 px-1 py-2 text-left hover:bg-subtle">
                <span className="w-7 shrink-0 pt-0.5 text-right text-[12px] tabular-nums text-ink-faint">{q.no}</span>
                <Badge tone={q.type === "single" ? "brand" : q.type === "multiple" ? "navy" : q.type === "blank" ? "ok" : "warn"} className="mt-0.5 shrink-0">
                  {q.type === "single" ? "单选" : q.type === "multiple" ? "多选" : q.type === "blank" ? "填空" : "主观"}
                </Badge>
                <RichText text={q.stem} subject={q.subject} inline className="line-clamp-2 block min-w-0 flex-1 text-[13px] text-ink" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
