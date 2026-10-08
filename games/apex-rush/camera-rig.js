import {angle} from './tracks.js';
/** Camera translation and aim share the exact rendered car anchor. Only the relative heading eases. */
export class ChaseCameraRig{
 reset(){this.heading=null;this.last=null;}
 constructor(){this.reset();}
 sample(p,dt,{mode=0,menu=false,elapsed=0,reduce=false}={}){
  const jump=this.last&&(this.last.resets!==p.resets||Math.hypot(p.x-this.last.x,p.z-this.last.z)>Math.max(12,p.speed*dt*4));
  const velocity=p.speed>.1?Math.atan2(p.vz,p.vx):p.yaw,slip=angle(velocity-p.yaw),target=p.yaw+slip*.35*Math.max(0,Math.cos(slip))*Math.min(1,p.speed/4);
  if(this.heading===null||jump||menu)this.heading=target;else this.heading+=angle(target-this.heading)*(1-Math.exp(-dt*9));
  this.last={x:p.x,z:p.z,resets:p.resets};let position,look;
  if(menu){const h=p.yaw-.65+(reduce?0:Math.sin(elapsed*.16)*.1);position={x:p.x+Math.cos(h)*10,y:p.y+4.4,z:p.z+Math.sin(h)*10};look={x:p.x,y:p.y+.65,z:p.z};}
  else if(mode===1){position={x:p.x-Math.cos(p.yaw)*.3,y:p.y+1.9,z:p.z-Math.sin(p.yaw)*.3};look={x:p.x+Math.cos(p.yaw)*20,y:p.y+1.4,z:p.z+Math.sin(p.yaw)*20};}
  else{const c=Math.cos(this.heading),s=Math.sin(this.heading),distance=8.2+p.speed*.035;position={x:p.x-c*distance,y:p.y+4.1,z:p.z-s*distance};look={x:p.x+c*9,y:p.y+1,z:p.z+s*9};}
  return {position,look,snapped:!!jump};
 }
}
