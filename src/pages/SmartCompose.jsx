import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Wand2, Plus, Trash2, Sparkles, Target, Scale, BookOpen, Cpu, Shuffle, AlertTriangle } from "lucide-react";
import { Badge, Button, Card, CardBody, CardHead, Empty, Field, Segmented, inputCls } from "../components/ui.jsx";
import { useStore, topicStats } from "../lib/store.js";
import { cn } from "../lib/utils.js";

const PRESETS = [
  { id: "balanced", label: "四科均衡 · 100 题", icon: Scale, desc: "四科各 25 题，客观题为主", build: (index) => index.subjects.map((s) => ({ subject: s.id, count: 25, type: "any", topic: "__all__", source: "real" })) },
  { id: "weak", label: "薄弱章节攻坚 · 40 题", icon: Target, desc: "从你正确率最低的章节各抽 10 题", build: () => null },
  { id: "politics", label: "政治客观题冲刺 · 60 题", icon: BookOpen, desc: "政治单选 + 多选各 30 题", build: () => ([{ subject: "politics", count: 30, type: "single", topic: "__all__", source: "real" }, { subject: "politics", count: 30, type: "multiple", topic: "__all__", source: "real" }]) },
  { id: "math", label: "数学客观题 · 40 题", icon: Sparkles, desc: "数学一选择题 40 题", build: () => ([{ subject: "math1", count: 40, type: "single", topic: "__all__", source: "real" }]) },
  { id: "cs", label: "408 全科 · 60 题", icon: Cpu, desc: "数据结构/组原/操作系统/网络各 15 题", build: () => ([
    { subject: "cs408", count: 15, type: "single", topic: "ds-树与二叉树", source: "real" },
    { subject: "cs408", count: 15, type: "single", topic: "co-存储系统", source: "real" },
    { subject: "cs408", count: 15, type: "single", topic: "os-进程管理", source: "real" },
    { subject: "cs408", count: 15, type: "single", topic: "cn-网络层", source: "real" },
  ]) },
  { id: "english", label: "英语阅读 · 20 题", icon: Shuffle, desc: "英语一阅读理解 20 题", build: () => ([{ subject: "english1", count: 20, type: "single", topic: "阅读-细节题", source: "real" }]) },
];

export default function SmartCompose({ index }) {
  const nav = useNavigate();
  const s = useStore();
  const [buckets, setBuckets] = useState([{ subject: index.subjects[0]?.id, count: 20, type: "any", topic: "__all__", source: "real" }]);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e6));
  const [note, setNote] = useState(null);

  const weakTopics = useMemo(() => {
    const all = [];
    for (const sub of index.subjects) {
      for (const t of topicStats(s, sub.id)) if (t.right + t.wrong >= 2) all.push({ ...t, subjectId: sub.id, subjectName: sub.name });
    }
    return all.sort((a, b) => a.accuracy - b.accuracy);
  }, [s.progress, index]);

  const total = buckets.reduce((a, b) => a + (Number(b.count) || 0), 0);

  const estimate = useMemo(() => {
    const out = [];
    for (const b of buckets) {
      const sub = index.subjects.find((x) => x.id === b.subject);
      if (!sub) continue;
      let pool = b.source === "mock" ? (sub.mocks || []) : sub.papers;
      let n = pool.reduce((a, p) => a + (b.type && b.type !== "any" ? p.questionCount : p.choiceCount || p.questionCount), 0);
      if (b.topic && b.topic !== "__all__") {
        const t = (sub.topics || []).find((x) => x.id === b.topic);
        n = t ? Math.min(n, t.count) : 0;
      }
      out.push({ subject: sub.name, want: Number(b.count) || 0, available: n, topic: b.topic });
    }
    return out;
  }, [buckets, index]);

  function applyPreset(p) {
    if (p.id === "weak") {
      if (!weakTopics.length) { setNote("还没有足够的练习数据来定位薄弱章节，先随便刷几十道题吧。"); return; }
      const picked = weakTopics.slice(0, 4).map((t) => ({ subject: t.subjectId, topic: t.topic, count: 10, type: "any", source: "real" }));
      setBuckets(picked);
      return;
    }
    const b = p.build(index);
    if (b) setBuckets(b);
  }

  function start() {
    const clean = buckets.map((b) => ({ ...b, count: Number(b.count) || 0 })).filter((b) => b.count > 0);
    if (!clean.length) { setNote("至少要有 1 个题量大于 0 的抽题条件。"); return; }
    const url = "/practice?mode=custom&seed=" + seed + "&buckets=" + encodeURIComponent(JSON.stringify(clean));
    nav(url);
  }

  const setB = (i, patch) => setBuckets((prev) => prev.map((b, j) => (j === i ? { ...b, ...patch } : b)));

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand text-white"><Wand2 className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-[17px] font-bold text-ink-strong">智能组卷</h2>
            <p className="mt-0.5 text-[12.5px] text-ink-subtle">按科目、章节、题型、题量自由配比，一键生成一份专属练习。也可以直接套用下面的模板。</p>
          </div>
          <Button variant="primary" onClick={start}><Sparkles className="size-3.5" />生成 {total} 题</Button>
        </CardBody>
      </Card>

      <Card>
        <CardHead icon={Sparkles} title="快捷模板" desc="点一下直接套用，之后还能继续微调" />
        <CardBody className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PRESETS.map((p) => (
            <button key={p.id} onClick={() => applyPreset(p)}
              className="flex items-start gap-2.5 rounded-md border border-line px-3 py-2.5 text-left transition-colors hover:border-brand-line hover:bg-brand-soft/30">
              <span className="grid size-7 shrink-0 place-items-center rounded-md bg-brand-soft text-brand"><p.icon className="size-3.5" /></span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-ink">{p.label}</span>
                <span className="mt-0.5 block text-[11.5px] text-ink-subtle">{p.desc}</span>
              </span>
            </button>
          ))}
        </CardBody>
      </Card>

      {note ? (
        <p className="flex items-center gap-2 rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
          <AlertTriangle className="size-3.5" />{note}
        </p>
      ) : null}

      <Card>
        <CardHead icon={Target} title="抽题条件" desc={"共 " + total + " 题"}
          extra={<Button variant="secondary" size="sm" onClick={() => setBuckets((b) => [...b, { subject: index.subjects[0]?.id, count: 10, type: "any", topic: "__all__", source: "real" }])}>
            <Plus className="size-3.5" />加一条
          </Button>} />
        <CardBody className="flex flex-col gap-3">
          {buckets.map((b, i) => {
            const sub = index.subjects.find((x) => x.id === b.subject) || index.subjects[0];
            const est = estimate[i];
            const short = est && est.available < est.want;
            return (
              <div key={i} className="flex flex-wrap items-end gap-2 rounded-md border border-line bg-subtle px-3 py-2.5">
                <Field label="科目" className="w-28">
                  <select className={inputCls} value={b.subject} onChange={(e) => setB(i, { subject: e.target.value, topic: "__all__" })}>
                    {index.subjects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </Field>
                <Field label="范围" className="w-24">
                  <select className={inputCls} value={b.source} onChange={(e) => setB(i, { source: e.target.value })}>
                    <option value="real">真题</option>
                    <option value="mock" disabled={!(sub.mocks || []).length}>模拟卷{(sub.mocks || []).length ? "" : "（无）"}</option>
                  </select>
                </Field>
                <Field label="章节" className="min-w-40 flex-1">
                  <select className={inputCls} value={b.topic} onChange={(e) => setB(i, { topic: e.target.value })}>
                    <option value="__all__">全部章节</option>
                    {(sub.topics || []).map((t) => <option key={t.id} value={t.id}>{(t.groupName || t.group) + " · " + t.name + "（" + t.count + "）"}</option>)}
                  </select>
                </Field>
                <Field label="题型" className="w-24">
                  <select className={inputCls} value={b.type} onChange={(e) => setB(i, { type: e.target.value })}>
                    <option value="any">不限</option>
                    <option value="single">单选</option>
                    <option value="multiple">多选</option>
                    <option value="blank">填空</option>
                    <option value="essay">主观题</option>
                  </select>
                </Field>
                <Field label="题量" className="w-20">
                  <input type="number" min="0" className={inputCls} value={b.count} onChange={(e) => setB(i, { count: e.target.value })} />
                </Field>
                <Button variant="ghost" size="iconSm" onClick={() => setBuckets((prev) => prev.filter((_, j) => j !== i))} aria-label="删除">
                  <Trash2 className="size-4" />
                </Button>
                {short ? (
                  <p className="w-full text-[11.5px] text-warn">
                    该条件最多只能抽到 {est.available} 题（已按题库实际题量提示）
                  </p>
                ) : null}
              </div>
            );
          })}
          <div className="flex flex-wrap items-center gap-3 border-t border-line-subtle pt-3">
            <Field label="随机种子" hint="同一种子会生成同一套题" className="w-40">
              <div className="flex gap-1.5">
                <input className={inputCls} value={seed} onChange={(e) => setSeed(Number(e.target.value) || 0)} />
                <Button variant="secondary" size="md" onClick={() => setSeed(Math.floor(Math.random() * 1e6))}><Shuffle className="size-3.5" /></Button>
              </div>
            </Field>
            <div className="ml-auto flex items-center gap-3">
              <Badge tone="brand">合计 {total} 题</Badge>
              <Button variant="primary" onClick={start}><Sparkles className="size-3.5" />生成试卷</Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {weakTopics.length > 0 && (
        <Card>
          <CardHead icon={Target} title="你的薄弱章节" desc="按正确率排序，点一下直接针对该章节组卷" />
          <CardBody className="flex flex-wrap gap-2">
            {weakTopics.slice(0, 12).map((t) => (
              <button key={t.subjectId + t.topic}
                onClick={() => setBuckets([{ subject: t.subjectId, topic: t.topic, count: 15, type: "any", source: "real" }])}
                className="flex items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-[12.5px] transition-colors hover:border-brand-line hover:bg-brand-soft/30">
                <span className="text-ink">{t.topic}</span>
                <Badge tone={t.accuracy >= 0.8 ? "ok" : t.accuracy >= 0.6 ? "warn" : "bad"}>{Math.round(t.accuracy * 100)}%</Badge>
              </button>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
