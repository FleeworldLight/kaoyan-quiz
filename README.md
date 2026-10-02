# 考研刷题（kaoyan-quiz）

一个纯前端的考研刷题单页应用，覆盖 **政治 / 英语一 / 数学一 / 408** 四科。
基于历年真题构建题库，支持章节练习、整套模考、随机组卷、错题本、统计看板，全部数据存在浏览器本地，不联网也能刷。

## 快速开始

**最简单的方式**：双击项目根目录的 **`启动刷题.cmd`**，它会自动构建（首次）并打开浏览器。

手动方式：

```bash
# 1. 安装依赖（已装好可跳过）
pnpm install --node-linker=hoisted

# 2. 构建并启动本地服务
pnpm build
pnpm serve
# 浏览器打开 http://127.0.0.1:5199/
```

开发模式（热更新）：

```bash
pnpm dev        # 默认 http://127.0.0.1:5199/
```

> ⚠️ 必须通过 HTTP 访问（`pnpm serve` / `启动刷题.cmd`），**不能直接双击 `dist/index.html`**——浏览器出于安全限制不允许 `file://` 下 `fetch` 本地 JSON 题库。

## 题库规模

| 科目 | 覆盖 | 套数 | 总题量 | 可自动评分 |
|---|---|---|---|---|
| 数学一 | 1987–2025（1994、2022 因源文件缺失/OCR 损坏剔除） | 37 | 765 | 257 |
| 英语一 | 2017–2023 | 7 | 359 | 275 |
| 政治 | 2010–2024 | 15 | 565 | 495 |
| 408 | 2009–2023 | 15 | 705 | 600 |
| **合计** | | **74** | **2394** | **1627** |

## 功能

| 模块 | 说明 |
|---|---|
| 年份套卷 | 按年份成套真题，支持计时、答题卡、交卷、自动评分 |
| 章节练习 | 按知识点跨年份抽题，按学科分组展示，显示各知识点掌握度 |
| 随机组卷 | 四科按题量自由配比混合组卷 |
| 错题本 | 答错自动收录，支持按科目筛选、查看解析、重做、导出 JSON |
| 收藏与笔记 | 题目级收藏与 Markdown 笔记 |
| 统计看板 | 正确率、各科进度、待加强知识点排行、26 周学习热力图、练习记录 |
| 公式渲染 | KaTeX 渲染 LaTeX（数学、408、政治均有公式） |
| 手机适配 | 响应式布局 + 底部导航，可在手机浏览器刷题 |

答题时支持键盘盲操：`A`–`D` / `1`–`4` 选择，`←` `→` 切题，`Enter` 下一题，`F` 标记。

## 题库数据

题目是静态 JSON，放在 `public/data/` 下，按科目分目录，前端按需懒加载。

```
public/data/
  index.json          # 全局清单：科目、试卷、题量、知识点
  math1/<year>.json
  english1/<year>.json
  politics/<year>.json
  cs408/<year>.json
  <subject>/images/   # 题干里的配图
```

数据规范见 [`tools/SCHEMA.md`](tools/SCHEMA.md)。

### 数据来源

| 科目 | 来源 |
|---|---|
| 数学一 | [TsekaLuk/Kaoyan-Math1-Papers](https://github.com/TsekaLuk/Kaoyan-Math1-Papers)（CC BY-NC-SA 4.0）：真题 Markdown + 逐题解析 |
| 英语一 | 同上仓库 `solutions/英语一/`（真题 + 答案解析 Markdown）；详见 `tools/english-findings.md` |
| 政治 | [yy11111111111111111111/kaoyan-politics](https://github.com/yy11111111111111111111/kaoyan-politics) 为主源，与 [mrwoov/kyzz](https://github.com/mrwoov/kyzz)、学信网官方答案交叉校验；详见 `tools/politics-findings.md` |
| 408 | [neville-studio/408-exam-paper](https://github.com/neville-studio/408-exam-paper) 的 `papers-rebuild/`（题干）+ 本地 `408真题/2009-2023答案/` 与 `2009-2016真题&答案/`（答案双源互证）；详见 `tools/cs408-findings.md` |

每份卷子的 JSON 里都带 `source` 字段（名称 + URL）。

**几个必须知道的数据坑（都已在数据里如实标注，没有编造）**：

- 政治主源之外的 `mrwoov/kyzz` **选项顺序被打乱**，答案字母与公开发布真题不一致，不能直接采用。
- 408 本地 `2009-2023真题/*.pdf` 有 8 个年份中文全部乱码（PDF 缺 ToUnicode 映射），题干改用上游「重构版」PDF。
- 408 与英语的含图题、部分公式上下标在文本抽取中会丢失；这类题目请对照原卷 PDF。

### 数据质量

- 每份卷子有 `quality` 字段（`high` / `medium` / `low`），OCR 质量差的卷子在前端会打标签提示。
- **答案存疑**：存在跨来源答案分歧的题带 `answerDisputed: true` + `answerNote`（政治 20 题），前端显示「答案存疑」徽标，并给出分歧说明；答案不会被删除，但请以官方答案为准。
- **选项缺失**：原始素材里选项被 OCR 吞掉的题带 `optionIssue` 字段，前端显示提示并当作主观题（自评）处理，不参与自动评分、不计入正确率。
- 数学 2022 与 1994 因源数据不可用（2022 全文乱码、1994 无真题文件）已整体剔除，没有用生成内容填充。


### 重新生成题库

```bash
pnpm data:build     # 抓取原始素材 → 解析 → 生成 index.json
pnpm data:index     # 只重建 index.json
pnpm verify         # 校验所有题库 JSON
```

解析脚本都在 `tools/` 下，每个科目的解析逻辑是独立的：

| 科目 | 脚本 |
|---|---|
| 数学一 | `fetch-tree.mjs` → `fetch-math.mjs` → `parse-math.mjs` → `fetch-math-images.mjs` |
| 英语一 | `fetch-english.mjs` → `parse-english.mjs` |
| 政治 | `politics-parse.mjs` → `build-politics.mjs` → `tag-chapters.mjs` → `build-topics-json.mjs` → `add-answer-note.mjs` → `validate-politics.mjs` |
| 408 | `fetch-rebuild.mjs` → `extract-rebuild.mjs` / `extract-qa.mjs` → `build-cs408.mjs` → `xcheck.mjs` → `validate-cs408.mjs` |
| 汇总 | `build-index.mjs` 生成 `public/data/index.json`；`validate-all.mjs` 全库校验 |

原始素材缓存在 `tools/cache/` 下，可安全删除后重新抓取。

校验全部数据：

```bash
node tools/validate-all.mjs
```

它会检查：JSON 可解析、题目 id 全库唯一、题干非空、单选题必须有 4 个 A/B/C/D 选项且答案在选项内、多选题答案字母升序且 ≥2 个、考点 id 双向一致等。

## 技术栈

Vite 5 + React 18 + React Router（HashRouter） + KaTeX。无后端、无数据库。
学习进度、错题、收藏、笔记、考试记录全部保存在 `localStorage`（键名 `kq:state:v1`）。

## 目录结构

```
kaoyan-quiz/
  启动刷题.cmd              ← 双击即可构建 + 启动 + 打开浏览器
  index.html
  vite.config.js
  src/
    main.jsx  App.jsx  styles.css
    lib/      data.js（加载与组卷） store.js（本地状态与统计） locate.js
    components/ Layout.jsx  RichText.jsx（Markdown + KaTeX 渲染）
    pages/    Home  Subject  Run（练习/模考）  Wrong  Fav  Stats
  tools/      数据管线 + 静态服务器 + 校验 + 端到端测试
  public/data/题库 JSON
```

## 自动化测试

```bash
pnpm verify      # 全库数据校验（JSON 结构、id 唯一、选项与答案一致性等）
pnpm test:e2e    # 端到端交互测试：无头 Edge 真实点击，验证答题/错题本/收藏/笔记/模考
```

`test:e2e` 需要先跑起 `pnpm serve`。它会依次验证：首页四科渲染 → 答错后展示正确答案并标红 → 进度与错题写入 localStorage → 收藏与笔记 → 错题本列表 → 统计页热力图 → 章节练习 → 四科随机组卷 → 模考计时/答题卡/交卷。当前为 **16/16 通过**。

## 已知限制

- 填空、解答、翻译、写作等主观题不支持自动评分，采用「查看参考答案 + 自评」，不计入正确率。
- 错题本导出为 JSON，暂不支持导入。
- 学习数据只存在本机浏览器，清空浏览器数据会丢失。
- 部分年份的题目解析来自 OCR，个别 LaTeX 公式可能渲染异常，题干会保留原始文本。

## 版权说明

题库内容均来自互联网公开渠道，版权归原出版/命题单位所有。本项目仅用于个人学习交流，请勿用于商业用途。
