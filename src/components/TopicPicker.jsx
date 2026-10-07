import React, { useMemo } from "react";
import { Check } from "lucide-react";
import { cn } from "../lib/utils.js";

/**
 * 章节选择器：从四科**现有**的章节列表里选，而不是让用户自由输入。
 *
 * 复用 index.json 里已有的 topics 结构（{ id, name, group, groupName }），
 * 好处是标签口径和题库一致，以后要做筛选/统计也不用再对账。
 * 三级：科目 → 分组（groupName）→ 章节（name）。
 */
export default function TopicPicker({ index, value, onChange }) {
  const subjects = index?.subjects || [];
  const subject = value?.subject || "";

  const topics = useMemo(() => {
    const s = subjects.find((x) => x.id === subject);
    return (s?.topics || []).filter((t) => t.kind !== "subject-fallback");
  }, [subjects, subject]);

  // 分组顺序按题量降序，用户先看到的是重点章节
  const groups = useMemo(() => {
    const m = new Map();
    for (const t of topics) {
      const g = t.groupName || t.group || "其它";
      if (!m.has(g)) m.set(g, []);
      m.get(g).push(t);
    }
    return [...m.entries()].map(([name, list]) => ({
      name,
      list: list.sort((a, b) => (b.count || 0) - (a.count || 0)),
      count: list.reduce((a, x) => a + (x.count || 0), 0),
    })).sort((a, b) => b.count - a.count);
  }, [topics]);

  const group = value?.groupName || "";
  const cur = groups.find((g) => g.name === group);

  function pickSubject(id) {
    onChange({ subject: id, topicId: null, topicName: null, groupName: null });
  }
  function pickGroup(name) {
    onChange({ ...value, groupName: name, topicId: null, topicName: null });
  }
  function pickTopic(t) {
    onChange({ ...value, subject, groupName: t.groupName || t.group || group, topicId: t.id, topicName: t.name });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 1. 科目 */}
      <div className="flex flex-wrap gap-1.5">
        {subjects.map((s) => {
          const on = subject === s.id;
          return (
            <button key={s.id} type="button" onClick={() => pickSubject(s.id)} data-test-subject={s.id}
              style={on ? { background: s.color, borderColor: s.color } : undefined}
              className={cn("rounded-md border px-2.5 py-1.5 text-[12.5px] transition-colors",
                on ? "font-semibold text-white"
                   : "border-line text-ink-subtle hover:border-line-strong")}>
              {s.name}
            </button>
          );
        })}
      </div>

      {/* 2. 分组 */}
      {subject ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11.5px] text-ink-faint">所属板块</span>
          <div className="flex flex-wrap gap-1.5">
            {groups.map((g) => (
              <button key={g.name} type="button" onClick={() => pickGroup(g.name)} data-test-group={g.name}
                className={cn("rounded-md border px-2 py-1 text-[12px] transition-colors",
                  group === g.name ? "border-brand-line bg-brand-soft font-semibold text-brand"
                                   : "border-line text-ink-subtle hover:border-line-strong")}>
                {g.name} <span className="text-ink-faint">{g.list.length}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* 3. 章节 */}
      {cur ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11.5px] text-ink-faint">具体章节</span>
          <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto pr-0.5">
            {cur.list.map((t) => {
              const on = value?.topicId === t.id;
              return (
                <button key={t.id} type="button" onClick={() => pickTopic(t)} data-test-topic={t.id}
                  className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[12px] transition-colors",
                    on ? "border-brand-line bg-brand-soft font-semibold text-brand"
                       : "border-line text-ink-subtle hover:border-line-strong")}>
                  {on ? <Check className="size-3" /> : null}{t.name}
                  <span className="text-ink-faint">{t.count}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {value?.topicName ? (
        <p className="rounded-md bg-brand-soft/60 px-2.5 py-1.5 text-[12px] text-brand">
          已选：{subjects.find((s) => s.id === subject)?.name} · {value.groupName} · <b>{value.topicName}</b>
        </p>
      ) : (
        <p className="text-[12px] text-ink-faint">
          {subject ? (group ? "请选一个具体章节" : "请选一个板块") : "请先选科目"}
        </p>
      )}
    </div>
  );
}
