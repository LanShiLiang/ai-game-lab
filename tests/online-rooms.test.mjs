import test from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {startRacingServer} from '../scripts/racing-server.mjs';
import {fpsServiceBase} from '../games/freight-fire/config.js';
import {OnlineClient} from '../games/freight-fire/network.js';
async function peer(base,endpoint){const socket=new WebSocket(base.replace('http:','ws:')+endpoint,{origin:base}),queue=[],waiting=[];socket.on('message',raw=>{const m=JSON.parse(raw);const at=waiting.findIndex(w=>w.type===m.type);if(at<0)queue.push(m);else waiting.splice(at,1)[0].resolve(m);});await new Promise((r,j)=>{socket.once('open',r);socket.once('error',j);});return{socket,send:m=>socket.send(JSON.stringify(m)),next:type=>{const at=queue.findIndex(m=>m.type===type);if(at>=0)return Promise.resolve(queue.splice(at,1)[0]);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('No '+type)),4000);waiting.push({type,resolve:m=>{clearTimeout(timer);resolve(m);}});});}};}
test('one central service routes racing and FPS protocols and publishes only online health',async t=>{
 const app=await startRacingServer({port:0,serveLab:true,publicBaseURL:'https://rooms.example/ai-game-lab/'});t.after(()=>app.close());const base='http://127.0.0.1:'+app.server.address().port;
 const raceHealth=await(await fetch(base+'/api/racing/health')).json(),fpsHealth=await(await fetch(base+'/api/fps/health')).json();assert.equal(raceHealth.online,true);assert.equal(fpsHealth.online,true);assert.equal(raceHealth.maxRooms,3);assert.equal(fpsHealth.maxRooms,3);assert.equal(raceHealth.addresses,undefined);assert.equal((await fetch(base+'/scripts/fps-server.mjs')).status,404);
 const race=await peer(base,'/racing'),fps=await peer(base,'/fps');t.after(()=>{race.socket.terminate();fps.socket.terminate();});race.send({type:'create',count:4,name:'Race host'});fps.send({type:'create_room',size:4,name:'FPS host'});const r=await race.next('joined'),f=await fps.next('joined');assert.equal(app.rooms.size,1);assert.equal(app.fps.rooms.size,1);assert.equal(r.invites[0],'https://rooms.example/ai-game-lab/games/apex-rush/?online=1&room='+r.roomId);const invite=await(await fetch(base+'/api/fps/invites?room='+f.roomId)).json();assert.equal(invite.invite,'https://rooms.example/ai-game-lab/games/freight-fire/?online=1&room='+f.roomId);assert.deepEqual(Object.keys(invite).sort(),['invite','roomId']);assert.notEqual(r.roomId,f.roomId);
 const friend=await peer(base,'/fps');t.after(()=>friend.socket.terminate());friend.send({type:'join_room',roomId:f.roomId,name:'FPS friend'});await friend.next('joined');assert.equal(app.fps.rooms.get(f.roomId).members.size,2);assert.equal(app.rooms.get(r.roomId).members.size,1);
});
test('FPS client preserves deployed path prefixes and upgrades HTTPS to WSS',()=>{
 const base=fpsServiceBase('https://rooms.example/ai-game-lab/games/freight-fire/index.html?room=x');assert.equal(base.href,'https://rooms.example/ai-game-lab/');assert.equal(new OnlineClient({base:base.href}).url,'wss://rooms.example/ai-game-lab/fps');
});
test('online room service rejects the retired eight-room configuration',async()=>{
 await assert.rejects(startRacingServer({port:0,maxRooms:8}),/Invalid room limit/);
});
