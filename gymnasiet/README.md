# 瑞典初中9年级成绩地图 (Grundskolan åk 9)

纯静态网页：**地图 + 联动排行榜**，按学校展示瑞典 grundskola 9 年级成绩。
四个可切换指标、三语（中文 / svenska / English）、kommun 与公私立筛选、搜索。
数据来自 Skolverket 的 **Planned Educations API v4**（公开、CC 授权）。

## 文件
- **index.html** — 网页（内置 30 所示例数据，先看效果）。
- **fetch-data.mjs** — 取数脚本，抓全瑞典真实数据 → `data.json`。
- **data.json** — 数据文件，网页优先读它。

## 四个指标
| 切换 | API 字段 | 范围 / 配色 |
|---|---|---|
| 平均绩点 meritvärde | `averageGradesMeritRating9thGrade` | 0–340，红低→绿高 |
| 升学资格% behörig (YR) | `ratioOfPupils9thGradeEligibleForNationalProgramYR` | 0–100 |
| 全国统考 NP | SVE/ENG/MA 三科均值 | 0–20 |
| **SALSA 增值偏差** | `salsaAverageGradesIn9thGradeDeviation` | ±30，**发散配色**：红=低于预期、绿=高于预期 |

SALSA 是按家庭背景（家长教育、性别比、新移民比例）校正后的"实际−预测"偏差，能减少
生源差异，比单看绩点更接近"学校的增值"。注意：SALSA 学年通常比当年成绩**滞后一年**
（meta 里分别标了"成绩"和"SALSA"学年）。

## 跑真实数据（约 1500 所，Node 18+）
```bash
node fetch-data.mjs        # 列校→坐标→逐校统计→一次取全国 SALSA→data.json
```
逐校统计有缓存（cache/），重跑很快；想强制刷新就删 cache/。
然后用静态服务器打开（**别用 file://**，浏览器会拦本地 fetch）：
```bash
python -m http.server 8000     # 访问 http://localhost:8000  (Windows 用 python)
```

## 高中页 / Gymnasiet (gymnasiet.html)
同一个 repo 里还有一张**高中地图** `gymnasiet.html`，顶部可在「小学 ⇄ 高中」之间切换。
高中数据是**按项目（program）**分的，所以多了一个项目下拉（选「所有项目」看校平均，或单看理科/经济/社科…）。三个指标：
- **录取分 antagningspoäng**（进这个项目要多少初中绩点）
- **三年毕业率%**（`ratioOfPupilsWithExamWithin3Years`）
- **毕业绩点 betygspoäng**（0–20，`gradesPointsForStudents`）

生成高中数据：
```bash
node fetch-data-gy.mjs        # → gy-data.json（逐校缓存在 cache/gy/）
```
`index.html` 读 `data.json`，`gymnasiet.html` 读 `gy-data.json`，两个都丢进 repo 根目录即可，Cloudflare 会同时托管。

## 免费上线（任选其一）

**A. Cloudflare Pages（推荐，你已经在用 Cloudflare）**
1. dash.cloudflare.com → Workers & Pages → Create → Pages → Upload assets。
2. 把含 index.html 和 data.json 的整个文件夹拖进去 → Deploy。
3. 几秒得到 xxx.pages.dev 公网地址，可绑自有域名。免费、全球 CDN。
   命令行等价：`npx wrangler pages deploy .`

**B. GitHub Pages**
1. 把文件夹推到一个 GitHub 仓库（index.html 在根目录）。
2. 仓库 Settings → Pages → Source 选 main 分支 / (root) → Save。
3. 得到 https://<用户名>.github.io/<仓库>/。

**C. Netlify / Vercel** — 把文件夹拖到 app.netlify.com 的 Drop 区，或 `vercel deploy`。

都不需要构建步骤——就是两个静态文件。想自动每年更新：用 GitHub Actions 定时跑
fetch-data.mjs 重新生成 data.json 再触发部署。

## 已有的同类服务（供参考，你这版的差异点）
- **skolranking.com** — 全瑞典约 1500 所地图+排名（按 meritvärde），最接近你这版。
- **skolkoll.se** — 最全的私营服务，含英文版、SALSA、师资等，可搜索上万所。
- **Utbildningsguiden（Skolverket 官方）** — 官方查找与比较工具，仅瑞典语、非地图优先。

你这版独有：**中文/三语切换** + **SALSA 增值偏差做成可切换图层** + 数据管道自控。

## 改造点
- 配色档位：index.html 里 METRICS 的 dom。
- CORS：API 一般不开浏览器跨域，故脚本预抓；要实时刷新可把脚本逻辑搬到 Cloudflare Worker。
- 加语言：往 I18N 里再加一个语言键即可（学校名/kommun 保持瑞典语原文）。
