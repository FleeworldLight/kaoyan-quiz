import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { History, Download, TrendingUp, Flame, Target, Clock, FileStack, Play, Trash2, CalendarDays } from "lucide-react";
import { Badge, Button, Card, CardBody, CardHead, Empty, Progress, Segmented, StatCard } from "../components/ui.jsx";
import { PracticeHeatmap, ActivityTrend, DonutStat } from "../components/Charts.jsx";
import { useStore, subjectStats, heatmap, streak, resetAll } from "../lib/store.js";
import { accuracy, fmtDate, fmtDuration } from "../lib/utils.js";

const MODE_LABEL = { exam: "整套模考", chapter: "章节练习", random: "随机组卷", wrong: "错题复测", fav: "收藏练习", paper: "套卷练习", mock: "模拟卷", custom: "智能组卷" };

export default function Records({ index }) {
  const s = useStore();
  const [mode, setMode] = useState("all");
  const [subject, setSubject] = useState("all");

  const days = useMemo(() => heatmap(s, 26), [s.records]);
  const sum = useMemo(() => {
    let right = 0, wrong = 0, time = 0, total = 0;
    for (const p of Object.values(s.progress)) { right += p.right || 0; wrong += p.wrong || 0; }
    for (const r of s.records) { time += r.durationSec || 0; total += r.total || 0; }
    return { right, wrong, time, total, acc: accuracy(right, wrong), sessions: s.records.length };
  }, [s.progress, s.records]);

  const modes = useMemo(() => [...new Set(s.records.map((r) => r.mode))], [s.records]);
  const list = useMemo(() => {
    let l = [...s.records].reverse();
    if (mode !== "all") l = l.filter((r) => r.mode === mode);
    if (subject !== "all") l = l.filter((r) => r.subject === subject);
    return l;
  }, [s.records, mode, subject]);

  const donut = useMemo(() => index.subjects.map((sub) => ({
    name: sub.name,
    value: s.records.filter((r) => r.subject === sub.id).reduce((a, r) => a + (r.total || 0), 0),
    itemStyle: { color: sub.color },
  })).filter((x) => x.value > 0), [s.records, index]);

  function exportCSV() {
    const head = "时间,科目,模式,章节,题量,答对,正确率,用时(秒)\n";
    const rows = list.map((r) => [
      new Date(r.at).toLocaleString("zh-CN"), r.subject || "", MODE_LABEL[r.mode] || r.mode, r.topic || "",
      r.total || 0, r.correct || 0, r.total ? Math.round((r.correct / r.total) * 100) + "%" : "", r.durationSec || 0,
    ].join(",")).join("\n");
    const blob = new Blob(["\ufeff" + head + rows], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "学习记录-" + new Date().toISOString().slice(0, 10) + ".csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-serif text-[19px] font-bold text-ink-strong">学习记录</h1>
        <Badge tone="brand">{sum.sessions} 次练习</Badge>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={exportCSV} disabled={!list.length}><Download className="size-3.5" />导出 CSV</Button>
          <Button variant="danger" size="sm" onClick={() => { if (confirm("确定清空全部学习数据（进度、错题、收藏、笔记、记录）？不可恢复。")) resetAll(); }}>
            <Trash2 className="size-3.5" />清空数据
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="累计答题" value={sum.total} unit="题" icon={FileStack} hint={sum.sessions + " 次练习"} />
        <StatCard label="累计正确率" value={Math.round(sum.acc * 100)} unit="%" icon={Target} tone={sum.acc >= 0.8 ? "ok" : sum.acc >= 0.6 ? "brand" : "warn"}
                  hint={"答对 " + sum.right + " / 答错 " + sum.wrong} />
        <StatCard label="累计用时" value={Math.round(sum.time / 3600)} unit="小时" icon={Clock} hint={fmtDuration(sum.time)} />
        <StatCard label="连续学习" value={streak(s)} unit="天" icon={Flame} tone="warn" />
      </div>

      <Card>
        <CardHead icon={CalendarDays} title="每日作答" desc="最近 26 周" />
        <CardBody><PracticeHeatmap days={days} /></CardBody>
      </Card>

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHead icon={TrendingUp} title="近 30 天趋势" desc="柱状为题量，折线为正确率" />
          <CardBody>
            {s.records.length ? <ActivityTrend records={s.records} height={260} />
              : <Empty icon={History} title="还没有记录" desc="完成一次练习后就会出现趋势图。" className="py-14" />}
          </CardBody>
        </Card>
        <Card>
          <CardHead title="各科练习量占比" />
          <CardBody>
            {donut.length ? <DonutStat data={donut} centerLabel={String(sum.total)} height={260} />
              : <Empty icon={History} title="暂无数据" className="py-14" />}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHead icon={History} title="练习明细" desc={list.length + " 条记录"} />
        <CardBody className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Segmented value={mode} onChange={setMode}
              options={[{ value: "all", label: "全部模式" }, ...modes.map((m) => ({ value: m, label: MODE_LABEL[m] || m }))]} />
            <Segmented value={subject} onChange={setSubject}
              options={[{ value: "all", label: "全部科目" }, ...index.subjects.map((x) => ({ value: x.id, label: x.name }))]} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-left text-[11.5px] text-ink-faint">
                  <th className="py-2 pr-3 font-medium">时间</th>
                  <th className="px-2 py-2 font-medium">模式</th>
                  <th className="px-2 py-2 font-medium">范围</th>
                  <th className="px-2 py-2 text-right font-medium">题量</th>
                  <th className="px-2 py-2 text-right font-medium">答对</th>
                  <th className="px-2 py-2 font-medium">正确率</th>
                  <th className="px-2 py-2 text-right font-medium">用时</th>
                </tr>
              </thead>
              <tbody>
                {list.slice(0, 200).map((r) => (
                  <tr key={r.id} className="border-b border-line-subtle last:border-0 hover:bg-subtle">
                    <td className="py-2 pr-3 whitespace-nowrap text-ink-subtle">{fmtDate(r.at)}</td>
                    <td className="px-2 py-2"><Badge tone={r.mode === "exam" ? "navy" : "neutral"}>{MODE_LABEL[r.mode] || r.mode}</Badge></td>
                    <td className="max-w-[220px] truncate px-2 py-2 text-ink-subtle">
                      {r.topic || index.subjects.find((x) => x.id === r.subject)?.name || r.subject || "—"}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.total}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.correct}</td>
                    <td className="px-2 py-2">
                      <span className="flex items-center gap-1.5">
                        <Progress value={r.total ? r.correct / r.total : 0} height={4}
                          tone={r.correct / Math.max(1, r.total) >= 0.8 ? "ok" : r.correct / Math.max(1, r.total) >= 0.6 ? "brand" : "warn"}
                          className="w-16" />
                        <span className="tabular-nums text-ink-subtle">{r.total ? Math.round((r.correct / r.total) * 100) + "%" : "—"}</span>
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-ink-subtle">{fmtDuration(r.durationSec)}</td>
                  </tr>
                ))}
                {!list.length && <tr><td colSpan={7} className="py-10 text-center text-ink-faint">没有符合条件的记录。</td></tr>}
              </tbody>
            </table>
          </div>
          {list.length > 200 && <p className="text-center text-[11.5px] text-ink-faint">只显示最近 200 条</p>}
        </CardBody>
      </Card>
    </div>
  );
}
