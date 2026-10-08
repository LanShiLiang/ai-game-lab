import {fpsServiceBase} from './config.js';
const saved=room=>{try{return sessionStorage.getItem('freight-room:'+room);}catch{return null;}};
const remember=(room,token)=>{try{if(token)sessionStorage.setItem('freight-room:'+room,token);else sessionStorage.removeItem('freight-room:'+room);}catch{}};
export const hasSavedRoom=room=>Boolean(saved(room));
export class OnlineClient{
 constructor({onJoined,onSnapshot,onError,onClose,onRooms,onRoom,onReconnecting,base,url}={}){
  this.callbacks={onJoined,onSnapshot,onError,onClose,onRooms,onRoom,onReconnecting};
  const address=new URL(url||'fps',base||fpsServiceBase(globalThis.location?.href||import.meta.url));address.protocol=['https:','wss:'].includes(address.protocol)?'wss:':'ws:';this.url=address.href;
  this.socket=null;this.connecting=null;this.joined=null;this.resume=null;this.intentional=false;this.attempts=0;this.timer=null;
 }
 connect(){
  if(this.socket?.readyState===WebSocket.OPEN)return Promise.resolve(this);if(this.connecting)return this.connecting;this.intentional=false;
  this.connecting=new Promise((resolve,reject)=>{
   const socket=this.socket=new WebSocket(this.url);let opened=false;const timeout=setTimeout(()=>{socket.close();reject(Error('连接在线服务超时，请稍后重试。'));},6000);
   socket.addEventListener('open',()=>{opened=true;clearTimeout(timeout);this.connecting=null;resolve(this);});
   socket.addEventListener('message',event=>{
    if(this.socket!==socket)return;let data;try{data=JSON.parse(event.data);}catch{return;}
    if(data.type==='joined'){this.joined=data;this.resume={roomId:data.roomId,reconnectToken:data.reconnectToken};remember(data.roomId,data.reconnectToken);this.attempts=0;this.callbacks.onJoined?.(data);}
    else if(data.type==='snapshot')this.callbacks.onSnapshot?.(data.snapshot,data);
    else if(data.type==='rooms')this.callbacks.onRooms?.(data.rooms);
    else if(data.type==='room'){if(this.joined)Object.assign(this.joined,data);this.callbacks.onRoom?.(data);}
    else if(data.type==='left')this.joined=null;
    else if(data.type==='error'){
     if(['INVALID_RECONNECT','ROOM_NOT_FOUND'].includes(data.code)){remember(this.resume?.roomId||this.requestedRoom,null);if(this.attempts){this.resume=null;this.intentional=true;socket.close(1000,'Reconnect unavailable');}}
     this.callbacks.onError?.(data);
    }
   });
   socket.addEventListener('error',()=>{if(!opened){clearTimeout(timeout);this.connecting=null;reject(Error('无法连接在线服务，请检查网络后重试。'));}if(!this.resume)this.callbacks.onError?.({code:'CONNECTION_ERROR',message:'在线服务连接失败，请稍后重试。'});});
   socket.addEventListener('close',event=>{
    clearTimeout(timeout);if(this.socket!==socket)return;this.socket=null;this.connecting=null;this.joined=null;if(!opened)reject(Error('连接已关闭。'));
    if(!this.intentional&&this.resume&&this.attempts<5)this.reconnect();else this.callbacks.onClose?.({code:event.code,reason:event.reason,intentional:this.intentional});
   });
  });return this.connecting;
 }
 reconnect(){const attempt=++this.attempts;this.callbacks.onReconnecting?.({attempt,roomId:this.resume.roomId});this.timer=setTimeout(async()=>{try{await this.connect();if(this.resume&&!this.intentional)this.send({type:'join_room',...this.resume});}catch{}},Math.min(500*2**(attempt-1),5000));}
 send(message){if(this.socket?.readyState!==WebSocket.OPEN||this.socket.bufferedAmount>64*1024)return false;this.socket.send(JSON.stringify(message));return true;}
 async create(options={}){await this.connect();return this.send({size:4,aiCount:0,...options,type:'create_room'});}
 async join(roomId,name){this.requestedRoom=roomId;await this.connect();return this.send({type:'join_room',roomId,name,reconnectToken:saved(roomId)||undefined});}
 sendInput(input){return Boolean(this.joined)&&this.send({type:'input',input});}
 restart(){return this.send({type:'restart'});}
 listRooms(){return this.send({type:'list_rooms'});}
 leave(){remember(this.resume?.roomId,null);this.intentional=true;this.resume=null;this.joined=null;clearTimeout(this.timer);return this.send({type:'leave'});}
 disconnect(){this.intentional=true;this.resume=null;this.joined=null;clearTimeout(this.timer);this.socket?.close(1000,'Client disconnect');}
}
