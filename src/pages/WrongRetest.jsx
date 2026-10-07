import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  RefreshCw, Download, Trash2, Target, TrendingUp, CheckCircle2, Play, ChevronDown,
  Camera, Images, HardDrive, ShieldCheck, AlertTriangle, Search, X, Maximize2,
} from "lucide-react";
import { Badge, Button, Card, CardBody, CardHead, Empty, Modal, Segmented, Spinner, Switch, inputCls } from "../components/ui.jsx";
import { DonutStat, AccuracyRank } from "../components/Charts.jsx";
import QuestionView from "../components/QuestionView.jsx";
import WrongPhotoCard from "../components/WrongPhotoCard.jsx";
import { useStore, clearWrong, exportWrong } from "../lib/store.js";
import { resolveQuestions } from "../lib/locate.js";
import {
  useLocalBankSnapshot, deleteItem, storageEstimate, isPersisted, requestPersistent, getBlobUrl,
} from "../lib/localbank.js";
import { fmtBytes } from "../lib/image.js";
import { cn, accuracy, fmtDate } from "../lib/utils.js";

/**
 * 错题本。两个标签页，因为两类内容本质不同：
 *   题库错题  —— 从题库里答错的题，可判分、可复测，会进正确率统计
 *   手工录入错题 —— 用户自己拍照记下的题，只有「图片 + 自己写的解析 + 章节标签」，
 *                不打分、不记录、不进统计（见 README「我的错题本」一节）
 */
export default function WrongRetest({ index }) {
  const s = useStore();
  const snap = useLocalBankSnapshot();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "photo" ? "photo" : "bank";
  const bankN = Object.keys(s.wrong).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={tab}
          onChange={(v) => setParams(v === "photo" ? { tab: "photo" } : {})}
          options={[
            { value: "bank", label: "题库错题", count: bankN },
            { value: "photo", label: "手工录入错题", count: snap.items.length },
          ]} />
        {tab === "photo" ? (
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" asChild>
              <Link to="/wrong/view"><Images className="size-3.5" />翻看复习</Link>
            </Button>
            <Button variant="primary" size="sm" asChild>
              <Link to="/wrong/add"><Camera className="size-3.5" />记一道错题</Link>
            </Button>
          </span>
        ) : null}
      </div>

      {tab === "photo" ? <PhotoWrong index={index} /> : <BankWrong index={index} />}
    </div>
  );
}

/* ==========================================================================
 *  标签页一：题库错题（原有逻辑，保持行为不变）
 * ========================================================================== */

function BankWrong({ index }) {
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
          title="题库错题是空的"
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

/* ==========================================================================
 *  标签页二：手工录入错题
 * ========================================================================== */

function PhotoWrong({ index }) {
  const snap = useLocalBankSnapshot();
  const [subject, setSubject] = useState("all");
  const [topic, setTopic] = useState("all");
  const [kw, setKw] = useState("");
  const [sort, setSort] = useState("recent");
  const [preview, setPreview] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [limit, setLimit] = useState(24);

  const bySubject = useMemo(() => {
    const m = new Map();
    for (const it of snap.items) m.set(it.subject, (m.get(it.subject) || 0) + 1);
    return m;
  }, [snap.items]);

  const topics = useMemo(() => {
    const m = new Map();
    for (const it of snap.items) {
      if (!it.topicName) continue;
      if (subject !== "all" && it.subject !== subject) continue;
      m.set(it.topicName, (m.get(it.topicName) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [snap.items, subject]);

  const shown = useMemo(() => {
    let list = snap.items;
    if (subject !== "all") list = list.filter((x) => x.subject === subject);
    if (topic !== "all") list = list.filter((x) => x.topicName === topic);
    if (kw.trim()) {
      const k = kw.trim().toLowerCase();
      list = list.filter((x) => (x.answerText + " " + (x.note || "") + " " + (x.topicName || "")).toLowerCase().includes(k));
    }
    list = [...list];
    if (sort === "oldest") list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    else list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return list;
  }, [snap.items, subject, topic, kw, sort]);

  const totalBytes = useMemo(() => snap.items.reduce((a, x) => a + (x.bytes || 0), 0), [snap.items]);

  /* 预览大图 */
  useEffect(() => {
    let alive = true;
    setPreviewUrl(null);
    if (!preview) return;
    getBlobUrl(preview.id, "image")
      .then((u) => { if (alive) setPreviewUrl(u); })
      .catch(() => {});
    return () => { alive = false; };
  }, [preview?.id]);

  async function onDelete(item) {
    if (!confirm("删除这道错题？图片也会一起删掉，无法恢复。")) return;
    await deleteItem(item.id);
  }

  if (snap.loading) return <Spinner label="正在载入你的错题…" />;

  if (snap.error) {
    return (
      <Card><CardBody>
        <p className="flex items-start gap-2 text-[12.5px] text-warn">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />本地存储打不开：{snap.error}
        </p>
      </CardBody></Card>
    );
  }

  if (!snap.items.length) {
    return (
      <Card>
        <Empty
          icon={Camera}
          title="还没有记过错题"
          desc="把书上做错的题拍下来，写上自己的解析、选一个章节，就能存进这里，以后随时翻看复习。"
          action={<Button variant="primary" asChild><Link to="/wrong/add"><Camera className="size-3.5" />记第一道错题</Link></Button>}
        />
        <StorageBar count={0} bytes={0} />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHead icon={Camera} title="手工录入错题"
            desc={"共 " + snap.items.length + " 道 · " + fmtBytes(totalBytes) + "。只存在你自己的浏览器里，不上传任何地方。"} />
          <CardBody className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Mini label="录入总数" value={snap.items.length} tone="text-brand" />
              <Mini label="涉及科目" value={bySubject.size} tone="text-ink-strong" />
              <Mini label="涉及章节" value={topics.length} tone="text-ink-strong" />
              <Mini label="占用空间" value={fmtBytes(totalBytes)} tone="text-ink-strong" small />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" asChild><Link to="/wrong/add"><Camera className="size-3.5" />记一道错题</Link></Button>
              <Button variant="secondary" asChild><Link to="/wrong/view"><Images className="size-3.5" />翻看复习</Link></Button>
              <Button variant="secondary" asChild><Link to="/records">备份 / 导入</Link></Button>
            </div>
            <p className="flex items-start gap-1.5 rounded-md bg-subtle px-3 py-2 text-[12px] leading-relaxed text-ink-subtle">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warn" />
              这些图片只存在本机浏览器里。<b>清除浏览器数据、或浏览器在磁盘紧张时回收存储，都会让图片消失</b>，
              而且不会计入正确率和掌握度统计。建议定期到「学习记录 → 备份全部数据」导出一次。
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHead icon={HardDrive} title="本地存储" desc="图片保存在浏览器的 IndexedDB 里" />
          <CardBody>
            <StorageBar count={snap.items.length} bytes={totalBytes} />
          </CardBody>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={subject} onChange={(v) => { setSubject(v); setTopic("all"); }}
          options={[{ value: "all", label: "全部", count: snap.items.length },
            ...index.subjects.filter((s) => bySubject.get(s.id)).map((s) => ({ value: s.id, label: s.name, count: bySubject.get(s.id) }))]} />
        <Segmented value={sort} onChange={setSort}
          options={[{ value: "recent", label: "最近记的" }, { value: "oldest", label: "最早记的" }]} />
        <div className="relative min-w-40 flex-1 sm:max-w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-faint" />
          <input className={cn(inputCls, "pl-8")} placeholder="搜我的解析 / 备注 / 章节"
                 value={kw} onChange={(e) => setKw(e.target.value)} />
        </div>
      </div>

      {topics.length > 1 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] text-ink-faint">章节</span>
          <button onClick={() => setTopic("all")}
            className={cn("rounded-md border px-2 py-1 text-[12px] transition-colors",
              topic === "all" ? "border-brand-line bg-brand-soft font-semibold text-brand" : "border-line text-ink-subtle hover:border-line-strong")}>
            全部 <span className="text-ink-faint">{snap.items.length}</span>
          </button>
          {topics.map(([name, n]) => (
            <button key={name} onClick={() => setTopic(name)}
              className={cn("rounded-md border px-2 py-1 text-[12px] transition-colors",
                topic === name ? "border-brand-line bg-brand-soft font-semibold text-brand" : "border-line text-ink-subtle hover:border-line-strong")}>
              {name} <span className="text-ink-faint">{n}</span>
            </button>
          ))}
        </div>
      ) : null}

      {!shown.length ? (
        <Card><Empty icon={Search} title="没有符合条件的错题" desc="换个科目、章节或关键词试试。" /></Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2" data-testid="photo-list">
          {shown.slice(0, limit).map((it) => (
            <WrongPhotoCard
              key={it.id}
              item={it}
              subjectName={index.subjects.find((s) => s.id === it.subject)?.name}
              onOpen={setPreview}
              onPreview={setPreview}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}

      {shown.length > limit ? (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={() => setLimit((v) => v + 24)}>再显示 24 条</Button>
        </div>
      ) : null}

      {/* 大图预览 */}
      <Modal open={!!preview} onOpenChange={(v) => !v && setPreview(null)}
             title="我的错题" width="max-w-4xl"
             desc={preview ? (index.subjects.find((s) => s.id === preview.subject)?.name || "") +
               (preview.topicName ? " · " + preview.groupName + " · " + preview.topicName : "") : ""}>
        {preview ? (
          <div className="flex flex-col gap-3">
            {previewUrl
              ? <img src={previewUrl} alt="题目原图" className="mx-auto block max-h-[62vh] w-auto max-w-full rounded-md border border-line" />
              : <Spinner label="载入图片…" />}
            <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-md border border-line-subtle bg-subtle px-3 py-2.5 text-[13px] leading-relaxed text-ink">
              {preview.answerText || "（没有写解析）"}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" asChild>
                <Link to={"/wrong/add?id=" + encodeURIComponent(preview.id)}>编辑</Link>
              </Button>
              <Button variant="primary" onClick={() => setPreview(null)}>关闭</Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

/* ---------------- 存储占用条 ---------------- */

function StorageBar({ count, bytes }) {
  const [est, setEst] = useState(null);
  const [persisted, setPersisted] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    storageEstimate().then(setEst);
    isPersisted().then(setPersisted);
  }, [count]);

  async function ask() {
    setBusy(true);
    const r = await requestPersistent();
    setPersisted(r.ok);
    setMsg(r.reason === "unsupported"
      ? "这个浏览器不支持申请持久化存储。"
      : r.ok ? "已获得持久化存储：浏览器不会自动清理你的数据（手动清除浏览器数据仍会删掉）。"
             : "浏览器没有批准。常见原因是站点使用时间还太短 / 没有加书签。数据仍能用，但磁盘紧张时有被回收的风险，建议定期导出备份。");
    setBusy(false);
  }

  const pct = est && est.quota ? Math.min(100, (est.usage / est.quota) * 100) : 0;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between text-[12.5px]">
        <span className="text-ink-subtle">这些错题占用</span>
        <span className="font-semibold text-ink-strong">{fmtBytes(bytes)}</span>
      </div>
      {est ? (
        <>
          <div className="h-1.5 overflow-hidden rounded-full bg-sunken">
            <div className="h-full rounded-full bg-brand" style={{ width: Math.max(1, pct) + "%" }} />
          </div>
          <p className="text-[11.5px] text-ink-faint">
            本站共占用约 {fmtBytes(est.usage)}，浏览器给本站的额度约 {fmtBytes(est.quota)}
          </p>
        </>
      ) : (
        <p className="text-[11.5px] text-ink-faint">这个浏览器不提供存储用量信息。</p>
      )}

      <div className="flex items-center gap-1.5 text-[12px]">
        <ShieldCheck className={cn("size-3.5", persisted ? "text-ok" : "text-ink-faint")} />
        {persisted === null ? <span className="text-ink-faint">持久化状态未知</span>
          : persisted ? <span className="text-ok">已开启持久化存储</span>
            : <span className="text-warn">未开启持久化存储</span>}
      </div>
      {persisted === false ? (
        <Button variant="secondary" size="sm" disabled={busy} onClick={ask}>申请持久化存储</Button>
      ) : null}
      {msg ? <p className="text-[11.5px] leading-relaxed text-ink-subtle">{msg}</p> : null}
    </div>
  );
}

function Mini({ label, value, tone, small }) {
  return (
    <div className="rounded-lg border border-line bg-subtle px-3 py-2">
      <div className="text-[11.5px] text-ink-subtle">{label}</div>
      <div className={cn("mt-0.5 leading-none font-bold tabular-nums", small ? "text-[15px]" : "text-[20px]", tone)}>{value}</div>
    </div>
  );
}
