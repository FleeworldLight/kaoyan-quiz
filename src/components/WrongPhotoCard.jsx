import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, Pencil, Trash2, ImageOff, CalendarDays } from "lucide-react";
import { Badge, Button } from "../components/ui.jsx";
import { getBlobUrl } from "../lib/localbank.js";
import { cn, fmtDate } from "../lib/utils.js";

/**
 * 手工录入错题的一张卡片。
 * 缩略图从 IndexedDB 取（长边 400 的缩略图，不会把几百 KB 的大图拉进列表）。
 */
export default function WrongPhotoCard({ item, subjectName, onOpen, onDelete, onPreview, dense }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    getBlobUrl(item.id, "thumb")
      .then((u) => { if (alive) setUrl(u); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [item.id, item.updatedAt]);

  return (
    <div className="flex gap-3 rounded-lg border border-line bg-surface p-2.5 shadow-panel transition-colors hover:border-line-strong">
      <button
        type="button"
        onClick={() => onPreview?.(item)}
        title="查看大图"
        className="relative size-20 shrink-0 overflow-hidden rounded-md border border-line-subtle bg-sunken"
        data-testid="photo-thumb"
      >
        {url ? (
          <img src={url} alt="" className="size-full object-cover" loading="lazy" decoding="async" />
        ) : (
          <span className="grid size-full place-items-center text-ink-faint">
            {failed ? <ImageOff className="size-4" /> : <span className="text-[10px]">载入中</span>}
          </span>
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {item.subject && subjectName ? <Badge tone="outline">{subjectName}</Badge> : null}
          {item.topicName ? <Badge tone="neutral">{item.groupName ? item.groupName + " · " : ""}{item.topicName}</Badge> : null}
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-ink-faint">
            <CalendarDays className="size-3" />{fmtDate(item.createdAt)}
          </span>
        </div>

        <button type="button" onClick={() => onOpen?.(item)}
          className="line-clamp-2 text-left text-[12.5px] leading-relaxed text-ink-subtle hover:text-ink">
          {item.answerText ? item.answerText.replace(/\s+/g, " ").slice(0, 120) : <span className="text-ink-faint">（没有写解析）</span>}
        </button>

        {item.note ? <span className="line-clamp-1 text-[11px] text-ink-faint">{item.note}</span> : null}

        <div className={cn("flex flex-wrap items-center gap-1", dense ? "mt-0" : "mt-auto")}>
          <Button variant="ghost" size="sm" onClick={() => onOpen?.(item)}><Eye className="size-3.5" />查看</Button>
          <Button variant="ghost" size="sm" asChild>
            <Link to={"/wrong/add?id=" + encodeURIComponent(item.id)}><Pencil className="size-3.5" />编辑</Link>
          </Button>
          <Button variant="ghost" size="iconSm" className="ml-auto text-bad hover:bg-bad-soft"
                  onClick={() => onDelete?.(item)} aria-label="删除"><Trash2 className="size-3.5" /></Button>
        </div>
      </div>
    </div>
  );
}
