# AI Game Lab

游戏大厅、集成协议和部署控制。**当前工作树不包含任何游戏的前端、模拟、模型、素材或专用后端源码。** 各游戏在自己的 Git 仓库独立开发和测试，只在云服务部署准备阶段按版本获取、构建并装配。

## 仓库边界

- `ai-game-lab`：大厅、投稿、游戏清单、通用 HTTP/WebSocket 网关、部署解析与缓存
- `game-transport-ship`：运输船 FPS 的客户端、模拟、资源和 FPS 后端
- `game-apex-rush`：逐浪竞速的客户端、模拟、资源和竞速后端
- `game-orbit-dash`：轨道闪避及其资源，无后端

游戏公开 ID 仍为 `freight-fire`、`apex-rush`、`orbit-dash`；已有 `/games/<id>/`、在线 API 和 WebSocket URL 保持不变。独立仓库状态由 `deployment/registry.json` 明确记录，未确认发布的仓库不会被自动获取。历史 Git 提交仍含旧文件；没有破坏性重写历史。

## 平台开发

Node.js 20+：

```sh
npm ci --ignore-scripts
npm run check
npm run build
npm run dev
```

`npm run build` 只生成平台 `dist/`，没有游戏资源。`npm run dev` 默认 `http://127.0.0.1:5173/`；此模式用于开发大厅，游戏入口要到部署装配后才可用。不要把独立游戏的 `src/`、`dist/`、缓存或服务器拷贝到本仓库。

## 部署时查询版本与装配

先审核注册仓库、构建许可和路由，再在云服务器运行：

```sh
npm run deploy:versions -- --state-dir /srv/ai-game-lab-state
npm run deploy:prepare -- --state-dir /srv/ai-game-lab-state --public-url https://example.com/ai-game-lab/
npm run deploy:activate -- --state-dir /srv/ai-game-lab-state --release <准备好的版本ID>
npm start -- --state-dir /srv/ai-game-lab-state --port 8790
```

`prepare` 不改 current，也不执行生产部署。它把分支/tag/Release 解析为完整提交 SHA，一次性锁定后，优先使用带校验和及来源声明的对应 Release 产物；否则仅对明确允许构建的注册仓库执行固定构建流程。源码、依赖缓存、游戏产物和组合发布目录都在平台仓库外。

`activate` 验证全部文件、启动并探测新后端后，原子切换 current；网关运行时还需收到该版本的就绪确认，无网关时明确报告只选择了版本。网关先准备新的完整前后端组合，再替换正在服务的版本；失败保留旧组合。运行时不会拉代码、查询新版本或安装依赖。回滚无需下载：

```sh
npm run deploy:rollback -- --state-dir /srv/ai-game-lab-state
```

网关发现活跃房间会拒绝切换并保留连接；内存房间不跨进程迁移，应在无人游玩时执行。网关与游戏后端只绑定回环地址，由现有 HTTPS 代理对外提供服务，不修改防火墙或网络设置。

详见 [版本、缓存、安全与迁移](docs/architecture.md)、[独立游戏产物契约](docs/game-artifact-contract.md)。

## 投稿与许可

投稿继续通过大厅生成 GitHub Issue 草稿；作者保留独立源码仓库、版本、素材来源和构建说明。平台不重写游戏实现。

平台原创代码与文档为 MIT，见 LICENSE。游戏代码及素材许可属于各独立仓库；平台的 MIT 不覆盖它们。共有的 v1 嵌入协议 SDK 在 `packages/game-contracts/`，不是游戏实现。
