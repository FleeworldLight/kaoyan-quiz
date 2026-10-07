# 模拟卷抓取记录（tools/mock-findings.md）

> ⚠️ **先看第十节**：第三轮已从 **N诺考研（noobdream.com）** 拿到用户点名要的
> **肖八（2026 冲刺 8 套卷，8/8 套）** 与 **肖四（2025 终极预测 4 套卷，4/4 套）**，
> 以及张宇 8 套卷、李林 6 套卷等数学整卷模拟卷，共 **7 系列 / 35 套 / 948 题**。
> 下面第一～九节是上一轮（GitHub 题库型来源）的记录，结论仍然成立，保留备查。

任务：为 `kaoyan-quiz` 抓取考研模拟卷，先堆进 `public/data/mock/`，**留好出处、如实标注质量未知**，
质量评估留到下一步。抓取脚本：`tools/fetch-mock.mjs`（下载）+ `tools/build-mock.mjs`（解析入库），
校验脚本：`tools/validate-mock.mjs`。

> 结论一句话：**没有找到可直接抓取的「肖四/肖八/腿姐/张宇八套卷」整卷原文**（这些几乎全是 PDF 扫描件或
> 付费/网盘资源，公开可编程抓取的极少）。最终产出的是 **3 个可用来源、9 个分组、22 套、5129 题**
> 的「题库型」模拟素材，全部 `quality: "unverified"`，每卷带 `source.url`，并区分 `paperKind`
> （`testPaper` 整卷 / `questionBank` 题库 / `chapterDrill` 章节练习）。

---

## 一、试过的每一个来源与结论

### A. 成功抓取并解析入库（3 个来源）

| # | 来源 | URL | 内容 | 结论 |
|---|---|---|---|---|
| A1 | SatoriSatori555/Kaoyan_Politics2027 | https://github.com/SatoriSatori555/Kaoyan_Politics2027 | 单页 HTML（4.0MB）内嵌 6 段 `<script type="application/json" id="__data__sN">`，共 **1224 题**（单选 573 / 多选 651），每题含 `options` / `answer` / `answerInferred` / 选项级解析 | ✅ **可用**。但 `source` 字段全部为「未知」、`answerInferred: true` —— 答案与解析均为来源仓库自动生成，**不是**原文答案。已在卷内 `sourceNote` 与题目解析前缀中如实标注。另有题干末尾丢问号（"……马克思主义从狭义上说是" 无"？"）等来源侧缺陷，未修 |
| A2 | jlshdsdk/zhangyu-1000t | https://github.com/jlshdsdk/zhangyu-1000t | 静态刷题站，71 章 + 书末 4 套测试卷，共 1307 题。题目/选项/`【解析】`/`最终答案` 全在 HTML 里，LaTeX 完整 | ✅ **可用且质量最好**。唯一可用「整卷型」来源：4 套测试卷各 22 题。测试卷里选择题 10 题 = 5 单选 + 5 填空，解答题 12 题 |
| A3 | zsc5725216-hub/408-quiz | https://github.com/zsc5725216-hub/408-quiz | 4 个 JSON（数据结构/计组/操作系统/计网），按王道教材小节组织，选择题 + 综合应用题，带答案与解析 | ⚠️ **可用但 OCR 质量参差**。题干有 OCR 错字（`力`↔`为`、`×`↔`x`、题号/页码混进题干）；部分题目的选项被 OCR 吃掉（图题只剩 0–3 个选项）；个别答案串是重复字符（如 `"BBD"`）。处理方式见下 |

### B. 试过但**不可用/未采用**（22 个）

| # | 来源 | URL | 结论 |
|---|---|---|---|
| B1 | mrwoov/kyzz | https://github.com/mrwoov/kyzz | 抓到了 9 个年份 JSON（2016–2024，各 33 题）。但 README 写明「20XX年考研政治**真题**」—— 是真题不是模拟卷，且真题已由项目 `public/data/politics/<year>.json` 收录，**不重复入库** |
| B2 | book118 肖四肖八解析 | https://max.book118.com/html/2026/0908/8010073015010125.shtm 、 https://max.book118.com/html/2026/0512/5341303223013212.shtm | 付费文档站，只有几页预览，拿不到完整题干/选项 |
| B3 | kyzyk 「2019考研政治肖秀荣4套卷选择题解析」PDF | https://www.kyzyk.com/upload/201812/13/201812131052066528.pdf | 连接超时（`UND_ERR_CONNECT_TIMEOUT`），站点不可达 |
| B4 | 知乎「模拟题：徐涛八套卷08」 | https://zhuanlan.zhihu.com/p/95912123 | HTTP 403（反爬），拿不到正文 |
| B5 | hlsky.com 「2024肖四完整版」 | https://hlsky.com/news/2111.html | TLS 证书链错误（`UNABLE_TO_GET_ISSUER_CERT_LOCALLY`） |
| B6 | ankichinas 腿姐四套卷（选择题 / 全内容） | https://file.ankichinas.cn/card/6195306e1a491Gqz 、 https://file.ankichinas.cn/card/61955e1a33752Ygf | 页面只有卡组元信息，卡牌内容由前端 XHR 拉取，SSR 载荷（`window.__NUXT__`）里没有题干，未找到公开 API |
| B7 | 新东方在线 考研政治模拟题列表 | https://kaoyan.koolearn.com/zhengzhi/moniti/51.html | 是跳转列表页，正文需登录/分页，未取到题目 |
| B8 | pan.kaoyany.top 网盘目录 | https://pan.kaoyany.top/ | 网盘索引，需授权，无法直接下载 |
| B9 | 微信公众平台「肖秀荣四套卷选择题 完整版考点整理」 | http://mp.weixin.qq.com/s?... | 搜狗跳转链接带时效签名，过期后 404，且正文需在微信内打开 |
| B10 | 用户本地目录全盘扫描 | 本机资料目录（`_recon` / `Math1真题库` / `cs-408` / `KaoYan-English-master` / `Awesome-408` 等）与下载目录 | **本地没有任何模拟卷文件**（关键词：模拟/预测/押题/八套/四套/六套/肖四/肖八/腿姐/徐涛/张宇/李林/王道/冲刺，全部 0 命中） |
| B11 | GitHub 仓库搜索：`肖秀荣` / `肖四` | https://api.github.com/search/repositories?q=肖秀荣 | 命中 22 个仓库但与肖四原文无关（书籍清单、无关同名项目） |
| B12 | GitHub 仓库搜索：`考研 模拟卷` / `考研 预测卷` / `考研 押题` | 同上 | **total_count = 0**，GitHub 上没有以这些词命名的模拟卷仓库 |
| B13 | GitHub 仓库搜索：`张宇` / `李林` / `汤家凤` / `考研数学 模拟卷` | 同上 | 只有 `jlshdsdk/zhangyu-1000t`（已采用 A2）、`sikouhjw/zhangyu1000`（TeX 重排，未含答案导出）、`4thirteen2one/kaoyanMATH`（18 讲笔记）。**李林六套卷/四套卷、汤家凤、合工大超越/共创：0 命中** |
| B14 | GitHub 仓库搜索：`408 王道` / `王道 408 模拟` | 同上 | 只有 A3 一家题库；其余全是「笔记/课后代码/思维导图」 |
| B15 | GitHub 仓库搜索：`考研 题库 json` / `kaoyan question bank` | 同上 | 命中 `Albertdeng23/GEEQuestionBank`（VLM 题库系统，无数据）、`LIziak112/structured-kaoyan-english`（英语真题，非模拟）、`Leesence1/psychology-quiz-app`（心理学 347，非本任务科目） |
| B16 | GitHub 代码搜索 `肖四` | https://api.github.com/search/code | HTTP 403 —— **未认证的代码搜索不可用**（API 要求 token） |
| B17 | Fantasia1999/kaoyanzhenti | https://github.com/Fantasia1999/kaoyanzhenti | 只有英语真题 PDF（1998–2026），**无模拟卷、无其他科目** |
| B18 | 4nthon/liti | https://github.com/4nthon/liti | 开源版只内置「马原基础概念」演示题库（远小于 1224 题，且质量更低），正式题库需自行导入，**不重复采用** |
| B19 | Bopang459/11408 | https://github.com/Bopang459/11408 | 只有 1 份《25考研408操作系统冲刺背诵手册.pdf》，是背诵手册不是模拟卷 |
| B20 | tutu-wow/PracticeQuestions | https://github.com/tutu-wow/PracticeQuestions | 仓库只有 README（题库在小程序后端），无数据 |
| B21 | xk271521-droid/kaoyan-miniapp / wanzhulehuanghun/yantu-open | 同名 GitHub 仓库 | 只有小程序/应用源码，题库需运行时拉取 |
| B22 | 搜索引擎（cn.bing / 百度 / 360 / 搜狗） | — | 仅 Bing/百度/360/搜狗可达；但「肖秀荣四套卷 选择题」在 Bing 上被整词切分（只返回「肖」字字典页），360 返回 0 条，搜狗只剩 2 条过期微信链接。**搜索引擎未能作为稳定的模拟卷来源** |

### C. 环境限制（影响抓取策略）

- `api.github.com` 未认证限流 60 req/h，**频繁 403**；改用 `cdn.jsdelivr.net/gh/<repo>@<branch>/<path>` 作为主通道，`raw.githubusercontent.com` 作回退（jsDelivr 稳定且快，raw 偶发 `ECONNRESET`/超时，需 4 次重试）。
- `codeload.github.com`（整包 ZIP）**连接超时**，无法整包下载，只能逐文件抓。
- `Invoke-WebRequest` 出不了网；Node `fetch` 可用（本仓库脚本全部用 Node `fetch`）。
- GitHub 仓库 API 拿目录树也要消耗限流额度，后来改用 GitHub HTML 页面解析。

---

## 二、成功产出的分组清单

`public/data/mock/_manifest.json` 共 **9 个 group / 22 套卷 / 5129 题 / 有答案 4672 题（91.1%）**。

| 科目 | 出版方（来源） | 卷名 | 套数 | 题量 | 答案覆盖率 | paperKind |
|---|---|---|---|---|---|---|
| politics | 徐涛 / 袁·杰（来源题库） | 2027 考研政治选择题题库 · 马原（单选/多选） | 2 | 139 + 157 | 100% | questionBank |
| politics | 同上 | · 毛中特（单选/多选） | 2 | 64 + 57 | 100% | questionBank |
| politics | 同上 | · 习思想（单选/多选） | 2 | 100 + 146 | 100% | questionBank |
| politics | 同上 | · 史纲（单选/多选） | 2 | 122 + 114 | 100% | questionBank |
| politics | 同上 | · 思修法基（单选/多选） | 2 | 78 + 96 | 100% | questionBank |
| politics | 同上 | · 综合训练（单选/多选） | 2 | 70 + 79 | 100% | questionBank |
| math1 | 张宇（1000 题转录版） | 2026 张宇考研数学1000题 · 测试卷一/二/三/四 | 4 | 各 22 | 各 16/22（解答题无独立答案字段） | **testPaper** |
| math1 | 同上 | · 基础篇章节练习（31 章合集） | 1 | 536 | 392/536 | chapterDrill |
| math1 | 同上 | · 强化篇章节练习（36 章合集） | 1 | 683 | 394/683 | chapterDrill |
| cs408 | 王道（2027 教材 OCR 题库） | 数据结构 / 计算机组成原理 / 操作系统 / 计算机网络 | 4 | 691 / 595 / 725 / 589 | 100%（含综合应用题；部分 `answerNote`） | questionBank |
| — | — | **合计** | **22** | **5129** | **4672 (91.1%)** | — |

按科目分布：

| 科目 | 卷数 | 题量 | 其中选择题 | 有答案 |
|---|---|---|---|---|
| politics | 12 | 1222 | 1222 | 1222 |
| math1 | 6 | 1307 | 473 | 850 |
| cs408 | 4 | 2600 | 2168 | 2600 |
| **合计** | **22** | **5129** | **3863** | **4672** |

> 注：**英语一产出为 0**。英语模拟卷同样只有 PDF 扫描件/付费资源，本轮未拿到。

---

## 三、失败清单与原因（逐条）

### 3.1 抓取阶段未拿到（下载失败，已记入 `_manifest.json` 的 `failed` 数组）

| 文件 | HTTP | 原因 |
|---|---|---|
| `jlshdsdk/zhangyu-1000t :: chapters/chapter-72.html` | 404 | 来源站点侧栏声明 73 章，实际只有 71 个 `chapter-*.html`；72/73 不存在（不影响任何题目，1307 题已全覆盖） |
| `jlshdsdk/zhangyu-1000t :: chapters/chapter-73.html` | 404 | 同上 |

### 3.2 解析阶段丢弃（已记入 `_manifest.json` 的 `droppedSummary`）

共丢弃 **69 题**，全部按「宁可少产出，不塞乱码」处理：

| 原因 | 数量 | 说明 |
|---|---|---|
| 选项数 3 ≠ 4 | 38 | 王道 408 OCR：图题/表格题的选项被 OCR 吃掉一整个 |
| 选项数 2 ≠ 4 | 14 | 同上 |
| 选项数 0 ≠ 4 | 9 | 题干里混进了 ASCII 图（`⑥◎ b：`），选项整体丢失 |
| 选项数 1 ≠ 4 | 6 | 同上 |
| 答案与题型不匹配 | 2 | 政治题库里 2 道标「多选」但来源只给 1 个答案字母，**不猜**，直接丢弃 |

另有 **9 道数学题被误判为乱码**（如 `$(2a^3+ab^2+b^3)(a^2b-ab^2)=$ ______.`），已在第二轮修复
`looksGarbled` 判定（把 LaTeX/符号计入有效内容）后**全部救回**，现 69 条丢弃里不再含数学题。

### 3.3 扫描件 / 乱码 / 只有题目没答案

- **扫描件**：肖四、肖八、腿姐四套卷、徐涛八套卷、张宇八套卷、李林六套卷等，公开渠道只有 PDF 扫描件；
  项目内 `pdfjs-dist` 无 OCR 能力，扫描件抽不出文字（`tools/test-pdf.mjs` 的用法只对文字版 PDF 有效）。
  本轮**没有**把任何扫描件入错库——因为连下载都拿不到（见 B2–B9）。
- **乱码**：未遇到「抽出 `-, ?I?m?mi` 这种」的 PDF（因为没抓到 PDF）；但王道 408 有 OCR 错字级噪声，
  已在卷 `sourceNote` 与题目 `answerNote` 中说明，并丢弃严重损坏者。
- **只有题目没答案**：本轮**没有**这种情况——三个来源都带答案。政治题库的答案由来源生成
  （`answerInferred: true`），性质上等同于「机器答案」，已如实标注，未升级 `quality`。
- **多字母/重复字母答案串**（王道 408）：如来源 `"BBD"`、`"CACA"`，按去重升序规范为 `"BD"`、`"CA"`，
  并在该题写入 `answerNote` 说明来源原串；若规范化后仍多于 1 个字母，该题按 `multiple` 入库并标注。
  这类题共 33 道（4 卷合计）。

---

## 四、抽查 5 道题（原文照抄，供核对）

### 4.1 政治 · 马原单选 q1

- **id**：`mock-politics-2027-marx-single-q1`　**来源**：https://github.com/SatoriSatori555/Kaoyan_Politics2027
- **题干**：有人说，世界上有两种东西最锋利，一种是剑，另一种是思想，而思想比剑更锋利。思想就是力量。“思想的闪电一旦彻底击中这块朴素的人民园地”，就会以雷霆万钧之势光耀时代的星空，迸发出建设新世界的强大物质力量。“在人类思想史上，就科学性、真理性、影响力、传播面而言，没有一种思想理论能达到马克思主义的高度，也没有一种学说能像马克思主义那样对世界产生了如此巨大的影响。”马克思主义从狭义上说是
- **选项**：A. 关于无产阶级斗争的性质、目的和解放的学说　B. 无产阶级争取自身解放和整个人类解放的学说体系　C. 马克思和恩格斯创立的基本理论、基本观点和基本方法构成的科学体系　D. 关于资本主义转化为社会主义以及社会主义和共产主义发展的普遍规律的学说
- **答案**：`C`（来源 `answerInferred: true`，非官方答案）
- **解析**（来源自动生成，已标注）：【A】……陷阱类型：以偏概全。识别口诀："看到只讲一个部分却当整体定义，立刻警惕是不是'拿局部当全部'。"

### 4.2 政治 · 史纲多选 q1

- **id**：`mock-politics-2027-shigang-multi-q1`　**来源**：同上
- **题干**：鸦片战争以清政府的失败而告终，并签订了一系列不平等条约，破坏了
- **选项**：A. 中国的主权和领土完整　B. 中国的领海主权　C. 中国的司法主权　D. 中国的关税主权
- **答案**：`ABCD`

### 4.3 数学一 · 张宇 1000 题 测试卷一 q1

- **id**：`mock-math1-zhangyu1000-2026-test1-q1`　**来源**：https://github.com/jlshdsdk/zhangyu-1000t
- **题干**：设函数 $f(x)$ 满足 $\lim_{x \to 0}\frac{x-f(x)}{\sin x}=1$，则（　）.
- **选项**：A. $f(0)=0$　B. $f'(0)=0$　C. $\lim_{x \to 0}\frac{f(x)}{x^2}=1$　D. $\lim_{x \to 0}\frac{f(x)}{x}=0$
- **答案**：`D`（来自来源的「最终答案」行）
- **解析**：由题设，有 $\lim_{x \to 0}\frac{x}{\sin x}-\lim_{x \to 0}\frac{f(x)}{\sin x}=1$，故 $\lim_{x \to 0}\frac{f(x)}{\sin x}=0$，$\lim_{x \to 0}\frac{f(x)}{x}=0$．题设条件未定义 $f(0)$，故 (A), (B) 错误．对于 (C) 选项，取 $f(x)=x^4$…

### 4.4 408 · 数据结构 q1

- **id**：`mock-cs408-wangdao-2027-ds-q1`　**来源**：https://github.com/zsc5725216-hub/408-quiz
- **题干**：一个完整的数据结构通常应包含以下哪些要素（）　*（小节 1.1 数据结构的基本概念，来源题号 1）*
- **选项**：A. 数据元素及其存储方式　B. 数据的逻辑结构和物理结构　C. 数据的逻辑结构、存储结构以及在其上定义的基本操作　D. 数据对象和数据元素之间的关系
- **答案**：`C`
- **解析**：一个完整的数据结构由三部分组成：逻辑结构（如线性、树形等）、存储结构（物理表示）以及在其上定义的基本操作（如插入、删除等）。只有选项C同时包含这三个核心要素。

### 4.5 408 · 操作系统 q1

- **id**：`mock-cs408-wangdao-2027-os-q1`　**来源**：同上（`data/操作系统.json`）
- **题干**：操作系统是对（）进行管理的软件。　*（小节 1.1 操作系统的基本概念，来源题号 1）*
- **选项**：A. 软件　B. 硬件　C. 计算机资源　D. 应用程序
- **答案**：`C`
- **解析**：操作系统管理计算机的硬件和软件资源，这些资源统称为计算机资源。注意，操作系统不仅管理处理机、存储器等硬件资源，还管理文件，文件不属于硬件资源，但属于计算机资源。

### 4.6 附：带 `answerNote` 的 OCR 存疑样例（供理解风险）

- **id**：`mock-cs408-wangdao-2027-ds-q348`
- **题干**：从邻接矩阵 A= 1 0 1 可以看出，该图共有（①）个顶点；若是有向图，则该图共有（②）条 0 1 0 弧；若是无向图，则共有（⑧）条边。 E.以上答案均不正确 c.3 E.以上答案均不正确 E.以上答案均不正确
- **选项**：A. 9　B. 3　C. 6　D. 1（**来源选项被 OCR 破坏**：题干里混入了 `E.`、`c.` 等错位选项文本）
- **answer**：`BD`　**answerNote**：来源答案串为 `"BBD"`，已按去重升序规范为 `"BD"`（疑似 OCR 重复字符）
- **结论**：**这道题就是「模拟卷质量不行」的典型样本**——已入库但标了 `answerNote`，做质量评估时优先处理这类。

---

## 五、校验脚本

`tools/validate-mock.mjs`：校验 JSON 可解析 / 必填字段 / `kind === "mock"` / `quality` 取值 /
每套有 `source.name + source.url` / 题目 id 全库唯一（并与 `public/data/{math1,english1,politics,cs408}` 真题 id 比对）/
题目 id 前缀 `mock-` / `single` 恰好 4 选项且答案为单字母 / `multiple` ≥2 选项且答案升序去重 /
`blank`·`essay` 选项必须为空 / `_manifest.json` 的 `paper.file` 路径与 `questionCount`·`choiceCount` 一致性 /
图片引用存在性。

实际输出（`node tools/validate-mock.mjs`）：

```
========== validate-mock 报告 ==========
目录: public/data/mock/    卷数: 22    题目总数: 5129    有答案: 4672 (91.1%)
  cs408     卷  4   题 2600   选择 2168   有答案 2600
  math1     卷  6   题 1307   选择  473   有答案  850
  politics  卷 12   题 1222   选择 1222   有答案 1222
唯一题目 id: 5129（与真题库 id 冲突 0）

--- 错误 0 条 ---

✅ 校验通过
```

---

## 六、复现方式

```bash
node tools/fetch-mock.mjs          # 下载原始素材到 tools/cache/mock/（已缓存则跳过）
node tools/build-mock.mjs          # 解析入库 → public/data/mock/*.json + _manifest.json
node tools/validate-mock.mjs       # 校验（--verbose 看全部警告/错误）
```

中间产物与完整报告：
- `tools/cache/mock/fetch-report.json` —— 每个文件的下载结果
- `tools/cache/mock/build-report.json` —— 每套卷题量/答案率 + 全部 69 条丢弃明细 + 全部警告
- `public/data/mock/_manifest.json` —— 分组清单 + `failed` + `droppedSummary`

（`tools/cache/` 已在 `.gitignore` 中，不会被提交。）

---

## 七、给「质量评估」阶段的建议

1. **优先排查 `answerNote` 非空的题**：33 道（王道 408），来源答案串是重复字符，最可能答案错误。
2. **政治 1224 题全部是 `answerInferred: true`**：这批答案由来源仓库生成，**没有任何官方或原文对照**。
   建议用另一来源（如正式出版物、或与真题库交叉抽查）估算准确率后再决定是否展示。
3. **王道 408 的 OCR 噪声是系统性的**（`力`↔`为`、`×`↔`x`、题号/页码混入题干），
   建议对带图题目单独过一遍（可从来源仓库 `data/img/...` 恢复图，但 431 张，成本较高）。
4. **缺口最大的科目是英语一（0 套）**；数学一也没有「整卷模拟卷」（只有张宇 1000 题的 4 套测试卷）。
   若要补齐，公开渠道基本只有扫描件 PDF，需要引入 OCR（本机 `~/.EasyOCR` 已存在）。

---

## 八、与仓库既有流程的兼容性（已验证）

`tools/build-index.mjs` 与 `tools/validate-all.mjs` 里都**已经预留了 mock 分支**（读 `public/data/mock/_manifest.json`
→ 并入 `index.json` 的 `mockGroups` / 各科 `subjects[].mocks`）。按它们读取的字段（`p.file` 相对于
`public/data/`、`doc.kind === "mock"`、`doc.source`、`doc.subject`、可选 `q.optionIssue`）逐一核对，
本区数据完全兼容：

```
node tools/validate-all.mjs
=== 结果 ===
总题量: 8003            # 真题 2874 + 模拟卷 5129
ERROR: 0 条
WARNING: 60 条          # 全部来自既有真题数据，模拟卷 0 条
结果: ✅ 通过
```

> 注：本次只读取、**没有重跑 `build-index.mjs`**（`public/data/index.json` 的 SHA256 前后一致，
> 未被我改动）。内置前端 bundle（`dist/assets/index-*.js`，构建于本次会话期间）已含
> `mockGroups` / `mockFailed` / `mockNote` 处理逻辑，父代理重建 `index.json` 后模拟卷即可在 GUI 中显示。

## 九、追加搜索（第二轮，结论未变）

| # | 来源 | URL | 结论 |
|---|---|---|---|
| B23 | RUTI-SOFTWARE-LIMITED/npee-exams | https://github.com/RUTI-SOFTWARE-LIMITED/npee-exams | 只有 1 份 2023 英语（一）**真题** + 一个 Web 应用，**无模拟题数据**；README 指向需登录的 ruti.page |
| B24 | Echo1LZJY/echo-kaoyan-english-skill | https://github.com/Echo1LZJY/echo-kaoyan-english-skill | 是 Codex skill 插件（真题精析/批改），**不含题库数据** |
| B25 | GitHub 搜索 `张宇八套卷` / `李林六套卷` / `考研 密押` / `考研英语 模拟` | https://api.github.com/search/repositories | 分别命中 7 / 11 / 0 / 4 个仓库，**全部为无关仓库或 skill 插件**；确认 GitHub 上没有这些模拟卷的题面数据 |

**结论：英语一模拟卷在本轮可达渠道内为 0 套。`public/data/mock/` 里没有英语一文件，这是如实结果，不是遗漏。**

---

## 十、第三轮：**肖四肖八已拿到**（来源 N诺考研 noobdream.com）

> 本轮结论一句话：**用户点名要的肖秀荣《2026 考研政治冲刺 8 套卷》（肖八，8/8 套）与《2025 肖秀荣终极预测 4 套卷》（肖四，4/4 套）已全部入库**，
> 每套 38 题（单选 16 + 多选 17 + 材料分析 5），题干／四选项／正确答案／原书简析齐备，答案覆盖率 99.7%（453/454）。
> 来源是 **N诺考研（noobdream.com）的公开刷题解析页**，是**第三方练习站对原书的网页转录，不是正式出版物原文**。

### 10.1 关键发现：`/Practice/exam_solution/<id>/` 是公开的（无需登录）

上一轮的 25 个来源全部失败，本轮换到**中文考研刷题站**后发现突破口：

| URL | 性质 | 结论 |
|---|---|---|
| `https://noobdream.com/Practice/exam_solution/<id>/` | 「某位用户做过这套卷后的成绩 + 逐题答案解析」页 | ✅ **公开可访问、无需登录**（`/Practice/article/<id>/` 单题页反而要登录，未用）。页面内是 SSR 的纯 HTML，含分节标题、题干、四个选项、`正确答案` 标记，以及折叠区里的**原书简析／参考答案** |
| `https://noobdream.com/Practice/pastexam/` | 「真题 / 模拟试卷」目录页 | ✅ **公开**，服务端渲染，每条 `.exam-item` 带 `data-type`（真题/模考）、`data-tag`（科目）、`data-exam-id`、标题 —— **这是找齐全套卷的正路，不用猜 ID**（解析脚本 `tools/nnd-pastexam.mjs`） |
| `https://noobdream.com/Practice/zhengzhi/`、`/Practice/index/` | 分科题库列表 | ✅ 公开但只有题库（非整卷），未用 |
| `https://noobdream.com/Practice/exam/`、`/Practice/exercise/<examId>/`、`/Practice/exam_history/` | 做题入口 | ⚠️ 需登录 / 需 VIP，未用 |
| `https://noobdream.com/sitemap.xml`、`/Practice/exam_list/`、`/Practice/list/` | — | ❌ 404 |

> ⚠️ **exam_solution 的 ID 与目录页的 `data-exam-id` 是两个不同命名空间，无法直接换算**
> （例：`exam_solution/253/` 是「2027考研智能组卷练习」，而目录页里 `data-exam-id=253` 是「2026 肖秀荣 8 套卷（一）」）。
> 所以「目录页给全集清单 + exam_solution ID 需要另找」这件事必须靠受控扫描解决（见 10.3）。

### 10.2 本轮试过的**新**来源与结论

| # | 来源 | URL | 结论 |
|---|---|---|---|
| N1 | **N诺考研 刷题解析页** | https://noobdream.com/Practice/exam_solution/38659/ 等 | ✅ **成功**。见 10.4 对照表，35 套卷全部入库 |
| N2 | 考研帮搜索 | https://www.kaoyan.com/search/?q=肖四 | ❌ 返回整站首页壳，无题目数据 |
| N3 | 搜狗微信搜索 | https://weixin.sogou.com/weixin?type=2&query=肖秀荣四套卷选择题 | ❌ 与上一轮相同：跳转链接带时效签名，正文需在微信内打开 |
| N4 | CSDN 搜索 API | https://so.csdn.net/api/v3/search?q=肖四选择题 | ❌ 无有效题库型结果（博客正文不逐题抄卷） |
| N5 | 简书搜索 | https://www.jianshu.com/search?q=肖四 | ❌ 无整卷文字版 |
| N6 | 百度文库搜索页 | https://wenku.baidu.com/search?word=肖秀荣四套卷 | ❌ 只有付费预览 |
| N7 | 道客巴巴 / 豆丁 / 人人文库 | doc88.com / docin.com / renrendoc.com 搜索 | ❌ 与上一轮 book118 同类：付费预览，拿不到完整题干 |
| N8 | B 站专栏搜索 API | `api.bilibili.com/x/web-interface/search/type?search_type=article` | ❌ 只返回视频/文章标题，正文不含逐题原文 |
| N9 | 知乎搜索 API | `zhihu.com/api/v4/search_v3` | ❌ 与上一轮一致：403 反爬 |
| N10 | exam8 / 中公考研 / 文都 | exam8.com / kaoyan365.cn / wendu.com | ❌ 首页可达，但模拟卷正文需登录或只有宣传页 |
| N11 | **Gitee（码云）** | `gitee.com/api/v5/search/repositories?q=肖四` | ❌ **API 全部 HTTP 400**（现要求 access_token）；网页搜索 `search.gitee.com` 只返回 849 字节 JS 壳，无 SSR 数据。**Gitee 方向确认是死路** |
| N12 | GitHub 仓库搜索（新关键词） | `肖秀荣`／`肖四`／`肖八`／`徐涛`／`腿姐`／`米鹏`／`考研政治 押题`／`考研政治 模拟题`／`politics mock kaoyan`／`kaoyan zhengzhi`／`肖1000`／`1000题`／`考研政治 题库`／`刷题`／`小程序`／`背诵` | ❌ 与上一轮结论一致：**没有以这些词命名的模拟卷题面仓库**；命中的都是笔记、书籍清单、小程序源码 |
| N13 | 张宇 8 套卷 / 李林 6 套卷 / 李艳芳 3 套卷（经 N1 同站发现） | 同 N1 | ✅ **成功**，见 10.4（意外收获：数学一终于有了真正的整卷模拟卷） |
| N14 | 徐涛 2026 冲刺 3 套卷、2026 李永乐 6 套卷、2025 合工大超越 5+5、2025 李良 5 套卷、2025 余丙森 5 套卷 | 目录页列出（见 10.5） | ⚠️ **未抓到 exam_solution 页**（本轮收尾时未及扫描到；卷名与套数已在目录页里确认存在） |

### 10.3 检索方法与「不再暴力扫 ID」的处理

- **正路**：`/Practice/pastexam/` 目录页一次性给出全部 273 条试卷（146 真题 + 127 模考）的名称、科目、`data-exam-id`。
- **exam_solution ID 的获取**：由于是两个 ID 空间，只能扫。本轮扫描策略与用量如实记录：
  - 第一轮（**已中止**）：`34000–39469`，并发 8，无间隔 —— 父代理指出对站点不友好后**立即停止**。
  - 第二轮（**受控**）：`39470–42000`，**并发 2、每次请求后 sleep 250ms**，`--save-html` 只落盘命中关键词的页面。同样在收尾指令后**停止**。
  - 全部扫描结果（含未命中页）留档于 `tools/cache/mock-xiao/nnd/scan.jsonl`（可断点续跑，已完成 ID 不重复请求）。
  - **教训**：同一套卷常被多人重复上传（不同 examId，页面完整度不同）。因此 `tools/nnd-make-sources.mjs` 为每套卷保留最多 4 个候选 ID，由 `tools/build-mock-xiao.mjs` **逐个实解、取题数与客观题数最高者**（见 10.4「候选 examId」列）。

### 10.4 exam_solution ID → 卷 对照表（本轮实际入库的 35 套）

生成命令：`node tools/nnd-report.mjs`（原始数据 `tools/cache/mock-xiao/build-report.json`）

#### 肖秀荣（用户点名要的）

| 系列 | 套 | 实际用 examId | 候选 examId（多上传） | 题量 | 客观题 | 有答案 | 答案率 | 来源 URL |
|---|---|---|---|---|---|---|---|---|
| 2026 考研政治冲刺 8 套卷 | 一 | 38659 | 38659, 38753, 38882, 38906 | 38 | 33 | 38 | 100% | https://noobdream.com/Practice/exam_solution/38659/ |
| 同上（肖八） | 二 | 38748 | 38748, 39001, 39190, 39220 | 38 | 33 | 37 | 97.4% | https://noobdream.com/Practice/exam_solution/38748/ |
| 同上 | 三 | 38879 | 38879, 39294, 39374, 39384 | 38 | 33 | 38 | 100% | https://noobdream.com/Practice/exam_solution/38879/ |
| 同上 | 四 | 38916 | 38916, 40023, 40081, 40082 | 38 | 33 | 38 | 100% | https://noobdream.com/Practice/exam_solution/38916/ |
| 同上 | 五 | 39173 | 39173, 40083, 40106, 40233 | 38 | 33 | 38 | 100% | https://noobdream.com/Practice/exam_solution/39173/ |
| 同上 | 六 | 39180 | 39180, 40209, 40239, 40341 | 38 | 33 | 38 | 100% | https://noobdream.com/Practice/exam_solution/39180/ |
| 同上 | 七 | 39312 | 39312, 40216, 40343, 40378 | 38 | 33 | 38 | 100% | https://noobdream.com/Practice/exam_solution/39312/ |
| 同上 | 八 | 39613 | 39613, 40535 | 38 | 33 | 38 | 100% | https://noobdream.com/Practice/exam_solution/39613/ |
| 2025 肖秀荣终极预测 4 套卷 | 一 | 36764 | 36764, 36767, 36769, 36770 | 38 | 33 | 38 | 100% | https://noobdream.com/Practice/exam_solution/36764/ |
| 同上（肖四） | 二 | 36883 | 36883, 38240 | 38 | 33 | 38 | 100% | https://noobdream.com/Practice/exam_solution/36883/ |
| 同上 | 三 | 36988 | 36988, 38244 | 38 | 33 | 38 | 100% | https://noobdream.com/Practice/exam_solution/36988/ |
| 同上 | 四 | 37096 | 37096, 38271 | 38 | 33 | 38 | 100% | https://noobdream.com/Practice/exam_solution/37096/ |

#### 数学一（本轮意外收获：整卷模拟卷）

| 系列 | 套数 | 实际用 examId（按套序） | 题量/套 | 答案率 |
|---|---|---|---|---|
| 2025 张宇终极预测 8 套卷 | 8 | 34107, 35250, 35370, 35415, 35688, 36613, 38825, 38826 | 20–22 | 75–100% |
| 2026 张宇终极预测 8 套卷 | 2 | 39543, 39891 | 22 | 77.3% |
| 2025 李林冲刺预测 6 套卷 | 6 | 36075, 36211, 36645, 36990, 37134, 37406 | 22 | 100% |
| 2026 李林冲刺预测 6 套卷 | 6 | 37276, 37279, 37392, 37393, 37395, 37396 | 21–22 | 95.5–100% |
| 2025 李艳芳预测 3 套卷 | 1（仅第三套） | 38064 | 12 | 100% |

> 每套的完整候选 ID、来源 URL、answerFrom 分布见 `node tools/nnd-report.mjs` 输出与 `tools/cache/mock-xiao/build-report.json`。

### 10.5 目录页确认存在、但**本轮未入库**的卷（未找到/未抓 exam_solution 页）

来自 `https://noobdream.com/Practice/pastexam/`（`tools/cache/mock-xiao/nnd/pastexam-list.json`，共 146 真题 + 127 模考）：

| 科目 | 卷名 | 目录页套数 | 状态 |
|---|---|---|---|
| 政治 | 2026 徐涛考研政治冲刺 3 套卷 | 2（目录页标 3 套） | ❌ 未找到解析页 |
| 政治 | 2026 肖秀荣 8 套卷（一~八） | 8 | ✅ 全部入库 |
| 政治 | 2025 肖秀荣终极预测 4 套卷 | 4 | ✅ 全部入库 |
| 数学一 | 2026 李永乐冲刺 6 套卷 | 4 | ❌ 未找到解析页 |
| 数学一 | 2025 合工大超越 5+5 套卷 | 10 | ❌ 未找到解析页 |
| 数学一 | 2025 李良冲刺预测 5 套卷 | 3 | ❌ 未找到解析页 |
| 数学一 | 2025 余丙森冲刺 5 套卷 | 3 | ❌ 未找到解析页 |
| 数学一 | 2025 李艳芳预测 3 套卷 | 3 | ⚠️ 只入库第三套 |
| 数学一 | 2025 张宇终极预测 8 套卷 | 8 | ✅ 全部入库 |
| 数学一 | 2026 张宇终极预测 8 套卷 | 2 | ✅ 全部入库 |
| 数学一 | 2025/2026 李林冲刺预测 6 套卷 | 6 + 6 | ✅ 全部入库 |
| 计算机 | 2027 年 408 统考冲刺 7+3 套卷 | 10 | ⚠️ 未入库（本项目 cs408 已有真题+王道题库，本轮未扩） |

> **没找到**：肖秀荣的其他年份（2024 及更早的肖四肖八）、**肖秀荣 1000 题**（N诺考研目录页里没有；上一轮 GitHub 也没有）。
> **没找到**：英语一模拟卷（N诺考研目录页里英语一只有真题，没有模考）。

### 10.6 年份口径（父代理问的 `year` 字段）

- `year` **照抄来源页标题里的年份数字**，不做换算：肖八 → `2026`，肖四 → `2025`，张宇 8 套卷 → `2025`/`2026`，李林 6 套卷 → `2025`/`2026`。
- **依据**：肖秀荣系列书按「考试年份」命名（《肖秀荣 2026 考研政治冲刺 8 套卷》＝面向 **2026 届考研**，即 **2025 年 12 月**那场考试）。内容侧可以交叉印证：该卷材料里出现的是 **2025 年**的时政
  （「2025年7月1日在二十届中央财经委员会第六次会议上的讲话」「2025年10月20—23日 二十届四中全会」「2025年9月12日 十四届全国人大常委会第十七次会议」），与「2025 年秋冬出版、供 2026 届使用」吻合。
- 因此：**`year: 2026` 的肖八 = 2026 届考研（2025 年 12 月考试）用**；`year: 2025` 的肖四 = 2025 届（2024 年 12 月考试）用。
- ⚠️ 这是**来源页标题的转录口径**；若后续发现原书封面另有标注，以原书为准。

### 10.7 保真度风险与纪律执行情况

- 每一个新增卷的 `sourceNote` 都写明：**「来源为第三方练习站 N诺考研对原书的网页转录，不是正式出版物原文，未经逐字核对，请以正式出版物为准」**。
- `_manifest.json` 顶层 `note` 追加了同口径的 `【N诺考研来源补充】` 段落，并说明系列完整性（肖八 8/8、肖四 4/4）。
- 所有新增卷 `quality` **一律 `unverified`**，未因「答案看起来合理」而升级。
- **未编造**：答案只取来源页明确写出的四处（`正确答案` 标记 / `【答案】X` / `标准答案为X` / 简析里「A、B、C 正确」的明确表述）。
  多选题若来源只给 1 个字母，按纪律**清空答案并写 `answerNote`**，不猜。
- **未编造选项**：来源把选项做成图片的题（缺选项）**丢弃并记入 `_manifest.json.droppedSummaryNnd`**，不补造。
  本轮共丢弃 14 题（明细见 `tools/cache/mock-xiao/build-report.json`）。
- 题型按**考试固定结构**（政治：1–16 单选 / 17–33 多选 / 34–38 材料；数学一：1–10 选择 / 11–16 填空 / 17–22 解答）判定，
  因为来源站的分节标题时有时无；这是考试结构不是内容推断，且与抓到的答案字母数交叉校验。

### 10.8 复现方式

```bash
# 0) 找全集清单（真题 + 模考的名称/科目/套数）
node tools/nnd-pastexam.mjs                 # 需要先缓存 /Practice/pastexam/ 页面
# 1) 发现 exam_solution ID（受控扫描；已完成 ID 会跳过）
node tools/nnd-scan.mjs 39470 42000 --concurrency=2 --delay=250 --save-html
# 2) 从扫描结果归纳卷清单（同名多上传会保留候选 ID）
node tools/nnd-make-sources.mjs
# 3) 下载 + 解析入库（自动逐候选页比对，取最完整的一版）
node tools/fetch-mock-xiao.mjs
node tools/build-mock-xiao.mjs
# 4) 出对照表 / 抽查
node tools/nnd-report.mjs
node tools/nnd-report.mjs --samples 5
# 5) 校验
node tools/validate-mock.mjs && node tools/validate-all.mjs
```

中间产物：`tools/cache/mock-xiao/{nnd/scan.jsonl, nnd/raw/*.html, pastexam-list.json, sources.json, build-report.json, fetch-report.json}`

### 10.9 本轮校验结果

```
========== validate-mock 报告 ==========
目录: public/data/mock/    卷数: 57    题目总数: 6077    有答案: 5590 (92.0%)
  cs408     卷  4   题 2600   选择 2168   有答案 2600
  math1     卷 29   题 1799   选择  689   有答案 1313
  politics  卷 24   题 1678   选择 1618   有答案 1677
唯一题目 id: 6077（与真题库 id 冲突 0）

--- 错误 0 条 ---
✅ 校验通过

=== validate-all.mjs ===
总题量: 9093
ERROR: 0 条
WARNING: 61 条（全部来自既有真题数据，模拟卷 0 条）
结果: ✅ 通过
```

**本轮新增：7 个系列 / 35 套 / 948 题 / 有答案 918（96.8%）**；
其中肖八 8 套 304 题、肖四 4 套 152 题，答案覆盖率 99.7%。

### 10.10 与正式出版物的差异风险（一句话结论）

**这 35 套卷的题干、选项与答案是 N诺考研站方对原书的网页转录，`quality` 全为 `unverified`；**
**虽已逐题保留可回源的 `source.url`，但未经与正式出版物逐字比对，可能存在错字、漏字、选项顺序差异或个别答案录入错误 —— 用作刷题练习足够，用作"标准答案依据"前必须核对原书。**

