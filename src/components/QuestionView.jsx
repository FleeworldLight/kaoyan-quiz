import React, { useState } from "react";
import { Star, Flag, NotebookPen, Check, X, ListChecks, Lightbulb, AlertTriangle, Copy } from "lucide-react";
import RichText, { dataImageUrl } from "./RichText.jsx";
import { Badge, Button, Tip, Kbd, Modal } from "./ui.jsx";
import { normMultiple, isAutoGraded, isCorrect, figureMissing } from "../lib/question.js";
import { cn } from "../lib/utils.js";

const TYPE_META = {
  single: { label: "单选题", tone: "brand" },
  multiple: { label: "多选题", tone: "navy" },
  blank: { label: "填空题", tone: "ok" },
  essay: { label: "主观题", tone: "warn" },
};

/**
 * 单题渲染。受控组件：答题状态由外部传入，便于练习/模考/错题本/收藏本复用。
 */
export default function QuestionView({
  q, index, total,
  picked, revealed,
  onPick, onConfirmMultiple, onReveal, onSelfGrade, onSkipBlank,
  flagged, onToggleFlag, favorited, onToggleFav, onOpenNote, note,
  footer, compact = false, className,
}) {
  const [copied, setCopied] = useState(false);
  const [zoom, setZoom] = useState(null);
  if (!q) return null;
  const meta = TYPE_META[q.type] || TYPE_META.essay;
  const auto = isAutoGraded(q);
  const okState = revealed && auto ? isCorrect(q, picked) : null;
  const multiSel = q.type === "multiple" ? String(picked || "") : "";

  return (
    <>
    <article data-testid="question" className={cn("overflow-hidden rounded-lg border border-line bg-surface shadow-panel", className)}>
      {/* 头部 */}
      <header className="flex flex-wrap items-center gap-2 border-b border-line-subtle px-4 py-2.5">
        <span className={cn("grid h-6 min-w-6 place-items-center rounded-md px-1.5 text-[12.5px] font-bold text-white",
          q.type === "single" ? "bg-brand" : q.type === "multiple" ? "bg-navy" : q.type === "blank" ? "bg-ok" : "bg-warn")}>
          {q.no ?? (index ?? 0) + 1}
        </span>
        <Badge tone={meta.tone}>{meta.label}</Badge>
        {q.score ? <span className="text-[11.5px] text-ink-faint">{q.score} 分</span> : null}
        {typeof index === "number" && total ? (
          <span className="text-[11.5px] text-ink-faint tabular-nums">{index + 1} / {total}</span>
        ) : null}
        {(q.topics || []).slice(0, 2).map((t) => <Badge key={t} tone="outline">{t}</Badge>)}
        {q.answerDisputed ? (
          <Tip label={q.answerNote || "不同来源答案存在分歧"}>
            <Badge tone="bad" dot>答案存疑</Badge>
          </Tip>
        ) : null}
        {q.optionIssue ? <Badge tone="warn" dot>选项残缺</Badge> : null}
        {q.answerInferred ? <Badge tone="warn">答案非原文</Badge> : null}

        <div className="ml-auto flex items-center gap-0.5">
          {onToggleFlag ? (
            <Tip label={flagged ? "取消标记" : "标记本题（F）"}>
              <Button variant="ghost" size="iconSm" onClick={onToggleFlag} aria-label="标记">
                <Flag className={cn("size-3.5", flagged ? "fill-warn text-warn" : "text-ink-faint")} />
              </Button>
            </Tip>
          ) : null}
          {onToggleFav ? (
            <Tip label={favorited ? "取消收藏" : "加入收藏本"}>
              <Button variant="ghost" size="iconSm" onClick={onToggleFav} aria-label="收藏">
                <Star className={cn("size-3.5", favorited ? "fill-warn text-warn" : "text-ink-faint")} />
              </Button>
            </Tip>
          ) : null}
          {onOpenNote ? (
            <Tip label={note ? "查看/编辑笔记" : "写笔记"}>
              <Button variant="ghost" size="iconSm" onClick={onOpenNote} aria-label="笔记">
                <NotebookPen className={cn("size-3.5", note ? "text-brand" : "text-ink-faint")} />
              </Button>
            </Tip>
          ) : null}
        </div>
      </header>

      <div className="px-4 py-3.5">
        {/* 材料 */}
        {q.material ? (
          <details className="mb-3 rounded-md border border-line-subtle bg-subtle" open={!compact}>
            <summary className="cursor-pointer px-3 py-1.5 text-[12px] font-semibold text-brand select-none">
              {q.materialTitle || "材料"}
            </summary>
            <div className="max-h-72 overflow-y-auto border-t border-line-subtle bg-surface px-3 py-2.5">
              <RichText text={q.material} subject={q.subject} className="text-[13.5px] leading-[1.75]" />
            </div>
          </details>
        ) : null}

        <RichText text={q.stem} subject={q.subject} />

        {q.images?.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {q.images.map((img) => (
              <button
                key={img}
                type="button"
                onClick={() => setZoom(img)}
                title="点击放大"
                className="group relative rounded-md border border-line-subtle bg-white p-0.5 transition-colors hover:border-brand-line"
              >
                <img src={dataImageUrl(q.subject, img)} alt="题目配图" loading="lazy" className="q-figure !my-0 !border-0" />
                <span className="pointer-events-none absolute right-1 bottom-1 hidden rounded bg-ink/75 px-1.5 py-0.5 text-[10.5px] text-white group-hover:block">
                  点击放大
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {figureMissing(q) ? (
          <p className="mt-2 flex items-start gap-1.5 rounded-md bg-warn-soft px-2.5 py-1.5 text-[12px] text-warn">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            本题题干提到图，但题库未收录配图，请对照原卷 PDF 查看。
          </p>
        ) : null}

        {q.optionIssue ? (
          <p className="mt-2 flex items-start gap-1.5 rounded-md bg-warn-soft px-2.5 py-1.5 text-[12px] text-warn">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{q.optionIssue}
          </p>
        ) : null}

        {/* 选项 */}
        {q.options?.length > 0 ? (
          <div className="mt-3 flex flex-col gap-1.5">
            {q.options.map((o) => {
              const isPicked = q.type === "multiple" ? multiSel.includes(o.key) : picked === o.key;
              const isAns = q.type === "multiple"
                ? normMultiple(q.answer).includes(o.key)
                : String(q.answer || "").trim() === o.key;
              const state = revealed ? (isAns ? "right" : isPicked ? "wrong" : "idle") : isPicked ? "on" : "idle";
              return (
                <button
                  key={o.key}
                  data-testid="option"
                  data-key={o.key}
                  type="button"
                  disabled={revealed || !onPick}
                  onClick={() => onPick && onPick(o.key)}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-md border px-3 py-2 text-left transition-[border-color,background-color]",
                    state === "idle" && "border-line bg-surface hover:border-brand-line hover:bg-brand-soft/30",
                    state === "on" && "border-brand bg-brand-soft",
                    state === "right" && "border-ok-line bg-ok-soft",
                    state === "wrong" && "border-bad-line bg-bad-soft",
                    revealed && "cursor-default"
                  )}
                >
                  <span className={cn("grid size-5.5 shrink-0 place-items-center rounded-[5px] text-[12px] font-bold",
                    state === "idle" && "bg-sunken text-ink-subtle",
                    state === "on" && "bg-brand text-white",
                    state === "right" && "bg-ok text-white",
                    state === "wrong" && "bg-bad text-white")}>
                    {state === "right" ? <Check className="size-3.5" /> : state === "wrong" ? <X className="size-3.5" /> : o.key}
                  </span>
                  <span className="min-w-0 flex-1 pt-px">
                    <RichText text={o.text} subject={q.subject} inline className="[&_.prose-q]:text-[14.5px]" />
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        {/* 作答操作 */}
        {!revealed && q.type === "multiple" && onConfirmMultiple ? (
          <div className="mt-3">
            <Button variant="primary" size="sm" onClick={onConfirmMultiple} disabled={!multiSel}>
              <ListChecks className="size-3.5" />确认答案
            </Button>
          </div>
        ) : null}

        {!revealed && onReveal ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={onReveal}><Lightbulb className="size-3.5" />查看参考答案</Button>
            {onSkipBlank ? <Button variant="ghost" size="sm" onClick={onSkipBlank}>标记为未掌握</Button> : null}
          </div>
        ) : null}

        {/* 解析 */}
        {revealed ? (
          <div data-testid="explanation" className="mt-3.5 rounded-md border border-dashed border-line bg-subtle px-3.5 py-3">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              {auto ? (
                <>
                  <span className="text-[12.5px] font-semibold text-ink-muted">正确答案</span>
                  <span className="rounded bg-ok px-1.5 py-px text-[12.5px] font-bold text-white">{q.answer || "—"}</span>
                  {okState === true && <Badge tone="ok" dot>答对了</Badge>}
                  {okState === false && <Badge tone="bad" dot>答错了</Badge>}
                </>
              ) : (
                <span className="text-[12.5px] font-semibold text-ink-muted">{q.answer ? "参考答案" : "解析"}</span>
              )}
            </div>
            {!auto && q.answer ? <RichText text={q.answer} subject={q.subject} className="text-[14px]" /> : null}
            {q.explanation ? (
              <div className={cn(!auto && q.answer && "mt-2.5")}>
                <div className="mb-1 text-[11.5px] text-ink-faint">解析</div>
                <RichText text={q.explanation} subject={q.subject} className="text-[14px]" />
              </div>
            ) : null}
            {!q.answer && !q.explanation ? <p className="text-[12.5px] text-ink-faint">本题未收录参考答案。</p> : null}
            <div className="mt-2.5 flex justify-end">
              <Button
                variant="ghost"
                size="xs"
                onClick={async () => {
                  const parts = [];
                  parts.push("【题目】" + String(q.stem).replace(/\n+/g, " "));
                  if (q.options?.length) parts.push(q.options.map((o) => o.key + ". " + o.text).join("\n"));
                  if (q.answer) parts.push("【答案】" + q.answer);
                  if (q.explanation) parts.push("【解析】" + q.explanation);
                  parts.push("—— 来自考研刷题 " + (q.subjectName || "") + " " + (q.year || "") + " 第 " + q.no + " 题");
                  try {
                    await navigator.clipboard.writeText(parts.join("\n\n"));
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1600);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                {copied ? <><Check className="size-3.5 text-ok" />已复制</> : <><Copy className="size-3.5" />复制解析</>}
              </Button>
            </div>            {q.answerNote ? (
              <p className="mt-2 flex items-start gap-1.5 text-[12px] text-bad">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{q.answerNote}
              </p>
            ) : null}
            {q.source?.url || q.source ? (
              <p className="mt-2 text-[11px] text-ink-faint">
                来源：{q.source?.url
                  ? <a className="underline decoration-dotted hover:text-brand" href={q.source.url} target="_blank" rel="noreferrer">{q.source.name || q.source.url}</a>
                  : (typeof q.source === "string" ? q.source : q.source?.name)}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* 自评 */}
        {revealed && !auto && onSelfGrade ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] text-ink-subtle">自评：</span>
            <Button size="sm" onClick={() => onSelfGrade(true)}><Check className="size-3.5" />答对了</Button>
            <Button variant="danger" size="sm" onClick={() => onSelfGrade(false)}><X className="size-3.5" />答错了</Button>
          </div>
        ) : null}

        {note ? (
          <div className="mt-3 rounded-md border border-brand-line bg-brand-soft/50 px-3 py-2">
            <div className="mb-1 flex items-center gap-1.5 text-[11.5px] font-semibold text-brand">
              <NotebookPen className="size-3.5" />我的笔记
            </div>
            <RichText text={note} subject={q.subject} className="text-[13px]" />
          </div>
        ) : null}
      </div>

      {footer ? <footer className="border-t border-line-subtle px-4 py-2.5">{footer}</footer> : null}
    </article>

    <Modal
      open={!!zoom}
      onOpenChange={(v) => !v && setZoom(null)}
      title="题目配图"
      desc={q.subjectName ? q.subjectName + (q.year ? " " + q.year + " 年" : "") + " 第 " + q.no + " 题" : undefined}
      width="max-w-4xl"
    >
      {zoom ? (
        <img src={dataImageUrl(q.subject, zoom)} alt="题目配图" className="mx-auto max-h-[70vh] w-auto rounded-md border border-line" />
      ) : null}
    </Modal>
    </>
  );
}
