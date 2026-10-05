import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
import {makeServer} from './serve.mjs';
import {root} from './catalog.mjs';

// Inspect the ordinary catalog UI. Never change featured flags, replace DOM
// covers for a fixture, or launch a game. --root supports the publication
// checkout, whose existing featured selection intentionally differs locally.
// --url inspects a deployed page against that checkout without modifying it.
const option=name=>process.argv.find(value=>value.startsWith(name+'='))?.slice(name.length+1);
const remoteUrl=option('--url');
let base;
if(remoteUrl){const url=new URL(remoteUrl);assert(['https:','http:'].includes(url.protocol)&&!url.username&&!url.password&&!url.search&&!url.hash,'--url must be a plain HTTP(S) catalog page URL');if(!url.pathname.endsWith('/'))url.pathname+='/';base=url.href;}
const projectRoot=path.resolve(root,option('--root')||(remoteUrl?'artifacts/online-lab':'.')),variant=remoteUrl?'public':projectRoot===path.resolve(root)?'local':'publication';
const out=path.resolve(root,option('--out')||`artifacts/game-covers/${variant}`);
for(const target of [projectRoot,out]){const relative=path.relative(root,target);assert(!relative.startsWith('..')&&!path.isAbsolute(relative),'QA paths must stay inside the workspace');}
await mkdir(out,{recursive:true});
const catalog=JSON.parse(await readFile(path.join(projectRoot,'games.json'),'utf8')),catalogBefore=JSON.stringify(catalog);
const featured=catalog.find(game=>game.featured)||catalog[0],ids=['apex-rush','freight-fire'],expectedAssets=new Map();
const report={date:new Date().toISOString(),projectRoot:path.relative(root,projectRoot),variant,url:base,catalog:catalog.map(({id,cover,featured})=>({id,cover,featured})),expectedFeatured:featured.id,
 checks:[],views:[],screenshots:[],errors:[],failedRequests:[],responses:[],limitations:[
  'Normal desktop/mobile catalog and its existing featured hero; no featured flags or gameplay state are modified.',
  'DOM checks prove source dimensions, crop geometry, loading and overlay placement. Screenshot inspection is still needed to judge the illustrated subject crop.'
 ]};
const check=(name,passed,details)=>{report.checks.push({name,passed,details});console.log((passed?'PASS ':'FAIL ')+name);assert.ok(passed,name+': '+JSON.stringify(details));};
check('Existing local/public featured choice is preserved',featured.id===(option('--expected-featured')||(variant==='local'?'orbit-dash':'apex-rush')),{variant,featured:featured.id});
for(const id of ids){const game=catalog.find(game=>game.id===id);assert(game,'Missing game '+id);check('New WebP catalog path '+id,game.cover===`games/${id}/cover.webp`,game.cover);const data=await readFile(path.join(projectRoot,game.cover)),asset={bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')};expectedAssets.set(id,asset);check('Cover WebP container and bounded file size '+id,data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP'&&data.readUInt32LE(4)+8===data.length&&data.length<600000,asset);}
const orbit=catalog.find(game=>game.id==='orbit-dash');check('Orbit retains its original SVG cover',orbit?.cover==='games/orbit-dash/cover.svg',orbit);
let server;
if(!remoteUrl){server=makeServer(projectRoot);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}/`;}
report.url=base;let browser,page,closing=false;
const shot=async(name,locator)=>{const filename=name+'.png';if(locator)await locator.screenshot({path:path.join(out,filename),animations:'disabled'});else {await page.evaluate(()=>window.scrollTo({top:0,left:0,behavior:'instant'}));await page.screenshot({path:path.join(out,filename),fullPage:true,animations:'disabled'});}report.screenshots.push(filename);};
async function inspectImage(selector){return page.locator(selector).evaluate(image=>{
 const container=image.closest('.card-cover')||image.closest('.orbit-window'),r=container.getBoundingClientRect(),ir=image.getBoundingClientRect(),style=getComputedStyle(image),badge=container.querySelector('.card-category'),br=badge?.getBoundingClientRect(),badgeStyle=badge?getComputedStyle(badge):null;
 const scale=Math.max(r.width/image.naturalWidth,r.height/image.naturalHeight),sourceCropX=Math.max(0,(image.naturalWidth-r.width/scale)/2),sourceCropY=Math.max(0,(image.naturalHeight-r.height/scale)/2);
 return {currentSrc:image.currentSrc,complete:image.complete,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,
  width:r.width,height:r.height,imageWidth:ir.width,imageHeight:ir.height,objectFit:style.objectFit,objectPosition:style.objectPosition,
  sourceCrop:{left:sourceCropX,right:sourceCropX,top:sourceCropY,bottom:sourceCropY,width:image.naturalWidth-sourceCropX*2,height:image.naturalHeight-sourceCropY*2},
  badge:badge?{text:badge.textContent,background:badgeStyle.backgroundColor,color:badgeStyle.color,contained:br.left>=r.left&&br.right<=r.right&&br.top>=r.top&&br.bottom<=r.bottom}:null};
 });}
try{
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-first-run']});report.browser=browser.version();
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});page=await context.newPage();page.setDefaultTimeout(15000);
 page.on('pageerror',error=>report.errors.push(error.message));page.on('requestfailed',request=>{if(!closing)report.failedRequests.push({url:request.url(),error:request.failure()?.errorText});});page.on('response',response=>{report.responses.push({url:response.url(),status:response.status()});if(response.status()>=400)report.failedRequests.push({url:response.url(),status:response.status()});});
 await page.goto(base);await page.locator('.game-card').first().waitFor();
 if(remoteUrl){
  const response=await context.request.get(new URL('games.json',base).href,{timeout:30000});check('Deployed catalog responds with HTTP 200',response.status()===200,{url:response.url(),status:response.status()});
  const actual=await response.json(),selection=games=>games.map(({id,cover,featured})=>({id,cover,featured}));check('Deployed covers and featured selection match the publication checkout',JSON.stringify(selection(actual))===JSON.stringify(selection(catalog)),selection(actual));
  for(const id of ids){const game=catalog.find(game=>game.id===id),response=await context.request.get(new URL(game.cover,base).href,{timeout:30000}),body=await response.body(),asset={url:response.url(),status:response.status(),bytes:body.length,sha256:createHash('sha256').update(body).digest('hex')},expected=expectedAssets.get(id);check('Deployed cover matches the expected source bytes '+id,asset.status===200&&asset.bytes===expected.bytes&&asset.sha256===expected.sha256,asset);}
 }
 for(const viewport of [{name:'desktop',width:1440,height:1000},{name:'mobile',width:390,height:844}]){
  await page.setViewportSize({width:viewport.width,height:viewport.height});await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  for(const id of ids){
   const card=page.locator(`.game-card[href="#/play/${id}"]`);await card.scrollIntoViewIfNeeded();await card.locator('img').evaluate(async image=>{if(!image.complete||!image.naturalWidth)await image.decode();});
   const image=await inspectImage(`.game-card[href="#/play/${id}"] img`),game=catalog.find(game=>game.id===id),expected=new URL(game.cover,base).href;
   check(`${viewport.name} image source / dimensions / HTTP 200 ${id}`,image.currentSrc===expected&&image.complete&&image.naturalWidth>=1000&&image.naturalHeight>=550&&report.responses.some(response=>response.url===expected&&response.status===200),image);
   check(`${viewport.name} category overlay remains contained ${id}`,image.badge?.text===game.category&&image.badge.contained&&/^rgba\(/.test(image.badge.background),image.badge);
   check(`${viewport.name} cover fills its original card viewport ${id}`,image.objectFit==='cover'&&image.width>100&&image.height>50&&Math.abs(image.imageWidth-image.width)<1&&Math.abs(image.imageHeight-image.height)<1,{width:image.width,height:image.height,sourceCrop:image.sourceCrop});
   report.views.push({viewport,id,...image});await shot(`${viewport.name}-${id}-card`,card);await shot(`${viewport.name}-${id}-cover`,card.locator('.card-cover'));
  }
  const overflow=await page.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth}));check(`${viewport.name} no horizontal document overflow`,overflow.documentWidth<=overflow.width+1&&overflow.bodyWidth<=overflow.width+1,overflow);
  await shot(viewport.name+'-full-catalog');
  await page.locator('.hero-exhibit').scrollIntoViewIfNeeded();await page.locator('#featured-cover').evaluate(async image=>{if(!image.complete||!image.naturalWidth)await image.decode();});
  const hero=await inspectImage('#featured-cover');check(`${viewport.name} hero retains this catalog's featured game`,hero.currentSrc===new URL(featured.cover,base).href&&await page.locator('#featured-title').innerText()===featured.title&&hero.complete&&hero.objectFit==='cover',{featured:featured.id,...hero});
  report.views.push({viewport,id:featured.id,kind:'hero',...hero});await shot(viewport.name+'-existing-featured-hero',page.locator('.hero-exhibit'));
 }
 check('Catalog flags, Orbit cover and game metadata remain untouched',JSON.stringify(JSON.parse(await readFile(path.join(projectRoot,'games.json'),'utf8')))===catalogBefore,{featured:catalog.map(game=>({id:game.id,featured:game.featured}))});
 check('No game was mounted during cover QA',await page.locator('iframe').count()===0,{});
 check('No browser or image request errors',!report.errors.length&&!report.failedRequests.length,{errors:report.errors,failedRequests:report.failedRequests});report.ok=true;
}catch(error){report.ok=false;report.failure=error.stack;process.exitCode=1;console.error(error.stack);if(page)await shot('failure').catch(()=>{});}
finally{closing=true;await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log('REPORT '+path.join(out,'report.json'));}
