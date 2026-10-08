import {racingServiceBase,remainingTime} from './config.js';
export function createOnlineLobby({join,notice,isMenu}){
 const $=s=>document.querySelector(s);
 let active=false,timer,epoch=0,busy=false,maxRooms=3,serverOffset=0;
 const endpoint=name=>new URL('api/racing/'+name,racingServiceBase(location.href)).href;
 const setAvailable=ready=>{ $('#app').classList.toggle('rooms-unavailable',!ready);$('#online-connected').hidden=!ready;$('#online-warning').hidden=ready;$('#create-room').disabled=!ready;$('#join-room').disabled=!ready; };
 setAvailable(false);$('#refresh-rooms').onclick=()=>refresh();
 function showRooms(rooms){
  $('#create-room').disabled=rooms.length>=maxRooms;const list=$('#online-room-list');list.replaceChildren();
  $('#rooms-summary').textContent='在线房间 '+rooms.length+' / '+maxRooms+' · 创建满8小时自动关闭';
  for(const room of rooms){const row=document.createElement('div');row.className='online-room-row';const info=document.createElement('span'),title=document.createElement('strong'),meta=document.createElement('small');title.textContent=room.hostName+'的房间';meta.textContent=(room.track==='city'?'十一城':'滨海沙滩')+' · '+(room.mode==='team'?'红蓝组队':'个人竞速')+' · '+room.humanCount+'/'+room.count+' 真人 · '+({grid:'等待发车',countdown:'准备发车',racing:'比赛中',ended:'已结束'}[room.status]||'等待')+' · 剩余 '+remainingTime(room.expiresAt,Date.now()+serverOffset);info.append(title,meta);const button=document.createElement('button');button.textContent=room.humanCount>=room.count?'已满':'加入';button.disabled=room.humanCount>=room.count;button.onclick=()=>join(room.roomId);row.append(info,button);list.append(row);}
 }
 async function refresh(){if(!active||!isMenu()||busy)return;busy=true;const current=epoch;try{const response=await fetch(endpoint('rooms'),{cache:'no-store',signal:AbortSignal.timeout(3000)});if(!response.ok)throw Error();const data=await response.json();if(current!==epoch||!active)return;maxRooms=data.maxRooms||maxRooms;serverOffset=(data.serverNow||Date.now())-Date.now();showRooms(data.rooms);}catch{if(active&&current===epoch)$('#rooms-summary').textContent='在线服务暂时无法访问，请稍后刷新。';}finally{busy=false;}}
 async function open(){active=true;const current=++epoch;clearInterval(timer);$('#app').classList.add('online-mode');setAvailable(false);$('#online-warning').textContent='正在连接在线房间…';try{const response=await fetch(endpoint('health'),{cache:'no-store',signal:AbortSignal.timeout(3000)});if(!response.ok)throw Error();const health=await response.json();if(health.protocol!==1||!health.ok||health.online!==true)throw Error();if(current!==epoch||!active||!isMenu())return;maxRooms=health.maxRooms||3;serverOffset=(health.serverNow||Date.now())-Date.now();setAvailable(true);$('#online-status').textContent='在线服务已连接 · 最多3间 · 每间8小时 · 最多16人';await refresh();if(active&&current===epoch)timer=setInterval(refresh,3000);}catch{if(active&&current===epoch){setAvailable(false);$('#online-warning').textContent='在线服务暂时无法访问，请稍后重试。人机模式仍可游玩。';}}}
 function stop(){active=false;epoch++;clearInterval(timer);}
 return {setActive(value){stop();$('#app').classList.toggle('online-mode',Boolean(value));if(value)open();},stop};
}
