import test from 'node:test';
import assert from 'node:assert/strict';
import {SnapshotStream} from '../games/apex-rush/sync.js';
import {angle} from '../games/apex-rush/tracks.js';
import {startRacingServer} from '../scripts/racing-server.mjs';
import {WebSocket} from 'ws';
const car=(x=0,yaw=0)=>({id:'car-1',x,y:.18,z:0,yaw,vx:35,vz:0,speed:35,steer:0,vy:0,roadVy:0,energy:0,driftTime:0,boostTime:0,miniTime:0,miniReady:0,collision:0,resets:0,airborne:false});
const snap=(p)=>({track:'beach',status:'racing',players:[p],time:0,count:2});
test('20Hz packets become uniform 60Hz motion without mutating authoritative state',()=>{
 const stream=new SnapshotStream();let seq=0,last=null,speeds=[];
 for(let frame=0;frame<240;frame++){
  const now=frame/60;
  while(seq/20<=now){const at=seq/20,p=car(at*35);stream.push(snap(p),at,0,at+.002);seq++;}
  const visual=stream.sample(now+.002);
  if(now>.4&&last)speeds.push((visual.players[0].x-last.x)*60);
  last=visual.players[0];
 }
 assert.ok(speeds.every(v=>Math.abs(v-35)<1e-8));
 assert.equal(stream.frames.at(-1).snapshot.players[0].x,(seq-1)/20*35);
 assert.ok(stream.frames.length<=64);
});
test('jitter and occasional lost snapshot preserve smooth movement and camera velocity inputs',()=>{
 const stream=new SnapshotStream(),packets=[];let previousArrival=0,index=0,last=null,speeds=[];
 for(let i=0;i<100;i++){
  if(i%13===9)continue;const time=i/20,at=Math.max(previousArrival+.001,time+.002+[0,.024,.006,.032,.012][i%5]);
  packets.push({time,at});previousArrival=at;
 }
 for(let frame=0;frame<270;frame++){
  const now=frame/60;
  while(index<packets.length&&packets[index].at<=now){const m=packets[index++];stream.push(snap(car(m.time*35)),m.time,0,m.at);}
  const s=stream.sample(now);if(!s)continue;const p=s.players[0];
  if(now>.5&&last)speeds.push((p.x-last.x)*60);
  last=p;assert.equal(p.vx,35);
 }
 assert.ok(speeds.every(v=>v>33.5&&v<36.5),JSON.stringify({min:Math.min(...speeds),max:Math.max(...speeds)}));
});
test('angle wrapping, respawn and new race epoch do not blend across discontinuities',()=>{
 const stream=new SnapshotStream();
 stream.push(snap(car(0,Math.PI-.05)),0,0,0);stream.push(snap(car(1.75,-Math.PI+.05)),.05,0,.05);
 const halfway=stream.sample(.125).players[0];assert.ok(Math.abs(Math.abs(angle(halfway.yaw))-Math.PI)<1e-6);
 const respawn=car(200);respawn.resets=1;respawn.vx=respawn.speed=0;
 stream.push(snap(respawn),.1,0,.1);
 assert.ok(stream.sample(.175).players[0].x<3);assert.equal(stream.sample(.2).players[0].x,200);
 stream.push(snap(car(-120)),.15,1,.15);assert.equal(stream.frames.length,1);assert.equal(stream.sample(.15).players[0].x,-120);
 stream.push(snap(car(-118.25)),.2,1,.2);stream.push(snap(car(999)),.18,1,.21);assert.equal(stream.frames.length,2);assert.equal(stream.push(snap(car(999)),.25,0,.25),false);assert.equal(stream.epoch,1);
});
test('prediction is short and stops during a network outage',()=>{
 const stream=new SnapshotStream();stream.push(snap(car()),0,0,0);stream.push(snap(car(1.75)),.05,0,.05);
 const limit=stream.sample(.225).players[0].x;assert.equal(limit,1.75+35*.075);
 assert.equal(stream.sample(4).players[0].x,limit);
});
test('server publishes approximately 20Hz snapshots on a monotonic simulation clock and resets epochs',async()=>{
 const app=await startRacingServer({port:0,host:'127.0.0.1'}),base='http://127.0.0.1:'+app.server.address().port,received=[];
 const s=new WebSocket(base.replace('http:','ws:')+'/racing',{origin:base});
 try{
  await new Promise((r,j)=>{s.once('open',r);s.once('error',j);});
  s.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='snapshot')received.push({at:performance.now(),...m});});
  const joined=new Promise(r=>s.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='joined')r(m);}));
  s.send(JSON.stringify({type:'create',count:16}));await joined;
  await new Promise(r=>setTimeout(r,1250));
  const hz=(received.length-1)*1000/(received.at(-1).at-received[0].at);
  assert.ok(hz>18&&hz<22,'actual snapshot rate '+hz);
  assert.ok(received.every((m,i)=>!i||m.serverTime>received[i-1].serverTime));
  const old=received.at(-1).epoch;s.send(JSON.stringify({type:'start'}));await new Promise(r=>setTimeout(r,100));
  assert.equal(received.at(-1).epoch,old+1);s.send(JSON.stringify({type:'restart'}));await new Promise(r=>setTimeout(r,100));assert.equal(received.at(-1).epoch,old+2);
 }finally{s.terminate();await app.close();}
});

test('clock reanchors after a host stall without seconds of packet-by-packet catch-up',()=>{
 const stream=new SnapshotStream();stream.push(snap(car(0)),0,0,0);stream.push(snap(car(17.5)),.5,0,.5);
 const before=stream.sample(1.05).players[0].x;
 assert.ok(stream.starved);stream.push(snap(car(22.75)),.65,0,1.15);
 const resumed=stream.sample(1.15).players[0].x;assert.ok(resumed>=before-1e-10);
 let latest=resumed;
 for(let i=1;i<16;i++){
  const time=.65+i*.05,now=1.15+i*.05;
  stream.push(snap(car(time*35)),time,0,now);
  const visual=stream.sample(now).players[0].x;
  assert.ok(visual>=latest);if(i>2)assert.ok(Math.abs(visual-(time-.1)*35)<1e-8);
  latest=visual;assert.equal(stream.starved,false);
 }
});
