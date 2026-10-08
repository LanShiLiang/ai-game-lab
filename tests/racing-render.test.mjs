import test from 'node:test';
import assert from 'node:assert/strict';
import {ChaseCameraRig} from '../games/apex-rush/camera-rig.js';
import {DriftTrailPool,trailColor} from '../games/apex-rush/drift-trails.js';
import {COLORS,Race} from '../games/apex-rush/sim.js';
import {SnapshotStream,interpolateRaceSnapshots} from '../games/apex-rush/sync.js';
import {makeTrack,atDistance,nearest,angle} from '../games/apex-rush/tracks.js';
import {PerspectiveCamera,Vector3} from '../games/apex-rush/vendor/three.module.js';
const pose=(x=0)=>({id:'car',x,y:0,z:0,yaw:0,vx:35,vz:0,speed:35,resets:0,drifting:true,airborne:false});
test('shared camera anchor keeps translating cars at a stable screen position at 20/30/60/144 Hz',()=>{
 for(const hz of [20,30,60,144]){const rig=new ChaseCameraRig(),camera=new PerspectiveCamera(62,1.6,.1,950);let first;
  for(let i=0;i<hz*3;i++){const p=pose(i/hz*35),c=rig.sample(p,1/hz);camera.position.set(c.position.x,c.position.y,c.position.z);camera.lookAt(c.look.x,c.look.y,c.look.z);camera.updateMatrixWorld();const projected=new Vector3(p.x,p.y+.65,p.z).project(camera);first??=projected;assert.ok(projected.distanceTo(first)<1e-10);}
 }
});
test('camera resets snap to the car while heading wraps without reverse spins or physical changes',()=>{
 const rig=new ChaseCameraRig(),p=pose();p.yaw=Math.PI-.01;rig.sample(p,.016);const before=rig.heading;p.yaw=-Math.PI+.01;rig.sample(p,.016);assert.ok(Math.abs(angle(rig.heading-before))<.02);p.x=500;p.resets++;const copy={...p},c=rig.sample(p,.016);assert.equal(c.snapped,true);assert.ok(Math.hypot(c.position.x-p.x,c.position.z-p.z)<12);assert.deepEqual(p,copy);
});
test('world trails follow both rear wheels, fade linearly and remain fixed after the vehicle leaves',()=>{
 const pool=new DriftTrailPool({capacity:64,markCapacity:64}),p=pose(),rgb=[1,.1,0];pool.sample(p,.1,rgb);pool.update(.1);p.x=7;pool.sample(p,.1,rgb);assert.ok(pool.stats().points>=20);const positions=[...pool.positions],i=pool.alpha.findIndex(a=>a>0),birth=pool.birth[i];p.x=300;p.drifting=false;pool.sample(p,.1,rgb);pool.update(.6);assert.deepEqual([...pool.positions],positions);assert.ok(Math.abs(pool.alpha[i]-(1-(pool.clock-birth)/pool.lifetime))<1e-6);pool.update(4);assert.equal(pool.stats().points,0);assert.equal(pool.stats().marks,0);
});
test('trail pool is bounded, low quality reduces work, and reset/drift gaps cannot draw map-spanning lines',()=>{
 const pool=new DriftTrailPool({capacity:96,markCapacity:48}),p=pose(),rgb=[0,.7,.8];for(let i=0;i<1000;i++){pool.update(.02);p.x=i*1.4;pool.sample(p,.02,rgb);}assert.ok(pool.stats().points<=96);assert.ok(pool.stats().marks<=48);const cursor=pool.markCursor;p.x=5000;p.resets++;pool.sample(p,.02,rgb);assert.equal(pool.markCursor,cursor);p.drifting=false;pool.sample(p,.02,rgb);p.x+=20;p.drifting=true;pool.sample(p,.02,rgb);assert.equal(pool.markCursor,cursor);pool.clear();assert.equal(pool.stats().points,0);assert.equal(pool.last.size,0);const big=new DriftTrailPool();big.setLow(true);assert.equal(big.budget,384);assert.equal(big.markBudget,256);for(const color of COLORS)assert.equal(trailColor(color),color);
});
test('distance-based trail density is consistent at different render rates',()=>{
 const totals=[];for(const hz of [20,30,60,144]){const pool=new DriftTrailPool(),p=pose();pool.sample(p,0,[1,0,0]);for(let i=1;i<=hz*2;i++){pool.update(1/hz);p.x=i/hz*35;pool.sample(p,1/hz,[1,0,0]);}totals.push(pool.cursor);}assert.ok(Math.max(...totals)-Math.min(...totals)<=2,JSON.stringify(totals));
});
test('collision display interpolation and bounded network prediction cannot cross the guardrail',()=>{
 const track=makeTrack('beach'),q=atDistance(track,75),limit=track.width/2-1.15,p={...pose(),x:q.x+q.nx*limit,z:q.z+q.nz*limit,index:q.index,y:q.y,yaw:q.h,vx:q.nx*40,vz:q.nz*40,collision:.3};const snap=player=>({track:'beach',status:'racing',players:[player],time:0});const stream=new SnapshotStream();stream.push(snap(p),0,0,0);stream.push(snap({...p}),.1,0,.1);const out=stream.sample(.3).players[0],road=nearest(track,out.x,out.z,out.index);assert.ok(Math.abs(road.offset)<=limit+.001);assert.deepEqual(stream.frames[0].snapshot.players[0],p);
 const race=new Race({count:2}),human=race.addHuman('Driver');race.start();race.time=1;race.status='racing';race.setInput(human.id,{throttle:1});for(let i=0;i<200;i++)race.tick(1/60);const previous=race.snapshot();race.reset(human);const current=race.snapshot(),display=interpolateRaceSnapshots(previous,current,.1).players.find(p=>p.id===human.id);assert.equal(display.x,human.x);assert.equal(display.z,human.z);
});
