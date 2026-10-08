#!/usr/bin/env bash
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Use the existing administrator session."; exit 1; }
release_id="${1:-}"
[[ "$release_id" =~ ^[0-9]{8}-[0-9]{6}$ ]] || { echo "Invalid release id"; exit 1; }
upload="/home/resume-deploy/ai-game-lab-upload/$release_id"
base=/home/resume-deploy/ai-game-lab
release="$base/releases/$release_id"
nginx_file=/etc/nginx/sites-available/domain-routing
backup="$upload/domain-routing.before"
service_file=/etc/systemd/system/ai-game-lab-racing.service
[ -f "$upload/release.tgz" ]
[ ! -e "$release" ] || { echo "Release already exists; inspect before retrying."; exit 1; }
[ ! -e "$service_file" ] || { echo "Initial installer only; existing service needs normal release update."; exit 1; }
[ -f "$nginx_file" ]
cp -a "$nginx_file" "$backup"
previous=$(readlink "$base/current" 2>/dev/null || true)
rollback() {
  echo "Install failed; restoring prior routing and stopping the new service."
  systemctl disable --now ai-game-lab-racing 2>/dev/null || true
  if [ -f "$service_file" ]; then mv "$service_file" "$upload/service.failed"; systemctl daemon-reload; fi
  cp -a "$backup" "$nginx_file"
  nginx -t && systemctl reload nginx
  if [ -n "$previous" ]; then ln -sfn "$previous" "$base/current"; fi
}
trap rollback ERR
install -d -m 0755 -o resume-deploy -g resume-deploy "$base" "$base/releases" "$base/runtime" "$release"
tar -xzf "$upload/release.tgz" -C "$release" --no-same-owner
chown -R resume-deploy:resume-deploy "$release"
install -m 0755 -o resume-deploy -g resume-deploy /home/resume-deploy/chilun/runtime/node-v24.21.0-linux-x64/bin/node "$base/runtime/node"
"$base/runtime/node" --check "$release/scripts/racing-server.mjs"
"$base/runtime/node" --check "$release/scripts/fps-server.mjs"
"$base/runtime/node" --input-type=module -e "import fs from 'node:fs';const p=JSON.parse(fs.readFileSync(process.argv[1]));if(p.maxRooms!==3||p.roomTtlMs!==28800000||p.host!=='127.0.0.1'||!p.online)throw Error('Bad production policy');" "$release/racing-online.config.json"
ln -sfn "$release" "$base/current"
cat > "$service_file" <<'SERVICE'
[Unit]
Description=AI Game Lab online rooms (racing and FPS)
After=network.target
[Service]
Type=simple
User=resume-deploy
Group=resume-deploy
WorkingDirectory=/home/resume-deploy/ai-game-lab/current
ExecStart=/home/resume-deploy/ai-game-lab/runtime/node scripts/racing-server.mjs
Environment=NODE_ENV=production
Restart=always
RestartSec=3
TimeoutStopSec=15
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
CapabilityBoundingSet=
MemoryMax=384M
CPUQuota=50%
TasksMax=64
LimitNOFILE=4096
[Install]
WantedBy=multi-user.target
SERVICE
python3 - "$nginx_file" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]);text=p.read_text()
if 'location ^~ /ai-game-lab/' in text: raise SystemExit('Route already exists; inspect before changing it')
marker='    location = /resume {'
if text.count(marker)!=1: raise SystemExit('Expected resume marker is not unique; routing left untouched')
block='''    location = /ai-game-lab { return 308 /ai-game-lab/; }
    location ^~ /ai-game-lab/ {
        proxy_pass http://127.0.0.1:8790/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 70s;
        proxy_send_timeout 70s;
    }

'''
p.write_text(text.replace(marker,block+marker))
PY
nginx -t
systemctl daemon-reload
systemctl enable --now ai-game-lab-racing
for attempt in 1 2 3 4 5; do if curl -fsS http://127.0.0.1:8790/api/racing/health > "$upload/health.json"; then break; fi; sleep 1; done
"$base/runtime/node" --input-type=module -e "import fs from 'node:fs';const p=JSON.parse(fs.readFileSync(process.argv[1]));if(!p.ok||p.maxRooms!==3||p.roomTtlMs!==28800000||!p.online)throw Error('Bad health');" "$upload/health.json"
systemctl reload nginx
curl -fsS https://lslzqco.cn/ai-game-lab/api/racing/health
trap - ERR
echo "AI_GAME_LAB_DEPLOYED $release_id"
