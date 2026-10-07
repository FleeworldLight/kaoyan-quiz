/**
 * 备份 / 恢复。
 *
 * 有两块东西要备份，形态完全不同：
 *   1. 学习状态（localStorage）—— 几十 KB 的 JSON，就是现在「备份全部数据」导出的那个
 *   2. 手工录入错题（IndexedDB）—— 每张几百 KB 的二进制
 *
 * 所以分两种导出：
 *   · 没有手工录入错题        → 还是导出单个 .json（小、可读、向后兼容）
 *   · 有手工录入错题          → 导出 .zip（state.json + manifest.json + images/ + thumbs/）
 *
 * 为什么图片不塞进 JSON：base64 会膨胀 33%，几百张图会得到一个几十 MB 的 JSON，
 * 浏览器 JSON.stringify 直接卡死。用 zip（STORE 不压缩，图片本身已压缩）最合适。
 */
import { makeZip, readZip } from "./zip.js";
import { importData } from "./store.js";
import { dumpAll, importRecords } from "./localbank.js";

const KIND = "kaoyan-quiz-backup";
const VERSION = 2;

const extOf = (mime) =>
  mime === "image/jpeg" ? "jpg" :
  mime === "image/png" ? "png" :
  mime === "image/webp" ? "webp" : "bin";

const mimeOfName = (name) =>
  /\.jpe?g$/i.test(name) ? "image/jpeg" :
  /\.png$/i.test(name) ? "image/png" :
  /\.webp$/i.test(name) ? "image/webp" : "application/octet-stream";

const bytesOf = (blob) => blob.arrayBuffer().then((b) => new Uint8Array(b));

/**
 * 导出备份。
 * @param {object} state  localStorage 里的整份状态
 * @returns {Promise<{blob:Blob, filename:string, kind:"zip"|"json", photos:number, bytes:number}>}
 */
export async function exportBackup(state) {
  const day = new Date().toISOString().slice(0, 10);
  const photos = await dumpAll();

  if (!photos.length) {
    const payload = { kind: KIND, version: VERSION, exportedAt: new Date().toISOString(), state };
    return {
      blob: new Blob([JSON.stringify(payload, null, 1)], { type: "application/json" }),
      filename: `考研刷题-学习数据-${day}.json`,
      kind: "json",
      photos: 0,
      bytes: 0,
    };
  }

  const entries = [];
  entries.push({ name: "manifest.json", data: JSON.stringify({
    kind: KIND, version: VERSION, exportedAt: new Date().toISOString(),
    photos: photos.length, hasImages: true,
    note: "images/ 与 thumbs/ 里是「手工录入错题」的图片，文件名就是记录 id；state.json 是学习状态。",
  }, null, 1) });
  entries.push({ name: "state.json", data: JSON.stringify(state) });

  const index = [];
  for (const p of photos) {
    const imgExt = extOf(p.meta.mime || p.image?.type);
    const thExt = extOf(p.meta.thumbMime || p.meta.mime || p.thumb?.type);
    const imgName = `images/${p.meta.id}.${imgExt}`;
    const thName = `thumbs/${p.meta.id}.${thExt}`;
    if (p.image) entries.push({ name: imgName, data: await bytesOf(p.image) });
    if (p.thumb) entries.push({ name: thName, data: await bytesOf(p.thumb) });
    // 把完整元数据带上（subject / 章节 / 我自己写的解析 / 备注都在这里），
    // 只把图片本体换成 zip 内的路径，导入时才能完整还原
    index.push({ ...p.meta, image: p.image ? imgName : null, thumb: p.thumb ? thName : null });
  }
  entries.push({ name: "index.json", data: JSON.stringify(index, null, 1) });

  const blob = await makeZip(entries);
  return {
    blob,
    filename: `考研刷题-备份-${day}.zip`,
    kind: "zip",
    photos: photos.length,
    bytes: blob.size,
  };
}

/**
 * 导入备份。自动识别 .json（只有状态）与 .zip（状态 + 手工录入错题）。
 * 合并策略：状态按原有规则（进度取较大值、错题收藏笔记取并集），
 *          手工录入错题按 id 去重，已存在的跳过（不覆盖你现有的内容）。
 */
export async function importBackup(file) {
  if (!file) throw new Error("没有选择文件");
  const name = (file.name || "").toLowerCase();

  // --- zip ---
  const isZip = name.endsWith(".zip") || file.type === "application/zip" || file.type === "application/x-zip-compressed";
  if (isZip) {
    const entries = await readZip(file);
    const map = new Map(entries.map((e) => [e.name, e.data]));
    const dec = new TextDecoder();

    let stateStats = null;
    let photoStats = { added: 0, skipped: 0 };

    const stateRaw = map.get("state.json") || map.get("manifest.json");
    if (map.has("state.json")) {
      stateStats = importData(JSON.parse(dec.decode(map.get("state.json"))));
    } else if (map.has("manifest.json")) {
      // 兼容：万一 manifest 里带了 state
      const m = JSON.parse(dec.decode(map.get("manifest.json")));
      if (m.state) stateStats = importData(m.state);
    }

    let index = [];
    if (map.has("index.json")) {
      index = JSON.parse(dec.decode(map.get("index.json")));
    } else {
      // 没有 index.json 时按文件名推断：images/<id>.<ext>
      index = entries
        .filter((e) => e.name.startsWith("images/"))
        .map((e) => ({ id: e.name.replace(/^images\//, "").replace(/\.[^.]+$/, ""), image: e.name, thumb: null }));
    }

    const records = [];
    for (const it of index) {
      const img = it.image ? map.get(it.image) : null;
      if (!img) continue;
      const th = it.thumb ? map.get(it.thumb) : null;
      const imgMime = it.mime || mimeOfName(it.image);
      records.push({
        meta: {
          // 优先用备份里的完整元数据；缺失字段再兜底
          ...it,
          id: it.id,
          createdAt: it.createdAt || Date.now(),
          updatedAt: it.updatedAt || Date.now(),
          subject: it.subject || "math1",
          answerText: it.answerText || "",
          mime: imgMime,
          thumbMime: it.thumbMime || (th ? mimeOfName(it.thumb || it.image) : imgMime),
        },
        image: new Blob([img], { type: imgMime }),
        thumb: th ? new Blob([th], { type: it.thumbMime || mimeOfName(it.thumb || it.image) }) : null,
      });
    }
    if (records.length) photoStats = await importRecords(records);

    return { kind: "zip", state: stateStats, photos: photoStats };
  }

  // --- json ---
  const text = await file.text();
  let obj;
  try { obj = JSON.parse(text); } catch { throw new Error("这个文件不是有效的 JSON"); }
  const stateStats = importData(obj);
  return { kind: "json", state: stateStats, photos: { added: 0, skipped: 0 } };
}

/** 拼一句给用户看的结果 */
export function describeImport(r) {
  const parts = [];
  if (r.state) {
    parts.push(`进度 ${r.state.progress} 条、错题 ${r.state.wrong} 条、收藏 ${r.state.fav} 条、笔记 ${r.state.notes} 条、记录 ${r.state.records} 条`);
  }
  if (r.kind === "zip") parts.push(`手工录入错题新增 ${r.photos.added} 道（已存在跳过 ${r.photos.skipped} 道）`);
  return parts.length ? "导入完成：" + parts.join("；") : "文件里没有可导入的内容。";
}
