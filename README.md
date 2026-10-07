# AI Game Lab

一个放得下很多 JavaScript 游戏 demo 的轻量实验室。首页、每款游戏和新增模板互相独立；静态游玩无需账号或远程服务。运输船另提供可选的 Node 局域网服务。

本机项目位置：`D:\ChatGPTProject\ai-game-lab`。

## 启动

安装 Node.js 20 或更高版本，然后在 PowerShell 中运行：

```powershell
cd D:\ChatGPTProject\ai-game-lab
npm.cmd run dev
```

打开 **http://127.0.0.1:5173**。静态开发服务使用 Node 内置模块，运输船模型和贴图已放在本地。修改文件后刷新浏览器；开发服务器没有自动热更新。按 `Ctrl+C` 停止。执行完整测试或局域网开服前，先运行 `npm.cmd ci --ignore-scripts` 安装锁定依赖。

```powershell
npm.cmd run check                 # 清单、资源路径、全部 JS 语法与玩法/服务器测试
npm.cmd run build                 # 输出纯静态站点到 dist/
npm.cmd run preview               # 本地预览构建产物
npm.cmd run dev -- --port 5174     # 5173 已被占用时换端口
```

`npm.cmd` 可以绕过部分 Windows 电脑对 `npm.ps1` 的执行策略限制；其他终端使用 `npm` 即可。服务默认只监听本机 `127.0.0.1`。请通过 HTTP 打开，直接双击 HTML 的 `file://` 模式无法读取首页 JSON 清单。

## 已有游戏：轨道闪避

- 左右方向键或 `A / D` 沿星环移动。
- 触控时拖动画面改变位置，或长按左右按钮。
- 躲开珊瑚色陨石，收集黄色能量（每个 +50 分）。
- 初始三格护盾；每次撞击消耗一格，并给予短暂无敌。
- 存活 45 秒通关；护盾耗尽结束。时间越长，陨石越密。
- 空格或界面按钮暂停/继续。切换标签页、窗口失去焦点时自动暂停。
- 结束后可「再玩一次」。本页最高分只在当前游戏实例中保留，返回大厅后重置。

这是一个需要视觉反应的 Canvas 游戏。按钮、操作提示和结算支持键盘及读屏，实时空间信息仍需视觉判断。`prefers-reduced-motion` 下关闭首页装饰动效、飞船拖尾和撞击粒子；必要的游戏运动保留。

## 游戏：运输船枪战

从大厅进入运输船枪战，或直接打开 `/games/freight-fire/`。WASD 移动、鼠标瞄准、左右键射击/瞄准、R 换弹、空格跳跃、Shift 静步、Esc 菜单。出生区按 B 选择主武器，1 主武器、2 手枪、3 刀；刀左键轻击两次、右键重刺一次可击败满血敌人。支持 4v4 / 8v8 本地 AI，局域网模式双击 `start-fps-lan.cmd` 开服。

保留已认可的经典地图结构与材质；枪手、人物、动作与音效直接复用用户指定的 dust2-web 公开 CS2 资源，采用匹配原生骨骼。M4A1-S / AK-47 / AWP 主武器配 USP-S 与爪子刀，支持两级狙击镜、从当前姿态与受击惯性进入有关节限制的物理布娃娃、尸体视角和 CS2 击杀条。音效默认开启。原版地图绝对尺寸尚未全部实测，地图不标记为已经验收一比一。详细说明与来源见 [运输船枪战说明](games/freight-fire/README.md)。

`npm.cmd run test:fps:browser` 验证真实键鼠、选枪、瞄准、死亡重生、大厅与 LAN 流程；`npm.cmd run test:experience` 验证画面、触控、暂停与结算重开。`artifacts/` 保存结果，不进入构建。

## 加入新游戏

### 外部作者投稿：GitHub 仓库与详细游戏说明

大厅的「游戏投稿」入口（`/#/submit`）只填写五项：游戏名称、GitHub 链接、游戏介绍、后端与部署需求、创意特色（选填）。点击「到 ai-game-lab 提 Issue」直接打开 [LanShiLiang/ai-game-lab 的新建 Issue 页面](https://github.com/LanShiLiang/ai-game-lab/issues/new)，自动带入游戏介绍；作者登录 GitHub 后检查正文并确认提交。表单显示收件仓库名称，作者填入的仓库仅作为游戏源码链接。站长审核后负责部署并回复可玩链接，准备投稿内容不代表已收件或已上架。

游戏仓库的 README 应写清构建方式（如 `npm ci && npm run build`；纯静态注明无需构建）、输出目录（如 `dist` 或 `.`）、部署版本、操作与支持设备、完成度及已知问题、作者与素材许可、封面或 Release 链接。这些资料不再作为本站表单字段或自动生成的 Issue 字段。

没有游戏仓库的用户可以点击「提交设计想法」，直接向本仓库创建标题以 `[设计想法]` 开头的 Issue。正文提示描述游戏概念、玩法与目标、创意与灵感（选填）。这个入口不检查游戏表单，也不要求提供仓库，但仍需要 GitHub 账号登录后确认提交。

收件仓库在 `src/community.json` 的 `submissionRepository` 配置。表单在浏览器本地生成草稿，不向本站提交资料或上传文件，不需要收件后台、数据库、邮件服务或 GitHub Token；未接入阿里云发信或 QQ 邮箱提醒。源码、封面、素材和构建产物由作者保存在自己的仓库或 GitHub Release 中，投稿只提供链接。长草稿采用复制后粘贴到 Issue 的方式，避免链接长度限制。表单不持久保存，刷新或离开页面前请复制草稿。

作者应提供可在子目录部署的静态产物及相对资源路径、开始/暂停/重开、窗口改变与全屏支持。需要后端服务的作品须单独说明。站长收到投稿后按指定版本获取源码，在隔离环境核对来源与构建说明，完成试玩与授权检查，再接入清单和部署。教程见大厅 `/#/guide`。

### 推荐：从模板开始

```powershell
npm.cmd run new:game -- my-game "我的游戏"
```

命令会复制 `templates/game/` 到 `games/my-game/`，并自动添加 `games.json` 记录。已有目录或重复 id 会被拒绝，避免覆盖作品。模板本身是可玩的 30 秒点击小游戏，含开始、暂停、重开和生命周期处理。

1. 修改新目录中的 `index.html`、`style.css`、`game.js`。
2. 更新 `cover.svg`（也可以改用 PNG / WebP）。
3. 在 `games.json` 中更新介绍、分类、标签和操作方式。
4. 运行 `npm.cmd run check`，刷新大厅，测试开始、重开与返回。

### 接入 AI 生成的现有 HTML 游戏

把游戏及所有素材放入 `games/<id>/`，使用相对路径引用。同一目录中可以自由增加 JS、CSS、音频和图片文件。把下面的记录加入 `games.json`：

```json
{
  "id": "my-game",
  "title": "我的游戏",
  "subtitle": "My Game",
  "description": "一句说明玩法的话。",
  "category": "益智",
  "tags": ["解谜"],
  "controls": ["鼠标", "触控"],
  "entry": "games/my-game/index.html",
  "cover": "games/my-game/cover.svg",
  "accent": "#3554df",
  "featured": false
}
```

`id` 必须是唯一的小写字母/数字/短横线组合。`entry`、`cover` 必须指向自身目录里的实际文件；`accent` 为六位十六进制颜色。`title`、`description`、`category`、`tags`、`controls` 为必填项。`subtitle` 可选；首个 `featured: true` 的游戏出现在首页主推荐，没有标记时使用第一款。分类由清单自动生成，搜索覆盖名称、描述和标签。无需改首页代码。

### 可直接交给 AI 的提示词

> 在 AI Game Lab 的 games/my-game/ 内做一款原生 JavaScript 游戏。保持独立 index.html、style.css、game.js，使用本地相对路径和普通 script 标签，不引入框架或后端。实现明确的开始、结算、重开、暂停；支持键盘/触控，尊重 prefers-reduced-motion。切换标签页暂停，停止时清理计时器和动画帧。不要修改首页；更新 games.json 元数据和游戏封面，运行 npm run check 与 npm run build。

## 隔离与生命周期

大厅为所有游戏提供「全屏游戏」「铺满窗口」「独立窗口」三个入口。全屏使用浏览器原生 Fullscreen API；未获允许时自动铺满窗口，并显示退出按钮。显示切换保留同一个 iframe，不重载对局；返回大厅销毁旧实例。轨道闪避、运输船和逐浪竞速自身也有全屏按钮。按 Esc 或退出按钮恢复。

游戏运行在独立 iframe 内，CSS 和全局变量互不污染。返回大厅或重新载入会移除旧 iframe，从而结束其脚本和计时器。普通游戏使用 `sandbox="allow-scripts"`；运输船为加载 ES modules、保存设置及鼠标锁定，使用 `allow-scripts allow-same-origin allow-pointer-lock`。运输船属于受信任的本地游戏，具有同源权限；普通游戏的 origin 仍是不透明 origin。

示例和模板使用普通 `<script defer>`，可直接在沙盒中加载。如果新游戏使用 ES module，其跨 origin 加载需要静态服务器为游戏资源提供合适的 CORS 头；当前默认服务器未开启 CORS，请优先使用普通脚本。浏览器存储/API 兼容性应在接入时单独验证。沙盒不会禁止所有网络请求，不应把来源不明代码视为可信代码。

游戏需自行监听 `visibilitychange` 并暂停。大厅也会发送辅助消息，模板已处理：

```js
window.addEventListener('message', (event) => {
  if (event.source === window.parent && event.data?.type === 'ai-game-lab:pause') {
    pause();
  }
});
```

不要在后台持续渲染。示例仅在运行时申请动画帧，Canvas 像素比最多为 2，粒子数量受事件和寿命限制；封面为本地 SVG，列表图片懒加载，没有远程字体或图片请求。

两款 3D 游戏默认「自动」画质：持续低帧率时降低渲染分辨率，性能恢复后逐步恢复，自动模式的渲染像素不超过 240 万；手动选择画质后保留用户选择。菜单/运输船暂停最多 15 FPS，赛车暂停不重绘场景；隐藏标签页取消渲染循环，恢复时重置时间累计，联机服务仍继续比赛。赛车小地图缓存静态赛道，排名列表只在数据变化时更新；轨道闪避缓存背景。模型解析成功后释放独立 GLB 下载缓存，已解析模型仍复用。静态服务流式发送资源，支持 ETag / HEAD，不为每个大文件请求整份分配内存。

## 项目结构

```text
ai-game-lab/
├─ index.html                 首页和游戏容器
├─ games.json                 唯一的游戏注册清单
├─ src/                       大厅 JS、CSS、图标
├─ games/
│  ├─ orbit-dash/             Canvas 街机游戏
│  └─ freight-fire/           3D 运输船 FPS、模型、贴图与许可
├─ templates/game/            可复制的新游戏模板
├─ scripts/                   Node 内置开发、检查、构建工具
├─ tests/                     玩法边界和本地静态服务测试
└─ dist/                      npm run build 产物（Git 忽略）
```

构建复制 `index.html`、`games.json`、`src/`、`games/` 及许可证，开发工具和模板不进入产物。每次构建仅替换本项目的 `dist/`。Hash 路由支持直接打开 `/#/play/orbit-dash` 和 `/#/play/freight-fire`，在其他静态目录下访问时资源仍使用相对路径。游戏资源、静态服务和模板生成均不依赖联网。

## 当前边界

不包含账号、持久排行榜或发布后台。投稿说明与仓库 / Release 链接通过 GitHub Issue 收件，新增与部署由站长审核后完成。运输船的可选 Node 服务只提供局域网房间，不实现公网匹配或延迟补偿。公开大厅已部署在 [lslzqco.cn/ai-game-lab](https://lslzqco.cn/ai-game-lab/)；开发服务器仅用于本机开发。

## 开源许可证

原创代码与项目文档采用 [MIT License](LICENSE)，允许使用、修改、分发及商业使用，分发时须保留版权声明与许可全文。第三方素材和依赖保留各自的版权与许可证，具体范围见 [LICENSE-SCOPE.md](LICENSE-SCOPE.md) 和 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。第三方游戏资源不会因仓库公开而变成 MIT 素材；投稿作品也保留作者选择的原许可证。

## 本次验证记录（2026-10-04）

- 在本项目目录运行 `npm run check`（语法 / 清单检查及明确枚举本仓库 `tests/` 的测试入口）：元数据、资源路径、全部 JS 语法通过，当前 64 项玩法、音频事件、静态服务与局域网测试通过；不会扫描 `artifacts/` 研究仓库或 `dist/` 副本。
- `npm run build` 成功；浏览器验证针对正式目录的 `dist/` 构建产物。
- 本机 Chrome 无头验证：开始、计分、真实键盘移动、暂停/继续、重开、返回大厅销毁 iframe、手机宽度布局、reduced motion、直接游戏链接与未知游戏回退全部通过；无控制台错误与 HTTP 资源失败。
- 游戏成功/失败结算采用受控碰撞和时间状态验证，没有执行完整的人工 45 秒游玩或实体触屏设备测试。
- 在临时副本中验证新游戏生成与注册，重复 id 被拒绝且清单保持不变。运输船已接入大厅清单。
- 运输船：20 项模拟测试与 8 项 LAN 测试通过，包括出生区选枪、装备权限、刀伤害 / 遮挡、蹲姿命中、经典地图通路与 AI 完整对局；本机 Chrome 的通用回归和 15 项重构玩法检查通过。
- 运输船五种武器完成原生动画检查；2,420 个动作 / 瞄准 / 贴墙采样、两队 98 个配套枪手画面、16 个角色姿态与 36 个死亡姿态通过。这些采样不证明所有网格零相交。当前报告在 `artifacts/freight-rebuild/`、`artifacts/transport-v3/`、`artifacts/cs2-rig/` 和 `artifacts/characters-upgrade/`。
- 浏览器记录与截图位于 `artifacts/`（Git 忽略）。

## 逐浪竞速 / APEX Racing

公开试玩：[AI Game Lab 逐浪竞速](https://lslzqco.cn/ai-game-lab/#/play/apex-rush)。

支持海滨与城市两条3D赛道、漂移集气、氮气、腾空落地喷、2–16人个人/组队、人机及局域网竞速。源码和使用说明见 `games/apex-rush/README.md`。双击 `start-racing-lan.cmd` 或运行 `npm run lan:racing` 开服；好友直接打开 http://主机IP:8790，在本地大厅选择房间加入；邀请链接也可直达房间。CDN页面为无需比赛后端的人机版，局域网比赛在自己的电脑主机运行。

公开仓库执行 `npm ci` 后即可使用 `npm run lan:racing` 开服；`npm run test:racing:browser` 执行真实浏览器按键全程试玩。验证证据位于 `artifacts/racing/`。

## 性能、投稿与全屏验证（2026-10-06）

- 完整检查通过：20 个测试文件、129 项测试。构建通过，Chrome 对实际 dist 页面验证投稿草稿、错误仓库、360px 布局、三款游戏原生全屏 / 铺满窗口 / 独立窗口、全屏拒绝回退和返回大厅销毁实例；没有页面异常或资源 HTTP 错误。
- 投稿表单简化为五项后，投稿专项测试与构建通过；Chrome 验证创意特色选填、空白必填内容拦截、长草稿复制、无仓库设计想法入口和 360px 排版。填写与生成草稿期间没有服务器写入或上传请求。可用 `node scripts/lab-upgrade-qa.mjs --submission-only` 重复验证。
- 1280×800、DPR 2 的本机 Chrome 样本中，正常游玩保持约 60 FPS；两款 3D 游戏菜单约 15 FPS。相同 2.1 秒窗口内，运输船暂停的 renderer.render 调用从 252 次降为 62 次（约减少 75%）；赛车暂停保持不重绘。该结果不代表所有设备。
- 无头 Chrome 始终把页面视为可见，因此隐藏页面和全屏拒绝分支通过明确模拟浏览器事件 / 拒绝来验证；原生全屏本身使用真实浏览器操作。没有创建测试投稿 Issue。
- 优化前后与功能截图见 artifacts/performance/before.json、after.json。脚本入口：node scripts/lab-upgrade-qa.mjs（先构建）。这些功能已纳入 2026-10-07 的线上更新。

## 使用体验验证（2026-10-07）

- 普通游戏页随窗口高度调整，轨道的暂停、方向控制与提示无需滚动查找；赛车与运输船的小窗口准备页提供紧凑布局，开局与阵营选择互不遮挡。三款游戏均支持原生全屏、铺满窗口与独立窗口。
- 运输船修复结算「返回菜单」后无法开始新局的问题；在线房间结束后隐藏失效的继续按钮，仍由房主重新开局。手机雷达与比分分开排列，触控按钮至少 44px 高。
- 129 项自动测试及构建通过。Chrome 验证两条赛道真实按键完赛、漂移、氮气、结算与重开；本机中位帧率 60 FPS。轨道使用真实按键运行至成功或失败，不修改时间或护盾；运输船使用真实移动、鼠标、开火、换弹和菜单操作。
- 浏览器入口：`npm run test:display`（先构建）、`npm run test:experience`、`npm run test:fps:browser`、`npm run test:racing:browser`。需安装 Chrome；截图与报告保存在 Git 忽略的 `artifacts/` 下。
- 手机为浏览器模拟设备；运输船结算回归使用明确的分数夹具，完整比赛逻辑由模拟测试覆盖。GitHub 投稿只检查草稿跳转，不提交测试 Issue。
- 体验审查与修复说明见 [docs/experience-20261007.md](docs/experience-20261007.md)。
