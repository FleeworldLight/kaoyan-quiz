import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Compass, Layers, Target, TrendingUp, ArrowRight } from "lucide-react";
import { Badge, Button, Card, CardBody, CardHead, Empty, Progress, Segmented, Tip } from "../components/ui.jsx";
import { MasteryRadar, AccuracyRank } from "../components/Charts.jsx";
import { useStore, subjectStats, topicStats } from "../lib/store.js";
import { cn, accuracy, masteryTier, SUBJECT_TONE } from "../lib/utils.js";

const TIERS = [
  { key: "mastered", label: "已掌握", color: "#1f8a62", bg: "bg-ok" },
  { key: "good", label: "较熟练", color: "#356fe5", bg: "bg-brand" },
  { key: "fair", label: "待巩固", color: "#b46a0c", bg: "bg-warn" },
  { key: "weak", label: "薄弱", color: "#c33a32", bg: "bg-bad" },
  { key: "none", label: "未练", color: "#dce2ea", bg: "bg-line" },
];

export default function MasteryMap({ index }) {
  const s = useStore();
  const nav = useNavigate();
  const [subjectId, setSubjectId] = useState(index.subjects[0]?.id);
  const [groupFilter, setGroupFilter] = useState("all");

  const sub = index.subjects.find((x) => x.id === subjectId) || index.subjects[0];

  /* 每科的掌握度分布 */
  const perSubject = useMemo(() => index.subjects.map((x) => {
    const stats = topicStats(s, x.id);
    const byTopic = new Map(stats.map((t) => [t.topic, t]));
    const buckets = { mastered: 0, good: 0, fair: 0, weak: 0, none: 0 };
    let totalQ = 0, doneQ = 0;
    for (const t of x.topics || []) {
      const a = byTopic.get(t.id);
      const attempts = a ? a.right + a.wrong : 0;
      buckets[masteryTier(a ? a.accuracy : 0, attempts).key]++;
      totalQ += t.count || 0;
      doneQ += Math.min(t.count || 0, attempts);
    }
    return { ...x, buckets, topicTotal: (x.topics || []).length, totalQ, doneQ, acc: accuracy(...Object.values(s.progress).filter((p) => p.subject === x.id).reduce((a, p) => [a[0] + (p.right || 0), a[1] + (p.wrong || 0)], [0, 0])) };
  }), [s.progress, index]);

  /* 当前科目的章节明细 */
  const topics = useMemo(() => {
    const stats = new Map(topicStats(s, sub.id).map((t) => [t.topic, t]));
    return (sub.topics || []).map((t) => {
      const a = stats.get(t.id);
      const attempts = a ? a.right + a.wrong : 0;
      return { ...t, attempts, right: a?.right || 0, wrong: a?.wrong || 0, acc: a ? a.accuracy : 0, tier: masteryTier(a ? a.accuracy : 0, attempts) };
    });
  }, [s.progress, sub]);

  const groups = useMemo(() => [...new Set(topics.map((t) => t.groupName || t.group || "其他"))], [topics]);
  const shown = groupFilter === "all" ? topics : topics.filter((t) => (t.groupName || t.group) === groupFilter);

  const radar = useMemo(() => {
    const byGroup = new Map();
    for (const t of topics) {
      const g = t.groupName || t.group || "其他";
      const cur = byGroup.get(g) || { right: 0, wrong: 0, attempts: 0 };
      cur.right += t.right; cur.wrong += t.wrong; cur.attempts += t.attempts;
      byGroup.set(g, cur);
    }
    const entries = [...byGroup.entries()].filter(([, v]) => v.attempts > 0);
    if (entries.length < 3) return null;
    return {
      indicators: entries.map(([g]) => ({ name: g, max: 1 })),
      series: [{ name: "正确率", color: sub.color, value: entries.map(([, v]) => +(v.right / Math.max(1, v.right + v.wrong)).toFixed(2)) }],
    };
  }, [topics, sub]);

  const weakest = [...topics].filter((t) => t.attempts > 0).sort((a, b) => a.acc - b.acc).slice(0, 10)
    .map((t) => ({ name: t.name, accuracy: t.acc, count: t.attempts }));

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-navy text-white"><Compass className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-[17px] font-bold text-ink-strong">掌握地图</h2>
            <p className="mt-0.5 text-[12.5px] text-ink-subtle">按章节看你的掌握程度：绿色已掌握、红色薄弱，灰色是还没练过的。</p>
          </div>
        </CardBody>
      </Card>

      {/* 各科掌握分布 */}
      <Card>
        <CardHead icon={Layers} title="各科掌握度分布" desc="按知识点统计，悬停查看数量" />
        <CardBody className="flex flex-col gap-4">
          {perSubject.map((x) => {
            const n = x.topicTotal || 1;
            return (
              <div key={x.id}>
                <div className="mb-1.5 flex items-center gap-2">
                  <i className="size-2.5 rounded-sm" style={{ background: x.color }} />
                  <button className="text-[13px] font-semibold text-ink hover:text-brand" onClick={() => setSubjectId(x.id)}>{x.name}</button>
                  <span className="text-[11.5px] text-ink-faint">{x.topicTotal} 个知识点 · 已练 {x.doneQ}/{x.totalQ} 题</span>
                  <span className="ml-auto text-[11.5px] text-ink-subtle">
                    {x.buckets.mastered + x.buckets.good > 0
                      ? "掌握良好 " + Math.round(((x.buckets.mastered + x.buckets.good) / n) * 100) + "%"
                      : "尚无掌握数据"}
                  </span>
                </div>
                <div className="flex h-2.5 overflow-hidden rounded-full bg-sunken">
                  {TIERS.map((t) => {
                    const w = (x.buckets[t.key] / n) * 100;
                    return w > 0 ? (
                      <Tip key={t.key} label={t.label + " " + x.buckets[t.key] + " 个"}>
                        <i className="block h-full" style={{ width: w + "%", background: t.color }} />
                      </Tip>
                    ) : null;
                  })}
                </div>
              </div>
            );
          })}
          <div className="flex flex-wrap gap-3 border-t border-line-subtle pt-3 text-[11.5px] text-ink-subtle">
            {TIERS.map((t) => (
              <span key={t.key} className="flex items-center gap-1.5">
                <i className="size-2.5 rounded-sm" style={{ background: t.color }} />{t.label}
              </span>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* 科目切换 */}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={subjectId} onChange={(v) => { setSubjectId(v); setGroupFilter("all"); }}
          options={index.subjects.map((x) => ({ value: x.id, label: x.name, count: (x.topics || []).length }))} />
        {groups.length > 1 && (
          <Segmented value={groupFilter} onChange={setGroupFilter}
            options={[{ value: "all", label: "全部" }, ...groups.map((g) => ({ value: g, label: g }))]} />
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHead icon={Compass} title={sub.name + " · 分组正确率雷达"} desc={radar ? "只统计已练过的分组" : "至少练过 3 个分组后显示"} />
          <CardBody>
            {radar ? <MasteryRadar indicators={radar.indicators} series={radar.series} height={300} />
              : <Empty icon={Compass} title="数据不足" desc="多练几个章节后这里会显示雷达图。" className="py-12" />}
          </CardBody>
        </Card>

        <Card>
          <CardHead icon={Target} title="最需要补的章节" desc="正确率从低到高" />
          <CardBody>
            {weakest.length ? <AccuracyRank data={weakest} height={Math.max(180, weakest.length * 30)}
              onClick={(d) => nav("/practice?mode=chapter&subject=" + sub.id + "&topic=" + encodeURIComponent(topics.find((t) => t.name === d.name)?.id || "") + "&count=15")} />
              : <Empty icon={Target} title="还没有练习数据" desc="做完几道题后这里会给出薄弱章节排行。" className="py-12" />}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHead icon={Layers} title="章节明细" desc={shown.length + " 个知识点"}
          extra={<Button variant="soft" size="sm" asChild><Link to={"/practice?mode=chapter&subject=" + sub.id + "&topic=__all__&count=20"}>混合练一章</Link></Button>} />
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-left text-[11.5px] text-ink-faint">
                  <th className="px-4 py-2 font-medium">知识点</th>
                  <th className="px-2 py-2 font-medium">分组</th>
                  <th className="px-2 py-2 text-right font-medium">题量</th>
                  <th className="px-2 py-2 text-right font-medium">做过</th>
                  <th className="px-2 py-2 text-right font-medium">正确率</th>
                  <th className="px-2 py-2 font-medium">掌握度</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {shown.map((t) => (
                  <tr key={t.id} className="border-b border-line-subtle last:border-0 hover:bg-subtle">
                    <td className="max-w-[260px] px-4 py-2 font-medium text-ink">{t.name}</td>
                    <td className="px-2 py-2 text-ink-faint">{t.groupName || t.group}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-ink-subtle">{t.count}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-ink-subtle">{t.attempts}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{t.attempts ? Math.round(t.acc * 100) + "%" : "—"}</td>
                    <td className="px-2 py-2">
                      <Badge tone={t.tier.tone === "brand" ? "brand" : t.tier.tone}>{t.tier.label}</Badge>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button variant="secondary" size="xs" asChild>
                        <Link to={"/practice?mode=chapter&subject=" + sub.id + "&topic=" + encodeURIComponent(t.id) + "&count=15"}>练</Link>
                      </Button>
                    </td>
                  </tr>
                ))}
                {!shown.length && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-ink-faint">这个科目还没有知识点标签。</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
