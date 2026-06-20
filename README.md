# 瑞典学校成绩地图 · Sweden School Results Map

[![License: MIT](https://img.shields.io/badge/License-MIT-2f6f5e.svg)](#授权--license)
[![Data: Skolverket](https://img.shields.io/badge/Data-Skolverket%20Open%20API-3b6ea5.svg)](https://api.skolverket.se/)
![No build step](https://img.shields.io/badge/build-none%20(static)-c98a1b.svg)

交互式地图 + 排行榜 + 趋势图，按学校展示瑞典义务教育（grundskola 9 年级）和高中（gymnasium）的公开成绩数据。三语切换（中文 / svenska / English），数据来自瑞典国家教育署（Skolverket）的公开 API。

Interactive map, ranking and trend charts of Swedish school results — compulsory school (year 9) and upper-secondary (gymnasium) — built from Skolverket's open data. Trilingual (Chinese / Swedish / English), pure static site, no build step.

**🔗 Live:** `https://skolkarta.pages.dev`  ·  _(replace with your own URL)_

<!-- 建议在此放两张截图：小学地图 + 高中趋势图。把图片放到 docs/ 并改下面的路径
![Grundskola](docs/screenshot-grundskola.png)
![Gymnasium](docs/screenshot-gymnasium.png)
-->

---

## 功能 · Features

- **两张地图**：小学 `index.html`（9 年级）与高中 `gymnasiet.html`，顶部一键切换。
- **多个可切换指标**，地图配色与排行同步：
  - 小学：平均绩点 meritvärde、升学资格 behörighet%、全国统考 NP、**SALSA 增值偏差**。
  - 高中：录取分 antagningspoäng、三年毕业率%、毕业绩点 betygspoäng；并可**按项目（program）筛选**或看校平均。
- **趋势图**：近 3 / 5 / 10 年走势 —— 单校、所在 kommun 平均、全国平均；高中的趋势会跟随所选项目。
- **多选 kommun**：勾选多个市镇一起排名 / 对比。
- **联动**：地图圆点 ↔ 排行榜行 ↔ 弹窗详情互相点击高亮。
- **三语切换**，记住选择；学校名与 kommun 保留瑞典语原文。
- **每个指标都有三语解释**；高中附完整的项目（program）对照说明。
- 纯静态、无需构建、可离线打开（底图瓦片需联网）。

---

## 指标与数据源 · Metrics & data

数据来自 **Skolverket – Planned Educations API v4**（`api.skolverket.se/planned-educations`）。

### 小学 grundskola（每校 9 年级）
| 指标 | API 字段 | 范围 |
|---|---|---|
| 平均绩点 meritvärde | `averageGradesMeritRating9thGrade` | 0–340 |
| 升学资格% behörig (YR) | `ratioOfPupils9thGradeEligibleForNationalProgramYR` | 0–100 |
| 全国统考 NP | `averageResultNationalTestsSubject{SVE,ENG,MA}9thGrade` 三科均值 | 0–20 |
| SALSA 增值偏差 | `salsaAverageGradesIn9thGradeDeviation`（`/statistics/all-schools/salsa`） | ±30 |

### 高中 gymnasium（每校按项目 program）
| 指标 | API 字段 | 范围 |
|---|---|---|
| 录取分 antagningspoäng | `admissionPointsAverage` / `admissionPointsMin` | 0–340 |
| 三年毕业率% | `ratioOfPupilsWithExamWithin3Years` | 0–100 |
| 毕业绩点 betygspoäng | `gradesPointsForStudents` | 0–20 |

趋势所需的历年序列直接取自这些字段返回的多年数组。

---

## 项目结构 · Structure

```
.
├─ index.html              # 小学地图（内置示例数据，可先预览）
├─ gymnasiet.html          # 高中地图
├─ fetch-data.mjs          # 取数脚本 → data.json（小学）
├─ fetch-data-gy.mjs       # 取数脚本 → gy-data.json（高中）
├─ data.json               # 小学数据（网页读取）
├─ gy-data.json            # 高中数据
├─ .gitignore
├─ .github/workflows/
│  └─ update-data.yml      # 每年自动刷新数据
└─ README.md
```

---

## 本地运行 · Quick start

需要 **Node 18+**（自带 `fetch`，无需安装任何 npm 包）。

```bash
# 1) 生成真实数据（首跑约几分钟；逐校结果缓存在 cache/）
node fetch-data.mjs        # → data.json     （小学，约 1500 所）
node fetch-data-gy.mjs     # → gy-data.json  （高中）

# 2) 用静态服务器打开（不要用 file://，浏览器会拦截本地 fetch）
python -m http.server 8000   # Windows 用 python；macOS/Linux 用 python3
#  → 浏览器访问 http://localhost:8000
```

> 缓存说明：逐校统计会缓存在 `cache/`，重跑很快。脚本带版本化的缓存目录（`gr2` / `gy2`），升级取数逻辑后旧缓存会自动失效；想强制全量刷新，删掉 `cache/` 即可。

---

## 部署（免费）· Deploy

推荐 **Cloudflare Pages + Git 集成**（push 即自动部署）：

1. 把仓库推到 GitHub（公开或私有均可）。
2. dash.cloudflare.com → **Workers & Pages** → **Create** → 切到 **Pages** 标签 → **Connect to Git** → 选择本仓库。
3. 构建设置：**Framework preset = None**，**Build command 留空**，**Build output directory = `/`**。
4. **Save and Deploy**，得到 `xxx.pages.dev`。之后每次 `git push` 自动重新部署。

也可用 **GitHub Pages**（Settings → Pages → 由 `main` 分支 `/root` 部署）或 **Netlify / Vercel**。都不需要构建步骤——就是一组静态文件。

> 提示：`*.pages.dev` / 自有域名在中国大陆的可达性通常优于 `*.github.io`。

---

## 自动更新数据 · Auto-update

`.github/workflows/update-data.yml` 每年 12 月（成绩公布后）自动重跑两个取数脚本，
若 `data.json` / `gy-data.json` 有变化就提交，Cloudflare 随之自动部署。
也可在仓库 **Actions** 页手动点 **Run workflow** 立即更新。

---

## 技术栈 · Tech

原生 HTML/CSS/JS，单文件页面，零依赖、零构建。地图用 [Leaflet](https://leafletjs.com)（CDN），底图为 CARTO Positron 瓦片，趋势图为内联 SVG 手绘。取数脚本为原生 Node ESM。

---

## 自定义 · Customization

- **配色档位**：各页 `METRICS` 里每个指标的 `dom`（色阶区间），按全国分布微调更合适。
- **加语言**：往 `I18N` 里再加一个语言键即可（学校名/kommun 保持瑞典语原文）。
- **实时刷新**：该 API 一般不开放浏览器跨域，所以采用脚本预抓 + 静态托管。若要做实时刷新，可把取数逻辑搬到 Cloudflare Worker 当缓存代理层。

---

## 方法学与口径 · Caveats

- **分数 ≠ 学校质量**：高 meritvärde / 高录取分既可能反映教学，也可能反映生源。SALSA 偏差按家庭背景做了校正，更接近"学校自身贡献"，建议与原始分数一并看。
- **录取分**衡量的是"多难考进"，不是教学产出。
- **跨项目不可直接比**：高中大学预备项目与职业项目是两套逻辑；"校平均"是按各项目人数加权的混合值。
- **小样本屏蔽**：人数过少的数据会被 Skolverket 屏蔽，显示为"—"。
- **趋势的存活偏差**：区域/全国历年均值由"当前仍存在的学校"计算，开关校会带来轻微偏差，看走向无碍，勿作精确历史统计。
- **SALSA 学年滞后**：SALSA 通常比当年成绩晚一年（页面 meta 分别标注）。

---

## 同类服务 · Similar tools

- [skolranking.com](https://skolranking.com) — 全国地图 + meritvärde 排名。
- [skolkoll.se](https://skolkoll.se) — 最全的私营服务（含英文版、SALSA、师资等）。
- [Utbildningsguiden](https://utbildningsguiden.skolverket.se)（Skolverket 官方）— 查找与比较，仅瑞典语。

本项目的差异点：中文/三语、把 SALSA 增值与项目维度做成可切换图层、数据管道自控。

---

## 授权 · License

代码以 **MIT** 授权。数据来自 **Skolverket**（瑞典国家教育署），为公开数据，依其条款（Creative Commons）使用。

> 本项目为独立的开源作品，与 Skolverket 无任何官方关联。数据仅供参考，请以官方来源为准。
> Independent open-source project, not affiliated with or endorsed by Skolverket.
