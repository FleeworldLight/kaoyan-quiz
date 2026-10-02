import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Flame, Target, TrendingUp, BookOpenCheck, ArrowRight, RefreshCw, Star,
  NotebookPen, Clock, Play, FileStack, Compass, CalendarDays, Sparkles, AlertTriangle,
} from "lucide-react";
import { Badge, Button, Card, CardBody, CardHead, Empty, IconButton, Progress, StatCard, Tip } from "../components/ui.jsx";
import { PracticeHeatmap, ActivityTrend, DonutStat } from "../components/Charts.jsx";
import { useStore, subjectStats, topicStats, heatmap, streak } from "../lib/store.js";
import { accuracy, fmtDate, fmtDuration, cn } from "../lib/utils.js";

export default function Dashboard({ index }) {
  const s = useStore();
  const nav = useNavigate();
  const [trendOpen, setTrendOpen] = useState(false);

  const days = useMemo(() => heatmap(s, 26), [s.records]);
  const overall = useMemo(() => {
    let right = 0, wrong = 0, answered = 0, time = 0;
    for (const p of Object.values(s.progress)) { right += p.right || 0; wrong += p.wrong || 0; }
    answered = right + wrong;
    for (const r of s.records) time += r.durationSec || 0;
    return { right, wrong, answered, time, acc: accuracy(right, wrong), sessions: s.records.length };
  }, [s.progress, s.records]);

  const todayCount = useMemo(() => {
    const k = new Date().toDateString();
    return s.records.filter((r) => new Date(r.at).toDateString() === k).reduce((a, r) => a + (r.total || 0), 0);
  }, [s.records]);

  const weak = useMemo(() => {
    const all = [];
    for (const sub of index.subjects) {
      for (const t of topicStats(s, sub.id)) {
        if (t.right + t.wrong >= 3) all.push({ ...t, subjectId: sub.id, subjectName: sub.name });
      }
    }
    return all.sort((a, b) => a.accuracy - b.accuracy).slice(0, 6);
  }, [s.progress, index]);

  const recent = useMemo(() => [...s.records].reverse().slice(0, 6), [s.records]);
  const wrongN = Object.keys(s.wrong).length;
  const favN = Object.keys(s.fav).length;
  const noteN = Object.keys(s.notes).length;
  const unfinished = useMemo(() => Object.entries(s.exams).filter(([, e]) => e && e.answers && !e.submittedAt), [s.exams]);

  const donut = useMemo(() => index.subjects.map((sub) => {
    const st = subjectStats(s, sub.id);
    return { name: sub.name, value: st.done, itemStyle: { color: sub.color } };
  }).filter((x) => x.value > 0), [s.progress, index]);

  return (
    <div className="flex flex-col gap-4">
      {/* ---------------- Hero ---------------- */}
      <section className="relative overflow-hidden rounded-xl bg-navy text-white shadow-panel">
        <div className="grid-bg absolute inset-0 opacity-70" />
        <div className="relative flex flex-col gap-5 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7 sm:py-6">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[12.5px] text-white/70">
              <CalendarDays className="size-3.5" />
              {new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })}
            </p>
            <h1 className="mt-1.5 font-serif text-[22px] leading-tight font-bold sm:text-[26px]">
              离考研还有 <span className="tabular-nums">{daysToExam()}</span> 天
            </h1>
            <p className="mt-1 text-[13px] text-white/75">
              今天已作答 <b className="tabular-nums">{todayCount}</b> 题
              {overall.answered ? <> · 累计 {overall.answered} 题 · 正确率 {Math.round(overall.acc * 100)}%</> : " · 开始你的第一次练习"}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="soft" size="md" asChild className="border-white/0 bg-white text-navy hover:bg-white/90">
                <Link to="/library"><Play className="size-3.5" />开始刷题</Link>
              </Button>
              <Button variant="ghost" size="md" asChild className="border-white/25 text-white hover:bg-white/10">
                <Link to="/smart-compose"><Sparkles className="size-3.5" />智能组卷</Link>
              </Button>
              {wrongN > 0 && (
                <Button variant="ghost" size="md" asChild className="border-white/25 text-white hover:bg-white/10">
                  <Link to="/wrong-retest"><RefreshCw className="size-3.5" />错题复测 {wrongN}</Link>
                </Button>
              )}
            </div>
          </div>
          <div className="grid shrink-0 grid-cols-2 gap-2.5 sm:w-[300px]">
            <MiniStat icon={Flame} label="连续学习" value={streak(s)} unit="天" />
            <MiniStat icon={Target} label="累计正确率" value={Math.round(overall.acc * 100)} unit="%" />
            <MiniStat icon={BookOpenCheck} label="已练题目" value={overall.answered} unit="题" />
            <MiniStat icon={Clock} label="累计用时" value={Math.round(overall.time / 3600)} unit="小时" />
          </div>
        </div>
      </section>

      {/* ---------------- 每日作答 ---------------- */}
      <Card>
        <CardHead
          icon={CalendarDays}
          title="每日作答"
          desc={overall.sessions ? "最近 26 周的学习记录，颜色越深当天刷得越多" : "开始刷题后这里会记录你的每日强度"}
          extra={
            <Button variant="ghost" size="sm" onClick={() => setTrendOpen((v) => !v)}>
              <TrendingUp className="size-3.5" />{trendOpen ? "收起趋势" : "作答趋势"}
            </Button>
          }
        />
        <CardBody>
          <PracticeHeatmap days={days} />
          {trendOpen ? (
            <div className="mt-4 border-t border-line-subtle pt-3">
              <div className="mb-1 text-[12.5px] font-semibold text-ink-muted">近 30 天作答量与正确率</div>
              <ActivityTrend records={s.records} />
            </div>
          ) : null}
        </CardBody>
      </Card>

      {/* ---------------- 待办 ---------------- */}
      {(wrongN > 0 || unfinished.length > 0 || !overall.answered) && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {wrongN > 0 && (
            <TodoCard
              icon={RefreshCw} tone="bad"
              title={"错题本有 " + wrongN + " 题待复测"}
              desc="错题复测会重做错题并统计攻坚效果"
              action={<Button variant="primary" size="sm" onClick={() => nav("/wrong-retest")}>去复测</Button>}
            />
          )}
          {unfinished.length > 0 && (
            <TodoCard
              icon={FileStack} tone="warn"
              title={"有 " + unfinished.length + " 场模考未交卷"}
              desc={unfinished.map(([k]) => k).slice(0, 2).join("、")}
              action={<Button variant="secondary" size="sm" onClick={() => nav("/records")}>查看</Button>}
            />
          )}
          {!overall.answered && (
            <TodoCard
              icon={Sparkles} tone="brand"
              title="还没开始刷题"
              desc="建议先从数学一 2015 年真题的练习模式入手"
              action={<Button variant="primary" size="sm" onClick={() => nav("/library?subject=math1")}>去题库</Button>}
            />
          )}
        </div>
      )}

      {/* ---------------- 四科进度 ---------------- */}
      <div className="grid gap-3 sm:grid-cols-2">
        {index.subjects.map((sub) => {
          const st = subjectStats(s, sub.id);
          const p = sub.questionCount ? Math.min(1, st.done / sub.questionCount) : 0;
          return (
            <Card key={sub.id} className="transition-shadow hover:shadow-pop">
              <CardBody className="flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg text-[15px] font-bold text-white"
                        style={{ background: sub.color }}>
                    {sub.icon || sub.name[0]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-[14.5px] font-semibold text-ink-strong">{sub.fullName || sub.name}</h3>
                    </div>
                    <p className="mt-0.5 text-[12px] text-ink-subtle">
                      {sub.papers.length} 套真题
                      {(sub.mocks || []).length ? " · " + sub.mocks.length + " 套模拟" : ""}
                      {" · " + sub.questionCount + " 题"}
                    </p>
                  </div>
                  <IconButton size="iconSm" onClick={() => nav("/library?subject=" + sub.id)} aria-label="进入">
                    <ArrowRight className="size-4" />
                  </IconButton>
                </div>
                <div className="flex items-center gap-2.5">
                  <Progress value={p} tone={st.accuracy >= 0.8 ? "ok" : st.accuracy >= 0.6 ? "brand" : "warn"} />
                  <span className="w-9 shrink-0 text-right text-[11.5px] tabular-nums text-ink-subtle">{Math.round(p * 100)}%</span>
                </div>
                <div className="flex items-center justify-between text-[11.5px] text-ink-faint">
                  <span>已练 {st.done} 题</span>
                  <span>{st.right + st.wrong > 0 ? "正确率 " + Math.round(st.accuracy * 100) + "%" : "尚未开始"}</span>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>

      {/* ---------------- 待加强 + 最近 ---------------- */}
      <div className="grid gap-3 lg:grid-cols-[1.25fr_1fr]">
        <Card>
          <CardHead icon={AlertTriangle} title="待加强的知识点" desc="至少做过 3 题、正确率最低的知识点" />
          <CardBody className="p-0">
            {!weak.length ? (
              <Empty icon={Compass} title="数据还不够" desc="多练几道题后，这里会按正确率排出你最需要补的章节。" className="py-10" />
            ) : (
              <ul className="divide-y divide-line-subtle">
                {weak.map((t) => (
                  <li key={t.subjectId + t.topic} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: index.subjects.find((x) => x.id === t.subjectId)?.color }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-ink">{t.topic}</div>
                      <div className="text-[11.5px] text-ink-faint">{t.subjectName} · 做过 {t.right + t.wrong} 题</div>
                    </div>
                    <Badge tone={t.accuracy >= 0.8 ? "ok" : t.accuracy >= 0.6 ? "warn" : "bad"}>
                      {Math.round(t.accuracy * 100)}%
                    </Badge>
                    <Button variant="secondary" size="xs" asChild>
                      <Link to={"/practice?mode=chapter&subject=" + t.subjectId + "&topic=" + encodeURIComponent(t.topic) + "&count=15"}>练</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHead icon={Clock} title="最近练习" desc={overall.sessions ? "共 " + overall.sessions + " 次" : "暂无记录"}
                    extra={<Button variant="ghost" size="sm" asChild><Link to="/records">全部</Link></Button>} />
          <CardBody className="p-0">
            {!recent.length ? (
              <Empty icon={Clock} title="还没有练习记录" desc="完成一次练习或模考后会显示在这里。" className="py-10" />
            ) : (
              <ul className="divide-y divide-line-subtle">
                {recent.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="grid size-7 shrink-0 place-items-center rounded-md bg-sunken text-ink-faint">
                      {r.mode === "exam" ? <FileStack className="size-3.5" /> : <Play className="size-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] font-medium text-ink">
                        {MODE_LABEL[r.mode] || r.mode}{r.topic ? " · " + r.topic : ""}
                      </div>
                      <div className="text-[11px] text-ink-faint">{fmtDate(r.at)} · {fmtDuration(r.durationSec)}</div>
                    </div>
                    <span className="shrink-0 text-[12px] tabular-nums text-ink-subtle">
                      {r.total} 题{r.total ? " / " + Math.round((r.correct / r.total) * 100) + "%" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

const MODE_LABEL = { exam: "整套模考", chapter: "章节练习", random: "随机组卷", wrong: "错题复测", fav: "收藏练习", paper: "套卷练习", mock: "模拟卷", custom: "智能组卷" };

function daysToExam() {
  const now = new Date();
  const y = now.getMonth() >= 11 ? now.getFullYear() + 1 : now.getFullYear();
  const exam = new Date(y, 11, 21); // 通常为 12 月倒数第二个周末，这里取 12/21 作为近似
  return Math.max(0, Math.ceil((exam - now) / 86400000));
}

function MiniStat({ icon: Icon, label, value, unit }) {
  return (
    <div className="rounded-lg border border-white/15 bg-white/8 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11.5px] text-white/70">
        <Icon className="size-3.5" />{label}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className="text-[19px] leading-none font-semibold tabular-nums text-white">{value}</span>
        <span className="text-[11.5px] text-white/70">{unit}</span>
      </div>
    </div>
  );
}

function TodoCard({ icon: Icon, title, desc, action, tone = "brand" }) {
  const tones = {
    brand: "bg-brand-soft text-brand",
    bad: "bg-bad-soft text-bad",
    warn: "bg-warn-soft text-warn",
  };
  return (
    <Card>
      <CardBody className="flex items-start gap-3">
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", tones[tone])}>
          <Icon className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold text-ink">{title}</div>
          <p className="mt-0.5 text-[12px] text-ink-subtle">{desc}</p>
          <div className="mt-2">{action}</div>
        </div>
      </CardBody>
    </Card>
  );
}
