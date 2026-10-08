# 在线房间服务部署与回滚

多人模式仅支持中央在线房间；人机练习在浏览器内运行。服务同时提供竞速与运输船在线协议，每次发布后均需验证公开多人连接。

## 使用

游戏菜单选择「在线房间」，创建或加入房间，复制邀请链接即可邀请好友。玩家不需要安装服务或输入主机地址。

## 生产规则

竞速最多3间，每间2/4/8/16席，创建8小时后关闭，重开不续期；最后一位真人离开后释放。运输船最多3间，1v1 至 8v8，可配置0至15个 AI（至少留1个真人席位），真人空席不自动补机器人；断线保留30秒，明确退出立即释放，房主转移给下一位在线玩家。房间只存于内存，服务重启会关闭当前房间。

## 启动与配置

Node.js 20+，执行 `npm ci --ignore-scripts`、`npm run online:start`。配置文件为 `racing-online.config.json`；服务只监听 `127.0.0.1:8790`，开发验收地址为 http://127.0.0.1:8790/ 。生产通过同域HTTPS反向代理访问；本机地址仅用于开发验收。

一个进程提供静态大厅、竞速 `/api/racing/*` 和 `/racing` WebSocket、运输船 `/api/fps/*` 和 `/fps` WebSocket。反向代理必须保留 Host、Upgrade、Connection，并从上游路径中移除 `/ai-game-lab/` 前缀。前端与邀请链接保留部署前缀。

## 发布与回滚

发布包同时包含 `scripts/racing-server.mjs`、`scripts/fps-server.mjs`、两款游戏资源、ws依赖和 `racing-online.config.json`。部署到新的版本目录，检查配置与文件SHA，再切换 current 并重启 `ai-game-lab-racing.service`。现有房间会中断，应在无人游玩时更新。

回滚时将 current 指回上一个已验证目录，重启服务。保留旧版和Nginx备份；不删除其他应用。初装脚本为 `scripts/install-online.sh`，后续更新脚本为 `scripts/activate-lab-release.sh`。

## 验收

验证公开HTTPS页面与游戏资源、两款游戏真实WebSocket建房/加入/邀请/退出、来源校验、容量上限、房主权限、断线30秒保留原真人席位并自动重连与大厅销毁实例。竞速8小时寿命使用可控时钟和缩短计时器验证，不声称人工等待8小时。本机双客户端验证不能替代真实公网网络质量验收。
