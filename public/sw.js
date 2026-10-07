/* eslint-disable no-restricted-globals */
/**
 * 考研刷题 Service Worker
 *
 * 为什么需要它：站点托管在 GitHub Pages，国内（尤其手机流量）访问 github.io
 * 经常出现 net::ERR_CONNECTION_RESET —— 应用外壳能下载，但紧随其后的
 * data/index.json、题目配图这些「后续请求」会被重置，表现为「页面能打开但题目/图片出不来」。
 *
 * 策略（针对这种弱网）：
 *   · 导航请求(index.html)  → 网络优先，失败回落缓存（既能拿到新版本，断网也能开）
 *   · 题库 JSON            → stale-while-revalidate：先用缓存秒开，后台再更新
 *   · 题目配图 / 带 hash 的静态资源 → 缓存优先（内容不会变）
 *
 * 效果：只要成功加载过一次，之后即使网络被重置/完全断网，题目和图片都能从本地缓存出来。
 *
 * ⚠️ 改了图片内容或想强制所有人刷新缓存时，把 VERSION 加一。
 */
const VERSION = "kq-v1";
const SHELL = VERSION + "-shell";
const DATA = VERSION + "-data";
const IMG = VERSION + "-img";

const OFFLINE_JSON = JSON.stringify({ offline: true });

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const c = await caches.open(SHELL);
    // 逐个 add，任何一个失败都不至于让整个 install 挂掉
    for (const u of ["./", "./index.html", "./favicon.svg"]) {
      try { await c.add(new Request(u, { cache: "reload" })); } catch { /* 忽略 */ }
    }
    // 题库索引单独预热：首屏的 fetch 可能发生在 SW 接管之前，
    // 不预热的话第一次访问的 index.json 进不了我们的缓存
    try {
      const dc = await caches.open(DATA);
      const r = await fetch(new Request("./data/index.json", { cache: "reload" }));
      if (r && r.ok) await dc.put("./data/index.json", r.clone());
    } catch { /* 忽略：联网时没拿到就等运行时缓存 */ }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// 注意用 .* 而不是 [^/]* —— 题库 JSON 有嵌套路径（data/cs408/2020.json、data/mock/xxx.json）
const isData = (p) => /\/data\/.*\.json$/.test(p);
const isImage = (p) => /\/data\/.*\/images\//.test(p);
const isHashedAsset = (p) => /\/assets\//.test(p);

/** 图片重试会带 ?r=N，缓存键要忽略它，否则重试等于绕过缓存 */
function cacheKey(req) {
  const u = new URL(req.url);
  u.searchParams.delete("r");
  return u.toString() === req.url ? req : u.toString();
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return;

  // 1) 导航：网络优先，失败回落缓存
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) {
          const c = await caches.open(SHELL);
          c.put("./index.html", fresh.clone());
        }
        return fresh;
      } catch {
        const c = await caches.open(SHELL);
        return (await c.match("./index.html")) || (await c.match("./")) ||
          new Response("离线且没有缓存副本", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    })());
    return;
  }

  // 2) 题库 JSON：先用缓存，同时在后台更新
  if (isData(url.pathname)) {
    event.respondWith((async () => {
      const c = await caches.open(DATA);
      const key = cacheKey(req);
      const cached = await c.match(key);
      const revalidate = fetch(req)
        .then((r) => { if (r && r.ok) c.put(key, r.clone()); return r; })
        .catch(() => null);
      if (cached) return cached;
      const fresh = await revalidate;
      return fresh || new Response(OFFLINE_JSON, { status: 503, headers: { "Content-Type": "application/json" } });
    })());
    return;
  }

  // 3) 配图与静态资源：缓存优先
  if (isImage(url.pathname) || isHashedAsset(url.pathname)) {
    event.respondWith((async () => {
      const name = isImage(url.pathname) ? IMG : SHELL;
      const c = await caches.open(name);
      const key = cacheKey(req);
      const cached = await c.match(key);
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) c.put(key, fresh.clone());
        return fresh;
      } catch (e) {
        return cached || new Response("", { status: 504, statusText: "offline" });
      }
    })());
  }
});

/* 允许页面主动要求「立即更新」（本站暂未用到，留着方便以后加重试按钮） */
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});
