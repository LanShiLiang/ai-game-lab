import {makeTrack,atDistance,nearest,angle,clamp,curvature} from './tracks.js';
export const COLORS=['#f15a40','#17bdcd','#f4c653','#667bf4','#eaa7bd','#a5ce75','#ede9d9','#8b607a','#ff8f46','#77a1cf','#e44571','#49bc95','#dac24f','#b183eb','#bbd1d7','#b66c4b'];
export const BOT_NAMES=['海风','晚点刹车','弯道诗人','白浪','小橘子','追风','洛城','流星','晴空','逆光','海盐','阿漂','银翼','弯心','最后一喷','落日'];
export const sanitizeInput=i=>({throttle:clamp(Number(i?.throttle)||0,-1,1),steer:clamp(Number(i?.steer)||0,-1,1),drift:!!i?.drift,boost:!!i?.boost,brake:!!i?.brake,reset:!!i?.reset});
export class Race{
 constructor({track='beach',count=8,mode='solo',laps=2,difficulty='normal',assist=true}={}){
  this.track=makeTrack(track);this.count=clamp(Math.floor(count)||8,2,16);this.mode=mode==='team'?'team':'solo';this.laps=clamp(Math.floor(laps)||2,1,5);this.difficulty=difficulty;this.assist=assist;this.time=0;this.status='grid';this.players=[];this.finishOrder=[];this.finishDeadline=Infinity;this.serial=0;
  for(let j=0;j<this.count;j++)this.players.push(this.createCar(j,true));
 }
 createCar(slot,bot){const p={id:'car-'+(++this.serial),slot,bot,name:BOT_NAMES[slot%BOT_NAMES.length],color:COLORS[slot],team:slot%2,x:0,z:0,y:0,vy:0,roadVy:0,airborne:false,airCount:0,yaw:0,vx:0,vz:0,speed:0,steer:0,drifting:false,driftTime:0,driftCharge:0,nitro:1,energy:0,boostTime:0,miniTime:0,miniReady:0,boostHeld:false,resetHeld:false,progress:0,lap:1,index:0,s:0,finish:null,collision:0,resets:0,blocked:0,input:sanitizeInput({})};this.putOnGrid(p);return p;}
 putOnGrid(p){const q=atDistance(this.track,12-Math.floor(p.slot/2)*6.5),side=(p.slot%2?1:-1)*2.9;Object.assign(p,{x:q.x+q.nx*side,z:q.z+q.nz*side,y:q.y,yaw:q.h,index:q.index,s:q.s,progress:0,vx:0,vz:0,speed:0});}
 addHuman(name='车手',color=0){const p=this.players.find(c=>c.bot);if(!p)return null;p.bot=false;p.name=String(name).replace(/[\u0000-\u001f<>]/g,'').slice(0,14)||'车手';p.color=COLORS[clamp(Math.floor(Number(color))||0,0,15)];p.input=sanitizeInput({});return p;}
 removeHuman(id){const p=this.players.find(c=>c.id===id);if(p){p.bot=true;p.name=BOT_NAMES[p.slot];p.input=sanitizeInput({});}}
 setInput(id,input){const p=this.players.find(c=>c.id===id);if(p&&!p.bot)p.input=sanitizeInput(input);}
 start(){if(this.status==='grid'){this.status='countdown';this.time=-3;}}
 restart(){this.time=0;this.status='grid';this.finishOrder=[];this.finishDeadline=Infinity;for(const p of this.players){const fresh=this.createCar(p.slot,p.bot);const keep={id:p.id,name:p.name,color:p.color,team:p.team,bot:p.bot};Object.assign(p,fresh,keep);}this.start();}
 reset(p){const s=Math.max(0,p.progress%this.track.length);const q=atDistance(this.track,s+2);Object.assign(p,{x:q.x,z:q.z,y:q.y,yaw:q.h,vx:0,vz:0,speed:0,index:q.index,s:q.s,blocked:0,boostTime:0,miniTime:0,drifting:false,driftTime:0,driftCharge:0,airborne:false,vy:0,roadVy:0,roadY:q.y,climbArmed:false});p.resets++;}
 aiInput(p){
  const t=this.track,q=nearest(t,p.x,p.z,p.index),speed=Math.hypot(p.vx,p.vz),look=clamp(10+speed*.32,10,30),aim=atDistance(t,q.s+look),lane=Math.sin(p.slot*2.8)*1.7;
  const desired=Math.atan2(aim.z+aim.nz*lane-p.z,aim.x+aim.nx*lane-p.x),err=angle(desired-p.yaw),c=curvature(t,q.s+8),factor=this.difficulty==='easy'?.76:this.difficulty==='hard'?1.03:.9;
  const skill=p.bot ? (.86+(p.slot*7%13)/13*.19) : 1;
  const target=(p.boostTime>0&&c<.007&&curvature(t,q.s+48)<.010?80:clamp(64-650*Math.max(c,curvature(t,q.s+36)*.7),26,61))*factor*skill,steer=clamp(err*2.8,-1,1);
  return {throttle:speed>target+4?0:1,steer,brake:speed>target+7,drift:Math.abs(err)>.30&&speed>20,boost:p.nitro>0&&speed>35&&c<.007&&curvature(t,q.s+70)<.010&&Math.abs(err)<.13,reset:false};
 }
 tick(dt=1/60){
  dt=clamp(dt,0,1/30);if(this.status==='grid'||this.status==='ended')return;this.time+=dt;
  if(this.time<0)return;if(this.status==='countdown')this.status='racing';
  for(const p of this.players)this.drive(p,p.bot||p.finish!==null?this.aiInput(p):p.input,dt);
  for(let i=0;i<this.players.length;i++)for(let j=i+1;j<this.players.length;j++){const a=this.players[i],b=this.players[j],dx=a.x-b.x,dz=a.z-b.z,d=Math.hypot(dx,dz);if(d>.01&&d<2.7){const push=(2.7-d)*.42,nx=dx/d,nz=dz/d;a.x+=nx*push;a.z+=nz*push;b.x-=nx*push;b.z-=nz*push;}}
  for(const p of this.players){const ground=nearest(this.track,p.x,p.z,p.index).y;if(!p.airborne)p.y=ground;else if(p.y<ground){p.y=ground;p.airborne=false;p.vy=0;p.miniTime=Math.max(p.miniTime,.55);}}
  if(this.players.every(p=>p.finish!==null)||this.time>this.finishDeadline||this.time>600)this.status='ended';
 }
 drive(p,i,dt){
  if(i.reset&&!p.resetHeld)this.reset(p);p.resetHeld=i.reset;p.collision=Math.max(0,p.collision-dt);p.boostTime=Math.max(0,p.boostTime-dt);p.miniTime=Math.max(0,p.miniTime-dt);p.miniReady=Math.max(0,p.miniReady-dt);
  if(i.boost&&!p.boostHeld&&p.nitro>0&&p.boostTime===0){p.nitro--;p.boostTime=2.4;}
  if(i.boost&&!p.boostHeld&&p.miniReady>0){p.miniTime=1.15;p.miniReady=0;}p.boostHeld=i.boost;
  let speed=Math.hypot(p.vx,p.vz);p.steer+=(i.steer-p.steer)*(1-Math.exp(-dt*12));
  const drift=!!i.drift&&Math.abs(p.steer)>.14&&speed>12;
  if(drift){p.driftTime+=dt;p.driftCharge+=dt*Math.abs(p.steer);p.energy+=dt*(.22+.32*Math.abs(p.steer))*clamp(speed/35,.4,1.5);if(p.energy>=1){if(p.nitro<3)p.nitro++;p.energy%=1;}}
  if(p.drifting&&!drift){if(p.driftCharge>.26){p.miniTime=.55;p.miniReady=1.6;}p.driftTime=0;p.driftCharge=0;}p.drifting=drift;
  const grip=drift?3.1:11.5,turn=drift?1.95:1.18,yawRate=p.steer*turn*clamp(speed/12,0,1)*(speed>62?.86:1);
  p.yaw=angle(p.yaw+yawRate*dt);
  const boosting=p.boostTime>0,mini=p.miniTime>0,maxSpeed=boosting?85:mini?74:61;
  let accel=(boosting?34:mini?30:20)*Math.max(0,i.throttle)-.0034*speed*speed-(i.brake?44:0)-(i.throttle===0?5:0)-(drift?2.3:0);
  speed=clamp(speed+accel*dt,0,maxSpeed);
  if(i.throttle<0){speed=Math.max(0,speed-35*dt);if(speed<2){p.vx=-Math.cos(p.yaw)*7;p.vz=-Math.sin(p.yaw)*7;}}
  const old=Math.atan2(p.vz,p.vx),velAngle=speed<2?p.yaw:old+angle(p.yaw-old)*(1-Math.exp(-grip*dt));
  if(i.throttle>=0||speed>2){p.vx=Math.cos(velAngle)*speed;p.vz=Math.sin(velAngle)*speed;}
  p.x+=p.vx*dt;p.z+=p.vz*dt;const q=nearest(this.track,p.x,p.z,p.index),limit=this.track.width/2-1.15;
  if(Math.abs(q.offset)>limit){const side=Math.sign(q.offset);p.x=q.x+q.nx*limit*side;p.z=q.z+q.nz*limit*side;const normal=p.vx*q.nx+p.vz*q.nz;if(normal*side>0){p.vx-=normal*q.nx*1.05;p.vz-=normal*q.nz*1.05;p.vx*=.82;p.vz*=.82;p.collision=.3;}if(this.assist&&!p.bot)p.yaw+=angle(q.h-p.yaw)*dt*2.0;}
  let delta=q.s-p.s;if(delta>this.track.length/2)delta-=this.track.length;if(delta<-this.track.length/2)delta+=this.track.length;
  if(Math.abs(delta)<Math.max(8,speed*dt*3))p.progress=Math.max(-50,p.progress+delta);
  const roadVy=(q.y-(p.roadY??q.y))/dt;if(roadVy>1)p.climbArmed=true;if(!p.airborne&&p.climbArmed&&roadVy<-.2&&speed>28){p.climbArmed=false;p.airborne=true;p.vy=Math.max(3.8,speed*.065);p.airCount++;}if(p.airborne){p.vy-=14*dt;p.y+=p.vy*dt;if(p.y<=q.y){p.y=q.y;p.airborne=false;p.vy=0;p.miniTime=Math.max(p.miniTime,.55);}}else p.y=q.y;p.roadVy=roadVy;p.roadY=q.y;p.s=q.s;p.index=q.index;p.speed=Math.hypot(p.vx,p.vz);p.lap=clamp(Math.floor(p.progress/this.track.length)+1,1,this.laps);
  if(p.progress>=this.track.length*this.laps&&p.finish===null){p.finish=this.time;this.finishOrder.push(p.id);this.finishDeadline=Math.min(this.finishDeadline,this.time+35);}
  if(p.speed<5)p.blocked+=dt;else p.blocked=0;if(p.bot&&p.blocked>2)this.reset(p);
 }
 ranking(){return [...this.players].sort((a,b)=>a.finish!==null&&b.finish!==null?a.finish-b.finish:a.finish!==null?-1:b.finish!==null?1:b.progress-a.progress);}
 snapshot(){return {track:this.track.id,laps:this.laps,mode:this.mode,count:this.count,time:this.time,status:this.status,finishDeadline:Number.isFinite(this.finishDeadline)?this.finishDeadline:null,players:this.players.map(({input,...p})=>({...p})),order:this.ranking().map(p=>p.id)};}
}
export function formatTime(t){if(t===null||!Number.isFinite(t))return '—';t=Math.max(0,t);return String(Math.floor(t/60)).padStart(2,'0')+':'+(t%60).toFixed(2).padStart(5,'0');}
export function teamScores(snapshot){const points=[25,20,16,13,11,10,9,8,7,6,5,4,3,2,1,0],scores=[0,0];for(let r=0;r<snapshot.order.length;r++){const p=snapshot.players.find(p=>p.id===snapshot.order[r]);if(p.finish!==null)scores[p.team]+=points[r];}return scores;}
