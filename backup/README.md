# 瑞典初中9年级成绩地图 (Grundskolan åk 9)

一个纯静态的可视化网页：**地图 + 联动排行榜**，按学校展示瑞典 grundskola 9 年级的三个指标，可切换、可筛选、可搜索。数据来自 Skolverket 的 **Planned Educations API v4**（公开、免费、CC 授权）。

## 文件

- **index.html** — 网页本身。直接双击打开即可（已内置 30 所示例数据，先看效果）。
- **fetch-data.mjs** — 取数脚本，抓全瑞典真实数据生成 `data.json`。
- **data.json** — 数据文件。网页优先读它；现在是示例占位，跑完脚本就变成真数据。

## 跑真实数据（约 1500 所）

需要 Node 18+（自带 `fetch`，无需 npm 包）：

```bash
node fetch-data.mjs      # 几分钟，首跑较慢，结果写入 data.json
```

脚本会：列出所有有 9 年级的 grundskola → 取坐标 → 逐校取 `/statistics/gr` 统计 → 取每个指标**最新学年**的值。
逐校统计有缓存（`cache/stats/<kod>.json`），重跑很快；想强制刷新就删 `cache/` 目录。

然后把 `index.html` + `data.json` 放同一目录，用任意静态服务器打开（**不能用 `file://` 直接读 data.json**，浏览器会拦本地 fetch）：

```bash
python3 -m http.server 8000   # 然后访问 http://localhost:8000
```

或直接丢到你的 Cloudflare Pages / 任意静态托管。

## 三个指标（地图配色 + 排行都按它）

| 切换项 | API 字段 | 范围 |
|---|---|---|
| 平均绩点 meritvärde | `averageGradesMeritRating9thGrade` | 0–340 |
| 升学资格% behörig (YR) | `ratioOfPupils9thGradeEligibleForNationalProgramYR` | 0–100 |
| 全国统考 NP 均分 | `averageResultNationalTestsSubject{SVE,ENG,MA}9thGrade` 三科均值 | 0–20 |

颜色：**红=低 → 黄=中 →绿=高**（绿色=分数高）。地图圆点和表格里的数值小圆点用同一套配色，方便对照。
弹窗里还有各科统考分、全科及格率、教师资格率、学生数。

## 改造点

- **配色档位**：`index.html` 里 `METRICS` 的 `dom`（每个指标的色阶区间），按全国分布调更合适。
- **CORS**：API 通常不开浏览器跨域，所以走脚本预抓而不是网页直连；如果你想做"实时刷新"，把 `fetch-data.mjs` 的逻辑搬到一个 Cloudflare Worker 上当代理/缓存层即可。
- **底图瓦片**：现在用 CARTO Positron。在沙箱预览里瓦片可能不加载（不影响圆点和表格）；正常部署没问题。
- **缩到某个 kommun**：顶部下拉选 kommun 会自动把地图聚焦过去。

数据口径提醒：高 meritvärde 既可能是教学强，也可能是生源好。要更公平地比，可再叠加 SALSA（按家庭背景校正后的残差），API 里 `/v4/statistics/all-schools/salsa` 一次就能取全国——需要的话可以再加一个"SALSA 偏差"指标。
