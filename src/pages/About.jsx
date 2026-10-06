import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Database, ShieldAlert, ExternalLink, BookOpen, FileStack, Heart,
  MonitorSmartphone, Code2, Scale, CheckCircle2,
} from "lucide-react";
import { Badge, Card, CardBody, CardHead, Divider } from "../components/ui.jsx";
import { cn, SUBJECT_TONE } from "../lib/utils.js";

/**
 * 数据来源与说明。
 * 页面上的来源列表是**从 index.json 实时推导**的，不是手写的常量 ——
 * 题库增删来源后这里会自动跟着变，不会出现文档与数据不一致的情况。
 */
export default function About({ index }) {
  const subjects = index.subjects || [];
  const mockGroups = index.mockGroups || [];

  const totalQ = subjects.reduce((a, s) => a + s.questionCount, 0);
  const totalPapers = subjects.reduce((a, s) => a + s.papers.length, 0);
  const mockQ = mockGroups.reduce((a, g) => a + g.questionCount, 0);
  const mockPapers = mockGroups.reduce((a, g) => a + g.papers.length, 0);

  // 每科的真题来源（按来源名归并，带年份区间）
  const subjectSources = useMemo(() => subjects.map((s) => {
    const m = new Map();
    for (const p of s.papers) {
      const key = p.source || "未标注来源";
      const cur = m.get(key) || { name: key, url: p.sourceUrl || "", years: [], count: 0 };
      cur.count++;
      if (p.year) cur.years.push(p.year);
      if (!cur.url && p.sourceUrl) cur.url = p.sourceUrl;
      m.set(key, cur);
    }
    const list = [...m.values()].map((x) => {
      const ys = x.years.filter(Boolean).sort((a, b) => a - b);
      return { ...x, range: ys.length ? (ys[0] === ys[ys.length - 1] ? String(ys[0]) : `${ys[0]}–${ys[ys.length - 1]}`) : "" };
    }).sort((a, b) => b.count - a.count);
    return { subject: s, list };
  }), [subjects]);

  // 模拟卷按出版方归并
  const mockPublishers = useMemo(() => {
    const m = new Map();
    for (const g of mockGroups) {
      const key = g.publisher || "未标注";
      const cur = m.get(key) || { publisher: key, subjects: new Set(), papers: 0, questions: 0, sources: new Map() };
      cur.subjects.add(g.subjectName || g.subject);
      cur.papers += g.papers.length;
      cur.questions += g.questionCount || 0;
      if (g.source?.url) cur.sources.set(g.source.name || g.source.url, g.source.url);
      m.set(key, cur);
    }
    return [...m.values()].map((x) => ({ ...x, subjects: [...x.subjects], sources: [...x.sources.entries()] }))
      .sort((a, b) => b.questions - a.questions);
  }, [mockGroups]);

  const commercial = mockPublishers.filter((p) => /肖秀荣|张宇|李林|李艳芳|王道|徐涛|袁/.test(p.publisher));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-serif text-[19px] font-bold text-ink-strong">数据来源与说明</h1>
        <Badge tone="neutral">真题 {totalPapers} 套 / {totalQ} 题</Badge>
        <Badge tone="warn">模拟卷 {mockPapers} 套 / {mockQ} 题</Badge>
      </div>

      {/* ------------------------------ 免责声明 ------------------------------ */}
      <Card className="border-warn-line bg-warn-soft/40">
        <CardBody className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-warn" />
            <h2 className="text-[14px] font-semibold text-ink-strong">重要声明：请先读这一节</h2>
          </div>
          <ul className="flex flex-col gap-2 text-[12.8px] leading-relaxed text-ink-subtle">
            <li className="flex gap-2">
              <span className="text-warn">·</span>
              <span>
                本站是<b className="text-ink-strong">个人学习用途</b>的刷题工具，
                <b className="text-ink-strong">不提供任何资料下载、不以任何形式盈利</b>，也不对题目内容主张任何权利。
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-warn">·</span>
              <span>
                题库内容整理自互联网公开渠道，<b className="text-ink-strong">版权归原作者与出版机构所有</b>。
                题目文本、答案与解析仅用于学习交流。
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-warn">·</span>
              <span>
                <b className="text-ink-strong">模拟卷部分尤其需要注意</b>：肖秀荣、张宇、李林、李艳芳、王道等系列
                多为<b className="text-ink-strong">正在销售的商业出版物</b>，所收录的是第三方站点的网页转录，
                <b className="text-ink-strong">不是正式出版物原文，也未经逐字核对</b>，
                可能存在错字、漏字、选项顺序差异甚至个别答案录入错误。
                <b className="text-ink-strong">请以正式出版物为准。</b>
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-warn">·</span>
              <span>
                如您是权利人，认为本站收录的内容侵犯了您的权益，
                <b className="text-ink-strong">请通过仓库的 Issue 联系我，我会在第一时间移除相关内容</b>，
                无需任何法律程序。
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-warn">·</span>
              <span>
                题库可能存在错误。对答案有疑问时请以官方答案 / 教材为准，也欢迎提 Issue 指出 ——
                应用内已对存疑题目做了标注（见下方「如何标注存疑内容」）。
              </span>
            </li>
          </ul>
        </CardBody>
      </Card>

      {/* ------------------------------ 数据总览 ------------------------------ */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {subjects.map((s) => {
          const tone = SUBJECT_TONE[s.id] || {};
          return (
            <Card key={s.id}>
              <CardBody className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className={cn("text-[13px] font-semibold", tone.text || "text-ink-strong")}>{s.name}</span>
                  <span className="text-[11.5px] text-ink-faint">{s.papers.length} 套</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-serif text-[22px] font-bold text-ink-strong">{s.questionCount}</span>
                  <span className="text-[12px] text-ink-faint">题</span>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[11.5px]">
                  <span className="text-ink-faint">可自动评分 {s.choiceCount}</span>
                  <span className="text-ink-faint">·</span>
                  <span className={cn(s.answerCoverage >= 95 ? "text-good" : "text-warn")}>
                    答案覆盖 {Math.round(s.answerCoverage)}%
                  </span>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>

      {/* ------------------------------ 真题来源 ------------------------------ */}
      <Card>
        <CardHead
          title="历年真题来源"
          desc="按科目列出每一套卷子的实际来源。列表由 index.json 实时推导，与题库数据始终一致。"
          icon={Database}
        />
        <CardBody className="flex flex-col gap-4">
          {subjectSources.map(({ subject, list }) => (
            <div key={subject.id} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className={cn("text-[13px] font-semibold", (SUBJECT_TONE[subject.id] || {}).text || "text-ink-strong")}>
                  {subject.fullName || subject.name}
                </span>
                <span className="text-[11.5px] text-ink-faint">
                  {subject.papers.length} 套 · {subject.questionCount} 题
                </span>
              </div>
              <ul className="flex flex-col gap-1.5">
                {list.map((src) => (
                  <li key={src.name} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12.5px]">
                    <span className="text-ink-subtle">{src.name}</span>
                    {src.range ? <span className="text-ink-faint">{src.range} 年</span> : null}
                    <span className="text-ink-faint">{src.count} 套</span>
                    {src.url ? (
                      <a href={src.url} target="_blank" rel="noreferrer noopener"
                         className="inline-flex items-center gap-0.5 text-brand hover:underline">
                        <ExternalLink className="size-3" />链接
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardBody>
      </Card>

      {/* ------------------------------ 模拟卷来源 ------------------------------ */}
      <Card>
        <CardHead
          title="模拟卷来源与风险"
          desc="模拟卷全部标记为「未校验」，多数对应正在销售的商业出版物，请务必以正式出版物为准。"
          icon={FileStack}
          extra={<Badge tone="warn">{commercial.length} 个商业出版方</Badge>}
        />
        <CardBody className="flex flex-col gap-3">
          <ul className="flex flex-col gap-2.5">
            {mockPublishers.map((p) => (
              <li key={p.publisher} className="flex flex-col gap-1 rounded-md border border-line-subtle bg-sunken/50 px-3 py-2">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[13px] font-semibold text-ink-strong">{p.publisher}</span>
                  <span className="text-[11.5px] text-ink-faint">{p.subjects.join(" / ")}</span>
                  <span className="ml-auto text-[11.5px] text-ink-faint">{p.papers} 套 · {p.questions} 题</span>
                </div>
                {p.sources.length ? (
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                    {p.sources.map(([name, url]) => (
                      <a key={url} href={url} target="_blank" rel="noreferrer noopener"
                         className="inline-flex items-center gap-0.5 text-[11.5px] text-brand hover:underline">
                        <ExternalLink className="size-3" />{name}
                      </a>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          {index.mockNote ? (
            <p className="rounded-md bg-sunken px-3 py-2 text-[12px] leading-relaxed text-ink-subtle">{index.mockNote}</p>
          ) : null}
        </CardBody>
      </Card>

      {/* ------------------------------ 标注约定 ------------------------------ */}
      <Card>
        <CardHead title="如何标注存疑内容" desc="宁可标出来，也不假装数据是完美的。" icon={Scale} />
        <CardBody>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {[
              ["答案存疑", "同一道题在不同来源的答案不一致时，会显示「答案存疑」，并写明各方说法与本站采用哪一个。"],
              ["答案非原文", "该题答案是来源题库推算生成的，不是原书/官方给出的答案（多见于题库型模拟题）。"],
              ["选项残缺", "来源的选项不完整（常见于选项被做成图片的题目），会提示对照原卷。"],
              ["缺配图", "题干提到「如下图」但题库未收录配图时，会提示对照原卷 PDF 查看。"],
              ["质量等级", "每套卷标有 high / medium / low / unverified 四档，低质量卷在题库里会明确提示。"],
              ["模拟卷一律未校验", "模拟卷全部标记 unverified，不作为标准答案依据。"],
            ].map(([t, d]) => (
              <div key={t} className="flex gap-2 rounded-md border border-line-subtle px-3 py-2">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-brand" />
                <div>
                  <div className="text-[12.5px] font-semibold text-ink-strong">{t}</div>
                  <div className="mt-0.5 text-[12px] leading-relaxed text-ink-subtle">{d}</div>
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* ------------------------------ 隐私与技术 ------------------------------ */}
      <Card>
        <CardHead title="隐私与技术" icon={MonitorSmartphone} />
        <CardBody className="flex flex-col gap-3 text-[12.5px] leading-relaxed text-ink-subtle">
          <div className="flex gap-2">
            <Heart className="mt-0.5 size-3.5 shrink-0 text-brand" />
            <span>
              <b className="text-ink-strong">本站不收集任何个人信息</b>：没有后端、没有账号、没有埋点统计。
              你的做题记录、错题、收藏、笔记全部只保存在<b className="text-ink-strong">你自己浏览器的 localStorage</b> 里，
              不会上传到任何服务器。清除浏览器数据就会清空，建议定期用「学习记录 → 备份全部数据」导出保存。
            </span>
          </div>
          <div className="flex gap-2">
            <BookOpen className="mt-0.5 size-3.5 shrink-0 text-brand" />
            <span>
              纯前端静态站点（Vite + React + Tailwind + Radix + ECharts + KaTeX），
              可离线部署，也可直接托管在 GitHub Pages 上。题库以 JSON 随站点分发、按需加载。
            </span>
          </div>
          <div className="flex gap-2">
            <Code2 className="mt-0.5 size-3.5 shrink-0 text-brand" />
            <span>
              源码、数据管线脚本、以及所有已知数据缺陷的记录都在仓库里。发现问题欢迎提 Issue。
            </span>
          </div>
        </CardBody>
      </Card>

      <Divider />
      <p className="flex items-center justify-center gap-2 pb-2 text-center text-[11.5px] text-ink-faint">
        祝你上岸。
        <span>·</span>
        <Link to="/library" className="text-brand hover:underline">去刷题</Link>
        <span>·</span>
        <Link to="/" className="text-brand hover:underline">回首页</Link>
      </p>
    </div>
  );
}
