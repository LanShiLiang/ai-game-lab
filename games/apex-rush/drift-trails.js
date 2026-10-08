import {COLORS} from './sim.js';
// The existing car is one model with liveries. Paint hex is the stable trail identity.
export const TRAIL_COLORS=Object.freeze(Object.fromEntries(COLORS.map(c=>[c,c])));
export function trailColor(paint){return TRAIL_COLORS[String(paint).toLowerCase()]||COLORS[0];}
export class DriftTrailPool{
 constructor({capacity=3072,markCapacity=1536,lifetime=2.4,markLifetime=3}={}){
  Object.assign(this,{capacity,markCapacity,lifetime,markLifetime});this.positions=new Float32Array(capacity*3);this.colors=new Float32Array(capacity*3);this.alpha=new Float32Array(capacity);this.sizes=new Float32Array(capacity);this.birth=new Float64Array(capacity).fill(-Infinity);this.markPositions=new Float32Array(markCapacity*18);this.markColors=new Float32Array(markCapacity*18);this.markAlpha=new Float32Array(markCapacity*6);this.markBirth=new Float64Array(markCapacity).fill(-Infinity);this.low=false;this.clear();
 }
 clear(){this.clock=0;this.cursor=0;this.markCursor=0;this.birth.fill(-Infinity);this.markBirth.fill(-Infinity);this.alpha.fill(0);this.markAlpha.fill(0);this.last=new Map();}
 setLow(low){if(this.low!==low){this.low=low;this.last.clear();this.cursor=0;this.markCursor=0;}}
 get budget(){return this.low?Math.min(384,this.capacity):this.capacity;}
 get markBudget(){return this.low?Math.min(256,this.markCapacity):this.markCapacity;}
 update(dt){this.clock+=Math.max(0,dt);for(let i=0;i<this.budget;i++){const age=this.clock-this.birth[i];this.alpha[i]=Math.max(0,1-age/this.lifetime);this.sizes[i]=.95+Math.min(this.lifetime,Math.max(0,age))*.65;}for(let i=0;i<this.markBudget;i++){const a=Math.max(0,1-(this.clock-this.markBirth[i])/this.markLifetime);this.markAlpha.fill(a,i*6,i*6+6);}}
 point(x,y,z,rgb,birth){const i=this.cursor++%this.budget,k=i*3;this.positions[k]=x;this.positions[k+1]=y;this.positions[k+2]=z;this.colors.set(rgb,k);this.birth[i]=birth;this.alpha[i]=Math.max(0,1-(this.clock-birth)/this.lifetime);this.sizes[i]=.95;}
 mark(ax,ay,az,bx,by,bz,rgb,birth){const i=this.markCursor++%this.markBudget,k=i*18,dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz);if(len<.001)return;const nx=-dz/len*.10,nz=dx/len*.10;this.markPositions.set([ax+nx,ay,az+nz,ax-nx,ay,az-nz,bx+nx,by,bz+nz,ax-nx,ay,az-nz,bx-nx,by,bz-nz,bx+nx,by,bz+nz],k);for(let j=0;j<6;j++)this.markColors.set(rgb,k+j*3);this.markBirth[i]=birth;this.markAlpha.fill(Math.max(0,1-(this.clock-birth)/this.markLifetime),i*6,i*6+6);}
 sample(p,dt,rgb,{enabled=true,remote=false}={}){
  if(!enabled||!p.drifting||p.airborne||p.speed<3){this.last.delete(p.id);return;}
  const c=Math.cos(p.yaw),s=Math.sin(p.yaw),wheels=[{x:p.x-1.4*c+1.02*s,y:p.y+.08,z:p.z-1.4*s-1.02*c},{x:p.x-1.4*c-1.02*s,y:p.y+.08,z:p.z-1.4*s+1.02*c}];
  let old=this.last.get(p.id);if(!old||old.resets!==p.resets||Math.hypot(p.x-old.x,p.z-old.z)>Math.max(12,p.speed*dt*4)||Math.abs(p.y-old.y)>3){this.last.set(p.id,{x:p.x,y:p.y,z:p.z,resets:p.resets,wheels});return;}
  old.x=p.x;old.y=p.y;old.z=p.z;const distance=Math.max(...wheels.map((w,i)=>Math.hypot(w.x-old.wheels[i].x,w.z-old.wheels[i].z))),spacing=this.low?(remote?3:1):remote?1.6:.65,steps=Math.min(32,Math.floor(distance/spacing));if(!steps)return;
  for(let n=1;n<=steps;n++){const f=n*spacing/distance,prev=(n-1)*spacing/distance,birth=this.clock-dt*(1-f);for(let side=0;side<2;side++){const a=old.wheels[side],b=wheels[side],x=a.x+(b.x-a.x)*f,y=a.y+(b.y-a.y)*f,z=a.z+(b.z-a.z)*f;this.point(x,y+.10,z,rgb,birth);this.mark(a.x+(b.x-a.x)*prev,a.y-.045+(b.y-a.y)*prev,a.z+(b.z-a.z)*prev,x,y-.045,z,rgb,birth);}}
  const f=steps*spacing/distance;for(let i=0;i<2;i++){const a=old.wheels[i],b=wheels[i];a.x+=(b.x-a.x)*f;a.y+=(b.y-a.y)*f;a.z+=(b.z-a.z)*f;}
 }
 stats(){return{points:this.alpha.subarray(0,this.budget).filter(a=>a>0).length,marks:this.markAlpha.subarray(0,this.markBudget*6).filter(a=>a>0).length/6,budget:this.budget,markBudget:this.markBudget};}
}
