// Explicit local acceptance test for an already prepared external release.
// It never resolves repositories, downloads code, or activates a release.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {WebSocket} from 'ws';
import {startGateway} from '../services/gateway/index.mjs';
const at=process.argv.indexOf('--release-dir');if(at<0||!process.argv[at+1])throw Error('--release-dir must name a prepared external release');
const releaseDir=path.resolve(process.argv[at+1]),gateway=await startGateway({releaseDir,port:0}),base='http://127.0.0.1:'+gateway.server.address().port,checks=[];
function peer(route){const socket=new WebSocket(base.replace('http:','ws:')+route,{origin:base}),messages=[],waiters=[];socket.on('message',bytes=>{const message=JSON.parse(bytes);const i=waiters.findIndex(waiter=>waiter.type===message.type);if(i>=0){const [w]=waiters.splice(i,1);clearTimeout(w.timer);w.resolve(message);}else messages.push(message);});return {socket,open:new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);}),send:message=>socket.send(JSON.stringify(message)),next:type=>new Promise((resolve,reject)=>{const i=messages.findIndex(m=>m.type===type);if(i>=0)return resolve(messages.splice(i,1)[0]);const waiter={type,resolve,timer:setTimeout(()=>reject(Error('Timed out waiting for '+type)),5000)};waiters.push(waiter);})};}
async function files(folder){const list=[];for(const item of await readdir(folder,{withFileTypes:true})){const file=path.join(folder,item.name);if(item.isDirectory())list.push(...await files(file));else list.push(file);}return list;}
const clients=[];
try{
 const catalog=await(await fetch(base+'/games.json')).json();assert.equal((await fetch(base+'/')).status,200);checks.push('platform homepage and registry');
 let modules=0;
 for(const game of catalog){assert.equal((await fetch(base+'/'+game.entry)).status,200,game.entry);assert.equal((await fetch(base+'/'+game.cover)).status,200,game.cover);const client=path.join(releaseDir,'public/games',game.id);for(const file of await files(client))if(file.endsWith('.js')){const relative=path.relative(path.join(releaseDir,'public'),file).split(path.sep).join('/');const response=await fetch(base+'/'+relative);assert.equal(response.status,200,relative);assert.match(response.headers.get('content-type'),/javascript/);modules++;}checks.push(game.id+' static entry, cover, JavaScript routes');}
 for(const route of ['/release-lock.json','/release-integrity.json','/games/freight-fire/server/index.mjs','/node_modules/ws/index.js','/services/gateway/index.mjs'])assert.equal((await fetch(base+route)).status,404,route);checks.push('backend and configuration stay private');
 for(const kind of ['fps','racing'])assert.equal((await fetch(base+'/api/'+kind+'/health')).status,200);checks.push('both independent APIs');
 const fps=peer('/fps'),race=peer('/racing');clients.push(fps.socket,race.socket);await Promise.all([fps.open,race.open]);fps.send({type:'create_room',size:4,aiCount:3,name:'Integration FPS'});race.send({type:'create',count:8,name:'Integration Racing'});const [f,r]=await Promise.all([fps.next('joined'),race.next('joined')]);assert.ok(f.roomId);assert.ok(r.roomId);assert.notEqual(f.roomId,r.roomId);checks.push('independent FPS and Racing WebSocket room creation');fps.send({type:'leave'});race.send({type:'leave'});
 console.log(JSON.stringify({releaseDir,checks,javaScriptRoutes:modules,roomProtocols:['fps','racing'],browserVerified:false},null,2));
}finally{for(const client of clients)client.terminate();await gateway.close();}
