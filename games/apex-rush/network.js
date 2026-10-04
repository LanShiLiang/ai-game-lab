import {unpackSnapshot} from './wire.js';
import {racingServiceBase} from './config.js';
import {SnapshotStream} from './sync.js';
export class RaceNetwork{
 constructor(onMessage,onDisconnect){this.onMessage=onMessage;this.onDisconnect=onDisconnect;this.intentional=false;this.motion=new SnapshotStream();}
 async connect(){if(this.socket?.readyState===WebSocket.OPEN)return;this.intentional=false;const endpoint=new URL('racing',racingServiceBase(location.href));endpoint.protocol=location.protocol==='https:'?'wss:':'ws:';const url=endpoint.href;await new Promise((resolve,reject)=>{const s=this.socket=new WebSocket(url),timeout=setTimeout(()=>{s.close();reject(Error('连接比赛服务超时，请检查网络后重试。'));},4500);s.onopen=()=>{clearTimeout(timeout);resolve();};s.onerror=()=>{clearTimeout(timeout);reject(Error('无法连接比赛服务，请确认网络或本地开服窗口仍在运行。'));};s.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.compact)m.snapshot=unpackSnapshot(m.snapshot);if(m.type==='snapshot'&&Number.isInteger(m.step))this.send({type:'ack',step:m.step});if(m.type==='joined')this.motion.reset();if(m.snapshot&&!this.motion.push(m.snapshot,m.serverTime,m.epoch))return;this.onMessage(m);}catch(err){console.error(err);}};s.onclose=()=>{clearTimeout(timeout);if(!this.intentional)this.onDisconnect();};});}
 visualSnapshot(){return this.motion.sample();}
 send(data){if(this.socket?.readyState===WebSocket.OPEN)this.socket.send(JSON.stringify(['join','create'].includes(data.type)?{...data,motionAck:1}:data));}
 close(){this.motion.reset();this.intentional=true;this.send({type:'leave'});this.socket?.close();this.socket=null;}
}