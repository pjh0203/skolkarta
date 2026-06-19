# 瑞典初中9年级成绩地图 · Sweden Grade-9 School Map

> 交互地图 + 排行榜，按学校展示瑞典 grundskola 9 年级成绩。四个可切换指标、三语（中文 / svenska / English）、kommun 与公私立筛选、搜索。
> Interactive map & ranking of Swedish compulsory-school year-9 results. Data from Skolverket's open API.

**在线访问 / Live:** _（部署后把你的网址填这里，例如 https://skolkarta.pages.dev）_

## 指标 / Metrics
| 指标 | 说明 | API 字段 |
|---|---|---|
| 平均绩点 meritvärde | 0–340，红低→绿高 | `averageGradesMeritRating9thGrade` |
| 升学资格% behörig (YR) | 0–100 | `ratioOfPupils9thGradeEligibleForNationalProgramYR` |
| 全国统考 NP | SVE/ENG/MA 三科均值 (0–20) | `averageResultNationalTestsSubject{SVE,ENG,MA}9thGrade` |
| SALSA 增值偏差 | 按家庭背景校正后的「实际−预测」，±30，发散配色 | `salsaAverageGradesIn9thGradeDeviation` |

SALSA 减少了生源差异的影响，比单看绩点更接近「学校的增值」。绿=高于预期，红=低于预期。
SALSA 学年通常比当年成绩滞后一年（页面 meta 里分别标注）。

## 文件 / Files
- `index.html` — 网页（无需构建，内置示例数据可先预览）。
- `fetch-data.mjs` — 取数脚本，抓全瑞典真实数据生成 `data.json`。
- `data.json` — 数据文件，网页优先读取。

## 本地运行 / Run locally
```bash
node fetch-data.mjs            # 需要 Node 18+，生成最新 data.json（约 1500 所）
python -m http.server 8000     # 然后访问 http://localhost:8000（别用 file://）
```

## 部署 / Deploy
本仓库是纯静态站，托管在 **Cloudflare Pages**（Git 集成，push 即自动部署）。
详见下方「一步步部署」。GitHub Pages / Netlify / Vercel 同样可用。

## 自动更新数据 / Auto-update
`.github/workflows/update-data.yml` 每年 12 月（成绩公布后）自动重跑取数脚本，
有变化就提交 `data.json`，Cloudflare 随之自动重新部署。也可在 Actions 页手动触发。

## 数据来源与授权 / Data & license
数据来自 **Skolverket – Planned Educations API v4**（瑞典国家教育署，公开数据，Creative Commons）。
本项目与 Skolverket 无官方关联。代码以 MIT 授权。
高 meritvärde 既可能反映教学质量，也可能反映生源，请结合 SALSA、全国统考、师资等一并看。
