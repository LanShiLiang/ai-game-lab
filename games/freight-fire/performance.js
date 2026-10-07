// Kept inside each game so standalone exports retain their own runtime.
export class FrameLoop {
  constructor(callback, rate) { this.callback=callback; this.rate=rate; this.frame=0; this.timer=0; this.running=false; this.previous=0; }
  start() { if(this.running || document.hidden)return; this.running=true; this.previous=performance.now(); this.schedule(); }
  schedule() {
    if(!this.running)return;
    const enqueue=()=>{this.timer=0;if(this.running)this.frame=requestAnimationFrame(now=>{this.frame=0;if(!this.running)return;if(this.rate()<60&&now-this.previous+.25<1000/this.rate()){this.schedule();return;}this.previous=now;this.callback(now);this.schedule();});};
    const fps=this.rate();
    if(fps>=60)enqueue();else this.timer=setTimeout(enqueue,Math.max(0,1000/fps-(performance.now()-this.previous)));
  }
  stop() { this.running=false; cancelAnimationFrame(this.frame); clearTimeout(this.timer); this.frame=0; this.timer=0; }
}

export class ResolutionBudget {
  constructor(quality='auto') { this.setQuality(quality); }
  setQuality(quality) { this.quality=['auto','low','medium','high'].includes(quality)?quality:'auto';this.scale=1;this.elapsed=0;this.frames=0;this.cooldown=0; }
  ratio(dpr,width,height) {
    const limit=this.quality==='high'?1.7:this.quality==='low'?1:1.35;
    const ratio=Math.min(dpr||1,limit)*this.scale;
    return this.quality==='auto'?Math.min(ratio,Math.sqrt(2400000/Math.max(1,width*height))):ratio;
  }
  sample(dt,active) {
    if(this.quality!=='auto'||!active||dt<=0||dt>.12)return false;
    this.elapsed+=dt;this.frames++;
    if(this.elapsed<2)return false;
    const fps=this.frames/this.elapsed;this.elapsed=0;this.frames=0;
    const previous=this.scale;
    if(fps<45)this.scale=Math.max(.55,this.scale*.85);
    else if(fps>57)this.scale=Math.min(1,this.scale+.05);
    return Math.abs(previous-this.scale)>.001;
  }
}
