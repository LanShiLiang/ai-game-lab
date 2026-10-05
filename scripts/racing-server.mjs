import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile,stat,realpath} from 'node:fs/promises';
import {networkInterfaces} from 'node:os';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {WebSocketServer,WebSocket} from 'ws';
import {packSnapshot} from '../games/apex-rush/wire.js';
import {Race,sanitizeInput} from '../games/apex-rush/sim.js';
const rootDefault=fileURLToPath(new URL('../',import.meta.url)),entry='/games/apex-rush/';
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.glb':'model/gltf-binary','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav','.woff2':'font/woff2','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8','':'text/plain; charset=utf-8','.zip':'application/zip'};
export function lanAddresses(){return Object.values(networkInterfaces()).flat().filter(p=>p&&!p.internal&&p.family==='IPv4'&&/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(p.address)).map(p=>p.address);}
export function resolveRacingFile(root,url){
 let p;try{p=decodeURIComponent(url.split('?')[0]);}catch{return null;}if(p==='/'||p===entry.slice(0,-1))p=entry;
 if(!p.startsWith(entry)||/[\\\0]/.test(p)||p.split('/').some(s=>s.startsWith('.')&&s!==''))return null;
 if(p.endsWith('/'))p+='index.html';const f=path.resolve(root,'.'+p),rel=path.relative(root,f);return rel.startsWith('..')||path.isAbsolute(rel)||!MIME[path.extname(f)]?null:f;
}
export const ONLINE_ROOM_LIMIT=3,ROOM_LIFETIME_MS=8*60*60*1000;
export async function startRacingServer({port=8790,host='0.0.0.0',root=rootDefault,maxRooms=8,online=false,serveLab=false,publicBaseURL='',roomTtlMs=ROOM_LIFETIME_MS,now=Date.now}={}){
 if(!Number.isInteger(maxRooms)||maxRooms<1||maxRooms>8)throw Error('Invalid room limit');
 if(!Number.isFinite(roomTtlMs)||roomTtlMs<=0||roomTtlMs>ROOM_LIFETIME_MS)throw Error('Room lifetime cannot exceed 8 hours');
 if(online)maxRooms=Math.min(maxRooms,ONLINE_ROOM_LIMIT);
 if(publicBaseURL){const u=new URL(publicBaseURL);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('Invalid public URL');publicBaseURL=u.href.replace(/\/$/,'');}
 const base=await realpath(root),rooms=new Map(),staticValidators=new Map();let actualPort=port,closed=false,serverStep=0;
 const send=(s,p)=>{if(s.readyState===WebSocket.OPEN&&s.bufferedAmount<150000)s.send(JSON.stringify(p));},fail=(s,message)=>send(s,{type:'error',message});
 const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
 const resolveFile=url=>{if(!serveLab)return resolveRacingFile(base,url);let p;try{p=decodeURIComponent(url.split('?')[0]);}catch{return null;}if(p==='/')p='/index.html';if(p.endsWith('/'))p+='index.html';if(/[\\\0]/.test(p)||p.split('/').some(s=>s.startsWith('.')&&s!==''))return null;if(!['/index.html','/games.json','/LICENSE','/THIRD_PARTY_NOTICES.md'].includes(p)&&!['/src/','/games/apex-rush/','/games/orbit-dash/','/games/freight-fire/','/licenses/'].some(prefix=>p.startsWith(prefix)))return null;const f=path.resolve(base,'.'+p),rel=path.relative(base,f);return rel.startsWith('..')||path.isAbsolute(rel)||!MIME[path.extname(f)]?null:f;};
 const expireRooms=()=>{const stamp=now();for(const r of rooms.values())if(stamp>=r.expiresAt){rooms.delete(r.id);for(const s of r.members.values()){s.roomId=null;send(s,{type:'room-expired',message:'房间创建已满8小时，现已自动关闭。请重新创建或加入其他房间。'});s.close(4001,'Room expired');}r.members.clear();}};
 const server=createServer(async(req,res)=>{expireRooms();if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  if((!serveLab&&req.url.split('?')[0]==='/')||req.url.split('?')[0]===entry.slice(0,-1)){res.writeHead(302,{Location:entry+(online?'?online=1':'?lan=1'),'Cache-Control':'no-store'});res.end();return;}
  if(req.url.split('?')[0]==='/api/racing/health'){json(res,200,{ok:true,protocol:1,version:'1.2.1',maxPlayers:16,maxRooms,roomTtlMs,snapshotHz:online?12:20,serverNow:now(),online,rooms:rooms.size,port:actualPort,addresses:online?[]:lanAddresses()});return;}
  if(req.url.split('?')[0]==='/api/racing/rooms'){json(res,200,{maxRooms,roomTtlMs,serverNow:now(),rooms:[...rooms.values()].map(r=>{const info=roomInfo(r);return {roomId:info.roomId,createdAt:r.createdAt,expiresAt:r.expiresAt,hostName:info.players.find(p=>p.id===info.hostId)?.name||'车手',track:info.track,mode:info.mode,laps:info.laps,humanCount:info.humanCount,count:info.count,status:info.status};})});return;}
  const f=resolveFile(req.url);if(!f){json(res,404,{error:'Not found'});return;}try{
   const r=await realpath(f),rel=path.relative(base,r),sourceStat=await stat(r);if(rel.startsWith('..')||path.isAbsolute(rel)||!resolveFile('/'+rel.split(path.sep).join('/'))||!sourceStat.isFile())throw Error();
   let file=r,fileStat=sourceStat,encoding=null;const gzip=/(?:^|,)\s*gzip(?:\s*;\s*q=([\d.]+))?\s*(?:,|$)/i.exec(req.headers['accept-encoding']||'');
   // Optional precompressed release files save bandwidth without per-request compression.
   if(gzip&&Number(gzip[1]??1)>0){try{const packed=await realpath(r+'.gz'),packedStat=await stat(packed);if(packed===r+'.gz'&&packedStat.isFile()){file=packed;fileStat=packedStat;encoding='gzip';}}catch{}}
   // Revalidate each request so a new release is immediately visible, while a
   // refresh of the same release can reuse its large models and audio files.
   // These weak validators use file metadata; no model is read or hashed for
   // HEAD/304. Each encoded representation has its own validator.
   const version=[sourceStat.size,sourceStat.mtimeMs,sourceStat.ino,fileStat.size,fileStat.mtimeMs,fileStat.ino,encoding||'identity'].join(':');
   let cached=staticValidators.get(file);
   if(cached?.version!==version){const modified=Math.max(sourceStat.mtimeMs,fileStat.mtimeMs);cached={version,etag:'W/"'+[sourceStat.size,sourceStat.mtimeMs,sourceStat.ino,fileStat.size,fileStat.mtimeMs,fileStat.ino].map(n=>n.toString(16)).join('-')+'-'+(encoding?'gz':'id')+'"',modified:Math.floor(modified/1000)*1000,lastModified:new Date(modified).toUTCString()};staticValidators.set(file,cached);}
   const headers={'Content-Type':MIME[path.extname(r)],'Cache-Control':'no-cache','Vary':'Accept-Encoding','ETag':cached.etag,'Last-Modified':cached.lastModified,...(encoding?{'Content-Encoding':encoding}:{}),'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
   const ifNoneMatch=req.headers['if-none-match'],ifModifiedSince=req.headers['if-modified-since'];
   // If-None-Match takes precedence over a date validator, including when its
   // value does not match. GET/HEAD use the required weak comparison.
   const unchanged=ifNoneMatch!==undefined?String(ifNoneMatch).split(',').some(tag=>tag.trim()==='*'||tag.trim().replace(/^W\//,'')===cached.etag.replace(/^W\//,'')):ifModifiedSince!==undefined&&Number.isFinite(Date.parse(ifModifiedSince))&&Date.parse(ifModifiedSince)>=cached.modified;
   if(unchanged){res.writeHead(304,headers);res.end();return;}
   if(req.method==='HEAD'){res.writeHead(200,{...headers,'Content-Length':fileStat.size});res.end();return;}
   const b=await readFile(file);res.writeHead(200,{...headers,'Content-Length':b.length});res.end(b);
  }catch{json(res,404,{error:'Not found'});}
 });
 server.requestTimeout=10000;server.headersTimeout=10000;
 const wss=new WebSocketServer({noServer:true,maxPayload:2048,perMessageDeflate:online?{threshold:256,concurrencyLimit:2,zlibDeflateOptions:{level:3,memLevel:5},clientNoContextTakeover:true}:false});
 const roomInfo=r=>({type:'room',roomId:r.id,createdAt:r.createdAt,expiresAt:r.expiresAt,serverNow:now(),online,hostId:r.hostId,humanCount:r.members.size,count:r.race.count,track:r.race.track.id,mode:r.race.mode,laps:r.race.laps,status:r.race.status,players:r.race.snapshot().players.map(p=>({id:p.id,name:p.name,bot:p.bot,team:p.team,color:p.color}))});
 const broadcastInfo=r=>{for(const s of r.members.values())send(s,roomInfo(r));};
 const detach=s=>{const r=rooms.get(s.roomId);if(!r)return;r.race.removeHuman(s.playerId);r.members.delete(s.playerId);if(r.hostId===s.playerId)r.hostId=r.members.keys().next().value||null;if(!r.members.size)rooms.delete(r.id);else broadcastInfo(r);s.roomId=null;};
 const join=(s,r,msg)=>{if(s.roomId){fail(s,'请先离开当前房间');return;}const p=r.race.addHuman(msg.name,msg.color);if(!p){fail(s,'房间已满（最多16人）');return;}s.motionAck=online&&msg.motionAck===1;s.pendingFrames=[];s.lastSentStep=0;s.playerId=p.id;s.roomId=r.id;s.lastInput=Date.now();r.members.set(p.id,s);r.hostId||=p.id;const suffix=entry+'?'+(online?'online=1&':'')+'room='+r.id;send(s,{type:'joined',roomId:r.id,createdAt:r.createdAt,expiresAt:r.expiresAt,serverNow:now(),online,playerId:p.id,hostId:r.hostId,serverTime:serverStep/60,epoch:r.epoch,snapshot:r.race.snapshot(),invites:publicBaseURL?[publicBaseURL+suffix]:lanAddresses().map(a=>'http://'+a+':'+actualPort+suffix),local:publicBaseURL?publicBaseURL+suffix:'http://localhost:'+actualPort+suffix});broadcastInfo(r);};
 server.on('upgrade',(req,socket,head)=>{let ok=false;try{const url=new URL(req.url,'http://'+req.headers.host),origin=new URL(req.headers.origin);ok=url.pathname==='/racing'&&origin.host===req.headers.host&&['http:','https:'].includes(origin.protocol);}catch{}if(!ok||wss.clients.size>=(online?64:128)){socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');socket.destroy();return;}wss.handleUpgrade(req,socket,head,s=>wss.emit('connection',s,req));});
 wss.on('connection',s=>{s.isAlive=true;s.lastInput=Date.now();s.window=Date.now();s.messages=0;s.on('pong',()=>s.isAlive=true);
  s.on('message',raw=>{expireRooms();if(Date.now()-s.window>1000){s.window=Date.now();s.messages=0;}if(++s.messages>150){s.close(1008,'Too many messages');return;}let m;try{m=JSON.parse(raw);}catch{return fail(s,'请求格式无效');}if(!m||typeof m!=='object')return;
   const r=rooms.get(s.roomId);
   if(m.type==='create'){if(s.roomId)return fail(s,'已经在房间中');if(rooms.size>=maxRooms)return fail(s,'房间已达上限（'+maxRooms+'间），请加入现有房间或稍后再试');const id=randomBytes(9).toString('base64url'),race=new Race({track:m.track==='city'?'city':'beach',count:[2,4,8,16].includes(m.count)?m.count:8,mode:m.mode,laps:[1,2,3].includes(m.laps)?m.laps:2,difficulty:['easy','normal','hard'].includes(m.difficulty)?m.difficulty:'normal',assist:m.assist!==false});const createdAt=now(),room={id,race,hostId:null,members:new Map(),epoch:0,createdAt,expiresAt:createdAt+roomTtlMs};rooms.set(id,room);join(s,room,m);return;}
   if(m.type==='join'){const room=rooms.get(String(m.roomId));if(!room)return fail(s,'房间不存在或已关闭，请获取新的邀请');join(s,room,m);return;}
   if(!r)return fail(s,'尚未加入房间');
   if(m.type==='input'){r.race.setInput(s.playerId,sanitizeInput(m.input));s.lastInput=Date.now();}
   else if(m.type==='start'||m.type==='restart'){if(r.hostId!==s.playerId)return fail(s,'只有房主可以发车');if(m.type==='start'){if(r.race.status==='grid'){r.epoch++;r.race.start();}}else{r.epoch++;r.race.restart();}broadcastInfo(r);}
   else if(m.type==='ack'){if(s.motionAck&&Number.isInteger(m.step)&&m.step<=s.lastSentStep)s.pendingFrames=s.pendingFrames.filter(step=>step>m.step);}
   else if(m.type==='team'){if(r.race.status!=='grid')return fail(s,'比赛中不能换队');const p=r.race.players.find(p=>p.id===s.playerId),team=m.team===1?1:0;if(r.race.players.filter(p=>!p.bot&&p.team===team).length>=r.race.count/2)return fail(s,'该队已满');p.team=team;const humans=r.race.players.filter(p=>!p.bot),bots=r.race.players.filter(p=>p.bot);const needed=[r.race.count/2-humans.filter(p=>p.team===0).length,r.race.count/2-humans.filter(p=>p.team===1).length];for(const b of bots){const t=needed[0]>0?0:1;b.team=t;needed[t]--;}broadcastInfo(r);}
   else if(m.type==='leave')detach(s);
  });s.on('close',()=>detach(s));s.on('error',()=>{});
 });
 let previous=performance.now(),accumulator=0,snapshotTimer=0;
 const tick=setInterval(()=>{
  expireRooms();
  const now=performance.now(),elapsed=Math.min((now-previous)/1000,.15);previous=now;
  accumulator+=elapsed;snapshotTimer+=elapsed;
  while(accumulator>=1/60){
   for(const r of rooms.values()){
    for(const s of r.members.values())if(Date.now()-s.lastInput>700)r.race.setInput(s.playerId,{});
    r.race.tick(1/60);
   }
   serverStep++;accumulator-=1/60;
  }
  const period=1/(online?12:20);
  if(snapshotTimer>=period){
   snapshotTimer%=period;
   for(const r of rooms.values()){
    // Serialize once for the room, rather than rebuilding the entire race per viewer.
    const resting=['grid','ended'].includes(r.race.status);
    if(online&&resting&&r.lastRestStep!==undefined&&serverStep-r.lastRestStep<60)continue;
    if(resting)r.lastRestStep=serverStep;else r.lastRestStep=undefined;
    const snapshot=r.race.snapshot(),packet=JSON.stringify({type:'snapshot',serverTime:serverStep/60,step:serverStep,epoch:r.epoch,compact:online,snapshot:online?packSnapshot(snapshot):snapshot});
    for(const s of r.members.values())if(s.readyState===WebSocket.OPEN&&s.bufferedAmount<(online?12000:150000)&&(!s.motionAck||s.pendingFrames.length<3)){if(s.motionAck)s.pendingFrames.push(serverStep);s.lastSentStep=serverStep;s.send(packet);}
   }
  }
 },8);
 const heartbeat=setInterval(()=>{for(const s of wss.clients){if(!s.isAlive){s.terminate();continue;}s.isAlive=false;s.ping();}},15000);
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});}catch(e){clearInterval(tick);clearInterval(heartbeat);wss.close();throw e;}actualPort=server.address().port;
 return {server,rooms,wss,close:async()=>{if(closed)return;closed=true;clearInterval(tick);clearInterval(heartbeat);for(const s of wss.clients)s.terminate();await new Promise(r=>wss.close(r));await new Promise(r=>server.close(r));}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const a=process.argv.slice(2);
  let config={};try{config=JSON.parse(await readFile(path.join(rootDefault,'racing-server.config.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw Error('无法读取 racing-server.config.json，请检查 JSON 格式');}
  const pi=a.indexOf('--port'),port=Number(pi>=0?a[pi+1]:process.env.RACING_PORT||config.port||8790),host=config.host||'0.0.0.0',maxRooms=config.maxRooms??8;
  if(!Number.isInteger(port)||port<1||port>65535)throw Error('端口必须在1–65535之间');
  if(!['0.0.0.0','127.0.0.1'].includes(host))throw Error('host 配置应为 0.0.0.0（局域网）或 127.0.0.1（仅本机）');
  if(!Number.isInteger(maxRooms)||maxRooms<1||maxRooms>8)throw Error('maxRooms 必须在1–8之间');
  const roomTtlMs=config.roomTtlMs??ROOM_LIFETIME_MS;
  if(config.online&&roomTtlMs!==ROOM_LIFETIME_MS)throw Error('在线服务房间寿命必须是8小时');
  const app=await startRacingServer({port,host,maxRooms,online:config.online===true,serveLab:config.serveLab===true,publicBaseURL:config.publicBaseURL||'',roomTtlMs});
  console.log('\n逐浪竞速 / APEX 竞速服务 v1.2.1\n\n本机打开：http://localhost:'+port+'/\n好友在浏览器输入：\n'+(host==='127.0.0.1'?'当前配置仅本机访问，请将 host 改为 0.0.0.0 后重启。':lanAddresses().map(ip=>'  http://'+ip+':'+port+'/').join('\n')||'未发现内网 IPv4，请连接 Wi-Fi 或有线网络')+'\n\n打开页面即可创建或选择房间，无需输入房间码。\n最多16人，空位由AI自动补齐。\n保持此窗口运行；按 Ctrl+C 或关闭窗口停止服务。\n');
  if(a.includes('--open')){const url='http://localhost:'+port+'/?lan=1';if(process.platform==='win32')spawn('cmd.exe',['/d','/c','start','',url],{windowsHide:true,stdio:'ignore'}).unref();else spawn(process.platform==='darwin'?'open':'xdg-open',[url],{stdio:'ignore'}).on('error',()=>{}).unref();}
  for(const sig of ['SIGINT','SIGTERM'])process.on(sig,async()=>{await app.close();process.exit();});
 }catch(e){
  console.error(e.code==='EADDRINUSE'?'端口已被占用。请关闭其他开服窗口，或修改 racing-server.config.json 的 port 后重试。':e.message);
  process.exitCode=1;
 }
}
