# 在线服务部署与回滚

公开大厅：https://lslzqco.cn/ai-game-lab/
游戏：https://lslzqco.cn/ai-game-lab/games/apex-rush/?online=1

## 生产规则

最多3个同时存在的房间；每房间2/4/8/16席，空位由AI补齐。房间从创建时开始计时，8小时到期后通知所有车手并关闭连接；重开比赛不改变时间。最后一位真人离开则提前释放。房间只保存在内存，服务重启不会恢复房间。

比赛服务只监听127.0.0.1:8790，对外复用Nginx的HTTPS 443，不额外开放端口，不增加云资源。服务通过systemd开机启动并在异常退出后恢复；内存上限384MB，CPU限额单核50%。

## 本地开服

Node.js 20+，先运行 npm ci，再运行 npm start。Windows也可以双击「启动局域网服务.cmd」。好友直接输入 http://主机IP:8790 。本地默认最多8房间，在线生产配置固定为3房间与8小时。

## 首次生产安装

部署目录：/home/resume-deploy/ai-game-lab/releases/<release-id>
当前版本：/home/resume-deploy/ai-game-lab/current
运行服务：ai-game-lab-racing.service
反向代理：/etc/nginx/sites-available/domain-routing 中独立 /ai-game-lab/ 路径

准备的 release.tgz 包含实验室静态页面、赛车代码、ws依赖、8小时生产配置及release.json；没有凭据。上传到 /home/resume-deploy/ai-game-lab-upload/<release-id>/release.tgz ，同目录放 install.sh，然后用已有管理入口运行 bash install.sh <release-id>。安装脚本仅首次安装修改Nginx并保存备份，验证失败则还原。

已有Node运行时复制到 /home/resume-deploy/ai-game-lab/runtime/node，之后发布不依赖其他项目的运行时路径。

## 后续更新与回滚

新包解压到新的 releases/<release-id>，检查配置与SHA后更新 current 符号链接并重启服务。更新会中断现有房间，应选无房间时操作。

回滚：将 current 指回上一个已验证的release目录，执行 systemctl restart ai-game-lab-racing ，再检查公开大厅、 /ai-game-lab/api/racing/health 和邀请链接。首次安装撤回还可恢复保存的Nginx备份并运行 nginx -t、systemctl reload nginx。保留旧版目录，不删除其他应用。

## 验收

必须验证公开HTTPS页面、游戏资源、真实WebSocket建房/加入/发车、3间上限和8小时配置。8小时寿命由可控时钟边界测试和缩短测试计时器验证，不声称人工等待8小时。公网试玩使用真实浏览器按键。

## Transport Ship

Public FPS: https://lslzqco.cn/ai-game-lab/games/freight-fire/

Standalone source: https://github.com/LanShiLiang/freight-fire . The public static build supports local bot matches; LAN hosting remains available in the source project with npm run lan:fps. Both scope levels now use 70% of their former magnification. Release copies use data-static=true without changing local LAN behavior.
