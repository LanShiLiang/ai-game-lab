export const TAU = Math.PI * 2;
export const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
export const angle = v=>Math.atan2(Math.sin(v),Math.cos(v));
const defs={
 beach:{id:'beach',name:'滨海沙滩',subtitle:'COASTLINE CIRCUIT',width:19,laps:2,difficulty:'舒展海岸 · 高速 S 弯',theme:'coast',points:[[-160,-85],[-65,-85],[40,-85],[105,-70],[145,-20],[122,35],[165,78],[155,137],[106,178],[40,155],[-10,176],[-62,130],[-127,136],[-176,88],[-163,32],[-205,-8],[-193,-61]]},
 city:{id:'city',name:'十一城',subtitle:'ELEVEN CITY RUN',width:17,laps:2,difficulty:'连续发卡 · 节奏漂移',theme:'city',points:[[-180,-180],[-30,-180],[145,-180],[185,-151],[185,-113],[148,-82],[10,-82],[-105,-82],[-138,-52],[-106,-20],[12,-20],[145,-20],[179,10],[146,40],[12,40],[-104,40],[-138,70],[-105,101],[12,101],[142,101],[177,134],[145,175],[85,188],[48,156],[10,188],[-29,156],[-67,188],[-104,157],[-142,190],[-190,159],[-207,101],[-207,15],[-207,-91],[-201,-148]]}
};
function spline(p0,p1,p2,p3,t){const t2=t*t,t3=t2*t;return [0,1].map(k=>.5*((2*p1[k])+(-p0[k]+p2[k])*t+(2*p0[k]-5*p1[k]+4*p2[k]-p3[k])*t2+(-p0[k]+3*p1[k]-3*p2[k]+p3[k])*t3));}
export function makeTrack(id='beach'){
 const d=defs[id]||defs.beach,p=d.points,raw=[];
 for(let i=0;i<p.length;i++){const a=p[(i+p.length-1)%p.length],b=p[i],c=p[(i+1)%p.length],e=p[(i+2)%p.length],n=Math.max(10,Math.ceil(Math.hypot(c[0]-b[0],c[1]-b[1])/2));for(let j=0;j<n;j++){const q=spline(a,b,c,e,j/n);raw.push({x:q[0],z:q[1]});}}
 let length=0;raw.forEach((q,i)=>{if(i)length+=Math.hypot(q.x-raw[i-1].x,q.z-raw[i-1].z);q.s=length;});length+=Math.hypot(raw.at(-1).x-raw[0].x,raw.at(-1).z-raw[0].z);
 raw.forEach((q,i)=>{const a=raw[(i+raw.length-1)%raw.length],b=raw[(i+1)%raw.length],h=Math.atan2(b.z-a.z,b.x-a.x);q.h=h;q.nx=-Math.sin(h);q.nz=Math.cos(h);q.y=d.theme==='coast'? .18+Math.pow(Math.max(0,Math.sin((q.s/length-.23)*Math.PI*6)),2)*3.8*(q.s/length>.23&&q.s/length<.4?1:0):.18;});
 return {...d,samples:raw,length};
}
export const TRACKS=Object.values(defs);
export function atDistance(track,s){
 s=((s%track.length)+track.length)%track.length;const a=track.samples;let lo=0,hi=a.length-1;while(lo<hi){const m=(lo+hi+1)>>1;if(a[m].s<=s)lo=m;else hi=m-1;}const q=a[lo],r=a[(lo+1)%a.length],span=(r.s>q.s?r.s:track.length)-q.s,f=clamp((s-q.s)/span,0,1);return {x:q.x+(r.x-q.x)*f,z:q.z+(r.z-q.z)*f,y:q.y+(r.y-q.y)*f,h:q.h+angle(r.h-q.h)*f,nx:q.nx,nz:q.nz,index:lo,s};
}
export function nearest(track,x,z,index=null){
 const a=track.samples;let best=Infinity,idx=0;
 const search=i=>{i=(i+a.length)%a.length;const p=a[i],d=(p.x-x)**2+(p.z-z)**2;if(d<best){best=d;idx=i;}};
 if(index===null){for(let i=0;i<a.length;i++)search(i);}else{for(let i=index-32;i<=index+32;i++)search(i);if(best>1600){for(let i=0;i<a.length;i++)search(i);}}
 const p=a[idx],r=a[(idx+1)%a.length],dx=r.x-p.x,dz=r.z-p.z,f=clamp(((x-p.x)*dx+(z-p.z)*dz)/(dx*dx+dz*dz),0,1),qx=p.x+dx*f,qz=p.z+dz*f;
 return {...p,index:idx,x:qx,z:qz,y:p.y+(r.y-p.y)*f,s:p.s+f*Math.hypot(dx,dz),offset:(x-qx)*p.nx+(z-qz)*p.nz,distance:Math.hypot(x-qx,z-qz)};
}
export function curvature(track,s){const a=atDistance(track,s),b=atDistance(track,s+24);return Math.abs(angle(b.h-a.h))/24;}
