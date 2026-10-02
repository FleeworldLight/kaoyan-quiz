import React, { useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useStore, subjectStats, topicStats } from "../lib/store.js";

const QLABEL = { high: "质量高", medium: "有小瑕疵", low: "OCR 较差" };

export default function Subject({ index }) {
  const { subject } = useParams();
  const nav = useNavigate();
  const s = useStore();
  const [tab, setTab] = useState("papers");
  const sub = index.subjects.find((x) => x.id === subject);

  const st = useMemo(() => (sub ? subjectStats(s, sub.id) : null), [s, sub]);
  const ts = useMemo(() => (sub ? topicStats(s, sub.id) : []), [s, sub]);
  const topicAcc = useMemo(() => new Map(ts.map((t) => [t.topic, t])), [ts]);

  const [mix, setMix] = useState(() => Object.fromEntries(index.subjects.map((x) => [x.id, x.id === subject ? 20 : 0])));
  const [count, setCount] = useState(20);

  if (!sub) return <div className="card empty">没有这个科目。<Link className="btn" to="/">返回首页</Link></div>;

  const papers = [...(sub.papers || [])].sort((a, b) => b.year - a.year);

  return (
    <>
      <div className="row" style={{ marginBottom: 6 }}>
        <button className="btn sm ghost" onClick={() => nav("/")}>← 首页</button>
      </div>
      <h1 className="page-title">{sub.fullName || sub.name}</h1>
      <p className="page-sub">
        共 {papers.length} 套 · {sub.questionCount || 0} 题（选择题 {sub.choiceCount || 0} 题）
        {st && st.right + st.wrong > 0 ? ` · 你的正确率 ${Math.round(st.accuracy * 100)}%` : ""}
      </p>

      <div className="tabs">
        <button className={"tab-btn" + (tab === "papers" ? " active" : "")} onClick={() => setTab("papers")}>年份套卷</button>
        <button className={"tab-btn" + (tab === "topics" ? " active" : "")} onClick={() => setTab("topics")}>章节练习</button>
        <button className={"tab-btn" + (tab === "random" ? " active" : "")} onClick={() => setTab("random")}>随机组卷</button>
      </div>

      {tab === "papers" && (
        <div className="grid" style={{ gap: 9 }}>
          {papers.map((p) => (
            <div className="paper-item" key={p.id}>
              <span className="yr">{p.year}</span>
              <span className="pmeta">
                {p.questionCount} 题 · 选择 {p.choiceCount} · {p.duration || 180} 分钟
              </span>
              {p.quality && p.quality !== "high" && (
                <span className={"tag q-" + p.quality}>{QLABEL[p.quality] || p.quality}</span>
              )}
              <button className="btn sm"
                      onClick={() => nav(`/run?mode=paper&subject=${sub.id}&year=${p.year}&practice=1`)}>
                练习
              </button>
              <button className="btn sm primary"
                      onClick={() => nav(`/run?mode=paper&subject=${sub.id}&year=${p.year}`)}>
                模考
              </button>
            </div>
          ))}
          {!papers.length && <div className="card empty">这个科目还没有导入试卷。</div>}
        </div>
      )}

      {tab === "topics" && (
        <>
          <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
            按知识点跨年份抽题。数字是题库里的题量；有百分比的说明你已经练过这个知识点。
          </p>
          {(() => {
            const groups = new Map();
            for (const t of sub.topics || []) {
              const g = t.groupName || t.group || "其他";
              if (!groups.has(g)) groups.set(g, []);
              groups.get(g).push(t);
            }
            if (!groups.size) {
              return <div className="card empty">这个科目还没有知识点标签。先用「年份套卷」或「随机组卷」练吧。</div>;
            }
            return (
              <>
                <div className="row" style={{ marginBottom: 16 }}>
                  <button className="btn sm primary"
                    onClick={() => nav(`/run?mode=chapter&subject=${sub.id}&topic=__all__&count=${count}`)}>
                    全部章节混合练习（{count} 题）
                  </button>
                  <span className="muted" style={{ fontSize: 13 }}>共 {sub.topics.length} 个知识点</span>
                </div>
                {[...groups.entries()].map(([g, list]) => (
                  <div key={g} style={{ marginBottom: 20 }}>
                    <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
                      <b>{g}</b>
                      <span className="muted" style={{ fontSize: 12.5 }}>{list.length} 个知识点</span>
                    </div>
                    <div className="grid c2" style={{ gap: 9 }}>
                      {list.map((t) => {
                        const acc = topicAcc.get(t.id);
                        return (
                          <div className="topic-item" key={t.id} style={{ cursor: "pointer" }}
                               onClick={() => nav(`/run?mode=chapter&subject=${sub.id}&topic=${encodeURIComponent(t.id)}&count=${count}`)}>
                            <span className="tname">{t.name || t.id}</span>
                            <span className="muted" style={{ fontSize: 12.5 }}>{t.count} 题</span>
                            {acc && acc.right + acc.wrong > 0 && (
                              <span className={"tag " + (acc.accuracy >= 0.8 ? "q-high" : acc.accuracy >= 0.6 ? "q-medium" : "q-low")}>
                                {Math.round(acc.accuracy * 100)}%
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </>
            );
          })()}
        </>
      )}

      {tab === "random" && (
        <div className="card">
          <b>随机组卷</b>
          <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
            四科可以混合组卷。只选客观题可以自动评分；需要填空/解答题时把下面的开关关掉。
          </p>
          <div className="grid c2" style={{ marginTop: 14 }}>
            {index.subjects.map((x) => (
              <div className="row" key={x.id} style={{ justifyContent: "space-between" }}>
                <span>{x.name}</span>
                <input type="number" min="0" max="100" style={{ width: 90 }} value={mix[x.id] ?? 0}
                       onChange={(e) => setMix({ ...mix, [x.id]: Math.max(0, Number(e.target.value) || 0) })} />
              </div>
            ))}
          </div>
          <div className="navrow">
            <button className="btn primary" onClick={() => {
              const m = Object.fromEntries(Object.entries(mix).filter(([, v]) => v > 0));
              if (!Object.keys(m).length) return;
              nav(`/run?mode=random&onlyChoice=true&mix=${encodeURIComponent(JSON.stringify(m))}&seed=${Math.floor(Math.random() * 1e6)}`);
            }}>开始随机练习</button>
            <label className="muted row" style={{ fontSize: 13, gap: 6 }}>
              <input type="checkbox" defaultChecked onChange={(e) => {}} /> 仅客观题
            </label>
          </div>
        </div>
      )}
    </>
  );
}
