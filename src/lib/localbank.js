/**
 * 我的错题本（手工录入错题）—— IndexedDB 存储层。
 *
 * 为什么单独一层而不是塞进 localStorage 的 s.wrong：
 *   1. 图片是二进制，localStorage 只能存字符串（base64 会膨胀 33%），且总量约 5 MB 根本不够
 *   2. s.wrong 里的每条都会被 lib/locate.js 拿去题库 JSON 里还原成结构化题目，
 *      而手工录入错题在题库里根本不存在；混进去只会污染错题统计与正确率
 *   → 所以手工录入错题自成一库，只共享「错题本」这个页面入口。
 *
 * 存储结构（DB: kaoyan-quiz-local v1）：
 *   items  元数据（纯文本，列表、筛选、统计都只读它，很快）
 *   blobs  图片本体 { id, image: Blob(长边2400), thumb: Blob(长边400) }
 *   拆成两个 store 是为了列列表时不必把几百 KB 的图片一起读出来。
 */
import { useSyncExternalStore } from "react";

const DB_NAME = "kaoyan-quiz-local";
const DB_VERSION = 1;
const STORE_META = "items";
const STORE_BLOB = "blobs";

export const LOCAL_ID_PREFIX = "local:";
export const isLocalId = (id) => typeof id === "string" && id.startsWith(LOCAL_ID_PREFIX);

/* ------------------------------ 基础 ------------------------------ */

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("当前浏览器不支持 IndexedDB（无痕模式可能禁用了它）"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_META)) {
        const st = db.createObjectStore(STORE_META, { keyPath: "id" });
        st.createIndex("createdAt", "createdAt");
        st.createIndex("subject", "subject");
      }
      if (!db.objectStoreNames.contains(STORE_BLOB)) {
        db.createObjectStore(STORE_BLOB, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error("打开本地数据库失败：" + (req.error?.message || "未知错误")));
  });
  return dbPromise;
}

function tx(storeName, mode, fn) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    let result;
    try { result = fn(store); } catch (e) { reject(e); return; }
    t.oncomplete = () => resolve(result && result.__req ? result.__req.result : result);
    t.onerror = () => reject(new Error(t.error?.message || "本地数据库操作失败"));
    t.onabort = () => reject(new Error(t.error?.message || "本地数据库操作被中断"));
  }));
}

const wrap = (req) => ({ __req: req });

/* ------------------------------ 响应式缓存 ------------------------------ */
/* 元数据列表在内存里共享一份：列表、筛选、侧栏计数、统计都读它，避免各页面各查一次 */

let snapshot = { items: [], loading: true, ready: false, error: null };
const listeners = new Set();

function emit(next) {
  snapshot = next;
  for (const fn of listeners) fn();
}
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function getSnapshot() {
  return snapshot;
}
/**
 * React hook：订阅手工录入错题列表。
 * 用 useSyncExternalStore 保证增删/导入后订阅组件真正重渲染
 * （直接返回 snapshot 的话，组件挂载后就再也不会因为 items 变化而更新）。
 */
export function useLocalBankSnapshot() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

let started = false;
function ensureLoaded() {
  if (started) return;
  started = true;
  listItems()
    .then((items) => emit({ items, loading: false, ready: true, error: null }))
    .catch((e) => emit({ items: [], loading: false, ready: true, error: e.message }));
}
if (typeof window !== "undefined") ensureLoaded();

async function refresh() {
  const items = await listItems();
  emit({ items, loading: false, ready: true, error: null });
  return items;
}

/* ------------------------------ 读 ------------------------------ */

/** 元数据列表，按添加时间倒序 */
export async function listItems() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE_META, "readonly");
    const req = t.objectStore(STORE_META).getAll();
    req.onsuccess = () => resolve((req.result || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
    req.onerror = () => reject(new Error(req.error?.message || "读取本地题目失败"));
  });
}

export async function getItem(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_META, "readonly").objectStore(STORE_META).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(new Error(req.error?.message || "读取失败"));
  });
}

/* ------------------------------ 图片 Blob 与 objectURL ------------------------------ */

const urlCache = new Map(); // `${id}:${kind}` -> objectURL

/**
 * 取图片的可显示 URL。kind: "image"（大图）| "thumb"（缩略图）
 * objectURL 会缓存，删除/更新时释放。
 */
export async function getBlobUrl(id, kind = "thumb") {
  const key = id + ":" + kind;
  if (urlCache.has(key)) return urlCache.get(key);
  const db = await openDB();
  const rec = await new Promise((resolve, reject) => {
    const req = db.transaction(STORE_BLOB, "readonly").objectStore(STORE_BLOB).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(new Error(req.error?.message || "读取图片失败"));
  });
  const blob = rec ? (kind === "thumb" ? rec.thumb || rec.image : rec.image) : null;
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(key, url);
  return url;
}

export async function getBlob(id, kind = "image") {
  const db = await openDB();
  const rec = await new Promise((resolve, reject) => {
    const req = db.transaction(STORE_BLOB, "readonly").objectStore(STORE_BLOB).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(new Error(req.error?.message || "读取图片失败"));
  });
  if (!rec) return null;
  return kind === "thumb" ? rec.thumb || rec.image : rec.image;
}

function dropUrls(id) {
  for (const kind of ["image", "thumb"]) {
    const key = id + ":" + kind;
    const url = urlCache.get(key);
    if (url) { try { URL.revokeObjectURL(url); } catch { /* 忽略 */ } urlCache.delete(key); }
  }
}

/* ------------------------------ 写 ------------------------------ */

let seq = 0;
function newId() {
  seq += 1;
  const rnd = Math.random().toString(36).slice(2, 10);
  return LOCAL_ID_PREFIX + Date.now().toString(36) + "-" + seq.toString(36) + rnd;
}

/**
 * 新增一道手工录入错题。
 * @param {object} rec
 *   image: Blob, thumb: Blob, mime, width, height        —— 由 lib/image.js 压缩产出
 *   subject, topicId, topicName, groupName                —— 从四科章节列表里选
 *   answerText                                            —— 用户自己写的答案与解析（必填）
 *   note                                                  —— 可选补充
 */
export async function addItem(rec) {
  const now = Date.now();
  const id = newId();
  const meta = {
    id,
    createdAt: now,
    updatedAt: now,
    subject: rec.subject,
    topicId: rec.topicId || null,
    topicName: rec.topicName || null,
    groupName: rec.groupName || null,
    answerText: rec.answerText || "",
    note: rec.note || "",
    mime: rec.mime || "image/webp",
    thumbMime: rec.thumbMime || rec.mime || "image/webp",
    width: rec.width || 0,
    height: rec.height || 0,
    bytes: (rec.image?.size || 0) + (rec.thumb?.size || 0),
  };
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const t = db.transaction([STORE_META, STORE_BLOB], "readwrite");
    t.objectStore(STORE_META).put(meta);
    t.objectStore(STORE_BLOB).put({ id, image: rec.image, thumb: rec.thumb });
    t.oncomplete = () => resolve();
    t.onerror = () => reject(new Error(t.error?.message || "保存失败（可能是存储空间不足）"));
    t.onabort = () => reject(new Error(t.error?.message || "保存被中断（可能是存储空间不足）"));
  });
  await refresh();
  return meta;
}

/** 改文字信息；传 image/thumb 则同时替换图片 */
export async function updateItem(id, patch) {
  const cur = await getItem(id);
  if (!cur) throw new Error("这条记录不存在了");
  const meta = { ...cur, ...patch, id, updatedAt: Date.now() };
  delete meta.image; delete meta.thumb;
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const t = db.transaction([STORE_META, STORE_BLOB], "readwrite");
    t.objectStore(STORE_META).put(meta);
    if (patch.image || patch.thumb) {
      const bs = t.objectStore(STORE_BLOB);
      const getReq = bs.get(id);
      getReq.onsuccess = () => {
        const old = getReq.result || {};
        bs.put({ id, image: patch.image || old.image, thumb: patch.thumb || old.thumb });
      };
    }
    t.oncomplete = () => resolve();
    t.onerror = () => reject(new Error(t.error?.message || "更新失败"));
  });
  dropUrls(id);
  await refresh();
  return meta;
}

export async function deleteItem(id) {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const t = db.transaction([STORE_META, STORE_BLOB], "readwrite");
    t.objectStore(STORE_META).delete(id);
    t.objectStore(STORE_BLOB).delete(id);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(new Error(t.error?.message || "删除失败"));
  });
  dropUrls(id);
  await refresh();
}

export async function clearItems() {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const t = db.transaction([STORE_META, STORE_BLOB], "readwrite");
    t.objectStore(STORE_META).clear();
    t.objectStore(STORE_BLOB).clear();
    t.oncomplete = () => resolve();
    t.onerror = () => reject(new Error(t.error?.message || "清空失败"));
  });
  for (const key of [...urlCache.keys()]) {
    const url = urlCache.get(key);
    if (url) { try { URL.revokeObjectURL(url); } catch { /* 忽略 */ } }
  }
  urlCache.clear();
  await refresh();
}

/* ------------------------------ 存储用量与持久化 ------------------------------ */

export async function storageEstimate() {
  if (!navigator.storage?.estimate) return null;
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota };
  } catch { return null; }
}

export async function isPersisted() {
  if (!navigator.storage?.persisted) return null;
  try { return await navigator.storage.persisted(); } catch { return null; }
}

/**
 * 申请持久化存储。
 * 浏览器在磁盘紧张时会主动清理「尽力而为(best-effort)」的存储，IndexedDB 会被清掉；
 * 申请成功后数据不会被自动回收（但仍可能被用户手动清除）。不保证批准。
 */
export async function requestPersistent() {
  if (!navigator.storage?.persist) return { ok: false, reason: "unsupported" };
  try {
    const granted = await navigator.storage.persist();
    return { ok: granted, reason: granted ? "granted" : "denied" };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

export async function localStats() {
  const items = await listItems();
  const bytes = items.reduce((a, x) => a + (x.bytes || 0), 0);
  const bySubject = new Map();
  for (const it of items) bySubject.set(it.subject, (bySubject.get(it.subject) || 0) + 1);
  return { count: items.length, bytes, bySubject };
}

/** 供导出用：把元数据与图片本体一起取出来 */
export async function dumpAll() {
  const items = await listItems();
  const db = await openDB();
  const out = [];
  for (const meta of items) {
    // 不要用 new Promise(async …)：executor 里抛错会被吞掉
    const rec = await new Promise((resolve) => {
      const req = db.transaction(STORE_BLOB, "readonly").objectStore(STORE_BLOB).get(meta.id);
      req.onsuccess = () => resolve(req.result || {});
      req.onerror = () => resolve({});
    });
    out.push({ meta, image: rec.image || null, thumb: rec.thumb || null });
  }
  return out;
}

/** 供导入用：按 id 合并，已存在则跳过（不覆盖用户现有内容） */
export async function importRecords(records) {
  const db = await openDB();
  const existing = new Set((await listItems()).map((x) => x.id));
  let added = 0, skipped = 0;
  for (const r of records) {
    if (!r?.meta?.id || existing.has(r.meta.id) || !r.image) { skipped++; continue; }
    const meta = { ...r.meta, bytes: (r.image?.size || 0) + (r.thumb?.size || 0) };
    await new Promise((resolve, reject) => {
      const t = db.transaction([STORE_META, STORE_BLOB], "readwrite");
      t.objectStore(STORE_META).put(meta);
      t.objectStore(STORE_BLOB).put({ id: meta.id, image: r.image, thumb: r.thumb || r.image });
      t.oncomplete = () => resolve();
      t.onerror = () => reject(new Error(t.error?.message || "导入失败（可能是存储空间不足）"));
    });
    existing.add(meta.id);
    added++;
  }
  await refresh();
  return { added, skipped };
}
