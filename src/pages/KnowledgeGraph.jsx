import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Network, Compass, Filter, Info } from "lucide-react";
import { Badge, Button, Card, CardBody, CardHead, Empty, Segmented, Switch } from "../components/ui.jsx";
import { KnowledgeGraph } from "../components/Charts.jsx";
import { useStore, topicStats } from "../lib/store.js";
import { masteryTier } from "../lib/utils.js";

const TIER_COLOR = { mastered: "#1f8a62", good: "#356fe5", fair: "#b46a0c", weak: "#c33a32", none: "#c8d0dc" };

export default function KnowledgeGraphPage({ index }) {
  const s = useStore();
  const nav = useNavigate();
  const [subjectId, setSubjectId] = useState("all");
  const [onlyPracticed, setOnlyPracticed] = useState(false);
  const [picked, setPicked] = useState(null);

  const { nodes, links, stats } = useMemo(() => {
    const nodes = [], links = [];
    const subs = subjectId === "all" ? index.subjects : index.subjects.filter((x) => x.id === subjectId);
    for (const sub of subs) {
      const tstats = new Map(topicStats(s, sub.id).map((t) => [t.topic, t]));
      const topics = sub.topics || [];
      if (!topics.length) continue;
      const rootId = "s:" + sub.id;
      nodes.push({ id: rootId, name: sub.name, category: "科目", value: sub.questionCount, symbolSize: 40, color: sub.color, acc: null, kind: "subject", subjectId: sub.id });

      const byGroup = new Map();
      for (const t of topics) {
        const g = t.groupName || t.group || "其他";
        if (!byGroup.has(g)) byGroup.set(g, []);
        byGroup.get(g).push(t);
      }
      for (const [g, list] of byGroup) {
        const gid = "g:" + sub.id + ":" + g;
        const gq = list.reduce((a, t) => a + (t.count || 0), 0);
        let gr = 0, gw = 0;
        for (const t of list) { const a = tstats.get(t.id); if (a) { gr += a.right; gw += a.wrong; } }
        const gacc = gr + gw ? gr / (gr + gw) : 0;
        nodes.push({ id: gid, name: g, category: sub.name, value: gq, symbolSize: 26, color: TIER_COLOR[masteryTier(gacc, gr + gw).key], acc: gr + gw ? gacc : null, kind: "group", subjectId: sub.id, group: g });
        links.push({ source: rootId, target: gid });

        for (const t of list) {
          const a = tstats.get(t.id);
          const attempts = a ? a.right + a.wrong : 0;
          if (onlyPracticed && !attempts) continue;
          const tid = "t:" + t.id;
          nodes.push({
            id: tid, name: t.name, category: sub.name, value: t.count || 0,
            symbolSize: Math.max(9, Math.min(30, 8 + Math.sqrt(t.count || 1) * 2.4)),
            color: TIER_COLOR[masteryTier(a ? a.accuracy : 0, attempts).key],
            acc: attempts ? a.accuracy : null, kind: "topic", topicId: t.id, subjectId: sub.id, group: g, count: t.count,
          });
          links.push({ source: gid, target: tid });
        }
      }
    }
    const nodeIds = new Set(nodes.map((n) => n.id));
    return {
      nodes,
      links: links.filter((l) => nodeIds.has(l.source) && nodeIds.has(l.target)),
      stats: { nodes: nodes.length, topics: nodes.filter((n) => n.kind === "topic").length },
    };
  }, [index, s.progress, subjectId, onlyPracticed]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-navy text-white"><Network className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-[17px] font-bold text-ink-strong">知识图谱</h2>
            <p className="mt-0.5 text-[12.5px] text-ink-subtle">
              科目 → 章节分组 → 知识点。节点越大题量越多，颜色代表你的掌握度。可拖动、滚轮缩放，点知识点直接开练。
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Segmented value={subjectId} onChange={setSubjectId}
              options={[{ value: "all", label: "全部" }, ...index.subjects.map((x) => ({ value: x.id, label: x.name }))]} />
            <Switch checked={onlyPracticed} onCheckedChange={setOnlyPracticed} label="只看练过的" className="gap-2" />
          </div>
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-center gap-3 text-[11.5px] text-ink-subtle">
        {[["已掌握", "mastered"], ["较熟练", "good"], ["待巩固", "fair"], ["薄弱", "weak"], ["未练", "none"]].map(([label, k]) => (
          <span key={k} className="flex items-center gap-1.5"><i className="size-2.5 rounded-full" style={{ background: TIER_COLOR[k] }} />{label}</span>
        ))}
        <span className="ml-auto">{stats.topics} 个知识点 · {stats.nodes} 个节点</span>
      </div>

      <Card>
        <CardBody className="p-1">
          {stats.nodes > 2 ? (
            <KnowledgeGraph nodes={nodes} links={links} height={540}
              onNodeClick={(d) => {
                setPicked(d);
                if (d.kind === "topic") nav("/practice?mode=chapter&subject=" + d.subjectId + "&topic=" + encodeURIComponent(d.topicId) + "&count=15");
                else if (d.kind === "group") nav("/library?subject=" + d.subjectId + "&view=chapter");
                else nav("/library?subject=" + d.subjectId);
              }} />
          ) : (
            <Empty icon={Network} title="没有可展示的知识点" desc="这个筛选条件下没有知识点数据，换个科目或关掉「只看练过的」。" className="py-24" />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
