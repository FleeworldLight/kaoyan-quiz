import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Home from "./pages/Home.jsx";
import Subject from "./pages/Subject.jsx";
import Run from "./pages/Run.jsx";
import Wrong from "./pages/Wrong.jsx";
import Fav from "./pages/Fav.jsx";
import Stats from "./pages/Stats.jsx";
import { loadIndex } from "./lib/data.js";

export default function App() {
  const [index, setIndex] = useState(null);
  const [err, setErr] = useState(null);
  const loc = useLocation();

  useEffect(() => {
    loadIndex().then(setIndex).catch((e) => setErr(e.message));
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [loc.pathname, loc.search]);

  if (err) {
    return (
      <div className="boot">
        <h2>题库加载失败</h2>
        <p className="muted">{err}</p>
        <p className="muted">请确认 <code>public/data/index.json</code> 存在，且通过本地服务器（而非 file://）打开。</p>
      </div>
    );
  }
  if (!index) {
    return <div className="boot"><div className="spinner" /><p className="muted">正在加载题库…</p></div>;
  }

  return (
    <Layout index={index}>
      <Routes>
        <Route path="/" element={<Home index={index} />} />
        <Route path="/s/:subject" element={<Subject index={index} />} />
        <Route path="/run" element={<Run />} />
        <Route path="/wrong" element={<Wrong index={index} />} />
        <Route path="/fav" element={<Fav index={index} />} />
        <Route path="/stats" element={<Stats index={index} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
