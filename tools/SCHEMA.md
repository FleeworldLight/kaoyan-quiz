# 题库数据规范 (v1)

所有题库数据放在 `public/data/` 下，前端通过 `fetch` 懒加载。

## 目录结构

```
public/data/
  index.json                # 全局清单
  math1/<year>.json         # 数学一，一年一份卷
  english1/<year>.json      # 英语一
  politics/<year>.json      # 政治（年份卷）或 politics/mock-<n>.json（模拟卷）
  cs408/<year>.json         # 408
```

## index.json

```json
{
  "version": 1,
  "generatedAt": "2026-01-01T00:00:00.000Z",
  "subjects": [
    {
      "id": "math1",
      "name": "数学一",
      "fullName": "考研数学（一）",
      "color": "#4f46e5",
      "icon": "∑",
      "examDuration": 180,
      "examTotalScore": 150,
      "sections": [
        { "id": "choice", "name": "选择题" },
        { "id": "blank",  "name": "填空题" },
        { "id": "essay",  "name": "解答题" }
      ],
      "papers": [
        {
          "id": "math1-2015",
          "year": 2015,
          "title": "2015 年全国硕士研究生招生考试 数学（一）",
          "file": "math1/2015.json",
          "questionCount": 23,
          "choiceCount": 8,
          "totalScore": 150,
          "duration": 180,
          "quality": "high",
          "source": "TsekaLuk/Kaoyan-Math1-Papers",
          "sourceUrl": "https://github.com/TsekaLuk/Kaoyan-Math1-Papers"
        }
      ],
      "topics": [
        { "id": "gaoshu-极值与最值", "name": "极限与连续", "count": 24 }
      ]
    }
  ]
}
```

- `quality`: `high` | `medium` | `low`。低质量（OCR 严重损坏）的卷子前端要显示提示，但不删除。
- `topics`: 章节练习用的知识点聚合，`id` 全局唯一，`count` 是该科目下该知识点的题目总数。

## 单卷 JSON

```json
{
  "id": "math1-2015",
  "subject": "math1",
  "subjectName": "数学一",
  "year": 2015,
  "title": "2015 年全国硕士研究生招生考试 数学（一）",
  "duration": 180,
  "totalScore": 150,
  "quality": "high",
  "source": { "name": "TsekaLuk/Kaoyan-Math1-Papers", "url": "https://github.com/..." },
  "sections": [
    {
      "id": "choice",
      "name": "一、选择题",
      "questions": [
        {
          "id": "math1-2015-q1",
          "no": 1,
          "type": "single",
          "stem": "设函数 $f(x)$ 在 $(-\\infty,+\\infty)$ 上连续……则曲线 $y=f(x)$ 的拐点个数为（）",
          "options": [
            { "key": "A", "text": "0." },
            { "key": "B", "text": "1." },
            { "key": "C", "text": "2." },
            { "key": "D", "text": "3." }
          ],
          "answer": "C",
          "explanation": "【解】……",
          "score": 4,
          "topics": ["gaoshu-导数的应用"],
          "images": []
        }
      ]
    }
  ]
}
```

## 字段约束

| 字段 | 说明 |
|---|---|
| `id` | 全库唯一，格式 `<subject>-<year>-q<no>`；模拟卷用 `<subject>-mock<n>-q<i>` |
| `type` | `single` 单选 / `multiple` 多选 / `blank` 填空 / `essay` 解答（含材料分析、翻译、写作） |
| `no` | 卷内题号（数字） |
| `stem` | 题干，保留原始 Markdown + LaTeX（`$...$` / `$$...$$`）。不要把选项写进 stem |
| `options` | `single`/`multiple` 必须有，数组顺序即 A/B/C/D；其它类型为 `[]` 或省略 |
| `answer` | `single`: `"C"`；`multiple`: `"ABD"`（字母升序，无分隔符）；`blank`: 参考答案的 LaTeX/Markdown 文本；`essay`: 参考答案全文 |
| `explanation` | 解析正文（Markdown + LaTeX），没有就留空字符串。**不要**把答案重复写在这里 |
| `score` | 该题分值，未知填 0 |
| `topics` | 知识点 id 数组，用于章节练习；无把握填空数组 |
| `images` | 相对 `public/data/<subject>/images/` 的图片文件名数组，无图填空数组 |
| `quality` | 卷级：题干/选项缺失或 OCR 损坏严重 → `low`；个别小瑕疵 → `medium` |

## 硬性要求

1. **不要编造题目**。只输出真实存在、能从来源核实的内容。抓不到就少输出。
2. **答案必须来自来源**，不能靠模型自己推。推断的答案一律不要写，宁可 `answer` 留空字符串并在 `quality` 上降级。
3. 每份卷子都要有 `source`（名称 + URL）。
4. JSON 必须能被 `JSON.parse` 解析；LaTeX 反斜杠要正确转义（`\\frac` → JSON 里写 `\\frac`，即文件中是 `\\frac`）。

---

## 补充字段（v1.1）

### `material` / `materialTitle`（可选）
用于英语阅读、政治材料分析等「一段材料对应多道题」的场景。**不要**把材料塞进每道题的 `stem` 里重复。

```json
{
  "id": "english1-2017-q21",
  "no": 21,
  "type": "single",
  "materialTitle": "Text 1",
  "material": "The crash of Egypt Air Flight 804 ……（整段阅读材料原文）",
  "stem": "21. The crash of Egypt Air Flight 804 is mentioned to",
  "options": [ { "key": "A", "text": "…" } ],
  "answer": "B",
  "explanation": "…"
}
```

同一段材料的多道题，`materialTitle` 与 `material` 内容保持一致，前端会自动折叠展示一次。
章节里也可以放 `materials` 数组，但优先用题目级字段，便于随机组卷。

### 英语一（english1）专项约定
- 题型分节：`cloze`（完型 1–20）、`reading`（阅读 Part A 21–40）、`newtype`（新题型 Part B 41–45）、`translation`（翻译 Part C 46–50）、`writing`（写作 Part A/B 51–52）。
- 完型 1–20：`materialTitle` 用 `"完型填空原文"`，`material` 放完整文章；`stem` 形如 `"（第 1 空）"` 或带空格的句子片段。
- 阅读 21–40：按 Text 1–4 分组，`materialTitle` 用 `"Text 1"`…`"Text 4"`。
- 41–45 新题型：若材料是段落匹配，同样用 `material`。
- 46–50 翻译、51–52 写作：`type: "essay"`，`options: []`，`answer` 放参考译文/范文（有则填，无则空字符串）。
- `score`：完型 0.5 分/题，阅读 2 分/题，新题型 2 分/题，翻译 10 分（5 小题共 10 分，每题 2 分），写作 10+20 分。
