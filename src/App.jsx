import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import AppShell from "./components/layout/AppShell.jsx";
import { Button } from "./components/ui.jsx";
import { loadIndex } from "./lib/data.js";
import Dashboard from "./pages/Dashboard.jsx";
import Library from "./pages/Library.jsx";
import Mock from "./pages/Mock.jsx";
import Practice from "./pages/Practice.jsx";
import SmartCompose from "./pages/SmartCompose.jsx";
import WrongRetest from "./pages/WrongRetest.jsx";
import MasteryMap from "./pages/MasteryMap.jsx";
import KnowledgeGraph from "./pages/KnowledgeGraph.jsx";
import Favorites from "./pages/Favorites.jsx";
import Notes from "./pages/Notes.jsx";
import Records from "./pages/Records.jsx";
import About from "./pages/About.jsx";
import AddWrong from "./pages/AddWrong.jsx";
import PhotoReview from "./pages/PhotoReview.jsx";

export default function App() {
  const [index, setIndex] = useState(null);
  const [err, setErr] = useState(null);
  const loc = useLocation();

  useEffect(() => {
    loadIndex().then(setIndex).catch((e) => setErr(e.message));
  }, []);

  useEffect(() => {
    if (!loc.pathname.startsWith("/practice")) window.scrollTo({ top: 0 });
  }, [loc.pathname, loc.search]);

  if (err) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas px-6">
        <div className="max-w-md rounded-lg border border-line bg-surface p-6 text-center shadow-panel">
          <h2 className="text-[16px] font-semibold text-ink-strong">题库加载失败</h2>
          <p className="mt-2 text-[13px] text-ink-subtle">{err}</p>
          <p className="mt-1 text-[12.5px] text-ink-faint">
            请确认 <code className="rounded bg-sunken px-1">public/data/index.json</code> 存在，
            并通过本地服务器（而非 file://）打开。
          </p>
          <Button className="mt-4" variant="primary" onClick={() => location.reload()}>重新加载</Button>
        </div>
      </div>
    );
  }

  if (!index) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-6 animate-spin text-brand" />
          <p className="text-[13px] text-ink-subtle">正在载入题库…</p>
        </div>
      </div>
    );
  }

  return (
    <AppShell index={index}>
      <Routes>
        <Route path="/" element={<Dashboard index={index} />} />
        <Route path="/library" element={<Library index={index} />} />
        <Route path="/mock" element={<Mock index={index} />} />
        <Route path="/practice" element={<Practice index={index} />} />
        <Route path="/smart-compose" element={<SmartCompose index={index} />} />
        <Route path="/wrong-retest" element={<WrongRetest index={index} />} />
        <Route path="/wrong/add" element={<AddWrong index={index} />} />
        <Route path="/wrong/view" element={<PhotoReview index={index} />} />
        <Route path="/mastery" element={<MasteryMap index={index} />} />
        <Route path="/graph" element={<KnowledgeGraph index={index} />} />
        <Route path="/favorites" element={<Favorites index={index} />} />
        <Route path="/notes" element={<Notes index={index} />} />
        <Route path="/records" element={<Records index={index} />} />
        <Route path="/about" element={<About index={index} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
