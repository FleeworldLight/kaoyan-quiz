import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useStore, streak, subjectStats } from "../lib/store.js";

const NAV = [
  { to: "/", label: "首页", icon: "🏠" },
  { to: "/wrong", label: "错题本", icon: "❌" },
  { to: "/fav", label: "收藏", icon: "⭐" },
  { to: "/stats", label: "统计", icon: "📊" },
];

export default function Layout({ index, children }) {
  const s = useStore();
  const nav = useNavigate();
  const [menu, setMenu] = useState(false);
  const wrongCount = Object.keys(s.wrong).length;

  return (
    <div className="app">
      <header className="topbar">
        <button className="menu-btn" onClick={() => setMenu((v) => !v)} aria-label="菜单">☰</button>
        <div className="brand" onClick={() => nav("/")}>
          <span className="logo">考</span>
          <span className="brand-text">考研刷题</span>
        </div>
        <nav className={"topnav " + (menu ? "open" : "")} onClick={() => setMenu(false)}>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"} className={({ isActive }) => "navitem" + (isActive ? " active" : "")}>
              <span className="navicon">{n.icon}</span>
              <span>{n.label}</span>
              {n.to === "/wrong" && wrongCount > 0 && <span className="badge">{wrongCount > 999 ? "999+" : wrongCount}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="topright">
          {streak(s) > 0 && <span className="streak" title="连续学习天数">🔥 {streak(s)} 天</span>}
        </div>
      </header>
      <main className="content">{children}</main>
      <nav className="tabbar">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === "/"} className={({ isActive }) => "tab" + (isActive ? " active" : "")}>
            <span className="navicon">{n.icon}</span>
            <span className="tablabel">{n.label}</span>
            {n.to === "/wrong" && wrongCount > 0 && <span className="badge badge-sm">{wrongCount > 99 ? "99+" : wrongCount}</span>}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
