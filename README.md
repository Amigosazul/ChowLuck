# 饭运抽卡 ChowLuck

两个人一起撕包抽签，决定今天吃什么。

撕开一包"食签"，翻出五道菜，最后盖章定下一道。两个人可以坐上同一张饭桌：共用一份菜单，实时看到对方抽到的签。两人选中同一道菜时，当天自动定案；选的不一样，可以掷签决定。

*A two-player "what's for lunch" picker: tear open a foil pack of five dish cards, flip them one by one, stamp the one you'll eat. Share a table with your partner to see each other's draws live. Vite + TypeScript front end, Hono + node:sqlite back end, no framework, no external services.*

<p align="center">
  <img src="docs/screenshots/tear.webp" alt="沿虚线撕开卡包" width="49%">
  <img src="docs/screenshots/results.webp" alt="五签排成扇形，选中的一签盖上「定」字印章" width="49%">
</p>
<p align="center">
  <img src="docs/screenshots/phone-results.webp" alt="手机上的结果页" width="32%">
  <img src="docs/screenshots/phone-table.webp" alt="手机上的同桌面板" width="32%">
</p>

## 快速开始

需要 Node.js 22.18 或更高版本。后端直接运行 TypeScript，并使用 Node 自带的 SQLite，不需要另装数据库。

```bash
npm install
npm run dev        # 前端 http://localhost:5173，接口 http://localhost:8787
npm test           # 抽卡逻辑与接口测试
npm run build      # 类型检查 + 打包到 dist/
npm start          # 生产模式：一个进程同时提供页面和接口（默认端口 8787）
```

只想一个人玩的话，前端单独打包也能用。抽签、菜单和记录都可以保存在浏览器里，只有"同桌"功能需要后端。

### 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `8787` | 服务端口 |
| `DB_PATH` | `data/chowluck.db` | SQLite 文件位置，备份这个文件即可 |
| `APP_TIMEZONE` | `Asia/Shanghai` | 按哪个时区判断"今天" |

## 玩法

1. **撕包**：按住卡包顶部的金色虚线向右拖，或点"直接撕开"。
2. **翻签**：每包五签。前四签按稀有度从低到高排列，第五签必定是中签或以上。
   - 每签的概率：平签 62%，中签 26%，上签 9%，上上签 3%
   - 第五签的概率：中签 72%，上签 21%，上上签 7%
3. **定签**：点卡片放大后，选"定下这一签"。
4. **同桌**：点右上角"同桌"开一张饭桌，把邀请码或链接发给 TA。
   - 一张饭桌最多两人，两人共用一份菜单。
   - 在同桌面板里点对方抽到的签，就能选同一道。
   - **暗签**：在你自己定签之前，看不到对方选了什么，只知道 TA 已经封签。这是服务端控制的，接口返回的数据里，对方的菜名是空的。
   - **同开**：两人都定签后，两张签一起翻开。选中同一道菜就是"心有灵犀"，当天自动定案；选的不一样，可以掷签决定，也可以改选对方的。
   - 掷签结果由服务端随机决定，两边看到的是同一个结果。揭晓动画每台设备只播一次，在同桌面板里可以"重看揭晓"。
5. **菜单**：可以停用不想吃的菜，也可以添加自己常吃的店，并指定签位和主字。

## 项目结构

```
src/shared/      前后端共用：类型、默认菜单、抽卡算法、日期
src/client/      前端（Vite + TypeScript，不依赖框架）
  main.ts        状态与流程编排
  store/         数据层：LocalStore（本机）/ RemoteStore（饭桌，接口 + SSE）
  ui/            卡包、翻签、结果、同桌面板、弹出面板、音效、特效
  styles/        设计令牌与各部分样式；fonts.css 由脚本生成
server/          后端（Hono + node:sqlite）
  app.ts         接口路由与实时推送
  repo.ts        数据表与读写
scripts/         字体子集化脚本
public/fonts/    自托管字体子集及其许可证
test/            Vitest 测试
```

### 改默认菜单

默认的 40 道菜在 `src/shared/dishes.ts`。每道菜包含以下字段：
- 菜名
- 卡面主字
- 类别
- 签位
- 人均价格
- 等待分钟数
- 热量
- 一句短评

改完菜单后，记得重新生成字体子集（见下一节），新出现的汉字才会用上毛笔字体。

### 字体

字体全部自己托管，不依赖 Google Fonts，在国内网络下也能正常显示。使用了三套字体，都采用 SIL Open Font License 1.1，许可证见 `public/fonts/licenses/`：
- 马善政毛笔楷书（Ma Shan Zheng）
- 思源宋体（Noto Serif SC）
- Cormorant Garamond

`npm run fonts` 会下载源字体（缓存在 `.cache/fonts`），裁出子集写入 `public/fonts/`，并生成 `src/client/styles/fonts.css`。中文字体各拆成两部分：
- 核心包：页面里出现过的字，打开页面时加载，共约 485KB。
- 常用字包：GB2312 一级常用字，只在自定义菜名或昵称用到时才下载。

改了界面文案或默认菜单、出现了新汉字时，要重新运行一次 `npm run fonts`，并把生成的文件一起提交。

## 接口

除创建和加入饭桌外，所有请求都要带 `Authorization: Bearer <token>`。SSE 请求无法设置请求头，改用 `?token=`。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/rooms` | 开桌 `{name, pool?}` → `{token}` |
| POST | `/api/rooms/join` | 入座 `{code, name}` → `{token}` |
| GET | `/api/state` | 饭桌、成员、菜单、今日签面、历史（自己没定签时，对方的选择为暗签） |
| PUT | `/api/pool` | 更新共用菜单 |
| POST | `/api/draws` | 开一包，由服务端抽签 |
| PUT | `/api/choice` | 选定 `{dish}` |
| POST | `/api/toss` | 两人都定签且不同时，由服务端掷签定案 |
| PUT / DELETE | `/api/final` | 定案 / 重新商量 |
| DELETE | `/api/members/:id` | 离开饭桌或请对方离席 |
| GET | `/api/events` | SSE，饭桌有变动时推送 `update` |

## 自己部署

- `npm run build` 之后执行 `npm start`，一个 Node 进程就够了。占用很小，适合放在家里的小主机或便宜的 VPS 上。
- 要用 HTTPS：`navigator.clipboard`（复制邀请链接）只在安全上下文中可用。常见做法是在前面加一层 Caddy 或 Nginx 反向代理。
- 饭桌凭证只保存在浏览器里，服务端只存它的哈希。换设备需要请对方先让出座位，再重新入座。
- 需要备份时，备份 `DB_PATH` 指向的那个 SQLite 文件即可。

## 许可证

代码采用 [MIT 许可证](LICENSE)。`public/fonts/` 里的字体子集不适用 MIT，它们沿用原字体的 SIL Open Font License 1.1，见 `public/fonts/licenses/`。
