import {angle,clamp} from './tracks.js';

const mix=(a,b,f)=>a+(b-a)*f;
const numeric=['vx','vz','speed','steer','vy','roadVy','energy','driftTime','boostTime','miniTime','miniReady','collision'];
const hermite=(a,b,va,vb,t,span)=>{
 const t2=t*t,t3=t2*t;
 return (2*t3-3*t2+1)*a+(t3-2*t2+t)*span*va+(-2*t3+3*t2)*b+(t3-t2)*span*vb;
};
function interpolate(a,b,f,span){
 // Resets and respawns are real discontinuities, never a journey across the map.
 if(a.resets!==b.resets||Math.hypot(b.x-a.x,b.z-a.z)>Math.max(12,span*110))return {...(f<1?a:b)};
 const p={...a};
 for(const key of numeric)if(Number.isFinite(a[key])&&Number.isFinite(b[key]))p[key]=mix(a[key],b[key],f);
 p.yaw=a.yaw+angle(b.yaw-a.yaw)*f;
 p.x=hermite(a.x,b.x,a.vx,b.vx,f,span);
 p.z=hermite(a.z,b.z,a.vz,b.vz,f,span);
 p.y=mix(a.y,b.y,f);
 return p;
}
function extrapolate(p,previous,seconds,span){
 if(previous&&previous.resets!==p.resets)previous=null;
 const t=Math.min(Math.max(seconds,0),.075),out={...p};
 if(t===0)return out;
 // Short gaps keep coasting; a lost connection never sends cars driving indefinitely.
 const ax=previous&&span>0?clamp((p.vx-previous.vx)/span,-45,45):0;
 const az=previous&&span>0?clamp((p.vz-previous.vz)/span,-45,45):0;
 out.x+=p.vx*t+.5*ax*t*t;out.z+=p.vz*t+.5*az*t*t;
 out.vx+=ax*t;out.vz+=az*t;out.speed=Math.hypot(out.vx,out.vz);
 if(previous&&p.resets===previous.resets&&span>0)out.yaw+=clamp(angle(p.yaw-previous.yaw)/span,-2.8,2.8)*t;
 if(p.airborne)out.y+=p.vy*t-7*t*t;else out.y+=clamp(p.roadVy||0,-12,12)*t;
 for(const key of ['boostTime','miniTime','miniReady','collision'])out[key]=Math.max(0,p[key]-t);
 return out;
}

/** Authoritative snapshots are immutable. Rendering follows a separate continuous clock. */
export class SnapshotStream {
 constructor({delay=.1}={}){this.delay=delay;this.reset();}
 reset(){this.frames=[];this.offsets=[];this.offset=null;this.targetOffset=null;this.lastNow=null;this.playhead=null;this.epoch=null;this.starved=false;this.recovered=false;}
 push(snapshot,serverTime,epoch=0,receivedAt=performance.now()/1000){
  if(!snapshot?.players?.length||this.epoch!==null&&epoch<this.epoch)return false;
  if(this.epoch!==null&&(this.epoch!==epoch||this.frames.at(-1)?.snapshot.track!==snapshot.track))this.reset();
  this.epoch=epoch;
  // Arrival time is a compatibility fallback for earlier service packages.
  const time=Number.isFinite(serverTime)?serverTime:receivedAt;
  if(this.frames.length&&time<=this.frames.at(-1).time)return false;
  if(this.starved){this.offsets=[];this.recovered=true;this.starved=false;}
  this.offsets.push({at:receivedAt,value:receivedAt-time});
  this.offsets=this.offsets.filter(p=>receivedAt-p.at<10);
  this.targetOffset=Math.min(...this.offsets.map(p=>p.value));
  if(this.offset===null)this.offset=this.targetOffset;
  this.frames.push({snapshot,time});
  if(this.frames.length>64)this.frames.shift();
  return true;
 }
 sample(now=performance.now()/1000){
  if(!this.frames.length)return null;
  const elapsed=this.lastNow===null?0:Math.max(0,now-this.lastNow);this.lastNow=now;
  if(this.recovered){this.offset=this.targetOffset;this.recovered=false;}
  // Clock corrections are gradual, so packet jitter cannot move the camera clock.
  this.offset+=clamp(this.targetOffset-this.offset,-elapsed*.02,elapsed*.02);
  const latest=this.frames.at(-1);
  const desired=now-this.offset-this.delay;
  this.starved=desired>latest.time+.076;
  // An outage cannot advance the playhead past the bounded prediction horizon.
  const target=Math.max(this.playhead??-Infinity,Math.min(desired,latest.time+.075));this.playhead=target;
  let left=this.frames[0],right=null;
  for(const frame of this.frames){if(frame.time<=target)left=frame;else{right=frame;break;}}
  if(target<=this.frames[0].time)return this.frames[0].snapshot;
  if(right){
   const span=right.time-left.time,f=clamp((target-left.time)/span,0,1),next=new Map(right.snapshot.players.map(p=>[p.id,p]));
   return {...latest.snapshot,players:left.snapshot.players.map(p=>next.has(p.id)?interpolate(p,next.get(p.id),f,span):p)};
  }
  if(latest.snapshot.status!=='racing')return latest.snapshot;
  const previous=this.frames.at(-2),old=new Map(previous?.snapshot.players.map(p=>[p.id,p])||[]);
  return {...latest.snapshot,players:latest.snapshot.players.map(p=>extrapolate(p,old.get(p.id),target-latest.time,latest.time-(previous?.time??latest.time)))};
 }
}
