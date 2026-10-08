#!/usr/bin/env bash
set -Eeuo pipefail
[ "$(id -un)" = resume-deploy ]
release_id="${1:-}"
[[ "$release_id" =~ ^[0-9]{8}-[0-9]{6}$ ]]
base=/home/resume-deploy/ai-game-lab
upload="/home/resume-deploy/ai-game-lab-upload/$release_id"
release="$base/releases/$release_id"
service=ai-game-lab-racing.service
previous=$(readlink -f "$base/current")
[[ "$previous" == "$base/releases/"* ]]
[ -d "$previous" ] && [ ! -e "$release" ]
[ "$(systemctl show "$service" -p User --value)" = resume-deploy ]
[ "$(systemctl show "$service" -p Restart --value)" = always ]
check_rooms(){ "$base/runtime/node" --input-type=module -e 'const h=await(await fetch("http://127.0.0.1:8790/api/racing/health",{signal:AbortSignal.timeout(5000)})).json();if(!h.ok||h.rooms!==0)throw Error("Active racing rooms or unhealthy service; postpone update");const r=await fetch("http://127.0.0.1:8790/api/fps/health",{signal:AbortSignal.timeout(5000)});if(r.status!==404){const f=await r.json();if(!r.ok||!f.ok||f.rooms!==0)throw Error("Active FPS rooms or unhealthy service; postpone update");}'; }
owned_pid(){
  local pid
  pid=$(systemctl show "$service" -p MainPID --value)
  [[ "$pid" =~ ^[1-9][0-9]*$ ]]
  [ "$(ps -p "$pid" -o uid= | tr -d ' ')" = "$(id -u)" ]
  [ "$(readlink -f "/proc/$pid/exe")" = "$(readlink -f "$base/runtime/node")" ]
  [[ "$(readlink -f "/proc/$pid/cwd")" == "$base/releases/"* ]]
  printf '%s' "$pid"
}
switch_link(){
  local destination="$1" suffix="$2" pending="$base/.current-$release_id-$2"
  [[ "$destination" == "$base/releases/"* ]] && [ -d "$destination" ]
  [ ! -e "$pending" ] && [ ! -L "$pending" ]
  ln -s "$destination" "$pending"
  mv -Tf "$pending" "$base/current"
}
restart_owned(){
  local pid current_pid
  pid=$(owned_pid)
  kill -TERM "$pid"
  for attempt in $(seq 1 15); do
    current_pid=$(systemctl show "$service" -p MainPID --value)
    if [[ "$current_pid" =~ ^[1-9][0-9]*$ ]] && [ "$current_pid" != "$pid" ] && curl --connect-timeout 2 --max-time 3 -fsS http://127.0.0.1:8790/api/racing/health > "$upload/health.json"; then return 0; fi
    sleep 1
  done
  return 1
}
rollback(){
  trap - ERR
  switch_link "$previous" rollback
  for attempt in $(seq 1 15); do
    if pid=$(owned_pid); then
      if [ "$(readlink -f "/proc/$pid/cwd")" = "$previous" ] && curl --connect-timeout 2 --max-time 3 -fsS http://127.0.0.1:8790/api/racing/health > "$upload/rollback-health.json"; then echo UPDATE_ROLLED_BACK; return 0; fi
      kill -TERM "$pid" || true
    fi
    sleep 1
  done
  echo ROLLBACK_LINK_RESTORED_SERVICE_REQUIRES_RECOVERY
  return 1
}
check_rooms
owned_pid > /dev/null
mkdir -m 0755 "$release"
cp -a "$previous/." "$release/"
tar -xzf "$upload/release.tgz" -C "$release" --no-same-owner
while IFS= read -r stale; do
  [ -z "$stale" ] && continue
  [[ "$stale" != /* && "$stale" != *..* && "$stale" != *\\* && "$stale" == *.gz ]]
  rm -f -- "$release/$stale"
done < "$release/STALE_GZIP.txt"
(cd "$release" && sha256sum -c SHA256SUMS.txt > "$upload/checksums.txt")
"$base/runtime/node" --check "$release/scripts/racing-server.mjs"
"$base/runtime/node" --input-type=module -e 'import fs from "node:fs";const c=JSON.parse(fs.readFileSync(process.argv[1]));if(c.host!=="127.0.0.1"||c.maxRooms!==3||c.roomTtlMs!==28800000||!c.online||!c.serveLab)throw Error("Bad online policy");' "$release/racing-online.config.json"
"$base/runtime/node" --check "$release/scripts/fps-server.mjs"
if [ -f "$release/RETIRED_FILES.txt" ]; then
  while IFS= read -r retired; do
    case "$retired" in games/apex-rush/lan.js|scripts/lan-server.mjs|tests/racing-lan.test.mjs|start-racing-lan.cmd|start-racing-lan.sh|racing-server.config.json) rm -f -- "$release/$retired";; *) exit 1;; esac
  done < "$release/RETIRED_FILES.txt"
fi
check_rooms
trap rollback ERR
switch_link "$release" next
restart_owned
"$base/runtime/node" --input-type=module -e 'import fs from "node:fs";const h=JSON.parse(fs.readFileSync(process.argv[1]));if(!h.ok||h.maxRooms!==3||h.roomTtlMs!==28800000)throw Error("Bad health");' "$upload/health.json"
verified_pid=$(owned_pid)
[ "$(readlink -f "/proc/$verified_pid/cwd")" = "$release" ]
curl --connect-timeout 3 --max-time 20 -fsS https://lslzqco.cn/ai-game-lab/src/release.json > "$upload/public-release.json"
"$base/runtime/node" --input-type=module -e 'import fs from "node:fs";if(JSON.parse(fs.readFileSync(process.argv[1])).id!==process.argv[2])throw Error("Public release mismatch");' "$upload/public-release.json" "$release_id"
curl --connect-timeout 3 --max-time 20 -fsS https://lslzqco.cn/ai-game-lab/ > "$upload/hall.html"
grep -q 'submission-receiver' "$upload/hall.html"
curl --connect-timeout 3 --max-time 20 -fsS https://lslzqco.cn/ai-game-lab/games/freight-fire/ > "$upload/freight.html"
grep -q 'data-mode="online"' "$upload/freight.html"
curl --connect-timeout 3 --max-time 20 -fsS https://lslzqco.cn/ai-game-lab/api/fps/health > "$upload/fps-health.json"
"$base/runtime/node" --input-type=module -e 'import fs from "node:fs";const h=JSON.parse(fs.readFileSync(process.argv[1]));if(!h.ok||!h.online)throw Error("Bad FPS health");' "$upload/fps-health.json"
trap - ERR
echo "AI_GAME_LAB_UPDATED $release_id"
