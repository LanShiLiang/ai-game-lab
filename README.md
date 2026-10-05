# AI Game Lab

一个放得下很多 AI 原生 JavaScript 游戏 demo 的轻量实验室。首页、每款游戏和新增模板互相独立；无需后端、账号、前端框架或运行时依赖。

本机项目位置：`D:\ChatGPTProject\ai-game-lab`。

## 启动

安装 Node.js 20 或更高版本，然后在 PowerShell 中运行：

```powershell
cd D:\ChatGPTProject\ai-game-lab
npm.cmd run dev
```

打开 **http://127.0.0.1:5173**。没有依赖需要安装，直接运行即可。修改文件后刷新浏览器；开发服务器没有自动热更新。按 `Ctrl+C` 停止。

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

## 加入新游戏

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

每款游戏运行在 `sandbox="allow-scripts"` 的独立 iframe 内，CSS 和全局变量互不污染。返回大厅或重新载入会移除旧 iframe，从而结束其脚本和计时器。iframe 的沙盒 origin 是不透明 origin：不能访问父页面 DOM、localStorage、弹窗或顶层导航。

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

## 项目结构

```text
ai-game-lab/
├─ index.html                 首页和游戏容器
├─ games.json                 唯一的游戏注册清单
├─ src/                       大厅 JS、CSS、图标
├─ games/
│  └─ orbit-dash/             独立可玩示例
├─ templates/game/            可复制的新游戏模板
├─ scripts/                   Node 内置开发、检查、构建工具
├─ tests/                     玩法边界和本地静态服务测试
└─ dist/                      npm run build 产物（Git 忽略）
```

构建只复制 `index.html`、`games.json`、`src/`、`games/`，开发工具和模板不进入产物。每次构建仅替换本项目的 `dist/`。Hash 路由支持直接打开 `/#/play/orbit-dash`，在其他静态目录下访问时资源仍使用相对路径。游戏资源、静态服务和模板生成均不依赖联网。

## 当前边界

不包含后端、账号、持久排行榜、上传或发布后台。新增作品通过本地文件和 JSON 清单完成。开发服务器用于本机开发，不是生产应用服务器；构建产物可以另行放到静态托管服务，仓库不包含自动部署流程。

## 本次验证记录（2026-10-04）

- 在本项目目录运行 `npm run check`：元数据、资源路径、全部 JS 语法通过，7 项玩法与静态服务测试全部通过。
- `npm run build` 成功；浏览器验证针对正式目录的 `dist/` 构建产物。
- 本机 Chrome 无头验证：开始、计分、真实键盘移动、暂停/继续、重开、返回大厅销毁 iframe、手机宽度布局、reduced motion、直接游戏链接与未知游戏回退全部通过；无控制台错误与 HTTP 资源失败。
- 游戏成功/失败结算采用受控碰撞和时间状态验证，没有执行完整的人工 45 秒游玩或实体触屏设备测试。
- 在临时副本中验证新游戏生成与注册，重复 id 被拒绝且清单保持不变。正式项目仍只包含「轨道闪避」。
- 浏览器记录与截图位于 `artifacts/`（Git 忽略）。

## 逐浪竞速与在线发布

[游戏大厅](https://lslzqco.cn/ai-game-lab/) · [逐浪竞速](https://lslzqco.cn/ai-game-lab/games/apex-rush/) · [独立源码仓库](https://github.com/LanShiLiang/apex-rush)。

逐浪竞速提供人机、局域网与在线模式，在线最多3房间、每间创建8小时后销毁，16人个人/组队与AI补位。只有这款经过审查的游戏开放 iframe 同源模块访问；其他作品保留脚本沙盒。在线服务启动及回滚说明见 docs/online-deployment.md。原有静态小游戏继续无需后端。

## 运输船

[在线试玩](https://lslzqco.cn/ai-game-lab/games/freight-fire/) · [独立源码](https://github.com/LanShiLiang/freight-fire)

经典运输船人机对战、CS2 配套枪械手臂与角色动画。M4A1-S 社区印花集、AK-47 社区火神与港湾警戒手套 / 袖口；死亡采用有关节限制的轻量物理布娃娃，静止后冻结；两档狙击放大倍率降低30%。本地可通过 `npm run lan:fps` 开启 4v4 / 8v8 局域网，详情见 [FPS 文档](docs/freight-fire.md)。

运输船与逐浪竞速大厅封面更新为原创 1440×800 WebP 宣传画，完整生成提示词与来源记录分别见两款游戏的 `cover-source.json`。
