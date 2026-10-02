import React, { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart, RadarChart, GraphChart, PieChart } from "echarts/charts";
import {
  GridComponent, TooltipComponent, LegendComponent, TitleComponent,
  MarkLineComponent, VisualMapComponent, DataZoomComponent, RadarComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { cn, fmtDayKey } from "../lib/utils.js";

echarts.use([
  BarChart, LineChart, RadarChart, GraphChart, PieChart,
  GridComponent, TooltipComponent, LegendComponent, TitleComponent,
  MarkLineComponent, VisualMapComponent, DataZoomComponent, RadarComponent,
  CanvasRenderer,
]);

const FONT = 'var(--font-sans)';
const INK = "#172033";
const MUTED = "#526071";
const LINE = "#e8edf3";
const BRAND = "#356fe5";

export const CHART_BASE = {
  textStyle: { fontFamily: '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif', color: MUTED, fontSize: 12 },
  grid: { left: 8, right: 12, top: 24, bottom: 4, containLabel: true },
  tooltip: {
    backgroundColor: "#fff",
    borderColor: "#dce2ea",
    borderWidth: 1,
    padding: [6, 9],
    textStyle: { color: INK, fontSize: 12 },
    extraCssText: "box-shadow:0 12px 32px rgba(25,36,53,.14);border-radius:8px;",
  },
};

/** ECharts 通用容器：自动 resize、自动 dispose */
export function EChart({ option, height = 220, className, onEvents }) {
  const ref = useRef(null);
  const instRef = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    const inst = echarts.init(ref.current, null, { renderer: "canvas" });
    instRef.current = inst;
    const ro = new ResizeObserver(() => inst.resize());
    ro.observe(ref.current);
    return () => { ro.disconnect(); inst.dispose(); instRef.current = null; };
  }, []);

  useEffect(() => {
    const inst = instRef.current;
    if (!inst || !option) return;
    inst.setOption(option, { notMerge: true });
  }, [option]);

  useEffect(() => {
    const inst = instRef.current;
    if (!inst || !onEvents) return;
    for (const [evt, handler] of Object.entries(onEvents)) inst.on(evt, handler);
    return () => { for (const evt of Object.keys(onEvents)) inst.off(evt); };
  }, [onEvents]);

  return <div ref={ref} className={cn("w-full", className)} style={{ height }} />;
}

/* ------------------------------------------------------------------ *
 * 每日作答热力图（GitHub 风格，纯 DOM 实现，贴合参考站的展示方式）
 * ------------------------------------------------------------------ */
function levelOf(n) {
  if (!n) return 0;
  if (n < 10) return 1;
  if (n < 30) return 2;
  if (n < 70) return 3;
  return 4;
}
const HEAT_CLASS = [
  "bg-[#eef1f6]",
  "bg-[#c9dcff]",
  "bg-[#8fb6f7]",
  "bg-[#4f8bef]",
  "bg-[#244fa8]",
];

export function PracticeHeatmap({ days, weeks = 26, className }) {
  const cols = useMemo(() => {
    const out = [];
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
    return out;
  }, [days]);

  const monthLabels = useMemo(() => {
    const labels = [];
    let last = -1;
    cols.forEach((wk, i) => {
      const m = wk[0]?.date ? new Date(wk[0].date).getMonth() + 1 : null;
      if (m != null && m !== last) { labels.push({ i, m }); last = m; }
    });
    return labels;
  }, [cols]);

  const total = days.reduce((a, d) => a + d.count, 0);

  return (
    <div className={className}>
      <div className="overflow-x-auto pb-1">
        <div className="inline-block min-w-full">
          <div className="mb-1 flex gap-[3px] pl-[22px] text-[10.5px] text-ink-faint">
            {cols.map((_, i) => {
              const lb = monthLabels.find((x) => x.i === i);
              return <span key={i} className="w-[13px] shrink-0">{lb ? lb.m + "月" : ""}</span>;
            })}
          </div>
          <div className="flex gap-[3px]">
            <div className="flex w-[19px] shrink-0 flex-col gap-[3px] text-[10px] leading-[13px] text-ink-faint">
              {["日", "一", "二", "三", "四", "五", "六"].map((d, i) => (
                <span key={d} className="h-[13px]">{i % 2 === 1 ? d : ""}</span>
              ))}
            </div>
            {cols.map((wk, i) => (
              <div key={i} className="flex shrink-0 flex-col gap-[3px]">
                {wk.map((d) => (
                  <span
                    key={d.key}
                    title={d.key + "：" + d.count + " 题"}
                    className={cn("size-[13px] rounded-[3px] transition-colors", HEAT_CLASS[levelOf(d.count)])}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-[11.5px] text-ink-subtle">
        <span>最近 {Math.round(days.length / 7)} 周共 {total} 题</span>
        <span className="flex items-center gap-1">
          刷题强度
          {["无", "轻", "中", "高", "很高"].map((t, i) => (
            <span key={t} className="flex items-center gap-0.5">
              <i className={cn("size-[11px] rounded-[3px]", HEAT_CLASS[i])} />
              <span className="text-[10.5px] text-ink-faint">{t}</span>
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

/* ---------------------------- 章节正确率排行 ---------------------------- */
export function AccuracyRank({ data, height = 260, onClick }) {
  const option = useMemo(() => {
    const items = data.slice(0, 12);
    return {
      ...CHART_BASE,
      grid: { left: 8, right: 42, top: 8, bottom: 4, containLabel: true },
      tooltip: { ...CHART_BASE.tooltip, formatter: (p) => `${p.name}<br/>正确率 ${(p.value * 100).toFixed(0)}%` },
      xAxis: { type: "value", max: 1, axisLabel: { formatter: (v) => v * 100 + "%", color: MUTED, fontSize: 11 }, splitLine: { lineStyle: { color: LINE } }, axisLine: { show: false } },
      yAxis: {
        type: "category",
        inverse: true,
        data: items.map((d) => d.name),
        axisLabel: { color: MUTED, fontSize: 11.5, width: 150, overflow: "truncate" },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: LINE } },
      },
      series: [{
        type: "bar",
        data: items.map((d) => ({
          value: d.accuracy,
          itemStyle: { color: d.accuracy >= 0.8 ? "#1f8a62" : d.accuracy >= 0.6 ? "#356fe5" : d.accuracy >= 0.4 ? "#b46a0c" : "#c33a32", borderRadius: [0, 4, 4, 0] },
        })),
        barWidth: 12,
        label: { show: true, position: "right", formatter: (p) => (p.value * 100).toFixed(0) + "%", color: MUTED, fontSize: 11 },
      }],
    };
  }, [data]);
  return <EChart option={option} height={height} onEvents={onClick ? { click: (p) => onClick(data[p.dataIndex]) } : undefined} />;
}

/* ------------------------------ 双轴趋势图 ------------------------------ */
export function ActivityTrend({ records, height = 240 }) {
  const option = useMemo(() => {
    const byDay = new Map();
    for (const r of records) {
      const k = fmtDayKey(r.at);
      const v = byDay.get(k) || { total: 0, correct: 0 };
      v.total += r.total || 0;
      v.correct += r.correct || 0;
      byDay.set(k, v);
    }
    const days = [...byDay.keys()].sort().slice(-30);
    const totals = days.map((d) => byDay.get(d).total);
    const accs = days.map((d) => (byDay.get(d).total ? +(byDay.get(d).correct / byDay.get(d).total).toFixed(3) : 0));
    return {
      ...CHART_BASE,
      grid: { left: 8, right: 8, top: 30, bottom: 4, containLabel: true },
      legend: { show: true, right: 0, top: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: MUTED, fontSize: 11.5 } },
      tooltip: { ...CHART_BASE.tooltip, trigger: "axis" },
      xAxis: { type: "category", data: days.map((d) => d.slice(5)), axisLabel: { color: MUTED, fontSize: 10.5 }, axisLine: { lineStyle: { color: LINE } }, axisTick: { show: false } },
      yAxis: [
        { type: "value", name: "题量", nameTextStyle: { color: MUTED, fontSize: 11 }, axisLabel: { color: MUTED, fontSize: 11 }, splitLine: { lineStyle: { color: LINE } } },
        { type: "value", name: "正确率", max: 1, nameTextStyle: { color: MUTED, fontSize: 11 }, axisLabel: { formatter: (v) => v * 100 + "%", color: MUTED, fontSize: 11 }, splitLine: { show: false } },
      ],
      series: [
        { name: "题量", type: "bar", data: totals, barWidth: "46%", itemStyle: { color: "#dbe6fb", borderRadius: [3, 3, 0, 0] } },
        { name: "正确率", type: "line", yAxisIndex: 1, data: accs, smooth: true, symbolSize: 5, lineStyle: { color: BRAND, width: 2 }, itemStyle: { color: BRAND }, areaStyle: { color: "rgba(53,111,229,.10)" } },
      ],
    };
  }, [records]);
  return <EChart option={option} height={height} />;
}

/* ------------------------------- 雷达图 ------------------------------- */
export function MasteryRadar({ indicators, series, height = 280 }) {
  const option = useMemo(() => ({
    ...CHART_BASE,
    tooltip: { ...CHART_BASE.tooltip },
    radar: {
      indicator: indicators,
      radius: "66%",
      splitNumber: 4,
      axisName: { color: MUTED, fontSize: 11.5 },
      splitLine: { lineStyle: { color: LINE } },
      splitArea: { areaStyle: { color: ["#fff", "#fbfcfe"] } },
      axisLine: { lineStyle: { color: LINE } },
    },
    series: [{
      type: "radar",
      symbolSize: 4,
      data: series.map((s) => ({
        value: s.value, name: s.name,
        lineStyle: { color: s.color, width: 2 },
        itemStyle: { color: s.color },
        areaStyle: { color: s.color, opacity: 0.14 },
      })),
    }],
  }), [indicators, series]);
  return <EChart option={option} height={height} />;
}

/* ------------------------------ 知识图谱 ------------------------------ */
export function KnowledgeGraph({ nodes, links, height = 480, onNodeClick }) {
  const option = useMemo(() => {
    const categories = [...new Set(nodes.map((n) => n.category))].map((c) => ({ name: c }));
    return {
      ...CHART_BASE,
      tooltip: { ...CHART_BASE.tooltip, formatter: (p) => (p.dataType === "node" ? `${p.data.name}<br/>题量 ${p.data.value}<br/>正确率 ${p.data.acc != null ? (p.data.acc * 100).toFixed(0) + "%" : "未练"}` : "") },
      legend: { show: true, top: 0, left: 0, itemWidth: 9, itemHeight: 9, textStyle: { color: MUTED, fontSize: 11.5 }, data: categories.map((c) => c.name) },
      series: [{
        type: "graph",
        layout: "force",
        roam: true,
        draggable: true,
        categories,
        force: { repulsion: 190, edgeLength: [50, 130], gravity: 0.08, friction: 0.14 },
        label: { show: true, position: "right", fontSize: 11, color: INK, formatter: (p) => (p.data.symbolSize > 16 ? p.data.name : "") },
        labelLayout: { hideOverlap: true },
        lineStyle: { color: "#c8d0dc", width: 1, curveness: 0.08 },
        emphasis: { focus: "adjacency", lineStyle: { width: 2, color: BRAND } },
        data: nodes.map((n) => ({
          ...n,
          symbolSize: n.symbolSize,
          itemStyle: { color: n.color, borderColor: "#fff", borderWidth: 1.5 },
        })),
        links,
      }],
    };
  }, [nodes, links]);
  return <EChart option={option} height={height} onEvents={onNodeClick ? { click: (p) => p.dataType === "node" && onNodeClick(p.data) } : undefined} />;
}

/* ------------------------------ 环形占比 ------------------------------ */
export function DonutStat({ data, height = 180, centerLabel }) {
  const option = useMemo(() => ({
    ...CHART_BASE,
    tooltip: { ...CHART_BASE.tooltip, formatter: (p) => `${p.name}：${p.value} 题（${p.percent}%）` },
    legend: { show: true, bottom: 0, itemWidth: 9, itemHeight: 9, textStyle: { color: MUTED, fontSize: 11.5 } },
    series: [{
      type: "pie",
      radius: ["58%", "80%"],
      center: ["50%", "44%"],
      avoidLabelOverlap: true,
      itemStyle: { borderColor: "#fff", borderWidth: 2 },
      label: { show: false },
      data,
    }],
    graphic: centerLabel ? [{
      type: "text", left: "center", top: "38%",
      style: { text: centerLabel, fill: INK, fontSize: 16, fontWeight: 600, fontFamily: "sans-serif" },
    }] : undefined,
  }), [data, centerLabel]);
  return <EChart option={option} height={height} />;
}
