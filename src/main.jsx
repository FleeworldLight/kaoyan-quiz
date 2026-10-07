import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import "katex/dist/katex.min.css";
import "./index.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);

/*
 * 注册 Service Worker（仅生产构建）。
 *
 * 站点托管在 GitHub Pages，国内手机流量访问 github.io 经常出现
 * net::ERR_CONNECTION_RESET —— 应用外壳能下来，但紧随其后的 data/index.json
 * 和题目配图会被重置，表现就是「页面能开、题目或图片出不来」。
 * 注册后只要成功加载过一次，之后即使网络被重置甚至断网也能从缓存正常用。
 *
 * 相对路径 "./sw.js" 会自动适配 GitHub Pages 的子路径部署。
 */
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((e) => {
      // 注册失败不影响正常使用，静默忽略（常见于 http:// 非 localhost 环境）
      console.warn("[sw] 注册失败：", e?.message || e);
    });
  });
}
