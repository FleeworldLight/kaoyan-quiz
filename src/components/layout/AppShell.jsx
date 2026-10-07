import React, { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  House, Library, FileStack, Compass, Network, RefreshCw, Wand2, Star,
  NotebookPen, History, Menu, Search, Flame, ChevronRight, Settings, Info, X,
} from "lucide-react";
import { Button, Card, IconButton, Modal, Badge, Progress, TipProvider, Tip, Empty, inputCls } from "../ui.jsx";
import { cn, accuracy, fmtDayKey } from "../../lib/utils.js";
import { useStore, streak, subjectStats } from "../../lib/store.js";
import { allQuestions } from "../../lib/data.js";
import { useLocalBankSnapshot } from "../../lib/localbank.js";

export const NAV_MAIN = [
  { to: "/", label: "首页", icon: House, end: true },
  { to: "/library", label: "题库", icon: Library },
  { to: "/mock", label: "模拟卷", icon: FileStack },
  { to: "/smart-compose", label: "智能组卷", icon: Wand2 },
  { to: "/wrong-retest", label: "错题复测", icon: RefreshCw, badge: "wrong" },
  { to: "/mastery", label: "掌握地图", icon: Compass },
  { to: "/graph", label: "知识图谱", icon: Network },
];
export const NAV_SUB = [
  { to: "/favorites", label: "收藏本", icon: Star, badge: "fav" },
  { to: "/notes", label: "题目笔记", icon: NotebookPen, badge: "notes" },
  { to: "/records", label: "学习记录", icon: History },
  { to: "/about", label: "数据说明", icon: Info },
];
export const NAV_TAB = [
  { to: "/", label: "首页", icon: House, end: true },
  { to: "/library", label: "题库", icon: Library },
  { to: "/wrong-retest", label: "错题", icon: RefreshCw, badge: "wrong" },
  { to: "/mastery", label: "掌握", icon: Compass },
];

const CRUMB = {
  "/": "学习区",
  "/library": "题库",
  "/mock": "模拟卷",
  "/practice": "答题",
  "/smart-compose": "智能组卷",
  "/wrong-retest": "错题复测",
  "/mastery": "掌握地图",
  "/graph": "知识图谱",
  "/about": "数据来源与说明",
  "/favorites": "收藏本",
  "/notes": "题目笔记",
  "/records": "学习记录",
};

/* ------------------------------------------------------------------ */
export default function AppShell({ index, children }) {
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const loc = useLocation();
  const s = useStore();
  const localSnap = useLocalBankSnapshot();

  useEffect(() => { setOpen(false); }, [loc.pathname, loc.search]);
  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen(true); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const wrongN = Object.keys(s.wrong).length;
  const favN = Object.keys(s.fav).length;
  const noteN = Object.keys(s.notes).length;
  // 本地图片题也算「错题」：它们不进 s.wrong（避免污染题库统计），
  // 但用户在侧栏看到的错题数应当把两部分加起来
  const localN = localSnap.items.length;
  const counts = { wrong: wrongN + localN, fav: favN, notes: noteN };
  const crumb = CRUMB[loc.pathname] || "学习区";

  return (
    <TipProvider>
      <div className="min-h-screen bg-canvas">
        {/* ---------------------- 桌面侧栏 ---------------------- */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[236px] flex-col border-r border-line bg-surface lg:flex">
          <SidebarContent index={index} counts={counts} />
        </aside>

        {/* ---------------------- 移动抽屉 ---------------------- */}
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-[#0c1421]/45" onClick={() => setOpen(false)} />
            <aside className="absolute inset-y-0 left-0 flex w-[264px] flex-col border-r border-line bg-surface shadow-pop">
              <div className="flex items-center justify-end px-2 pt-2">
                <IconButton size="iconSm" onClick={() => setOpen(false)} aria-label="关闭"><X className="size-4" /></IconButton>
              </div>
              <SidebarContent index={index} counts={counts} />
            </aside>
          </div>
        )}

        {/* ---------------------- 主区域 ---------------------- */}
        <div className="lg:pl-[236px]">
          <header className="sticky top-0 z-20 border-b border-line bg-surface/92 backdrop-blur-md">
            <div className="mx-auto flex h-12 max-w-[1180px] items-center gap-2 px-3 sm:px-5">
              <IconButton size="iconSm" className="lg:hidden" onClick={() => setOpen(true)} aria-label="菜单">
                <Menu className="size-4.5" />
              </IconButton>
              <div className="flex min-w-0 items-center gap-1.5 text-[13px]">
                <span className="text-ink-faint">学习区</span>
                <ChevronRight className="size-3.5 shrink-0 text-ink-faint" />
                <span className="truncate font-semibold text-ink">{crumb}</span>
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  onClick={() => setSearchOpen(true)}
                  className="hidden h-7.5 items-center gap-2 rounded-md border border-line bg-subtle px-2.5 text-[12.5px] text-ink-faint transition-colors hover:border-line-strong hover:text-ink-subtle sm:flex"
                >
                  <Search className="size-3.5" />
                  <span>搜索题目…</span>
                  <kbd className="rounded border border-line bg-surface px-1 font-mono text-[10.5px]">Ctrl K</kbd>
                </button>
                <IconButton size="iconSm" className="sm:hidden" onClick={() => setSearchOpen(true)} aria-label="搜索">
                  <Search className="size-4" />
                </IconButton>
                {streak(s) > 0 && (
                  <span className="hidden items-center gap-1 rounded-md bg-warn-soft px-2 py-1 text-[12px] font-semibold text-warn sm:flex">
                    <Flame className="size-3.5" />{streak(s)} 天
                  </span>
                )}
                <Button variant="ghost" size="sm" asChild>
                  <NavLink to="/records"><History className="size-3.5" />学习记录</NavLink>
                </Button>
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-[1180px] px-3 pt-4 pb-24 sm:px-5 lg:pb-10">{children}</main>

          <footer className="mx-auto max-w-[1180px] px-3 pb-24 text-[11.5px] text-ink-faint sm:px-5 lg:pb-8">
            题库内容来自互联网公开渠道，版权归原出版/命题单位所有，仅供个人学习交流。
          </footer>
        </div>

        {/* ---------------------- 移动底部导航 ---------------------- */}
        <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/96 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
          {NAV_TAB.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cn("relative flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10.5px] font-medium transition-colors",
                  isActive ? "text-brand" : "text-ink-subtle")
              }
            >
              <n.icon className="size-5" />
              {n.label}
              {n.badge && counts[n.badge] > 0 && (
                <span className="absolute top-0.5 right-[22%] min-w-4 rounded-full bg-bad px-1 text-[9.5px] leading-4 text-white">
                  {counts[n.badge] > 99 ? "99+" : counts[n.badge]}
                </span>
              )}
            </NavLink>
          ))}
          <button onClick={() => setOpen(true)} className="flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10.5px] font-medium text-ink-subtle">
            <Menu className="size-5" />更多
          </button>
        </nav>

        <SearchModal open={searchOpen} onOpenChange={setSearchOpen} index={index} />
      </div>
    </TipProvider>
  );
}

/* ------------------------------------------------------------------ */
function NavEntry({ item, counts }) {
  const Icon = item.icon;
  const n = item.badge ? counts[item.badge] : 0;
  return (
    <NavLink to={item.to} end={item.end} className="nav-entry">
      <Icon className="size-4 shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
      {n > 0 && (
        <span className={cn("rounded-full px-1.5 text-[10.5px] leading-4 font-semibold",
          item.badge === "wrong" ? "bg-bad-soft text-bad" : "bg-brand-soft text-brand")}>
          {n > 999 ? "999+" : n}
        </span>
      )}
    </NavLink>
  );
}

function SidebarContent({ index, counts }) {
  const nav = useNavigate();
  const s = useStore();
  return (
    <>
      <div className="flex items-center gap-2.5 px-4 py-3.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-navy font-serif text-[15px] font-bold text-white">考</span>
        <div className="min-w-0">
          <div className="truncate font-serif text-[15px] font-bold tracking-tight text-ink-strong">考研刷题</div>
          <div className="truncate text-[11px] text-ink-faint">政治 · 英语一 · 数学一 · 408</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        <div className="px-2 pt-1 pb-1 text-[10.5px] font-semibold tracking-wide text-ink-faint">学习</div>
        <div className="flex flex-col gap-px">
          {NAV_MAIN.map((n) => <NavEntry key={n.to} item={n} counts={counts} />)}
        </div>

        <div className="px-2 pt-3.5 pb-1 text-[10.5px] font-semibold tracking-wide text-ink-faint">我的</div>
        <div className="flex flex-col gap-px">
          {NAV_SUB.map((n) => <NavEntry key={n.to} item={n} counts={counts} />)}
        </div>

        <div className="px-2 pt-3.5 pb-1.5 text-[10.5px] font-semibold tracking-wide text-ink-faint">题库</div>
        <div className="flex flex-col gap-px px-0.5">
          {index.subjects.map((sub) => {
            const st = subjectStats(s, sub.id);
            const p = sub.questionCount ? Math.min(1, st.done / sub.questionCount) : 0;
            return (
              <button
                key={sub.id}
                onClick={() => nav("/library?subject=" + sub.id)}
                className="group flex flex-col gap-1 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-sunken"
              >
                <span className="flex items-center gap-2">
                  <i className="size-2 shrink-0 rounded-sm" style={{ background: sub.color }} />
                  <span className="flex-1 truncate text-[12.5px] font-medium text-ink">{sub.name}</span>
                  <span className="text-[11px] tabular-nums text-ink-faint">{sub.questionCount}</span>
                </span>
                <span className="pl-4"><Progress value={p} height={3} /></span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 rounded-lg border border-line-subtle bg-subtle px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-muted">
            <Info className="size-3.5" />数据说明
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">
            真题 {index.subjects.reduce((a, x) => a + x.papers.length, 0)} 套 / {index.subjects.reduce((a, x) => a + x.questionCount, 0)} 题。
            模拟卷与部分年份标注了质量等级，答案存疑的题会打徽标。
          </p>
        </div>
      </nav>
    </>
  );
}

/* ------------------------------------------------------------------ */
function SearchModal({ open, onOpenChange, index }) {
  const [q, setQ] = useState("");
  const [pool, setPool] = useState(null);
  const [subject, setSubject] = useState("all");
  const nav = useNavigate();

  useEffect(() => {
    if (!open || pool) return;
    let alive = true;
    (async () => {
      const all = [];
      for (const sub of index.subjects) {
        const qs = await allQuestions(sub.id).catch(() => []);
        for (const x of qs) all.push({ ...x, subjectName: sub.name });
      }
      if (alive) setPool(all);
    })();
    return () => { alive = false; };
  }, [open, pool, index]);

  const results = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw || !pool) return [];
    const list = subject === "all" ? pool : pool.filter((x) => x.subject === subject);
    const out = [];
    for (const x of list) {
      const hay = (x.stem + " " + (x.options || []).map((o) => o.text).join(" ") + " " + x.answer).toLowerCase();
      if (hay.includes(kw)) {
        out.push(x);
        if (out.length >= 60) break;
      }
    }
    return out;
  }, [q, pool, subject]);

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="搜索题目" desc="按题干、选项、答案关键词检索全库" width="max-w-2xl">
      <input
        autoFocus
        className={inputCls}
        placeholder="输入关键词，例如「拐点」「二叉树」「社会主要矛盾」"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <button onClick={() => setSubject("all")} className={cn("rounded-md border px-2 py-1 text-[12px]", subject === "all" ? "border-brand-line bg-brand-soft text-brand" : "border-line text-ink-subtle")}>全部</button>
        {index.subjects.map((sub) => (
          <button key={sub.id} onClick={() => setSubject(sub.id)}
            className={cn("rounded-md border px-2 py-1 text-[12px]", subject === sub.id ? "border-brand-line bg-brand-soft text-brand" : "border-line text-ink-subtle")}>
            {sub.name}
          </button>
        ))}
      </div>

      <div className="mt-3">
        {!q.trim() && <p className="py-6 text-center text-[12.5px] text-ink-faint">{pool ? "输入关键词开始搜索" : "正在载入题库…"}</p>}
        {q.trim() && !results.length && pool && <Empty title="没有匹配的题目" desc="换个关键词试试，或减少限定科目。" />}
        {results.length > 0 && (
          <div className="flex max-h-[46vh] flex-col gap-1.5 overflow-y-auto">
            {results.map((x) => (
              <button
                key={x.id}
                onClick={() => { onOpenChange(false); nav("/library?subject=" + x.subject + "&paper=" + (x.year || "") + "&focus=" + x.id); }}
                className="rounded-md border border-line px-3 py-2 text-left transition-colors hover:border-brand-line hover:bg-brand-soft/40"
              >
                <span className="flex items-center gap-2">
                  <Badge tone="brand">{x.subjectName}</Badge>
                  <span className="text-[11.5px] text-ink-faint">{x.paperTitle} · 第 {x.no} 题</span>
                </span>
                <span className="mt-1 line-clamp-2 block text-[12.5px] text-ink">{x.stem.replace(/\$/g, "").slice(0, 150)}</span>
              </button>
            ))}
            {results.length >= 60 && <p className="py-2 text-center text-[11.5px] text-ink-faint">只显示前 60 条结果</p>}
          </div>
        )}
      </div>
    </Modal>
  );
}
