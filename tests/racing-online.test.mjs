import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {WebSocket} from 'ws';
import {startRacingServer,ONLINE_ROOM_LIMIT,ROOM_LIFETIME_MS} from '../scripts/racing-server.mjs';
import {racingServiceBase,remainingTime} from '../games/apex-rush/config.js';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function client(base){const s=new WebSocket(base.replace('http:','ws:')+'/racing',{origin:base}),messages=[];s.on('message',raw=>messages.push(JSON.parse(raw)));await new Promise((r,j)=>{s.once('open',r);s.once('error',j);});return {s,send:m=>s.send(JSON.stringify(m)),next:async type=>{for(let i=0;i<100;i++){const j=messages.findIndex(m=>m.type===type);if(j>=0)return messages.splice(j,1)[0];await wait(10);}throw Error('Missing '+type);}};}
test('online policy: exactly three rooms; 8h deadline fixed across starts/restarts; expiry closes clients and frees capacity',async()=>{
 let clock=1800000000000;const app=await startRacingServer({port:0,host:'127.0.0.1',maxRooms:8,online:true,now:()=>clock,publicBaseURL:'https://lslzqco.cn/ai-game-lab/'}),base='http://127.0.0.1:'+app.server.address().port,clients=[];
 try{
  for(let i=0;i<4;i++)clients.push(await client(base));
  for(let i=0;i<3;i++){clients[i].send({type:'create',name:'Host '+i,count:16});const m=await clients[i].next('joined');assert.equal(m.expiresAt-m.createdAt,ROOM_LIFETIME_MS);assert.equal(m.invites[0],'https://lslzqco.cn/ai-game-lab/games/apex-rush/?online=1&room='+m.roomId);}
  const health=await(await fetch(base+'/api/racing/health')).json();assert.equal(health.maxRooms,ONLINE_ROOM_LIMIT);assert.equal(health.roomTtlMs,28800000);assert.equal(health.rooms,3);assert.deepEqual(health.addresses,[]);
  clients[3].send({type:'create'});assert.match((await clients[3].next('error')).message,/3间/);assert.equal(app.rooms.size,3);
  const room=[...app.rooms.values()][0],deadline=room.expiresAt;clients[0].send({type:'start'});await wait(25);clock+=1000;clients[0].send({type:'restart'});await wait(25);assert.equal(room.expiresAt,deadline);assert.equal(room.createdAt,1800000000000);
  clock=deadline-1;assert.equal((await(await fetch(base+'/api/racing/rooms')).json()).rooms.length,3);
  clock=deadline;const close=new Promise(r=>clients[0].s.once('close',code=>r(code)));assert.equal((await(await fetch(base+'/api/racing/rooms')).json()).rooms.length,0);assert.match((await clients[0].next('room-expired')).message,/8小时/);assert.equal(await close,4001);
  clients[3].send({type:'join',roomId:room.id});assert.match((await clients[3].next('error')).message,/不存在/);
  clients[3].send({type:'create'});await clients[3].next('joined');assert.equal(app.rooms.size,1);
 }finally{for(const c of clients)c.s.terminate();await app.close();}
});
test('real timer destroys an idle online room without a request or player action',async()=>{
 const app=await startRacingServer({port:0,host:'127.0.0.1',online:true,roomTtlMs:180}),base='http://127.0.0.1:'+app.server.address().port;let c;
 try{c=await client(base);c.send({type:'create'});const m=await c.next('joined');assert.equal(m.expiresAt-m.createdAt,180);await c.next('room-expired');assert.equal(app.rooms.size,0);}finally{c?.s.terminate();await app.close();}
});
test('prefix-safe endpoint and countdown',()=>{
 assert.equal(racingServiceBase('https://lslzqco.cn/ai-game-lab/games/apex-rush/index.html?online=1').href,'https://lslzqco.cn/ai-game-lab/');
 assert.equal(racingServiceBase('http://192.168.1.2:8790/games/apex-rush/').href,'http://192.168.1.2:8790/');
 assert.equal(racingServiceBase('https://demo.chatgpt.site/game.js').href,'https://demo.chatgpt.site/');
 assert.equal(remainingTime(28800000,0),'08:00:00');assert.equal(remainingTime(123,124),'00:00:00');
});
test('lab static serving preserves private-file boundary',async()=>{const app=await startRacingServer({port:0,host:'127.0.0.1',online:true,serveLab:true}),base='http://127.0.0.1:'+app.server.address().port;try{assert.equal((await fetch(base+'/')).status,200);assert.equal((await fetch(base+'/games/orbit-dash/')).status,200);for(const p of ['/package.json','/racing-online.config.json','/scripts/racing-server.mjs','/.git/config','/games/apex-rush/%2e%2e/%2e%2e/.env'])assert.equal((await fetch(base+p)).status,404);}finally{await app.close();}});
test('lab serves FPS models, textures and audio without exposing server files',async()=>{
 const app=await startRacingServer({port:0,host:'127.0.0.1',online:true,serveLab:true}),base='http://127.0.0.1:'+app.server.address().port;
 try{
  for(const [file,mime] of [['index.html','text/html'],['assets/viewmodel-cs2/m4a1-golden-coil.glb','model/gltf-binary'],['assets/viewmodel-cs2/ak47-fire-serpent.webp','image/webp'],['assets/audio/cs2/ak47_01.mp3','audio/mpeg'],['assets/viewmodel-cs2/SOURCES.md','text/plain'],['vendor/LICENSE','text/plain']]){
   const response=await fetch(base+'/games/freight-fire/'+file);assert.equal(response.status,200,file);assert.ok(response.headers.get('content-type').startsWith(mime),file);assert.ok((await response.arrayBuffer()).byteLength>0);
  }
  for(const file of ['/scripts/lan-server.mjs','/games/freight-fire/.env','/games/freight-fire/../../package.json'])assert.equal((await fetch(base+file)).status,404);
 }finally{await app.close();}
});
test('precompressed static assets preserve original type and identity fallback',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'lab-static-')),source='export const greeting="运输船";\n'.repeat(200);
 await mkdir(path.join(root,'games/freight-fire'),{recursive:true});await writeFile(path.join(root,'games/freight-fire/game.js'),source);await writeFile(path.join(root,'games/freight-fire/game.js.gz'),gzipSync(source));
 const app=await startRacingServer({root,port:0,host:'127.0.0.1',serveLab:true}),base='http://127.0.0.1:'+app.server.address().port;
 try{
  const compressed=await fetch(base+'/games/freight-fire/game.js',{headers:{'accept-encoding':'gzip'}});assert.equal(compressed.status,200);assert.equal(compressed.headers.get('content-encoding'),'gzip');assert.equal(compressed.headers.get('content-type'),'text/javascript; charset=utf-8');assert.equal(await compressed.text(),source);
  const plain=await fetch(base+'/games/freight-fire/game.js',{headers:{'accept-encoding':'gzip;q=0, identity'}});assert.equal(plain.headers.get('content-encoding'),null);assert.equal(await plain.text(),source);assert.equal((await fetch(base+'/games/freight-fire/game.js.gz')).status,404);
 }finally{await app.close();assert.equal(path.dirname(path.resolve(root)),path.resolve(tmpdir()));assert.ok(path.basename(root).startsWith('lab-static-'));await rm(root,{recursive:true,force:true});}
});
