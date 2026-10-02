import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useStore, subjectStats, topicStats, heatmap, streak, resetAll } from "../lib/store.js";

function level(n) {
  if (!n) return "";
  if (n < 10) return "l1";
  if (n < 25) return "l2";
  if (n < 50) return "l3";
  return "l4";
}
function fmtDate(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function fmtDur(sec) {
  if (!sec) return "—";
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} 小时 ${m % 60} 分` : `${m} 分钟`;
}

const MODE_LABEL = { exam: "整套模考", chapter: "章节练习", random: "随机组卷", wrong: "错题重做", fav: "收藏练习", paper: "套卷练习" };

export default function Stats({ index }) {
  const s = useStore();

  const sum = useMemo(() => {
    let right = 0, wrong = 0, answered = 0;
    for (const p of Object.values(s.progress)) { right += p.right || 0; wrong += p.wrong || 0; }
    answered = right + wrong;
    const totalTime = s.records.reduce((a, r) => a + (r.durationSec || 0), 0);
    return { right, wrong, answered, sessions: s.records.length, acc: answered ? right / answered : 0, totalTime };
  }, [s.progress, s.records]);

  const days = useMemo(() => heatmap(s, 26), [s.records]);
  const weeks = useMemo(() => {
    const out = [];
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
    return out;
  }, [days]);

  const weakTopics = useMemo(() => {
    const all = [];
    for (const sub of index.subjects) {
      for (const t of topicStats(s, sub.id)) {
        if (t.right + t.wrong >= 3) all.push({ ...t, subject: sub.name, subjectId: sub.id });
      }
    }
    return all.sort((a, b) => a.accuracy - b.accuracy).slice(0, 12);
  }, [s.progress, index]);

  const recent = useMemo(() => [...s.records].reverse().slice(0, 20), [s.records]);

  return (
    <>
      <h1 className="page-title">学习统计</h1>
      <p className="page-sub">所有数据都存在这台设备的浏览器里，不会上传。</p>

      <div className="grid c4">
        <div className="stat"><div className="k">累计答对</div><div className="v" style={{ color: "var(--ok)" }}>{sum.right}</div></div>
        <div className="stat"><div className="k">累计答错</div><div className="v" style={{ color: "var(--bad)" }}>{sum.wrong}</div></div>
        <div className="stat"><div className="k">总正确率</div><div className="v">{Math.round(sum.acc * 100)}<small>%</small></div></div>
        <div className="stat"><div className="k">连续学习</div><div className="v">{streak(s)}<small> 天</small></div></div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <b>学习热力图</b>
          <span className="muted" style={{ fontSize: 13 }}>最近 26 周 · 共练习 {sum.sessions} 次 · 累计 {fmtDur(sum.totalTime)}</span>
        </div>
        <div style={{ overflowX: "auto", marginTop: 14 }}>
          <div className="heat">
            {weeks.map((wk, wi) => (
              <React.Fragment key={wi}>
                {wk.map((d) => (
                  <i key={d.key} className={level(d.count)} title={`${d.key} · ${d.count} 题`} />
                ))}
              </React.Fragment>
            ))}
          </div>
        </div>
        <div className="legend">
          少 <i style={{ background: "#eceef5" }} /><i style={{ background: "#c7d2fe" }} /><i style={{ background: "#818cf8" }} /><i style={{ background: "#4f46e5" }} /><i style={{ background: "#312e81" }} /> 多
        </div>
      </div>

      <div className="card">
        <b>各科进度</b>
        <div className="grid" style={{ gap: 12, marginTop: 12 }}>
          {index.subjects.map((sub) => {
            const st = subjectStats(s, sub.id);
            const pct = sub.questionCount ? Math.min(100, (st.done / sub.questionCount) * 100) : 0;
            return (
              <div key={sub.id}>
                <div className="row" style={{ justifyContent: "space-between", fontSize: 14 }}>
                  <span style={{ fontWeight: 600 }}>{sub.fullName || sub.name}</span>
                  <span className="muted">
                    {st.done}/{sub.questionCount} 题
                    {st.right + st.wrong > 0 ? ` · 正确率 ${Math.round(st.accuracy * 100)}%` : ""}
                  </span>
                </div>
                <div className="meter" style={{ marginTop: 6 }}><i style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <b>待加强的知识点</b>
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>至少做过 3 题、正确率最低的知识点。</p>
        {!weakTopics.length && <p className="muted" style={{ marginTop: 10 }}>数据还不够，多练几道题再来看看。</p>}
        <div className="grid c2" style={{ gap: 9, marginTop: 12 }}>
          {weakTopics.map((t) => (
            <div className="topic-item" key={t.subjectId + t.topic}>
              <span className="tname">
                {t.topic}
                <span className="muted" style={{ fontSize: 12, marginLeft: 6 }}>{t.subject}</span>
              </span>
              <span className="muted" style={{ fontSize: 12.5 }}>{t.right}/{t.right + t.wrong}</span>
              <span className={"tag " + (t.accuracy >= 0.8 ? "q-high" : t.accuracy >= 0.6 ? "q-medium" : "q-low")}>
                {Math.round(t.accuracy * 100)}%
              </span>
              <Link className="btn sm" to={`/run?mode=chapter&subject=${t.subjectId}&topic=${encodeURIComponent(t.topic)}&count=15`}>练</Link>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <b>最近练习记录</b>
        {!recent.length && <p className="muted" style={{ marginTop: 10 }}>还没有练习记录。</p>}
        <div style={{ marginTop: 10 }}>
          {recent.map((r) => (
            <div className="row" key={r.id} style={{ justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line)", fontSize: 14 }}>
              <span>{MODE_LABEL[r.mode] || r.mode}{r.topic ? ` · ${r.topic}` : ""}</span>
              <span className="muted">
                {r.total} 题{r.total ? ` · 正确率 ${Math.round((r.correct / r.total) * 100)}%` : ""} · {fmtDur(r.durationSec)}
              </span>
              <span className="muted" style={{ fontSize: 12.5 }}>{fmtDate(r.at)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <b>设置</b>
        <div className="grid c2" style={{ marginTop: 12 }}>
          <label className="row" style={{ justifyContent: "space-between" }}>
            <span>作答后立即显示答案</span>
            <input type="checkbox" checked={s.settings.instantReveal}
                   onChange={(e) => import("../lib/store.js").then((m) => m.setSettings({ instantReveal: e.target.checked }))} />
          </label>
          <label className="row" style={{ justifyContent: "space-between" }}>
            <span>选择题选项随机打乱</span>
            <input type="checkbox" checked={s.settings.shuffleOptions}
                   onChange={(e) => import("../lib/store.js").then((m) => m.setSettings({ shuffleOptions: e.target.checked }))} />
          </label>
        </div>
        <div className="navrow">
          <button className="btn sm danger" onClick={() => { if (confirm("确定清空所有学习记录、错题本和收藏？此操作不可恢复。")) resetAll(); }}>
            清空全部学习数据
          </button>
        </div>
      </div>
    </>
  );
}
