import {readReleasePointer} from '../services/gateway/pointers.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,stat,realpath,symlink,cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {readRegistry} from '../scripts/deploy/registry.mjs';
import {prepareRelease,activateRelease,rollbackRelease,verifyRelease} from '../scripts/deploy/releases.mjs';
import {queryVersions,resolveVersion,obtainBuild,verifyArtifactEnvelope,buildEnvironment} from '../scripts/deploy/resolver.mjs';
import {root,readCatalog} from '../scripts/catalog.mjs';
import {run,digest,saveJSON,readJSON,checksums,stateDirectory,extractArchive} from '../scripts/deploy/common.mjs';
const gameId='fixture-game';
const registration={id:gameId,title:'Fixture',description:'Deployment test fixture',category:'Test',tags:[],controls:[],accent:'#112233',entry:`games/${gameId}/index.html`,cover:`games/${gameId}/cover.svg`,source:{kind:'repository',repository:'fixture'}};
async function fixture(t){
 const base=await mkdtemp(path.join(tmpdir(),'lab-deploy-'));t.after(()=>rm(base,{recursive:true,force:true}));const source=path.join(base,'source'),state=path.join(base,'state'),web=path.join(base,'web'),registryFile=path.join(base,'registry.json');await mkdir(source);await mkdir(web);
 const pkg={name:'fixture-game',version:'1.0.0',private:true,type:'module',scripts:{build:'node build.mjs',postinstall:'node -e "require(\'fs\').writeFileSync(\'HOOK_RAN\',\'bad\')"'}};
 await saveJSON(path.join(source,'package.json'),pkg);await saveJSON(path.join(source,'package-lock.json'),{name:pkg.name,version:pkg.version,lockfileVersion:3,requires:true,packages:{'':{...pkg,scripts:undefined}}});
 await writeFile(path.join(source,'build.mjs'),`import {mkdir,writeFile,access} from 'node:fs/promises';if(await access('HOOK_RAN').then(()=>true,()=>false))throw Error('untrusted lifecycle hook ran');await mkdir('dist/client',{recursive:true});await writeFile('dist/client/index.html','<!doctype html><title>Fixture</title>');await writeFile('dist/client/cover.svg','<svg/>');await writeFile('dist/client/runtime-config.js','globalThis.AI_GAME_LAB_CONFIG ||= {};');await writeFile('dist/game-release.json',JSON.stringify({schemaVersion:1,id:'${gameId}',version:'1.0.0',client:'client',service:null}));`);
 await run('git',['init','-b','main'],{cwd:source});await run('git',['add','.'],{cwd:source});await run('git',['-c','user.name=Test','-c','user.email=test@localhost','commit','-m','fixture'],{cwd:source});
 await writeFile(path.join(web,'index.html'),'<!doctype html><title>Platform</title>');await saveJSON(path.join(web,'games.json'),[registration]);
 const game={id:gameId,repository:source,publication:'local',ref:'main',allowSourceBuild:true,serviceRoutes:null};await saveJSON(registryFile,{schemaVersion:1,trustedRepositories:[source],games:[game]});
 return {base,source,state,web,registryFile,game,options:{registryFile,stateDir:state,allowLocal:true,platformDirectory:web}};
}
test('registry refuses untrusted repositories, pending publication and implicit local sources',async t=>{
 const f=await fixture(t);await assert.rejects(()=>readRegistry(f.registryFile),/allow-local/);const registry=await readJSON(f.registryFile);registry.trustedRepositories=[];await saveJSON(f.registryFile,registry);await assert.rejects(()=>readRegistry(f.registryFile,{allowLocal:true}),/not explicitly trusted/);
 registry.trustedRepositories=[f.source];registry.games[0].publication='pending';await saveJSON(f.registryFile,registry);await assert.rejects(()=>readRegistry(f.registryFile,{allowLocal:true}),/publication/);
});
test('deployment resolves once, locks exact SHA, builds outside platform and reuses verified version cache',async t=>{
 const f=await fixture(t),first=await prepareRelease({...f.options,releaseId:'first'}),sourceSHA=await run('git',['rev-parse','HEAD'],{cwd:f.source});
 assert.equal(first.lock.games[0].commit,sourceSHA);assert.equal(first.lock.games[0].requestedRef,'main');assert.equal(first.lock.games[0].cacheHit,false);assert.equal(first.lock.games[0].artifactKind,'source-build');assert.ok(!first.directory.startsWith(root));
 assert.equal(await stat(path.join(f.state,'current')).catch(()=>null),null);assert.ok((await stat(path.join(first.directory,'public/games',gameId,'index.html'))).isFile());
 const second=await prepareRelease({...f.options,releaseId:'second'});assert.equal(second.lock.games[0].cacheHit,true);assert.equal(second.lock.games[0].cacheKey,first.lock.games[0].cacheKey);
 await writeFile(path.join(f.source,'README.md'),'new immutable version');await run('git',['add','.'],{cwd:f.source});await run('git',['-c','user.name=Test','-c','user.email=test@localhost','commit','-m','next'],{cwd:f.source});
 const next=await prepareRelease({...f.options,releaseId:'next'});assert.notEqual(next.lock.games[0].commit,sourceSHA);assert.notEqual(next.lock.games[0].cacheKey,first.lock.games[0].cacheKey);assert.equal(next.lock.games[0].cacheHit,false);assert.equal(first.lock.games[0].commit,sourceSHA);
});
test('fetch/ref/build/probe failures never replace current; activation and rollback are atomic',async t=>{
 const f=await fixture(t);await prepareRelease({...f.options,releaseId:'good'});await activateRelease({stateDir:f.state,releaseId:'good',probe:async()=>{}});const current=(await readReleasePointer(f.state,'current')).target;
 const registry=await readJSON(f.registryFile);registry.games[0].ref='does-not-exist';await saveJSON(f.registryFile,registry);await assert.rejects(()=>prepareRelease({...f.options,releaseId:'bad-ref'}));assert.equal((await readReleasePointer(f.state,'current')).target,current);
 registry.games[0].ref='main';registry.games[0].allowSourceBuild=false;await saveJSON(f.registryFile,registry);
 // Clear cache only in this isolated fixture to exercise denied source fallback.
 await rm(path.join(f.state,'cache'),{recursive:true});await assert.rejects(()=>prepareRelease({...f.options,releaseId:'denied-build'}),/not authorized/);assert.equal((await readReleasePointer(f.state,'current')).target,current);
 registry.games[0].allowSourceBuild=true;await saveJSON(f.registryFile,registry);await prepareRelease({...f.options,releaseId:'good-two'});
 await assert.rejects(()=>activateRelease({stateDir:f.state,releaseId:'good-two',probe:async()=>{throw Error('health failed');}}),/health failed/);assert.equal((await readReleasePointer(f.state,'current')).target,current);
 await activateRelease({stateDir:f.state,releaseId:'good-two',probe:async()=>{}});assert.equal(path.basename((await readReleasePointer(f.state,'current')).target),'good-two');await rollbackRelease({stateDir:f.state,probe:async()=>{}});assert.equal((await readReleasePointer(f.state,'current')).target,current);
 await writeFile(path.join(f.source,'build.mjs'),"throw Error('intentional build failure');\n");await run('git',['add','.'],{cwd:f.source});await run('git',['-c','user.name=Test','-c','user.email=test@localhost','commit','-m','failing build'],{cwd:f.source});await assert.rejects(()=>prepareRelease({...f.options,releaseId:'broken-build'}),/intentional build failure/);assert.equal((await readReleasePointer(f.state,'current')).target,current);
});
test('release and cache tampering are detected before activation or reuse',async t=>{
 const f=await fixture(t),release=await prepareRelease({...f.options,releaseId:'clean'});await writeFile(path.join(release.directory,'public/index.html'),'tampered');await assert.rejects(()=>verifyRelease(f.state,'clean'),/integrity/);
 const entry=release.lock.games[0],cached=path.join(f.state,'cache',gameId,entry.cacheKey,'dist/client/index.html');await writeFile(cached,'tampered');await assert.rejects(()=>prepareRelease({...f.options,releaseId:'must-fail'}),/Cached artifact/);assert.equal(await stat(path.join(f.state,'current')).catch(()=>null),null);
});
test('release provenance binds archive bytes, repository, commit, game and lockfile',async()=>{
 const archive=Buffer.from('archive'),checksum=digest(archive),game={id:'fixture',repository:'https://github.com/owner/game.git'},resolved={commit:'a'.repeat(40),lockfileDigest:'b'.repeat(64)},provenance={schemaVersion:1,gameId:game.id,repository:game.repository,commit:resolved.commit,lockfileSha256:resolved.lockfileDigest,artifactSha256:checksum};
 assert.equal(await verifyArtifactEnvelope({archive,checksum,provenance},game,resolved),checksum);
 await assert.rejects(()=>verifyArtifactEnvelope({archive:Buffer.from('bad'),checksum,provenance},game,resolved),/checksum/);await assert.rejects(()=>verifyArtifactEnvelope({archive,checksum,provenance:{...provenance,commit:'c'.repeat(40)}},game,resolved),/provenance/);
});
test('source-build environment excludes secrets and archive extraction refuses links',async t=>{
 const f=await fixture(t),old=process.env.GITHUB_TOKEN;process.env.GITHUB_TOKEN='test-secret';try{assert.equal(buildEnvironment(f.state).GITHUB_TOKEN,undefined);}finally{if(old===undefined)delete process.env.GITHUB_TOKEN;else process.env.GITHUB_TOKEN=old;}
 const archive=path.join(f.base,'bad.tar');const header=Buffer.alloc(512);header.write('link');header.write('0000777',100);header.write('0000000',108);header.write('0000000',116);header.write('00000000000',124);header.write('00000000000',136);header.fill(32,148,156);header[156]=50;header.write('/etc/passwd',157);header.write('ustar\0',257);header.write('00',263);const sum=header.reduce((a,b)=>a+b,0);header.write(sum.toString(8).padStart(6,'0')+'\0 ',148);await writeFile(archive,Buffer.concat([header,Buffer.alloc(1024)]));await assert.rejects(()=>extractArchive(archive,path.join(f.base,'unpacked')),/links/);
 await assert.rejects(()=>stateDirectory(path.join(root,'bad-state')),/outside/);
});

test('live activation waits for the same gateway instance; failures and timeouts restore pointers',async t=>{
 const f=await fixture(t);await prepareRelease({...f.options,releaseId:'old'});await prepareRelease({...f.options,releaseId:'next'});await activateRelease({stateDir:f.state,releaseId:'old',probe:async()=>{}});await mkdir(path.join(f.state,'run'),{recursive:true});
 const file=path.join(f.state,'run/gateway-status.json'),identity={pid:process.pid,instanceId:'test-instance'},save=async data=>saveJSON(file,{...identity,releaseId:'old',ready:true,updatedAt:Date.now(),...data});
 await save({});
 const timer=setInterval(async()=>{if(path.basename((await readReleasePointer(f.state,'current')).target)==='next')await save({releaseId:'next',lastReload:{requestedReleaseId:'next',ok:true,at:Date.now()}});},25);let activated;
 try{activated=await activateRelease({stateDir:f.state,releaseId:'next',probe:async()=>{},ackTimeoutMs:1000});}finally{clearInterval(timer);}
 assert.equal(activated.liveStatus,'ready');assert.equal(path.basename((await readReleasePointer(f.state,'current')).target),'next');
 await save({releaseId:'next'});
 const rejection=setInterval(async()=>{if(path.basename((await readReleasePointer(f.state,'current')).target)==='old')await save({releaseId:'next',lastReload:{requestedReleaseId:'old',ok:false,error:'occupied rooms',at:Date.now()}});},25);
 try{await assert.rejects(()=>activateRelease({stateDir:f.state,releaseId:'old',probe:async()=>{},ackTimeoutMs:1000}),/rejected release/);}finally{clearInterval(rejection);}
 assert.equal(path.basename((await readReleasePointer(f.state,'current')).target),'next');
 await save({releaseId:'next'});
 const wrong=setInterval(async()=>{if(path.basename((await readReleasePointer(f.state,'current')).target)==='old')await save({instanceId:'another-instance',releaseId:'old'});},25);
 try{await assert.rejects(()=>activateRelease({stateDir:f.state,releaseId:'old',probe:async()=>{},ackTimeoutMs:180}),/acknowledge/);}finally{clearInterval(wrong);}
 assert.equal(path.basename((await readReleasePointer(f.state,'current')).target),'next');
 await save({releaseId:'next',updatedAt:Date.now()-10000});await assert.rejects(()=>activateRelease({stateDir:f.state,releaseId:'old',probe:async()=>{}}),/stale/);
});

test('matching immutable release artifacts are preferred and cached without running source build',async t=>{
 const f=await fixture(t),artifact=path.join(f.base,'artifact');await mkdir(path.join(artifact,'client'),{recursive:true});await writeFile(path.join(artifact,'client/index.html'),'<!doctype html><title>Artifact</title>');await saveJSON(path.join(artifact,'game-release.json'),{schemaVersion:1,id:gameId,version:'1.2.3',client:'client',service:null});
 const archivePath=path.join(f.base,'release.tgz');await run('tar',['-czf',archivePath,'-C',artifact,'.']);const archive=await readFile(archivePath),archiveSha=digest(archive),repository='https://github.com/owner/game.git',commit='a'.repeat(40),lockfileDigest='b'.repeat(64),prefix=repository.slice(0,-4)+'/releases/download/v1.2.3/';
 const spec={archive:'game-release.tgz',checksum:'game-release.sha256',provenance:'game-release.provenance.json'},provenance={schemaVersion:1,gameId,repository,commit,lockfileSha256:lockfileDigest,artifactSha256:archiveSha};
 const payloads=new Map([[prefix+spec.archive,archive],[prefix+spec.checksum,Buffer.from(archiveSha+'  game-release.tgz\n')],[prefix+spec.provenance,Buffer.from(JSON.stringify(provenance))]]),saved=globalThis.fetch;let downloads=0;
 globalThis.fetch=async url=>{downloads++;const bytes=payloads.get(String(url));assert.ok(bytes);return new Response(bytes,{status:200,headers:{'content-length':String(bytes.length)}});};
 try{const game={id:gameId,repository,allowSourceBuild:false,releaseArtifacts:spec,serviceRoutes:null},resolved={commit,lockfileDigest,release:{assets:Object.values(spec).map(name=>({name,browser_download_url:prefix+name}))}};await mkdir(f.state);const first=await obtainBuild(game,resolved,f.state);assert.equal(first.kind,'release-artifact');assert.equal(first.archiveDigest,archiveSha);assert.equal(first.cacheHit,false);const second=await obtainBuild(game,resolved,f.state);assert.equal(second.cacheHit,true);assert.equal(downloads,3);}finally{globalThis.fetch=saved;}
});


test('version queries peel annotated tags and retain exact dependency-lock bytes',async t=>{
 const f=await fixture(t);await run('git',['-c','user.name=Test','-c','user.email=test@localhost','tag','-a','v1','-m','Version one'],{cwd:f.source});await mkdir(f.state);const versions=await queryVersions(f.game,f.state),commit=await run('git',['rev-parse','HEAD'],{cwd:f.source});assert.equal(versions.find(v=>v.ref==='refs/tags/v1').commit,commit);const resolved=await resolveVersion({...f.game,ref:'v1'},f.state);assert.equal(resolved.commit,commit);assert.equal(resolved.lockfileDigest,digest(await readFile(path.join(f.source,'package-lock.json'))));
});

test('private release downloads use the asset API and never forward credentials to storage redirects',async t=>{
 const f=await fixture(t),artifact=path.join(f.base,'private-artifact');await mkdir(path.join(artifact,'client'),{recursive:true});await writeFile(path.join(artifact,'client/index.html'),'<!doctype html>Private artifact');await saveJSON(path.join(artifact,'game-release.json'),{schemaVersion:1,id:gameId,version:'1',client:'client',service:null});const archiveFile=path.join(f.base,'private.tgz');await run('tar',['-czf',archiveFile,'-C',artifact,'.']);const archive=await readFile(archiveFile),sha=digest(archive),repository='https://github.com/owner/private.git',commit='a'.repeat(40),lockfileDigest='b'.repeat(64),spec={archive:'game-release.tgz',checksum:'game-release.sha256',provenance:'game-release.provenance.json'};
 const provenance={schemaVersion:1,gameId,repository,commit,lockfileSha256:lockfileDigest,artifactSha256:sha},payloads=[archive,Buffer.from(sha+'\n'),Buffer.from(JSON.stringify(provenance))],assets=Object.values(spec).map((name,index)=>({name,id:index+1,url:'https://api.github.com/repos/owner/private/releases/assets/'+(index+1)})),savedFetch=globalThis.fetch,savedToken=process.env.GITHUB_TOKEN;let apiRequests=0,storageRequests=0;process.env.GITHUB_TOKEN='fake-test-token';
 globalThis.fetch=async(url,options)=>{const address=new URL(url),id=Number(address.pathname.split('/').at(-1));if(address.hostname==='api.github.com'){apiRequests++;assert.equal(options.headers.Authorization,'Bearer fake-test-token');assert.equal(options.headers.Accept,'application/octet-stream');return new Response(null,{status:302,headers:{location:'https://release-assets.githubusercontent.com/artifacts/'+id}});}storageRequests++;assert.equal(options.headers.Authorization,undefined);return new Response(payloads[id-1],{status:200});};
 try{await mkdir(f.state);const result=await obtainBuild({id:gameId,repository,allowSourceBuild:false,releaseArtifacts:spec,serviceRoutes:null},{commit,lockfileDigest,release:{assets}},f.state);assert.equal(result.kind,'release-artifact');assert.equal(apiRequests,3);assert.equal(storageRequests,3);}finally{globalThis.fetch=savedFetch;if(savedToken===undefined)delete process.env.GITHUB_TOKEN;else process.env.GITHUB_TOKEN=savedToken;}
});
