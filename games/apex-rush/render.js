import * as T from './vendor/three.module.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';
import {atDistance,angle,nearest} from './tracks.js';
import {ChaseCameraRig} from './camera-rig.js';
import {DriftTrailPool,trailColor} from './drift-trails.js';
import {ResolutionBudget} from './performance.js';
const Y=new T.Vector3(0,1,0);
function rng(seed=97){return ()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}
function canvasTexture(w,h,paint){const c=document.createElement('canvas');c.width=w;c.height=h;paint(c.getContext('2d'),w,h);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;}
function roadTexture(){const r=rng();const t=canvasTexture(128,128,(c,w,h)=>{c.fillStyle='#4f626b';c.fillRect(0,0,w,h);for(let i=0;i<8500;i++){c.fillStyle=r()>.5?'rgba(255,255,255,.08)':'rgba(12,25,34,.10)';c.fillRect(r()*w,r()*h,1+r(),1+r());}});t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=8;return t;}
function labelTexture(text,bg='#163f54',fg='#ffffff',w=512,h=96){return canvasTexture(w,h,(c)=>{c.fillStyle=bg;c.fillRect(0,0,w,h);c.fillStyle=fg;c.textAlign='center';c.textBaseline='middle';c.font='bold '+Math.floor(h*.53)+'px Bahnschrift, Microsoft YaHei, sans-serif';c.fillText(text,w/2,h/2);});}
function skyTexture(coast){return canvasTexture(1024,512,(c,w,h)=>{const g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,coast?'#409fc4':'#657bbb');g.addColorStop(.46,coast?'#b5e4ef':'#c9daef');g.addColorStop(.62,coast?'#fff1d3':'#f5d7c3');g.addColorStop(1,'#77918b');c.fillStyle=g;c.fillRect(0,0,w,h);const r=rng(9);for(let i=0;i<35;i++){const x=r()*w,y=50+r()*150;const glow=c.createRadialGradient(x,y,0,x,y,70);glow.addColorStop(0,'rgba(255,255,255,.55)');glow.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=glow;c.fillRect(x-90,y-30,180,60);}});}
function bodyGeometry(){const rings=[[-2.28,.78,.18,.53],[-1.82,.99,.17,.7],[-.73,1.05,.16,.78],[.88,1.00,.2,.78],[1.7,.86,.3,.66],[2.12,.73,.34,.52]],v=[],ind=[];for(const [x,w,b,t] of rings)v.push(x,b,-w*.90,x,b+.10,-w,x,t-.08,-w,x,t,-w*.85,x,t,w*.85,x,t-.08,w,x,b+.10,w,x,b,w*.90);for(let i=0;i<rings.length-1;i++)for(let j=0;j<8;j++){const a=i*8+j,b=i*8+(j+1)%8,c=b+8,d=a+8;ind.push(a,b,d,b,c,d);}for(let j=1;j<7;j++){ind.push(0,j+1,j,40,40+j,40+j+1);}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(v,3));g.setIndex(ind);g.computeVertexNormals();return g;}
export function makeCar(color='#f15a40',detail=true){
 const root=new T.Group(),body=new T.Group();root.add(body);const wheels=[];
 const paint=new T.MeshPhysicalMaterial({color,metalness:.68,roughness:.24,clearcoat:1,clearcoatRoughness:.13});
 const carbon=new T.MeshStandardMaterial({color:'#18212a',metalness:.25,roughness:.5}),glass=new T.MeshPhysicalMaterial({color:'#092131',metalness:.05,roughness:.18,clearcoat:.15,envMapIntensity:.10}),metal=new T.MeshStandardMaterial({color:'#d4dce2',metalness:.94,roughness:.2}),rubber=new T.MeshStandardMaterial({color:'#101820',roughness:.94});
 const part=(g,m,x,y,z,rot=null)=>{const mesh=new T.Mesh(g,m);mesh.position.set(x,y,z);if(rot)mesh.rotation.set(...rot);mesh.castShadow=true;body.add(mesh);return mesh;};
 part(bodyGeometry(),paint,0,.22,0);part(new T.BoxGeometry(4.45,.16,1.99),carbon,-.02,.4,0);
 // A sloped cockpit and continuous glass canopy sit between front and rear fenders.
 const canopy=new T.BufferGeometry();canopy.setAttribute('position',new T.Float32BufferAttribute([-.98,.86,-.77,-.65,1.36,-.59,.36,1.39,-.56,1.03,.85,-.71,-.98,.86,.77,-.65,1.36,.59,.36,1.39,.56,1.03,.85,.71],3));canopy.setIndex([0,1,4,1,5,4,1,2,5,2,6,5,2,3,6,3,7,6,4,5,7,5,6,7,0,3,1,1,3,2]);for(let i=0;i<canopy.index.array.length;i+=3){const v=canopy.index.array[i+1];canopy.index.array[i+1]=canopy.index.array[i+2];canopy.index.array[i+2]=v;}canopy.computeVertexNormals();part(canopy,glass,0,.17,0);part(new T.BoxGeometry(1.05,.065,1.18),paint,-.12,1.56,0);
 for(const z of [-1.02,1.02]){
  part(new T.BoxGeometry(1.15,.14,.15),paint,1.26,.81,z*.92);part(new T.BoxGeometry(1.05,.14,.15),paint,-1.47,.80,z*.97);
  for(const x of [-1.40,1.35]){
   const w=new T.Group();w.position.set(x,.48,z);body.add(w);
   const tire=new T.Mesh(new T.CylinderGeometry(.47,.47,.30,20),rubber);tire.rotation.x=Math.PI/2;tire.castShadow=true;w.add(tire);
   for(const sign of [-1,1]){
    const rim=new T.Mesh(new T.CylinderGeometry(.32,.32,.015,16),metal);rim.rotation.x=Math.PI/2;rim.position.z=sign*.16;w.add(rim);
    const disc=new T.Mesh(new T.CylinderGeometry(.20,.20,.024,16),carbon);disc.rotation.x=Math.PI/2;disc.position.z=sign*.18;w.add(disc);
    for(let j=0;j<(detail?5:0);j++){const spoke=new T.Mesh(new T.BoxGeometry(.035,.51,.025),metal);spoke.position.z=sign*.195;spoke.rotation.z=j*Math.PI/5;w.add(spoke);}
    const cap=new T.Mesh(new T.SphereGeometry(.077,8,6),paint);cap.position.z=sign*.20;w.add(cap);
   }wheels.push({object:w,front:x>0});
  }
  part(new T.BoxGeometry(.28,.13,.19),carbon,.68,1.05,z*1.03);
  part(new T.BoxGeometry(.11,.23,.09),metal,-1.62,1.09,z*.69);
 }
 part(new T.BoxGeometry(.47,.1,2.25),carbon,-1.65,1.26,0);part(new T.BoxGeometry(.09,.26,2.25),paint,-1.91,1.2,0);
 const head=new T.MeshStandardMaterial({color:'#e9fcff',emissive:'#9ef4ff',emissiveIntensity:1.8}),tail=new T.MeshStandardMaterial({color:'#ff442d',emissive:'#ff2211',emissiveIntensity:1.5});
 for(const z of [-.54,.54]){part(new T.BoxGeometry(.04,.11,.49),head,2.11,.74,z);part(new T.BoxGeometry(.04,.09,.52),tail,-2.29,.70,z);part(new T.CylinderGeometry(.10,.13,.19,10),metal,-2.32,.43,z,[0,0,Math.PI/2]);}
 for(const z of [-.20,.20])part(new T.BoxGeometry(1.05,.015,.14),carbon,1.41,.97,z);
 const flame=new T.Group();root.add(flame);
 const fm=new T.MeshBasicMaterial({color:'#46dfff',transparent:true,opacity:.85,depthWrite:false,blending:T.AdditiveBlending});
 for(const z of [-.52,.52]){const m=new T.Mesh(new T.ConeGeometry(.22,2.4,10),fm);m.rotation.z=-Math.PI/2;m.position.set(-3.35,.46,z);flame.add(m);const core=new T.Mesh(new T.ConeGeometry(.1,1.8,8),new T.MeshBasicMaterial({color:'#fff8cc'}));core.rotation.z=-Math.PI/2;core.position.set(-3.2,.46,z);flame.add(core);}flame.visible=false;
 function mergeParts(group){const map=new Map();for(const child of [...group.children])if(child.isMesh){const g=child.geometry.clone();g.deleteAttribute('uv');child.updateMatrix();g.applyMatrix4(child.matrix);if(!map.has(child.material))map.set(child.material,[]);map.get(child.material).push(g);group.remove(child);child.geometry.dispose();}for(const [m,gs] of map){const mesh=new T.Mesh(mergeGeometries(gs),m);mesh.castShadow=true;group.add(mesh);gs.forEach(g=>g.dispose());}}mergeParts(body);wheels.forEach(w=>{if(!detail)for(const m of [...w.object.children])if(m.material===carbon||m.material===paint){w.object.remove(m);m.geometry.dispose();}mergeParts(w.object);});mergeParts(flame);return {root,body,wheels,flame};
}
export class RaceView{
 constructor(canvas,quality='auto'){
  this.resolution=new ResolutionBudget(quality);
  this.canvas=canvas;this.renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.88;this.renderer.shadowMap.type=T.PCFSoftShadowMap;
  this.rig=new ChaseCameraRig();this.trailPalette=new Map();this.camera=new T.PerspectiveCamera(62,1,.15,950);this.cars=new Map();this.elapsed=0;this.stats={fps:0,calls:0,triangles:0};this.frames=0;this.lastFps=performance.now();this.quality=quality;this.cameraMode=0;this.camReady=false;this.sparks=[];this.reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);this.resize();
 }
 resize(){const w=this.canvas.clientWidth,h=this.canvas.clientHeight;if(!w||!h)return;const ratio=this.resolution.ratio(devicePixelRatio,w,h);if(Math.abs(this.renderer.getPixelRatio()-ratio)>.001)this.renderer.setPixelRatio(ratio);this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
 setQuality(q){this.resolution.setQuality(q);this.quality=this.resolution.quality;this.renderer.shadowMap.enabled=this.quality!=='low';if(this.sun){const size=this.quality==='high'?2048:1024;this.sun.shadow.mapSize.set(size,size);this.sun.shadow.map?.dispose();this.sun.shadow.map=null;this.sun.shadow.needsUpdate=true;}this.resize();}
 load(track){
  if(this.scene){this.scene.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material]){m.map?.dispose();m.dispose();}}});this.environment?.dispose();}
  this.track=track;this.scene=new T.Scene();this.cars.clear();this.camReady=false;this.elapsed=0;this.sparks=[];
  const coast=track.theme==='coast',sky=skyTexture(coast);sky.mapping=T.EquirectangularReflectionMapping;this.scene.background=sky;const pmrem=new T.PMREMGenerator(this.renderer);this.environment=pmrem.fromEquirectangular(sky);this.scene.environment=this.environment.texture;pmrem.dispose();this.scene.fog=new T.Fog(coast?'#cae7e9':'#d6d8e8',160,500);
  this.scene.add(new T.HemisphereLight('#d5f4ff',coast?'#bfae79':'#847e94',1.35));const sun=new T.DirectionalLight('#fff0d6',2.2);sun.position.set(-50,130,-65);sun.castShadow=true;sun.shadow.mapSize.set(this.quality==='high'?2048:1024,this.quality==='high'?2048:1024);sun.shadow.camera.left=-55;sun.shadow.camera.right=55;sun.shadow.camera.top=55;sun.shadow.camera.bottom=-55;sun.shadow.camera.far=300;sun.shadow.bias=-.0005;sun.shadow.normalBias=.08;this.scene.add(sun,sun.target);this.sun=sun;this.renderer.shadowMap.enabled=this.quality!=='low';
  const batches=new Map(),mats=new Map();const material=(key,color,opt={})=>{if(!mats.has(key))mats.set(key,new T.MeshStandardMaterial({color,roughness:.79,...opt}));return mats.get(key);};
  const add=(geo,key,color,x,y,z,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0,opt={})=>{const matrix=new T.Matrix4().compose(new T.Vector3(x,y,z),new T.Quaternion().setFromEuler(new T.Euler(rx,ry,rz)),new T.Vector3(sx,sy,sz));geo.applyMatrix4(matrix);const mat=material(key,color,opt);if(!batches.has(mat))batches.set(mat,[]);batches.get(mat).push(geo);};
  const box=(key,c,x,y,z,sx,sy,sz,ry=0)=>add(new T.BoxGeometry(1,1,1),key,c,x,y,z,sx,sy,sz,0,ry);
  const cylinder=(key,c,x,y,z,r,h,ry=0,segments=9)=>add(new T.CylinderGeometry(r,r,h,segments),key,c,x,y,z,1,1,1,0,ry);
  const seaMat=new T.MeshPhysicalMaterial({color:coast?'#258fa9':'#6c99ba',metalness:.32,roughness:.2,clearcoat:1});this.waveTime={value:0};seaMat.onBeforeCompile=shader=>{shader.uniforms.waveTime=this.waveTime;shader.vertexShader='uniform float waveTime;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n transformed.z += sin(position.x*.09+waveTime*.9)*.12 + cos(position.y*.12+waveTime*.7)*.13;');};const sea=new T.Mesh(new T.PlaneGeometry(2000,2000,120,120),seaMat);sea.rotation.x=-Math.PI/2;sea.position.y=-.8;this.scene.add(sea);
  const landShape=new T.Shape();for(let j=0;j<=96;j++){const a=j/96*Math.PI*2,r=(coast?245:340)+Math.sin(a*7)*12,x=Math.cos(a)*r,z=Math.sin(a)*(coast&&Math.sin(a)<0?165:r)+25;j===0?landShape.moveTo(x,z):landShape.lineTo(x,z);}const land=new T.Mesh(new T.ShapeGeometry(landShape),material('ground',coast?'#ebd6a5':'#bec6bd'));land.rotation.x=Math.PI/2;land.position.y=-.05;land.material.side=T.DoubleSide;land.receiveShadow=true;this.scene.add(land);
  const a=track.samples;
  const ribbon=(width,shift=0,dy=0)=>{const pos=[],uv=[],idx=[];a.forEach((p,i)=>{for(const s of [-1,1]){pos.push(p.x+p.nx*(shift+s*width/2),p.y+dy,p.z+p.nz*(shift+s*width/2));uv.push(i*.7,s===-1?0:track.width/3);}const n=(i+1)%a.length,k=i*2,l=n*2;idx.push(k,l,k+1,l,l+1,k+1);});const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;};
  const asphalt=new T.Mesh(ribbon(track.width),new T.MeshStandardMaterial({map:roadTexture(),roughness:.97,side:T.DoubleSide}));asphalt.receiveShadow=true;this.scene.add(asphalt);
  for(const side of [-1,1]){const verge=new T.Mesh(ribbon(2.4,side*(track.width/2+1),-.04),material('verge',coast?'#ded7b4':'#e5dcd4'));verge.material.side=T.DoubleSide;verge.receiveShadow=true;this.scene.add(verge);}
  for(let s=0;s<track.length;s+=3){
   const p=atDistance(track,s),q=atDistance(track,s+3),len=Math.hypot(q.x-p.x,q.z-p.z),rot=-p.h;
   for(const side of [-1,1]){const x=p.x+p.nx*(track.width/2+.35)*side,z=p.z+p.nz*(track.width/2+.35)*side;box(Math.floor(s/3)%2?'curbwhite':'curbred',Math.floor(s/3)%2?'#f4efe4':coast?'#24b5c8':'#de694e',x,p.y+.07,z,len+.2,.20,.65,rot);box('rail',coast?'#f1eee0':'#e9e5e1',p.x+p.nx*(track.width/2+1.2)*side,p.y+.69,p.z+p.nz*(track.width/2+1.2)*side,len+.15,.48,.27,rot);
    if(Math.floor(s)%12<3)cylinder('posts','#84969a',p.x+p.nx*(track.width/2+1.2)*side,p.y+.41,p.z+p.nz*(track.width/2+1.2)*side,.11,.82,0,6);
   }
   if(Math.floor(s/3)%5===0)box('lane','#eee9dc',p.x,p.y+.014,p.z,len,.017,.14,rot);
  }
  // Start gantry, checkerboard finish carpet, and roadside turn boards.
  const start=atDistance(track,22);
  for(let x=0;x<4;x++)for(let y=0;y<12;y++){const pos=atDistance(track,20+x*.55),o=-track.width/2+(y+.5)*track.width/12;box((x+y)%2?'checkerblack':'checkerwhite',(x+y)%2?'#203943':'#ffffff',pos.x+pos.nx*o,pos.y+.023,pos.z+pos.nz*o,.55,.018,track.width/12+.01,-pos.h);}
  for(const side of [-1,1])box('gantry','#174d63',start.x+start.nx*side*(track.width/2+1),4.1,start.z+start.nz*side*(track.width/2+1),.7,8,.7,-start.h);
  box('gantry','#174d63',start.x,8.0,start.z,.8,1.8,track.width+3,-start.h);
  const banner=new T.Mesh(new T.PlaneGeometry(track.width+1,1.5),new T.MeshBasicMaterial({map:labelTexture('APEX / '+track.name),side:T.DoubleSide}));banner.position.set(start.x-.5*Math.cos(start.h),8,start.z-.5*Math.sin(start.h));banner.rotation.y=-Math.PI/2-start.h;this.scene.add(banner);
  for(let s=45;s<track.length;s+=55){const p=atDistance(track,s),turn=angle(atDistance(track,s+35).h-p.h);if(Math.abs(turn)>.35){const side=turn>0?-1:1,o=track.width/2+2;box('boards','#f6c650',p.x+p.nx*o*side,p.y+1.4,p.z+p.nz*o*side,2.9,1.5,.12,-p.h);box('boardline','#28495d',p.x+p.nx*o*side,p.y+1.4,p.z+p.nz*o*side,1.6,.27,.16,-p.h+Math.sign(turn)*.5);}}
  const random=rng(coast?24:69);
  const nearRoad=(x,z,min=18)=>nearest(track,x,z).distance<min;
  function palm(x,z,h){cylinder('trunk','#a48757',x,h/2,z,.21,h,0,10);for(let k=0;k<9;k++){const an=k*Math.PI*2/9,pos=[],idx=[];for(let j=0;j<=9;j++){const f=j/9,l=f*4.6,w=Math.sin(f*Math.PI)*.62,y=.7*Math.sin(f*Math.PI)-f*f*1.2;pos.push(l,y,-w,l,y,w);if(j<9){const i=j*2;idx.push(i,i+2,i+1,i+1,i+2,i+3);}}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();add(g,'palmleaf','#428764',x,h,z,1,1,1,0,an,0,{side:T.DoubleSide});}add(new T.SphereGeometry(.46,8,6),'coconut','#847245',x,h-.18,z);}
  function tree(x,z,h=6){cylinder('trunk','#8c7b62',x,1.3,z,.24,2.6);add(new T.IcosahedronGeometry(1,1),'leaves','#6c9679',x,3.5,z,h*.55,h*.55,h*.55);}
  if(coast){
   for(let i=0;i<90;i++){const p=atDistance(track,random()*track.length),side=i%2?1:-1,o=track.width/2+5+random()*12,x=p.x+p.nx*o*side,z=p.z+p.nz*o*side;if(!nearRoad(x,z,13))palm(x,z,5+random()*4);}
   // Beach parasols, loungers and boardwalk props beside the coastal straight.
   for(let i=0;i<24;i++){const x=-135+i*10,z=-119-random()*9;cylinder('umbrellaPole','#f5ead6',x,1.7,z,.075,3.4);add(new T.ConeGeometry(2.2,.9,10),i%2?'umbrellaorange':'umbrellawhite',i%2?'#ed784e':'#fff4d9',x,3.6,z);box('lounger','#f6eee0',x+2,.4,z+1,1,.15,2.5);}
   for(let i=0;i<18;i++){const x=-95+random()*135,z=5+random()*80;if(nearRoad(x,z,26))continue;const w=9+random()*9,h=6+random()*9;box(i%2?'housewhite':'housepeach',i%2?'#f2ece1':'#f0b89b',x,h/2,z,w,h,9);add(new T.ConeGeometry(1,1,4),'roof','#bd6e56',x,h+2,z,w*.8,4,9*.8,0,Math.PI/4);for(let k=0;k<3;k++)box('window','#548c9c',x-w*.32+k*w*.32,h*.60,z-4.55,1.6,2,.12);box('door','#8a7760',x,h*.22,z-4.6,1.8,3,.14);}
   // Lighthouse and breakwater.
   cylinder('lighthouse','#faf0df',143,11,207,4,22,0,20);cylinder('lighthouseband','#dc6849',143,14,207,4.1,2.5,0,20);cylinder('lantern','#315d73',143,23,207,3,3.8,0,12);add(new T.ConeGeometry(4.2,2.2,16),'roof','#b85d45',143,26.0,207);
   for(let i=0;i<30;i++)add(new T.IcosahedronGeometry(1,0),'rocks','#9eaab0',-225+random()*480,-.0,210+random()*10,3+random()*2,1.2+random()*1.5,2+random()*3);
   for(let i=0;i<7;i++){const x=-230+random()*460,z=-230-random()*140;box('boat','#f9f3df',x,.15,z,13,2.3,4);cylinder('mast','#efe9d5',x,8,z,.09,15);add(new T.ConeGeometry(4,11,3),'sail','#f8ede0',x+1.9,8,z,1,1,.05);}
   // Short sandstone covered section: repeated arches frame the return bend.
   for(let s=track.length*.70;s<track.length*.735;s+=7){const p=atDistance(track,s);for(const side of [-1,1])box('tunnel','#d7bc8c',p.x+p.nx*side*(track.width/2+3),5,p.z+p.nz*side*(track.width/2+3),1.3,10,3,-p.h);box('tunnel','#d7bc8c',p.x,10,p.z,1.3,1.3,track.width+9,-p.h);}
   // Ripple lines near the beach are inexpensive geometry, not frame-by-frame meshes.
   for(let i=0;i<18;i++)box('waves','#74cad1',-20,-.71,-171-i*7,250+random()*70,.035,.26);
   for(let i=0;i<12;i++){const x=-330+random()*650,z=275+random()*170;add(new T.ConeGeometry(1,1,7),'mountain','#9eb7a0',x,16,z,35+random()*50,50+random()*45,30+random()*50);}
  }else{
   const fronts=['#eaded0','#d9c9b5','#cddbdc','#d5bda8','#efe6d9'];
   for(let z=-145;z<=145;z+=31)for(let x=-175;x<=147;x+=29){if(nearRoad(x,z,23))continue;const w=18+random()*6,d=16+random()*5,h=12+random()*24;box('building'+Math.floor(random()*5),fronts[Math.floor(random()*5)],x,h/2,z,w,h,d);box('cornice','#f4ece0',x,h,z,w+1,.8,d+1);add(new T.ConeGeometry(1,1,4),'cityroof','#637482',x,h+2,z,w*.73,4,d*.73,0,Math.PI/4);for(let f=0;f<Math.floor(h/4);f++)for(let k=0;k<4;k++){box('citywindow','#68858e',x-w*.35+k*w*.23,3+f*4,z-d/2-.07,1.4,2.0,.12);box('sill','#f1e7d7',x-w*.35+k*w*.23,2+f*4,z-d/2-.2,1.7,.18,.5);box('citywindow','#68858e',x-w/2-.08,3+f*4,z-d*.35+k*d*.23,.12,2,1.4);}box('entrance','#536575',x,1.6,z-d/2-.1,2.4,3.2,.14);}
   for(let i=0;i<56;i++){const p=atDistance(track,i*track.length/56),o=track.width/2+4,side=i%2?1:-1;cylinder('lamp','#5c6e78',p.x+p.nx*o*side,3.5,p.z+p.nz*o*side,.095,7);box('light','#ffe5ac',p.x+p.nx*o*side,7,p.z+p.nz*o*side,.65,.30,.65);if(i%3===0)tree(p.x+p.nx*(o+5)*side,p.z+p.nz*(o+5)*side,5);}
   // Landmark clock tower, arched windows, blue copper roof and a legible clock.
   box('tower','#e8d9c4',-155,19,-125,11,38,11);box('cornice','#f4ece0',-155,37,-125,14,1,14);add(new T.ConeGeometry(9,13,4),'cityroof','#498a99',-155,44,-125,1,1,1,0,Math.PI/4);
   const clock=canvasTexture(128,128,(c)=>{c.fillStyle='#f8f1de';c.beginPath();c.arc(64,64,60,0,Math.PI*2);c.fill();c.strokeStyle='#264551';c.lineWidth=3;for(let j=0;j<12;j++){c.beginPath();c.moveTo(64+48*Math.cos(j*Math.PI/6),64+48*Math.sin(j*Math.PI/6));c.lineTo(64+55*Math.cos(j*Math.PI/6),64+55*Math.sin(j*Math.PI/6));c.stroke();}c.lineWidth=5;c.beginPath();c.moveTo(42,58);c.lineTo(64,64);c.lineTo(73,29);c.stroke();});const cm=new T.Mesh(new T.PlaneGeometry(6,6),new T.MeshBasicMaterial({map:clock}));cm.position.set(-155,30,-130.6);cm.rotation.y=Math.PI;this.scene.add(cm);
   for(let i=0;i<45;i++){const a=i*Math.PI*2/45,r=300;const h=18+random()*28;box('skyline','#b0becb',Math.cos(a)*r,h/2,Math.sin(a)*r,15+random()*25,h,15+random()*25);}
   // Plaza fountain and terracotta paving.
   cylinder('fountain','#e7e3d6',-40,.4,-125,11,.8,0,32);cylinder('water','#66b7c5',-40,.88,-125,9,.08,0,32);cylinder('fountain','#e7e3d6',-40,2,-125,1.3,3,0,16);
  }
  for(const [mat,geos] of batches){geos.forEach(g=>g.deleteAttribute('uv'));const merged=mergeGeometries(geos,false);for(const g of geos)g.dispose();const m=new T.Mesh(merged,mat);m.castShadow=true;m.receiveShadow=true;this.scene.add(m);}
  // One pooled trail point cloud handles dust, tire sparks and exhaust wisps.
  this.particlePositions=new Float32Array(500*3);this.particleColors=new Float32Array(500*3);this.particleLives=new Float32Array(500);this.particleVel=new Float32Array(500*3);this.particleIndex=0;
  const pg=new T.BufferGeometry();pg.setAttribute('position',new T.BufferAttribute(this.particlePositions,3));pg.setAttribute('color',new T.BufferAttribute(this.particleColors,3));this.particles=new T.Points(pg,new T.PointsMaterial({map:canvasTexture(32,32,c=>{const g=c.createRadialGradient(16,16,0,16,16,16);g.addColorStop(0,'rgba(255,255,255,.9)');g.addColorStop(.35,'rgba(255,255,255,.45)');g.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=g;c.fillRect(0,0,32,32);}),size:.48,vertexColors:true,transparent:true,opacity:.48,depthWrite:false}));this.particles.frustumCulled=false;this.scene.add(this.particles);
  this.trails=new DriftTrailPool();
  const trailMaterial=(smoke=false)=>new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,uniforms:{viewport:{value:this.canvas.clientHeight},map:{value:this.particles.material.map}},vertexShader:'attribute vec3 color;attribute float alpha;attribute float size;varying vec3 vColor;varying float vAlpha;uniform float viewport;void main(){vColor=color;vAlpha=alpha;vec3 p=position;'+(smoke?'p.y+=(1.0-alpha)*0.9;':'')+'vec4 mv=modelViewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*mv;'+(smoke?'gl_PointSize=clamp(size*viewport/max(1.0,-mv.z),1.0,180.0);':'')+'}',fragmentShader:'uniform sampler2D map;varying vec3 vColor;varying float vAlpha;void main(){float a=vAlpha*'+(smoke?'texture2D(map,gl_PointCoord).a*0.60':'0.55')+';if(a<0.005)discard;gl_FragColor=vec4(vColor,a);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'});
  const cloud=new T.BufferGeometry();for(const [name,array,itemSize]of [['position',this.trails.positions,3],['color',this.trails.colors,3],['alpha',this.trails.alpha,1],['size',this.trails.sizes,1]])cloud.setAttribute(name,new T.BufferAttribute(array,itemSize).setUsage(T.DynamicDrawUsage));
  this.driftSmoke=new T.Points(cloud,trailMaterial(true));this.driftSmoke.frustumCulled=false;this.scene.add(this.driftSmoke);
  const marks=new T.BufferGeometry();for(const [name,array,itemSize]of [['position',this.trails.markPositions,3],['color',this.trails.markColors,3],['alpha',this.trails.markAlpha,1]])marks.setAttribute(name,new T.BufferAttribute(array,itemSize).setUsage(T.DynamicDrawUsage));
  this.driftMarks=new T.Mesh(marks,trailMaterial());this.driftMarks.frustumCulled=false;this.scene.add(this.driftMarks);
  this.resetMotion();
 }
 emit(x,y,z,color,vx=0,vz=0){const i=this.particleIndex++%500,k=i*3,c=new T.Color(color);this.particlePositions.set([x,y,z],k);this.particleColors.set([c.r,c.g,c.b],k);this.particleVel.set([vx,.3+Math.random()*.5,vz],k);this.particleLives[i]=.5+Math.random()*.4;}
 updateParticles(dt){for(let i=0;i<500;i++){const k=i*3;this.particleLives[i]-=dt;if(this.particleLives[i]<=0){this.particlePositions[k+1]=-100;continue;}for(let j=0;j<3;j++)this.particlePositions[k+j]+=this.particleVel[k+j]*dt;}this.particles.geometry.attributes.position.needsUpdate=true;this.particles.geometry.attributes.color.needsUpdate=true;}
 resetMotion(){this.rig.reset();this.camReady=false;this.trails?.clear();}
 render(snapshot,localId,dt=.016,menu=false){
  if(!this.scene)return;if(this.resolution.sample(dt,!menu))this.resize();dt=Math.min(dt,.1);this.elapsed+=dt;if(this.waveTime)this.waveTime.value=this.elapsed;
  const p=snapshot.players.find(p=>p.id===localId)||snapshot.players[0];let target=new T.Vector3(p.x,p.y+1,p.z);
  this.trails.setLow(this.quality==='low'||this.reduce||this.resolution.scale<.7);this.trails.update(dt);
  for(const state of snapshot.players){
   let car=this.cars.get(state.id);if(!car){car=makeCar(state.color,state.id===localId);this.cars.set(state.id,car);this.scene.add(car.root);}
   const boosting=state.boostTime>0||state.miniTime>0;car.root.position.set(state.x,state.y+.05,state.z);car.root.rotation.y=-state.yaw;car.body.rotation.x=state.steer*state.speed*.0009;car.body.rotation.z=(boosting?-.015:0);car.flame.visible=boosting;car.flame.scale.x=.85+Math.sin(this.elapsed*45)*.18;
   for(const w of car.wheels){w.object.rotation.z+=state.speed*dt/.47;if(w.front)w.object.rotation.y=-state.steer*.35;}
   const key=trailColor(state.color);let rgb=this.trailPalette.get(key);if(!rgb){rgb=new T.Color(key).toArray();this.trailPalette.set(key,rgb);}this.trails.sample(state,dt,rgb,{enabled:!menu&&(!this.trails.low||state.id===localId||Math.hypot(state.x-p.x,state.z-p.z)<45),remote:state.id!==localId});
   if(state.collision>0&&!this.reduce)this.emit(state.x,state.y+.4,state.z,'#ffcf66',Math.random()*4-2,Math.random()*4-2);
  }
  this.updateParticles(dt);
  if(!this.camReady)this.rig.reset();const pose=this.rig.sample(p,dt,{mode:this.cameraMode,menu,elapsed:this.elapsed,reduce:this.reduce});this.camera.position.set(pose.position.x,pose.position.y,pose.position.z);this.look=new T.Vector3(pose.look.x,pose.look.y,pose.look.z);this.camera.lookAt(this.look);this.camReady=true;
  const fov=this.cameraMode===1?76:62+(!menu&&!this.reduce?p.speed*.1+(p.boostTime>0?5:0):0);this.camera.fov+=(fov-this.camera.fov)*(1-Math.exp(-dt*4));this.camera.updateProjectionMatrix();
  this.driftSmoke.geometry.setDrawRange(0,this.trails.budget);this.driftMarks.geometry.setDrawRange(0,this.trails.markBudget*6);this.driftSmoke.material.uniforms.viewport.value=this.canvas.clientHeight*this.renderer.getPixelRatio();for(const mesh of [this.driftSmoke,this.driftMarks])for(const attribute of Object.values(mesh.geometry.attributes))attribute.needsUpdate=true;
  this.sun.position.set(target.x-40,120,target.z-60);this.sun.target.position.copy(target);
  for(const [id,car] of this.cars)car.root.visible=id===localId||(!menu&&car.root.position.distanceToSquared(this.camera.position)>12);
  this.renderer.render(this.scene,this.camera);this.frames++;const now=performance.now();if(now-this.lastFps>1000){this.stats={fps:Math.round(this.frames*1000/(now-this.lastFps)),calls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles};this.frames=0;this.lastFps=now;}
 }
 dispose(){this.resizeObserver.disconnect();if(this.scene){const textures=new Set();this.scene.traverse(o=>{o.geometry?.dispose();for(const mat of [].concat(o.material||[])){for(const value of Object.values(mat))if(value?.isTexture)textures.add(value);mat.dispose();}});this.scene.background?.dispose?.();for(const t of textures)t.dispose();}this.environment?.dispose();this.renderer.dispose();}
}
