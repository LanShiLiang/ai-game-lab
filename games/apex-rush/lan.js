import {racingServiceBase,remainingTime} from './config.js';
export function isLanHost(host) {
 if(host==='localhost')return true;
 if(!/^\d+\.\d+\.\d+\.\d+$/.test(host))return false;
 const a=host.split('.').map(Number);
 if(a.some(n=>n>255)||host.split('.').some(n=>String(Number(n))!==n))return false;
 return a[0]===10||a[0]===127||a[0]===192&&a[1]===168||a[0]===172&&a[1]>=16&&a[1]<=31;
}
export function lanHostUrl(value) {
 const text=value.trim().replace(/^http:\/\//i,'').replace(/\/(?:games\/apex-rush\/?)?$/,'');
 const match=/^(localhost|\d+\.\d+\.\d+\.\d+)(?::(\d+))?$/.exec(text);
 if(!match||!isLanHost(match[1]))throw Error('请输入主机的内网 IPv4，例如 192.168.1.23:8790');
 const port=Number(match[2]||8790);
 if(port<1||port>65535)throw Error('端口应在 1–65535 之间');
 return 'http://'+match[1]+':'+port+'/games/apex-rush/?lan=1';
}
export function createLanLobby({join,notice,isMenu}) {
 const $=s=>document.querySelector(s);
 let active=false,timer,epoch=0,busy=false,online=false,maxRooms=8,serverOffset=0;
 const endpoint=name=>new URL('api/racing/'+name,racingServiceBase(location.href)).href;
 const setAvailable=ready=>{
  $('#app').classList.toggle('lan-remote',!ready);
  $('#lan-deploy').hidden=ready||online;$('#lan-connected').hidden=!ready;$('#online-warning').hidden=!online||ready;
  $('#create-room').disabled=!ready;$('#join-room').disabled=!ready;
 };
 setAvailable(false);
 $('#host-connect').onsubmit=e=>{
  e.preventDefault();
  try{const url=lanHostUrl($('#host-ip').value);location.assign(url);}catch(err){notice(err.message);$('#host-ip').focus();}
 };
 $('#refresh-rooms').onclick=()=>refresh();
 $('#copy-host-ip').onclick=async()=>{
  const value=$('#host-addresses').value;
  try{await navigator.clipboard.writeText(value);notice('主机地址已复制。好友在浏览器打开即可。');}
  catch{$('#host-copy-fallback').hidden=false;$('#host-copy-fallback').value=value;$('#host-copy-fallback').select();notice('地址已选中，请复制后发给好友。');}
 };
 function showRooms(rooms) {
  $('#create-room').disabled=rooms.length>=maxRooms;
  const list=$('#lan-room-list');list.replaceChildren();
  $('#rooms-summary').textContent=online?'在线房间 '+rooms.length+' / '+maxRooms+' · 创建满8小时自动关闭':rooms.length?'已有 '+rooms.length+' 个房间':'还没有房间，可以在下方创建。';
  for(const room of rooms){
   const row=document.createElement('div');row.className='lan-room-row';
   const info=document.createElement('span'),title=document.createElement('strong'),meta=document.createElement('small');
   title.textContent=room.hostName+'的房间';
   meta.textContent=(room.track==='city'?'十一城':'滨海沙滩')+' · '+(room.mode==='team'?'红蓝组队':'个人竞速')+' · '+room.humanCount+'/'+room.count+' 真人 · '+({grid:'等待发车',countdown:'准备发车',racing:'比赛中',ended:'已结束'}[room.status]||'等待')+(online?' · 剩余 '+remainingTime(room.expiresAt,Date.now()+serverOffset):'');
   info.append(title,meta);
   const button=document.createElement('button');button.textContent=room.humanCount>=room.count?'已满':'加入';
   button.disabled=room.humanCount>=room.count;button.onclick=()=>join(room.roomId);
   row.append(info,button);list.append(row);
  }
 }
 async function refresh(){
  if(!active||!isMenu()||busy||(!online&&!isLanHost(location.hostname)))return;
  busy=true;const current=epoch;
  try{
   const response=await fetch(endpoint('rooms'),{cache:'no-store',signal:AbortSignal.timeout(3000)});
   if(!response.ok)throw Error();const data=await response.json();
   if(current!==epoch||!active)return;
   maxRooms=data.maxRooms||maxRooms;serverOffset=(data.serverNow||Date.now())-Date.now();showRooms(data.rooms);
  }catch{if(active&&current===epoch){$('#rooms-summary').textContent=online?'在线服务暂时无法访问，请稍后刷新。':'主机连接已断开，请确认开服窗口仍在运行。';}}
  finally{busy=false;}
 }
 async function open(){
  active=true;const current=++epoch;clearInterval(timer);
  $('#app').classList.add('lan-mode');setAvailable(false);
  if(!online&&!isLanHost(location.hostname))return;
  $('#lan-deploy-status').textContent='正在连接本机服务…';$('#online-warning').textContent='正在连接在线房间…';
  try{
   const response=await fetch(endpoint('health'),{cache:'no-store',signal:AbortSignal.timeout(3000)});
   if(!response.ok)throw Error();const health=await response.json();
   if(health.protocol!==1||!health.ok)throw Error();
   if(current!==epoch||!active||!isMenu())return;
   maxRooms=health.maxRooms||8;serverOffset=(health.serverNow||Date.now())-Date.now();setAvailable(true);
   $('#lan-status').textContent=online?'在线服务已连接 · 最多3间 · 每间8小时 · 最多16人':'主机已连接 · 最多 16 人 · AI 自动补位';
   const addresses=location.hostname==='localhost'||location.hostname.startsWith('127.')?health.addresses:[location.hostname,...health.addresses];
   const select=$('#host-addresses');select.replaceChildren();
   for(const host of [...new Set(addresses.length?addresses:[location.hostname])]){
    const option=document.createElement('option');option.value='http://'+host+':'+health.port+'/';option.textContent=host+':'+health.port;select.append(option);
   }
   await refresh();if(active&&current===epoch)timer=setInterval(refresh,3000);
  }catch{if(active&&current===epoch){setAvailable(false);$('#lan-deploy-status').textContent='此页面未连接开服服务，请按下方步骤启动。';$('#online-warning').textContent='在线服务暂时无法访问，请稍后重新选择在线房间。人机模式仍可游玩。';}}
 }
 function stop(){active=false;epoch++;clearInterval(timer);}
 return {setActive(value){stop();online=value==='online';$('#app').classList.toggle('online-mode',online);if(value)open();else $('#app').classList.remove('lan-mode');},stop};
}
