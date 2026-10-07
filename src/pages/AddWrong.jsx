import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Camera, ImagePlus, ClipboardPaste, Loader2, Check, X, AlertTriangle, Save, ArrowLeft, Trash2,
} from "lucide-react";
import { Badge, Button, Card, CardBody, CardHead, Divider, Field, Spinner, inputCls } from "../components/ui.jsx";
import TopicPicker from "../components/TopicPicker.jsx";
import { processImage, imageFromClipboard, imageFromDrop, fmtBytes, MAX_EDGE } from "../lib/image.js";
import { addItem, updateItem, deleteItem, getItem, getBlobUrl } from "../lib/localbank.js";
import { cn } from "../lib/utils.js";

/**
 * 记一道错题（拍照 / 粘贴截图 / 拖放）。
 *
 * 按约定「一次上传一道」，且图片、我的答案解析、章节标签三项**都是必填**——
 * 宁可录入时多花十秒，也不要攒下一堆没有答案、没有归类的废图。
 */
export default function AddWrong({ index }) {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get("id") || "";

  const [img, setImg] = useState(null);          // { image, thumb, mime, width, height, originalBytes, bytes }
  const [previewUrl, setPreviewUrl] = useState("");
  const [topic, setTopic] = useState({ subject: "", topicId: null, topicName: null, groupName: null });
  const [answer, setAnswer] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(!!editId);
  const [dragOver, setDragOver] = useState(false);

  const camRef = useRef(null);
  const fileRef = useRef(null);

  /* 编辑模式：载入已有记录 */
  useEffect(() => {
    if (!editId) return;
    let alive = true;
    (async () => {
      try {
        const it = await getItem(editId);
        if (!alive) return;
        if (!it) { setErr("找不到这条记录，可能已被删除。"); setLoading(false); return; }
        setTopic({ subject: it.subject, topicId: it.topicId, topicName: it.topicName, groupName: it.groupName });
        setAnswer(it.answerText || "");
        setNote(it.note || "");
        const url = await getBlobUrl(editId, "image");
        if (alive && url) setPreviewUrl(url);
      } catch (e) {
        if (alive) setErr(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [editId]);

  /* 粘贴：截图直接 Ctrl/⌘+V 是最快的录入方式 */
  useEffect(() => {
    function onPaste(e) {
      const f = imageFromClipboard(e);
      if (!f) return;
      e.preventDefault();
      handleFile(f);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  async function handleFile(file) {
    if (!file) return;
    setErr("");
    setBusy(true);
    try {
      const r = await processImage(file);
      setImg(r);
      if (previewUrl && previewUrl.startsWith("blob:") && !editId) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(r.image));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const canSave = !busy && !!topic.topicId && answer.trim().length > 0 && (!!img || !!editId);

  async function save(thenAnother) {
    if (!canSave) return;
    setBusy(true);
    setErr("");
    try {
      if (editId) {
        const patch = {
          subject: topic.subject,
          topicId: topic.topicId,
          topicName: topic.topicName,
          groupName: topic.groupName,
          answerText: answer.trim(),
          note: note.trim(),
          ...(img ? { image: img.image, thumb: img.thumb, mime: img.mime, width: img.width, height: img.height } : {}),
        };
        await updateItem(editId, patch);
      } else {
        await addItem({
          image: img.image, thumb: img.thumb, mime: img.mime, width: img.width, height: img.height,
          subject: topic.subject, topicId: topic.topicId, topicName: topic.topicName, groupName: topic.groupName,
          answerText: answer.trim(), note: note.trim(),
        });
      }
      if (thenAnother) {
        setImg(null); setPreviewUrl(""); setAnswer(""); setNote("");
        if (camRef.current) camRef.current.value = "";
        if (fileRef.current) fileRef.current.value = "";
        setBusy(false);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      nav("/wrong-retest?tab=photo");
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  async function remove() {
    if (!editId || !confirm("删除这道错题？图片也会一起删掉，无法恢复。")) return;
    await deleteItem(editId);
    nav("/wrong-retest?tab=photo");
  }

  if (loading) return <Spinner label="正在载入…" />;

  return (
    <div className="flex flex-col gap-4" data-testid="add-wrong">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/wrong-retest?tab=photo"><ArrowLeft className="size-3.5" />返回错题本</Link>
        </Button>
        <h1 className="font-serif text-[19px] font-bold text-ink-strong">{editId ? "编辑这道错题" : "记一道错题"}</h1>
        <Badge tone="brand">只存在你自己的浏览器里</Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* ---------------- 图片 ---------------- */}
        <Card>
          <CardHead title="题目图片" desc="照书上的题、截图、或从相册选。会自动压缩，不用担心占空间。" icon={ImagePlus}
            extra={img ? <Badge tone="ok">已压缩 {fmtBytes(img.bytes)}</Badge> : null} />

          <CardBody className="flex flex-col gap-3">
            {previewUrl ? (
              <div className="flex flex-col gap-2">
                <div className="overflow-hidden rounded-md border border-line bg-sunken">
                  <img src={previewUrl} alt="题目预览" className="mx-auto block max-h-[46vh] w-auto max-w-full" />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-ink-faint">
                  {img ? (
                    <>
                      <span>原图 {fmtBytes(img.originalBytes)} → 压缩后 <b className="text-ink-subtle">{fmtBytes(img.bytes)}</b></span>
                      <span>·</span>
                      <span>{img.width}×{img.height}（长边上限 {MAX_EDGE}）</span>
                    </>
                  ) : <span>当前图片（要换一张请重新拍/选）</span>}
                  <Button variant="ghost" size="sm" className="ml-auto"
                          onClick={() => (camRef.current ? camRef.current.click() : fileRef.current?.click())}>
                    更换
                  </Button>
                </div>
              </div>
            ) : (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = imageFromDrop(e); if (f) handleFile(f); }}
                className={cn("flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-10 text-center transition-colors",
                  dragOver ? "border-brand bg-brand-soft/40" : "border-line bg-subtle")}
              >
                {busy ? (
                  <>
                    <Loader2 className="size-6 animate-spin text-brand" />
                    <span className="text-[12.5px] text-ink-subtle">正在压缩图片…</span>
                  </>
                ) : (
                  <>
                    <ImagePlus className="size-7 text-ink-faint" />
                    <span className="text-[13px] font-medium text-ink-strong">把题目图片放进来</span>
                    <span className="text-[11.5px] leading-relaxed text-ink-faint">
                      手机上直接拍书上那道题；电脑上可以截图后按 <b>Ctrl/⌘ + V</b> 粘贴，或把图片拖进来
                    </span>
                    <div className="mt-1 flex flex-wrap justify-center gap-2">
                      <Button variant="primary" size="sm" onClick={() => camRef.current?.click()}>
                        <Camera className="size-3.5" />拍照
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                        <ImagePlus className="size-3.5" />从相册/文件选
                      </Button>
                    </div>
                    <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-ink-faint">
                      <ClipboardPaste className="size-3" />支持 Ctrl/⌘ + V 粘贴截图
                    </span>
                  </>
                )}
              </div>
            )}

            {/* 拍照（手机直接调相机） */}
            <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden"
                   onChange={(e) => handleFile(e.target.files?.[0])} />
            {/* 相册/文件（也是 e2e 用的入口） */}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" data-testid="pick-image"
                   onChange={(e) => handleFile(e.target.files?.[0])} />

            {err ? (
              <p className="flex items-start gap-1.5 rounded-md bg-warn-soft px-2.5 py-2 text-[12px] text-warn">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{err}
              </p>
            ) : null}
          </CardBody>
        </Card>

        {/* ---------------- 文字 ---------------- */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHead title="我的答案与解析" desc="自己写。以后翻看复习时，这里就是你要回忆的内容。" icon={Check}
              extra={<span className="text-[11.5px] text-ink-faint">必填 · {answer.trim().length} 字</span>} />
            <CardBody>
              <textarea
                className={cn(inputCls, "min-h-40 resize-y leading-relaxed")}
                placeholder={"例如：\n答案：B\n错因：把 TLB 和 Cache 的比较对象搞混了，TLB 比较的是虚页号，Cache 比较的是物理地址。\n要点：先算虚页号 → 查 TLB → 命中则得实页号 → 再查 Cache。"}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                data-testid="answer-input"
              />
            </CardBody>
          </Card>

          <Card>
            <CardHead title="属于哪一章" desc="从四科现有章节里选，方便以后按章节翻看。" icon={ClipboardPaste} />
            <CardBody>
              <TopicPicker index={index} value={topic} onChange={setTopic} />
            </CardBody>
          </Card>

          <Card>
            <CardHead title="备注（可选）" />
            <CardBody>
              <input className={inputCls} placeholder="例如：2027 版《1000 题》P58 第 12 题"
                     value={note} onChange={(e) => setNote(e.target.value)} />
            </CardBody>
          </Card>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" disabled={!canSave} onClick={() => save(false)} data-testid="save-wrong">
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              {editId ? "保存修改" : "保存到错题本"}
            </Button>
            {!editId ? (
              <Button variant="secondary" disabled={!canSave} onClick={() => save(true)}>保存并再记一道</Button>
            ) : null}
            <Button variant="ghost" asChild><Link to="/wrong-retest?tab=photo">取消</Link></Button>
            {editId ? (
              <Button variant="danger" className="ml-auto" onClick={remove}><Trash2 className="size-3.5" />删除</Button>
            ) : null}
          </div>
          {!canSave ? (
            <p className="text-[11.5px] text-ink-faint">
              还需要：
              {[
                !img && !editId ? "一张题目图片" : null,
                !answer.trim() ? "你的答案解析" : null,
                !topic.topicId ? "一个章节标签" : null,
              ].filter(Boolean).join("、")}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
