import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Shuffle, Eye, EyeOff, Maximize2, Info, ImageOff } from "lucide-react";
import { Badge, Button, Card, CardBody, Empty, Modal, Segmented, Spinner, Switch } from "../components/ui.jsx";
import { useLocalBankSnapshot, getBlobUrl } from "../lib/localbank.js";
import { cn } from "../lib/utils.js";

/**
 * 翻看复习（本地图片题）。
 *
 * 注意这是**纯翻看**：不打分、不记录、不产生任何复习数据（与题库错题的复测不同）。
 * 唯一的一点"复习"设计是：答案默认折叠，先自己回忆，点一下/按空格再看。
 * 键盘：← → 翻页，空格 看答案。
 */
export default function PhotoReview({ index }) {
  const snap = useLocalBankSnapshot();
  const [subject, setSubject] = useState("all");
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [i, setI] = useState(0);
  const [reveal, setReveal] = useState(false);
  const [rememberReveal, setRememberReveal] = useState(true); // 关掉后翻页会自动折叠
  const [zoom, setZoom] = useState(false);
  const [url, setUrl] = useState(null);
  const [imgErr, setImgErr] = useState(false);

  const bySubject = useMemo(() => {
    const m = new Map();
    for (const it of snap.items) m.set(it.subject, (m.get(it.subject) || 0) + 1);
    return m;
  }, [snap.items]);

  // 打乱：用 seed 保证「重新打乱」前顺序稳定，翻页时不会跳
  const list = useMemo(() => {
    const base = subject === "all" ? snap.items : snap.items.filter((x) => x.subject === subject);
    const arr = [...base];
    let s = seed >>> 0;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let k = arr.length - 1; k > 0; k--) {
      const j = Math.floor(rnd() * (k + 1));
      [arr[k], arr[j]] = [arr[j], arr[k]];
    }
    return arr;
  }, [snap.items, subject, seed]);

  const cur = list[Math.min(i, Math.max(0, list.length - 1))] || null;

  /* 切题时载入大图，并按设置决定是否折叠答案 */
  useEffect(() => {
    setImgErr(false);
    if (!cur) { setUrl(null); return; }
    if (!rememberReveal) setReveal(false);
    let alive = true;
    setUrl(null);
    getBlobUrl(cur.id, "image")
      .then((u) => { if (alive) setUrl(u); })
      .catch(() => { if (alive) setImgErr(true); });
    return () => { alive = false; };
  }, [cur?.id, rememberReveal]);

  useEffect(() => { setI(0); }, [subject, seed]);

  const go = (d) => {
    if (!list.length) return;
    setI((v) => (v + d + list.length) % list.length);
    if (!rememberReveal) setReveal(false);
  };

  useEffect(() => {
    function onKey(e) {
      if (zoom) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
      else if (e.key === " " || e.key === "Enter") { e.preventDefault(); setReveal((v) => !v); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [list.length, zoom, rememberReveal]);

  if (snap.loading) return <Spinner label="正在载入你的错题…" />;

  if (!snap.items.length) {
    return (
      <Card>
        <Empty
          icon={ImageOff}
          title="还没有记过错题"
          desc="把书上做错的题拍下来存进错题本，以后可以在这里随手翻看复习。"
          action={<Button variant="primary" asChild><Link to="/wrong/add">去记第一道</Link></Button>}
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 顶栏 */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/wrong-retest?tab=photo"><ArrowLeft className="size-3.5" />返回错题本</Link>
        </Button>
        <h1 className="font-serif text-[19px] font-bold text-ink-strong">翻看复习</h1>
        <Badge tone="neutral">{list.length ? i + 1 : 0} / {list.length}</Badge>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <Segmented value={subject} onChange={setSubject}
            options={[{ value: "all", label: "全部", count: snap.items.length },
              ...index.subjects.filter((s) => bySubject.get(s.id)).map((s) => ({ value: s.id, label: s.name, count: bySubject.get(s.id) }))]} />
          <Button variant="secondary" size="sm" onClick={() => setSeed(Math.floor(Math.random() * 1e9))}>
            <Shuffle className="size-3.5" />重新打乱
          </Button>
        </span>
      </div>

      <p className="flex items-start gap-1.5 rounded-md bg-subtle px-3 py-2 text-[12px] leading-relaxed text-ink-subtle">
        <Info className="mt-0.5 size-3.5 shrink-0 text-ink-faint" />
        这里是纯翻看：<b>不打分、不记录</b>，也不会影响你的正确率和掌握度统计。答案默认折叠，先自己回忆，再点开对一下。
      </p>

      {!cur ? (
        <Card><Empty icon={ImageOff} title="这个科目下还没有错题" desc="换个科目，或先去记一道。" /></Card>
      ) : (
        <Card>
          <CardBody className="flex flex-col gap-3">
            {/* 题目图片 */}
            <div className="relative overflow-hidden rounded-md border border-line bg-sunken">
              {imgErr ? (
                <div className="grid h-56 place-items-center gap-1 text-center text-[12.5px] text-ink-faint">
                  <ImageOff className="size-5" />
                  图片读取失败（记录还在，可能是浏览器清过存储）
                </div>
              ) : url ? (
                <>
                  <img src={url} alt="题目" className="mx-auto block max-h-[58vh] w-auto max-w-full" />
                  <button type="button" onClick={() => setZoom(true)}
                    className="absolute right-2 bottom-2 inline-flex items-center gap-1 rounded bg-ink/75 px-2 py-1 text-[11px] text-white">
                    <Maximize2 className="size-3" />放大
                  </button>
                </>
              ) : (
                <div className="grid h-56 place-items-center"><Spinner label="载入图片…" /></div>
              )}
            </div>

            {/* 标签 */}
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="outline">{index.subjects.find((s) => s.id === cur.subject)?.name || cur.subject}</Badge>
              {cur.topicName ? <Badge tone="brand">{cur.groupName ? cur.groupName + " · " : ""}{cur.topicName}</Badge> : null}
              {cur.note ? <span className="text-[11.5px] text-ink-faint">{cur.note}</span> : null}
            </div>

            {/* 我的答案与解析：默认折叠 */}
            <div className="rounded-md border border-line-subtle">
              <button type="button" onClick={() => setReveal((v) => !v)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[12.5px] font-medium text-ink-subtle hover:bg-subtle"
                data-testid="toggle-answer">
                {reveal ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                {reveal ? "收起我的答案与解析" : "想好了？点这里看我的答案与解析"}
                <span className="ml-auto text-[11px] text-ink-faint">空格键</span>
              </button>
              {reveal ? (
                <div className="whitespace-pre-wrap border-t border-line-subtle px-3 py-3 text-[13px] leading-relaxed text-ink"
                     data-testid="answer-text">
                  {cur.answerText || "（没有写解析）"}
                </div>
              ) : null}
            </div>

            {/* 翻页 */}
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => go(-1)}><ChevronLeft className="size-4" />上一张</Button>
              <Button variant="primary" className="flex-1" onClick={() => go(1)}>下一张<ChevronRight className="size-4" /></Button>
            </div>

            <Switch checked={rememberReveal} onCheckedChange={setRememberReveal}
                    label="翻到下一张时保持答案展开"
                    desc="关掉的话每张都先折叠，逼自己先回忆再看" />
          </CardBody>
        </Card>
      )}

      <Modal open={zoom} onOpenChange={setZoom} title="题目原图" desc={cur ? (cur.groupName ? cur.groupName + " · " : "") + (cur.topicName || "") : ""} width="max-w-5xl">
        {url ? <img src={url} alt="题目原图" className="mx-auto block max-h-[82vh] w-auto max-w-full rounded-md border border-line" /> : null}
      </Modal>
    </div>
  );
}
