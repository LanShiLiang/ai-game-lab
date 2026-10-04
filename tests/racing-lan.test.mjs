import test from 'node:test';
import assert from 'node:assert/strict';
import {lanHostUrl,isLanHost} from '../games/apex-rush/lan.js';
import {startRacingServer} from '../scripts/racing-server.mjs';
import {WebSocket} from 'ws';
test('IP entry accepts private IPv4 and validates ports without arbitrary URL navigation',()=>{
 for(const value of ['192.168.1.23','http://192.168.1.23:8790/','192.168.1.23:8790','http://192.168.1.23:8790/games/apex-rush/'])assert.equal(lanHostUrl(value),'http://192.168.1.23:8790/games/apex-rush/?lan=1');
 assert.equal(lanHostUrl('10.0.0.2:8791'),'http://10.0.0.2:8791/games/apex-rush/?lan=1');
 for(const host of ['localhost','127.0.0.1','172.16.0.1','172.31.255.254'])assert.ok(isLanHost(host));
 for(const value of ['https://192.168.1.23','javascript:alert(1)','8.8.8.8','192.168.1.999','192.168.001.2','192.168.1.1:0','192.168.1.1:65536','192.168.1.1@evil.example','172.32.0.1','192.168.1.1/path','<script>'])assert.throws(()=>lanHostUrl(value));
});
test('bare host IP opens local lobby and discovers joinable rooms',async()=>{
 const app=await startRacingServer({port:0,host:'127.0.0.1'}),base='http://127.0.0.1:'+app.server.address().port;
 let s;
 try{
  const redirect=await fetch(base+'/',{redirect:'manual'});assert.equal(redirect.status,302);assert.equal(redirect.headers.get('location'),'/games/apex-rush/?lan=1');
  assert.equal((await fetch(base+'/')).status,200);
  const health=await(await fetch(base+'/api/racing/health')).json();assert.equal(health.port,app.server.address().port);assert.ok(Array.isArray(health.addresses));
  assert.deepEqual((await(await fetch(base+'/api/racing/rooms')).json()).rooms,[]);
  s=new WebSocket(base.replace('http:','ws:')+'/racing',{origin:base});await new Promise((r,j)=>{s.once('open',r);s.once('error',j);});
  const joined=new Promise(r=>s.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='joined')r(m);}));
  s.send(JSON.stringify({type:'create',name:'IP Host',count:16,mode:'team',track:'city'}));const room=await joined;
  const listing=(await(await fetch(base+'/api/racing/rooms')).json()).rooms;assert.equal(listing.length,1);assert.equal(listing[0].roomId,room.roomId);assert.equal(listing[0].hostName,'IP Host');assert.equal(listing[0].count,16);assert.equal(listing[0].humanCount,1);assert.equal(listing[0].mode,'team');
  s.close();await new Promise(r=>s.once('close',r));for(let i=0;i<30&&(await(await fetch(base+'/api/racing/rooms')).json()).rooms.length;i++)await new Promise(r=>setTimeout(r,10));assert.equal((await(await fetch(base+'/api/racing/rooms')).json()).rooms.length,0);
 }finally{s?.terminate();await app.close();}
});
