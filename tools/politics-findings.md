# 考研政治题库 —— 构建报告、来源核实与后续改动

> 生成物：`public/data/politics/2010.json` … `2024.json`、`public/data/politics/_topics.json`、`tools/validate-politics.mjs`
> 注意：`public/data/index.json` 由调用方统一重建，本流程**不修改**它。

## 一、来源核实结论

| # | 来源 | URL | 可用性结论 |
|---|---|---|---|
| 1 | **yy11111111111111111111/kaoyan-politics** | https://github.com/yy11111111111111111111/kaoyan-politics | ★**主源**。`2011年考研政治真题.md`…`2026年…md`，每年完整 38 题（16 单选 + 17 多选 + 5 材料分析），题干/四个选项（公开真题顺序）/【答案】/【答案要点】齐全。 |
| 2 | **mrwoov/kyzz** | https://github.com/mrwoov/kyzz | 15 年 × 33 题纯选择题 + 解析全文 + 三级考点字段。**选项顺序被重排**，答案字母不能当真题答案；用作内容级交叉校验与冲突提示。 |
| 3 | 学信网 chsi 2010 真题解析 | https://yz.chsi.com.cn/kyzx/other/201001/20100113/61646472-1.html（`-2`/`-3`） | 可用。2010 单选+多选官方答案与解析；无选项原文，仅用于 2010 卷答案。 |
| 4 | 中国教育在线 eol 2021 完整版 | https://www.eol.cn/m/kaoyan/202012/t20201226_2063200.shtml | 可用。完整 2021 卷（含 5 道材料分析题参考答案）。 |
| 5 | 新东方 2020 docx | http://file.xdf.cn/uploads/211019/1113_211019200125xKHpTX2kl8ZHzoiw.docx | 可用但**选项顺序也被重排**（与主源仅 18/32 同序），答案字母不能直接采用。 |
| 6 | TsekaLuk/Kaoyan-Politics-Papers | https://github.com/TsekaLuk/Kaoyan-Politics-Papers | 名不副实：README 称 1994–2024，实际只有 `solutions/2021–2024` 四份 md，`papers/` 不存在。2023 可校验。 |
| 7 | 北方网 2010 答案 | https://edu.enorth.com.cn/system/2011/01/05/005535326.shtml | 页面 GBK 乱码，弃用。 |
| 8 | 其它 GitHub 候选 | `wenckerwan/guanlan`、`tutu-wow/PracticeQuestions`、`cschef/kaoyan_politics`、`dafuim/kyzz2018` | 除 guanlan 有 papers.json 外，其余仓库实际为空。 |

## 二、核心技术结论

1. **kyzz 的选项顺序被打乱**（与 chsi 官方 2010 顺序、eol 官方 2021 顺序均不同）。其答案字母 ≠ 公开答案，且自身有错（如 2010 Q25 官方 ABCD 它写 ACD）。**不能直接当真题答案。**
2. **yy 源采用公开真题选项顺序**：2021 与 eol 官方答案同序 31/33 一致；2023 与 TsekaLuk 同序 31/33 一致；2011/2022/2024 与 kyzz 33/33 一致。
3. **任何单源都有错**：2023 Q4 yy 说 A、TsekaLuk 说 B，kyzz 解析（“首先排除 C、D…受成本制约”）支持 A → 本库取 A；2021 Q23 eol 给 AB，但 kyzz 解析明确“数字经济已成为新引擎”属正确项，本库取 ABC 并加 note。
4. **跨源比较必须用选项文本内容而非字母**（各源顺序不同）：用「子串包含 + 2-gram 重合率」对齐后，主源 vs kyzz 在 462 道选择题中的真实冲突仅 16 处。

## 三、决定 1：冲突题标注规范化（已完成）

20 道跨源冲突题新增字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `verify` | string | 原有：`yy=kyzz` / `CONFLICT-yy-vs-kyzz` / `CONFLICT-chsi-vs-kyzz` / `yy-answer-points` / `chsi-2010` |
| `answerDisputed` | boolean | **新增**。`true` 表示该题答案存疑，前端可直接用它显示「答案存疑」徽标 |
| `answerNote` | string | **新增**。面向考生的中文提示，形如「此题在不同来源的答案存在分歧，本站采用「<来源>」的答案（X）；另有…。请以官方答案为准。」 |
| `chapterTopics` | string[] | **新增**。章级标签（见决定 2） |
| `chapterConfidence` | `"chapter"` \| `"subject-only"` \| null | **新增**。章级标签的置信度 |
| `subjectHint` | string \| null | **新增**。科目级提示（马原/毛中特/史纲/思修/新思想/时政） |

卷级另加 `verification.disputedQuestions`（题号数组）与 `verification.disputedCount`，便于前端一次性取用。

### 受影响的 20 道题清单（年份 / 题号 / 类型 / 本库答案 / verify / 另一来源答案）

| 年份 | 题号 | 类型 | 本库答案 | verify | 分歧来源与答案 |
|---|---|---|---|---|---|
| 2010 | 2 | single | D | `CONFLICT-chsi-vs-kyzz` | chsi 官方 D ↔ kyzz 解析主张 C（量变质变） |
| 2010 | 25 | multiple | ABCD | `CONFLICT-chsi-vs-kyzz` | chsi 官方 ABCD ↔ kyzz ACD |
| 2010 | 26 | multiple | AB | `CONFLICT-chsi-vs-kyzz` | chsi 官方 AB ↔ kyzz ABD |
| 2010 | 31 | multiple | BD | `CONFLICT-chsi-vs-kyzz` | chsi 官方 BD ↔ kyzz AB |
| 2012 | 7 | single | B | `CONFLICT-yy-vs-kyzz` | 主源 ↔ mrwoov/kyzz（选项顺序不同，内容对齐后仍冲突） |
| 2012 | 10 | single | A | `CONFLICT-yy-vs-kyzz` | 主源 ↔ mrwoov/kyzz（选项顺序不同，内容对齐后仍冲突） |
| 2012 | 29 | multiple | BCD | `CONFLICT-yy-vs-kyzz` | 主源 ↔ mrwoov/kyzz（选项顺序不同，内容对齐后仍冲突） |
| 2013 | 19 | multiple | CD | `CONFLICT-yy-vs-kyzz` | 主源 ↔ mrwoov/kyzz（选项顺序不同，内容对齐后仍冲突） |
| 2013 | 21 | multiple | ACD | `CONFLICT-yy-vs-kyzz` | 主源 ↔ mrwoov/kyzz（选项顺序不同，内容对齐后仍冲突） |
| 2014 | 32 | multiple | ABC | `CONFLICT-yy-vs-kyzz` | 主源 ↔ mrwoov/kyzz（选项顺序不同，内容对齐后仍冲突） |
| 2015 | 4 | single | D | `CONFLICT-yy-vs-kyzz` | 主源 ↔ mrwoov/kyzz（选项顺序不同，内容对齐后仍冲突） |
| 2016 | 11 | single | A | `CONFLICT-yy-vs-kyzz` | 主源 ↔ mrwoov/kyzz（选项顺序不同，内容对齐后仍冲突） |
| 2017 | 24 | multiple | ABCD | `CONFLICT-yy-vs-kyzz` | 主源 ↔ mrwoov/kyzz（选项顺序不同，内容对齐后仍冲突） |
| 2019 | 11 | single | B | `CONFLICT-yy-vs-kyzz` | 主源 ↔ mrwoov/kyzz（选项顺序不同，内容对齐后仍冲突） |
| 2019 | 30 | multiple | ABCD | `CONFLICT-yy-vs-kyzz` | 主源 ↔ mrwoov/kyzz（选项顺序不同，内容对齐后仍冲突） |
| 2020 | 2 | single | C | `CONFLICT-yy-vs-kyzz` | 主源 C ↔ 新东方解析/kyzz 解析主张「价值性评价」(D) |
| 2020 | 17 | multiple | BCD | `CONFLICT-yy-vs-kyzz` | 主源 BCD ↔ kyzz 内容对齐后为 ABD |
| 2020 | 19 | multiple | BCD | `CONFLICT-yy-vs-kyzz` | 主源 BCD ↔ kyzz 内容对齐后为 ABD |
| 2020 | 21 | multiple | BCD | `CONFLICT-yy-vs-kyzz` | 主源 BCD ↔ kyzz 内容对齐后为 ABD |
| 2021 | 24 | multiple | BCD | `CONFLICT-yy-vs-kyzz` | 主源 ↔ mrwoov/kyzz（选项顺序不同，内容对齐后仍冲突） |

按年份：2010（Q2/25/26/31）、2012（Q7/10/29）、2013（Q19/21）、2014（Q32）、2015（Q4）、2016（Q11）、2017（Q24）、2019（Q11/30）、2020（Q2/17/19/21）、2021（Q24）。

## 四、决定 2：章节级打标（已完成）

### 方案
- id 格式 **`<学科>-<章>`**（两段式，前端按 `-` 前半段分组）；另设 6 个 **`<学科>-综合`** 兜底桶（`kind: "subject-fallback"`，前端可用 `chapterConfidence` 区分，或干脆不展示）。
- 判定方式：关键词规则打分（章级阈值 6；科目取“单章最高分”所在学科）。**只在使用明确信号时打章级标签**，信号不足则退到科目兜底桶，绝不硬套。
- 讲义顺序敏感提示：单选前 4 题按考研政治固定结构强制归 `马原`。

### 结果

- 选择题 **495 道全部有标签**（覆盖 100%）；其中 **章级（confidence=chapter）394 道 = 394/495 = 79.6%**，科目兜底 101 道 = 20.4%。
- 每份卷子 33 道选择题均有章级标签（15/15 卷 ✔）。

### 章级 topic 列表（id + count）

**【马原】**

| id | count | 名称 | 类型 |
|---|---|---|---|
| `马原-政治经济学` | 57 | 马克思主义政治经济学（商品经济·资本·垄断） | 章 |
| `马原-综合` | 29 | 马克思主义基本原理·综合 | 兜底桶 |
| `马原-唯物史观` | 23 | 唯物史观（社会存在与社会意识·社会形态） | 章 |
| `马原-科学社会主义` | 18 | 科学社会主义（社会主义·共产主义） | 章 |
| `马原-辩证法` | 13 | 唯物辩证法（联系发展·三大规律） | 章 |
| `马原-唯物论` | 8 | 辩证唯物论（物质观·意识观） | 章 |
| `马原-认识论` | 7 | 认识论（实践与认识·真理） | 章 |
| `马原-导论` | 4 | 导论（马克思主义总论） | 章 |

**【毛中特】**

| id | count | 名称 | 类型 |
|---|---|---|---|
| `毛中特-中国特色社会主义理论体系` | 23 | 中国特色社会主义理论体系（邓小平理论·三个代表·科学发展观） | 章 |
| `毛中特-新民主主义革命` | 16 | 毛泽东思想与新民主主义革命理论 | 章 |
| `毛中特-综合` | 12 | 毛泽东思想和中国特色社会主义理论体系概论·综合 | 兜底桶 |
| `毛中特-社会主义改造与建设` | 10 | 社会主义改造与社会主义建设道路初步探索 | 章 |

**【时政】**

| id | count | 名称 | 类型 |
|---|---|---|---|
| `时政-当年时事` | 16 | 时政：当年国内外重大时事 | 章 |
| `时政-综合` | 5 | 形势与政策（时政）·综合 | 兜底桶 |

**【史纲】**

| id | count | 名称 | 类型 |
|---|---|---|---|
| `史纲-近代史` | 27 | 旧民主主义革命时期（近代史） | 章 |
| `史纲-综合` | 20 | 中国近现代史纲要·综合 | 兜底桶 |
| `史纲-党史` | 18 | 新民主主义革命时期（党史） | 章 |
| `史纲-现代史` | 2 | 新中国时期（现代史·建设与改革开放） | 章 |

**【思修】**

| id | count | 名称 | 类型 |
|---|---|---|---|
| `思修-法治` | 32 | 法治篇：法治素养与法律基础 | 章 |
| `思修-人生观价值观` | 21 | 思想篇：人生观与价值观 | 章 |
| `思修-道德` | 12 | 道德篇：道德观与道德实践 | 章 |
| `思修-综合` | 7 | 思想道德与法治·综合 | 兜底桶 |

**【新思想】**

| id | count | 名称 | 类型 |
|---|---|---|---|
| `新思想-总体布局` | 49 | 布局安排：经济·政治·文化·社会·生态 | 章 |
| `新思想-综合` | 28 | 习近平新时代中国特色社会主义思想概论·综合 | 兜底桶 |
| `新思想-内外条件` | 23 | 内外条件：安全·国防·一国两制·外交 | 章 |
| `新思想-党建` | 8 | 全面从严治党 | 章 |
| `新思想-基本问题` | 6 | 基本问题：新时代总目标总任务与领导力量 | 章 |
| `新思想-导论` | 1 | 导论：新思想的历史地位与世界观方法论 | 章 |

### 细粒度考点

另有从本地 `Politics-Obsidian-Note-latest` 抽取的 682 个考点，其中 **36 个 count>0**（已剔除 0 题章节）。这些 id 为三段式或更长（如 `史纲-中华民族的抗日战争-考点61马克思主义中国化`），与章级两段式 id **命名空间不冲突**（已实测 0 冲突、0 重复）。打标 56 道题。

## 五、_topics.json v2 结构

```jsonc
{
  "version": 2,
  "tagging": { "choiceQuestions": 495, "chapterLevel": 394, "subjectFallback": 101, "untagged": 0, "chapterPrecision": 79.6, "coverage": 100 },
  "chapters": [ { "id": "马原-政治经济学", "subject": "马原", "name": "…", "count": 57, "kind": "chapter" } ],
  "subjects": [ { "id": "马原", "name": "…", "chapters": [ { "id": "…", "topics": [ { "id": "…", "name": "…", "kind": "考点", "count": 10 } ] } ] } ]
}
```

- **只保留 count > 0 的 topic**（章级与细粒度都是），前端不会出现 0 题空章节。
- 校验脚本已强制：任何声明 count>0 的 topic 必须至少被一道题引用；任何题目引用的 topic 必须在 `_topics.json` 中存在（双向一致，实测均 0 违规）。

## 六、产出统计

| 年份 | 单选 | 多选 | 材料 | 合计 | 章标 | 存疑 | quality |
|---|---|---|---|---|---|---|---|
| 2010 | 16 | 17 | 0 | 33 | 33 | 4 | medium |
| 2011 | 16 | 17 | 5 | 38 | 33 | 0 | high |
| 2012 | 16 | 17 | 5 | 38 | 33 | 3 | medium |
| 2013 | 16 | 17 | 5 | 38 | 33 | 2 | medium |
| 2014 | 16 | 17 | 5 | 38 | 33 | 1 | medium |
| 2015 | 16 | 17 | 5 | 38 | 33 | 1 | medium |
| 2016 | 16 | 17 | 5 | 38 | 33 | 1 | medium |
| 2017 | 16 | 17 | 5 | 38 | 33 | 1 | medium |
| 2018 | 16 | 17 | 5 | 38 | 33 | 0 | high |
| 2019 | 16 | 17 | 5 | 38 | 33 | 2 | medium |
| 2020 | 16 | 17 | 5 | 38 | 33 | 4 | medium |
| 2021 | 16 | 17 | 5 | 38 | 33 | 1 | medium |
| 2022 | 16 | 17 | 5 | 38 | 33 | 0 | high |
| 2023 | 16 | 17 | 5 | 38 | 33 | 0 | high |
| 2024 | 16 | 17 | 5 | 38 | 33 | 0 | high |

合计 **565 题**（单选 240 / 多选 255 / 材料分析 70），答案缺失 0 题。

## 七、已知缺陷

1. **20 道题答案存疑**（已加 `answerDisputed` + `answerNote`）。2012–2019 这 6 年没有第三份权威答案可仲裁，本库保留主源答案并如实标注，**没有编造答案**。
2. **章级打标准确率约 79.6%**，科目兜底 20.4%。抽样核对发现少量误判，例如：
   - `2017-Q10`（陈独秀对巴黎和会认识变化）被判为 `新思想-内外条件`，实际应属 `史纲-党史`；
   - `2020-Q7`（新时代人民政协工作中心环节）被判为 `史纲-综合`，实际应属 `新思想-总体布局`。
   两处均因短关键词（“和会/巴黎”“人民政协”）误命中。前端若对章节练习要求高准确率，建议对 `chapterConfidence == "subject-only"` 的题不纳入章节练习。
3. **2010 卷的选项顺序**取自 kyzz，与试卷公开发布顺序不同（答案已按 chsi 官方答案给出，字母与公开发布答案一致）；该卷无材料分析题。
4. **材料分析题答案是简明要点版**（约 140–400 字/题），非完整官方评分细则，`verify` 标为 `yy-answer-points`。
5. 未纳入模拟题（肖四肖八/腿姐等）：无明确公开授权来源。
6. `tools/` 下保留的正式脚本：`politics-parse.mjs`、`build-politics.mjs`、`build-topics.mjs`、`tag-chapters.mjs`、`build-topics-json.mjs`、`add-answer-note.mjs`、`backfill-essay-fields.mjs`、`validate-politics.mjs`、`check-topic-consistency.mjs`、`build-index.mjs`（index.json 由调用方统一重建，此脚本保留参考，本次未运行）。
