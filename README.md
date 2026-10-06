# 考研刷题（kaoyan-quiz）

一个纯前端的考研刷题单页应用，覆盖 **政治 / 英语一 / 数学一 / 408** 四科。
历年真题 + 模拟卷，含智能组卷、错题复测、掌握地图、知识图谱、收藏本与题目笔记；全部学习数据存在浏览器本地，不联网也能刷。

## 快速开始

**最简单的方式**：双击项目根目录的 **`启动刷题.cmd`**，它会自动构建（首次）并打开浏览器。

手动方式：

```bash
pnpm install --node-linker=hoisted   # 安装依赖（已装好可跳过）
pnpm build                            # 构建
pnpm serve                            # 启动本地服务，浏览器打开 http://127.0.0.1:5199/
pnpm dev                              # 或开发模式（热更新）
```

> ⚠️ 必须通过 HTTP 访问（`pnpm serve` / `启动刷题.cmd`），**不能直接双击 `dist/index.html`**——浏览器出于安全限制不允许 `file://` 下 `fetch` 本地 JSON 题库。

## 部署到 GitHub Pages

已内置 GitHub Actions 工作流（`.github/workflows/deploy.yml`），推到 `main` 就会自动构建、校验题库、发布。

**一次性设置：**

1. 在 GitHub 上建一个**公开**仓库（免费账号的 Pages 只支持公开仓库）：
   ```bash
   git remote add origin https://github.com/<你的用户名>/<仓库名>.git
   git branch -M main
   git push -u origin main
   ```
2. 仓库 → **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。
3. 等 Actions 跑完，访问 `https://<你的用户名>.github.io/<仓库名>/`。

**不需要改任何配置**：`vite.config.js` 里的 `base: "./"` 配合 `HashRouter`，站点放在根路径或任意子路径都能正常工作（已在模拟子路径下实测：首页、练习页、KaTeX 公式、408 配图全部正常）。

**为什么用 Actions 而不是直接提交 `dist/`**：`dist/` 在 `.gitignore` 里（避免仓库里既有源码又有产物、容易不同步）。工作流每次从源码构建，并把 `node tools/validate-all.mjs` 作为发布前的一道关卡——数据校验不通过就不会发布。

**GitHub Pages 的资源限制**（当前用量都在安全范围内）：站点 ≤ 1 GB（本站约 31 MB）、单文件 ≤ 100 MB（最大 1.1 MB）、每月流量软上限 100 GB。GitHub Pages 自带 HTTP/2 与 gzip/brotli，所以 `serve.mjs` 里的压缩只对本地预览有意义。

> ⚠️ **公开部署前请先读 [数据来源与说明](#数据来源与版权) 一节。** 真题部分风险较低，但模拟卷多为正在销售的商业出版物。

## 数据来源与版权

应用内有一页「**数据说明**」（侧栏 → 我的 → 数据说明，路由 `/about`），来源列表是从 `index.json` **实时推导**的，与题库数据永远一致，公开部署时会向访客显示：

- 本站为个人学习用途，不提供资料下载、不盈利、不对内容主张权利；
- 题库整理自互联网公开渠道，**版权归原作者与出版机构所有**；
- **模拟卷**（肖秀荣、张宇、李林、李艳芳、王道、徐涛等）多为正在销售的商业出版物，所收录的是第三方站点的网页转录，**不是正式出版物原文、未经逐字核对**，可能有错字/漏字/选项顺序差异，**请以正式出版物为准**；
- 权利人如不希望内容被收录，可通过仓库 Issue 联系移除。

**在自己的电脑上刷 = 个人使用；放到公网让所有人下载是另一回事。** 如果要公开部署，请先自行判断这个风险是否可以接受。

授权范围的划分见 [LICENSE](LICENSE)（代码 MIT）与 [NOTICE.md](NOTICE.md)（题库内容版权归原作者，不在 MIT 范围内）。

## 题库规模

**四科都已覆盖 2010–2025**（数学另有 1987–2009，408 另有 2009）。

| 科目 | 覆盖 | 套数 | 总题量 | 可自动评分 |
|---|---|---|---|---|
| 数学一 | 1987–2025（缺 1994，源文件不存在；2010–2025 完整） | 38 | 787 | 267 |
| 英语一 | 2010–2025 | 16 | 827 | 635 |
| 政治 | 2010–2025 | 16 | 603 | 528 |
| 408 | 2009–2025（**已配图 110 题 / 121 张**） | 17 | 799 | 680 |
| **真题合计** | | **87** | **3016** | **2110** |
| 模拟卷 | 见下方「模拟卷」 | 57 | 6077 | 4475 |
| **全库合计** | | **144** | **9093** | **6585** |

### 模拟卷（`public/data/mock/`）

| 科目 | 来源 | 系列 | 套数 | 题量 |
| 科目 | 来源 | 系列 | 套数 | 题量 |
|---|---|---|---|---|
| 政治 | **N诺考研 [noobdream.com](https://noobdream.com/Practice/pastexam/)**（第三方练习站转录） | **肖秀荣 · 2026 冲刺 8 套卷（肖八）** | 8 | 304 |
| 政治 | 同上 | **肖秀荣 · 2025 终极预测 4 套卷（肖四）** | 4 | 150 |
| 数学一 | 同上 | 张宇终极预测 8 套卷（2025 全 8 套 + 2026 两套） | 10 | 189 |
| 数学一 | 同上 | 李林冲刺预测 6 套卷（2025/2026 各 6 套） | 12 | 259 |
| 数学一 | 同上 | 李艳芳预测 3 套卷（仅第三套） | 1 | 12 |
| 政治 | [Kaoyan_Politics2027](https://github.com/SatoriSatori555/Kaoyan_Politics2027)（徐涛/袁·杰题目网页版题库） | 马原/毛中特/习思想/史纲/思修法基/综合训练 | 12 | 1222 |
| 数学一 | [zhangyu-1000t](https://github.com/jlshdsdk/zhangyu-1000t)（张宇 1000 题转录版） | 测试卷一~四 + 基础篇/强化篇章节练习 | 6 | 1307 |
| 408 | [408-quiz](https://github.com/zsc5725216-hub/408-quiz)（王道教材 OCR 题库） | 数据结构/计组/操作系统/计网 | 4 | 2600 |
| **合计** | | **16 个系列** | **57** | **6077** |

**模拟卷的已知问题（界面上都有提示）**：

- 全部标记 `quality: "unverified"`，**没有逐题校验**，请以正式出版物为准。
- **肖四肖八等来自 N诺考研的网页转录，不是正式出版物原文**：每卷 `sourceNote` 都写明了这一点，`source.url` 逐套指向对应的练习解析页，可以逐题回源核对。这 35 套卷虽然答案覆盖 96.8%，但可能存在错字、选项顺序差异或个别录入错误 —— 刷题够用，但当「标准答案依据」前必须核对原书。
- 政治的 1222 题（徐涛/袁·杰网页题库）**答案是来源题库推算生成的**（来源自己标了 `answerInferred=true`）。界面对这类卷显示「答案多为推算」，每道题带「答案非原文」徽标。
- 408 的来源是教材 OCR，存在系统性噪声（`力`↔`为`、题号页码混入题干、图题选项被吞），18 道题的答案串不规范已加 `answerNote`，69 道选项数不足 4 的题直接丢弃。
- **没找到**：肖秀荣 1000 题、更早年份的肖四肖八、英语一模拟卷、腿姐/米鹏等；已试过的 30+ 个来源（含 Gitee、百度文库、道客巴巴、知乎、B 站专栏、GitHub 各种关键词）逐条结论见 `tools/mock-findings.md`。
- `year` 口径照抄来源书名（肖八 = 2026 届、肖四 = 2025 届），即分别面向 2025 年 12 月与 2024 年 12 月的考试。**政治时政题有时效性**，作练习时注意这一点。


## 功能

### 学习
| 模块 | 说明 |
|---|---|
| 学习区首页 | 考研倒计时、今日/累计统计、每日作答热力图、待办提醒、四科进度、待加强知识点、最近练习 |
| 题库 | 四科切换 · 完整/严选/真题过滤 · 按年份/按章节两种视图 · 试卷速览（点任一题直接跳到该题） |
| 模拟卷 | 独立模块，按系列/出版方分组，质量默认标记「未校验」 |
| 智能组卷 | 科目 × 章节 × 题型 × 题量自由配比，6 个快捷模板，薄弱章节一键组卷，随机种子可复现 |
| 掌握地图 | 各科掌握度分布、分组正确率雷达、最需补强章节排行、章节明细表 |
| 知识图谱 | 科目 → 章节分组 → 知识点三层力导向图，节点大小 = 题量、颜色 = 掌握度，点击直接开练 |

### 刷题
| 模块 | 说明 |
|---|---|
| 练习模式 | 逐年/逐章/随机/智能组卷，作答后可选立即显示答案 |
| 模考模式 | 计时、答题卡、交卷自动评分、分题型表现、错题清单 |
| 作答布局 | **单题**（一屏一题）与**连续**（长列表 + 作答自滚）两种 |
| 键盘盲操 | `A`–`D` / `1`–`4` 选项 · `←` `→` 切题 · `Enter` 下一题 · `F` 标记 · `R` 看答案 |
| 超时提醒 | 单题耗时超过 2.5 分钟（主观题 6 分钟）时在运行条提示 |
| 错题复测 | 错题自动收录，按科目/章节聚合，错题章节排行 + 攻坚建议，逐题展开复测 |
| 收藏本 / 题目笔记 | 搜索、筛选、展开原题，导出 Markdown |
| 学习记录 | 统计卡、热力图、作答趋势双轴图、练习明细表、导出 CSV、清空数据 |
| 题目搜索 | 顶栏 `Ctrl/⌘ + K` 全库检索题干/选项/答案 |

### 界面
- Tailwind CSS v4 + Radix UI + lucide-react + Framer Motion + ECharts
- 左侧固定侧栏（导航 + 各科进度），顶栏面包屑与全局搜索，移动端抽屉 + 底部 Tab 栏
- 设计 token 与参考站同一语言：画布 `#f5f7fa`、墨色 `#172033`、品牌蓝 `#356fe5`、深蓝 hero `#244fa8`，14px 基准字号 + 衬线体标题

## 题库数据

题目是静态 JSON，放在 `public/data/` 下，按科目分目录，前端按需懒加载。

```
public/data/
  index.json            # 全局清单：科目、试卷、题量、知识点、模拟卷分组
  math1/<year>.json
  english1/<year>.json
  politics/<year>.json
  cs408/<year>.json
  mock/_manifest.json + mock/<id>.json    # 模拟卷
  <subject>/images/     # 题干配图
```

数据规范见 [`tools/SCHEMA.md`](tools/SCHEMA.md)。

### 数据来源

| 科目 | 来源 |
|---|---|
| 数学一 | [TsekaLuk/Kaoyan-Math1-Papers](https://github.com/TsekaLuk/Kaoyan-Math1-Papers)（CC BY-NC-SA 4.0）：真题 Markdown + 逐题解析 |
| 英语一 | 上游 `solutions/英语一/`（2017–2023）+ 本地 `KaoYan-English-master` 历年真题与解析 PDF（2010–2016）+ [Fantasia1999/kaoyanzhenti](https://github.com/Fantasia1999/kaoyanzhenti) 与懒笔记（2024–2025）；详见 `tools/english-findings.md` |
| 政治 | [yy11111111111111111111/kaoyan-politics](https://github.com/yy11111111111111111111/kaoyan-politics) 为主源，与 [mrwoov/kyzz](https://github.com/mrwoov/kyzz)、学信网官方答案交叉校验；详见 `tools/politics-findings.md` |
| 408 | [neville-studio/408-exam-paper](https://github.com/neville-studio/408-exam-paper) 的 `papers-rebuild/`（题干）+ 本地 `408真题/` 两套 PDF 双源互证答案；详见 `tools/cs408-findings.md` |
| 模拟卷 | 见 `tools/mock-findings.md`：政治 [Kaoyan_Politics2027](https://github.com/SatoriSatori555/Kaoyan_Politics2027)、数学 [zhangyu-1000t](https://github.com/jlshdsdk/zhangyu-1000t)、408 [408-quiz](https://github.com/zsc5725216-hub/408-quiz) |

每份卷子的 JSON 都带 `source` 字段（名称 + URL），前端在解析区展示。

### 数据质量

- 卷级 `quality`：`high` / `medium` / `low` / `unverified`（模拟卷默认），前端打标签提示。
- **答案存疑**：跨来源答案有分歧的题带 `answerDisputed: true` + `answerNote`，前端显示「答案存疑」徽标并给出分歧说明。答案不会被删除，但请以官方答案为准。
- **选项残缺**：原始素材里选项被 OCR 吞掉的题带 `optionIssue`，前端提示并当作主观题处理，不参与自动评分、不计入正确率。
- **没有编造**：抓不到答案就留空并降级 `quality`；OCR 损坏严重的年份（数学 2022）整体剔除。数学 1994 源文件缺失、英语 2024 上游素材实为 2022 内容，均如实记录。
- **政治 2025 的题干是「公开真题整理版」而非逐字原卷**：与第 4 个独立来源（西安外事学院公开的 16 页原卷 PDF）比对，33 道选择题中 29 道有 ≥3 个选项能在原卷同位置对上、28 道「答案所选选项」同位置一致；差异集中在措辞级，但 Q12 的干扰项与原卷不同。卷内 `verification.contentNote` 已逐项披露，`tools/parse-xaiu-2025.mjs` 保留了后续换成逐字原卷的能力。
- **政治 2025 的材料分析题第 35 题只有单一来源**（标 `verify=single-source:wsyu`）。
- **政治 2026 未产出**：只能拿到 16 道单选或广告占位页，拿不到 38 题可核实文字；主源 `yy…` 的 2026 已证实是重写内容，不用。
- **模拟卷质量**：政治模拟题答案是来源题库推算（`answerInferred`），408 是教材 OCR，详见上方「模拟卷」一节。

### 已知的上游数据缺陷（不返工，只记录）

- 英语 2023 卷答案覆盖仅 19%（上游源只有 Part B/C 答案），完型/阅读留空未推断。
- 英语 2017/2018/2021/2022 缺写作范文、2019 缺第 48 题译文、2021 翻译节 0 题。
- 408 含图题目（二叉树/页表/时序图）在文本抽取中会丢图，题干会写「如下图」，需对照原卷 PDF。
- 政治细粒度考点标签（`q.topics`）依赖 `tools/cache/politics-baseline/` 快照恢复，**全量重建后必须跑 `restore-granular-topics.mjs`**（已挂进 `data:politics`）。

### 重新生成题库

```bash
pnpm data:build     # 抓取原始素材 → 解析 → 生成 index.json
pnpm data:index     # 只重建 index.json
pnpm verify         # 全库结构校验
```

| 科目 | 脚本 |
|---|---|
| 数学一 | `fetch-tree.mjs` → `fetch-math.mjs` → `parse-math.mjs` → `fetch-math-images.mjs` |
| 英语一 | `fetch-english.mjs` → `parse-english.mjs` |
| 政治 | `politics-parse.mjs` → `build-politics.mjs` → `tag-chapters.mjs` → `build-topics-json.mjs` → `add-answer-note.mjs` |
| 408 | `fetch-rebuild.mjs` → `extract-rebuild.mjs` / `extract-qa.mjs` → `build-cs408.mjs` → **`attach-cs408-images.mjs`**（抽图+挂图）→ `xcheck.mjs` |
| 模拟卷 | `fetch-mock.mjs`（GitHub 来源）+ `fetch-mock-xiao.mjs`（N诺考研来源）→ `build-mock.mjs` / `build-mock-xiao.mjs` |
| 汇总 | `build-index.mjs` 生成 `index.json`；`validate-all.mjs` 全库校验；`validate-mock.mjs` 模拟卷校验 |

原始素材缓存在 `tools/cache/`（已 gitignore），可安全删除后重新抓取。

### 408 配图

408 真题的「二叉树/页表/Cache 结构图/时序图」原本只有文字「如下图」。`tools/attach-cs408-images.mjs` 从 `tools/cache/rebuild/<year>.pdf` 里把嵌入图抽出来（共 121 张），按**题号在页面上的 y 区间**定位到对应题目，写回每题的 `images` 字段。

```bash
node tools/attach-cs408-images.mjs          # 抽图 + 挂图 + 出报告
node tools/attach-cs408-images.mjs --dry    # 只扫描定位，不写盘
```

抽出来的图是原始光栅图，合计约 30 MB。仓库里提交的版本已经过压缩：

```bash
python tools/optimize-images.py --dry-run   # 看能省多少
python tools/optimize-images.py             # 就地压缩（文件名不变，无需改 JSON）
```

这个 Python 脚本**不在 npm 流水线里**（Node 侧没有纯 JS 的 PNG 量化实现），只有重新抽图后才需要跑一次。

它的质量门槛是**墨迹掩膜 IoU**（把图二值化后比对线条/文字的像素交并比），默认要求 ≥ 0.99，在满足门槛的候选里挑体积最小的：

| 方案 | 体积 | 墨迹 IoU |
|---|---|---|
| 原图 | 29.4 MB | — |
| 只做 PNG 重编码 | ~29 MB | 1.00 |
| **自适应调色板（当前提交版本）** | **10.4 MB（省 65%）** | **≥ 0.99** |
| 固定 256 色（早期版本） | 14.2 MB | ≥ 0.99 |
| 更激进的调色板 | 7.0 MB | 中位数仅 0.96 ❌ 未采用 |

> 为什么不用 PSNR 当门槛：这类图的像素误差几乎全在扫描底噪（近白噪点）上，PSNR 会低得吓人（中位数 38.6 dB）但肉眼完全看不出；真正该守住的是线条和文字，所以用墨迹 IoU。

仍未收录配图的题会在界面上显示「本题题干提到图，题库未收录配图，请对照原卷 PDF 查看」。

## 自动化测试

```bash
pnpm verify      # 全库数据校验：JSON 结构、id 唯一、选项与答案一致性、多选题答案升序等
pnpm test:e2e    # 端到端交互测试（无头 Edge + CDP 真实点击）
```

`pnpm verify` 当前 **0 ERROR**。`pnpm test:e2e` 需要先跑起 `pnpm serve`，覆盖 15 组场景 **30/30 通过**：
首页倒计时/热力图/侧栏 → 题库与章节视图 → 练习答错→解析→错题写入 → 键盘盲操 → 收藏与笔记 →
连续布局 → 错题复测 → 掌握地图图表 → 知识图谱 → 智能组卷模板与生成 → 模考计时/答题卡/不立即显示答案/交卷 →
学习记录 → 收藏本 → 笔记页 → 全局搜索 → 移动端布局 → 全程无 JS 运行时异常。

## 技术栈

Vite 5 · React 18 · React Router（HashRouter） · Tailwind CSS v4 · Radix UI · lucide-react ·
Framer Motion · ECharts · KaTeX。无后端、无数据库，学习数据存 `localStorage`（键名 `kq:state:v1`）。

## 目录结构

```
kaoyan-quiz/
  启动刷题.cmd
  src/
    index.css                 设计系统（Tailwind @theme token）
    App.jsx  main.jsx
    components/
      ui.jsx                  基础组件（Button/Card/Badge/Progress/Tabs/Modal/…）
      Charts.jsx              ECharts 封装 + 热力图/趋势/雷达/图谱
      QuestionView.jsx        题目渲染（练习/模考/错题本/收藏本共用）
      RichText.jsx            Markdown + KaTeX 渲染
      layout/AppShell.jsx     侧栏 + 顶栏 + 移动导航 + 全局搜索
    lib/
      data.js                 数据加载、组卷、模拟卷
      store.js                localStorage 状态与统计
      question.js             题目判定纯函数
      locate.js  utils.js
    pages/                    Dashboard Library Mock Practice SmartCompose
                              WrongRetest MasteryMap KnowledgeGraph
                              Favorites Notes Records
  tools/                      数据管线 + 静态服务器 + 校验 + 端到端测试
  public/data/                题库 JSON
```

## 已知限制

- 填空、解答、翻译、写作等主观题不支持自动评分，采用「查看参考答案 + 自评」，不计入正确率。
- 模拟卷来自公开渠道、尚未逐题校验，请以正式出版物为准。
- 含图题目（408 的二叉树/页表等）在文本抽取中会丢失图形，题干会写「如下图」，需对照原卷 PDF。
- 学习数据支持「备份全部数据（JSON）」与「导入数据」，导入时按较大值合并，不会覆盖已有练习量。
- 学习数据只存在本机浏览器，清空浏览器数据会丢失。

## 版权说明

题库内容均来自互联网公开渠道，版权归原出版/命题单位所有。本项目仅用于个人学习交流，请勿用于商业用途。
