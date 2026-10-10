import {precompressPublic} from './compression.mjs';
import {setTimeout as delay} from 'node:timers/promises';
import {mkdir,cp,readFile,writeFile,rename,symlink,readlink,lstat,realpath,rm,stat} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {root,readCatalog} from '../catalog.mjs';
import {buildWeb} from '../build-web.mjs';
import {readRegistry} from './registry.mjs';
import {resolveVersion,obtainBuild} from './resolver.mjs';
import {stateDirectory,withStateLock,readJSON,saveJSON,checksums,digest,run,inside,discard} from './common.mjs';
const RELEASE=/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/;
export async function prepareRelease({registryFile=path.join(root,'deployment/registry.json'),stateDir,allowLocal=false,publicBaseURL='',releaseId,platformDirectory}={}){
 const state=await stateDirectory(stateDir);return withStateLock(state,async()=>{
  const registry=await readRegistry(registryFile,{allowLocal}),catalog=await readCatalog(platformDirectory||root);
  const ids=new Set(registry.games.map(game=>game.id));if(catalog.some(game=>!/^https:\/\//.test(game.entry)&&!ids.has(game.id)))throw Error('Catalog game has no deployment source');
  if(publicBaseURL){const url=new URL(publicBaseURL);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Invalid public URL');}
  const id=releaseId||new Date().toISOString().replace(/[-:.]/g,'')+'-'+randomUUID().slice(0,8);if(!RELEASE.test(id))throw Error('Invalid release id');
  const releases=path.join(state,'releases');await mkdir(releases,{recursive:true});const output=path.join(releases,id);if(await stat(output).catch(()=>null))throw Error('Release already exists');
  const staging=path.join(releases,'.staging-'+randomUUID());await mkdir(staging);
  try{
   const web=platformDirectory?await realpath(platformDirectory):await buildWeb();await cp(web,path.join(staging,'public'),{recursive:true});
   const games=[];
   for(const game of registry.games){const resolved=await resolveVersion(game,state),built=await obtainBuild(game,resolved,state);const descriptor=await readJSON(path.join(built.folder,'game-release.json'));
    const target=path.join(staging,'games',game.id);await cp(built.folder,target,{recursive:true});await mkdir(path.join(staging,'public/games'),{recursive:true});await cp(path.join(target,'client'),path.join(staging,'public/games',game.id),{recursive:true});
    const runtime=path.join(staging,'public/games',game.id,'runtime-config.js');if(await stat(runtime).catch(()=>null))await writeFile(runtime,(await readFile(runtime,'utf8'))+"\nglobalThis.AI_GAME_LAB_CONFIG ||= {};\nglobalThis.AI_GAME_LAB_CONFIG.lobbyURL ||= '../../index.html';\n");
    games.push({id:game.id,repository:game.repository,requestedRef:game.ref,commit:resolved.commit,lockfileSha256:resolved.lockfileDigest,version:descriptor.version,artifactKind:built.kind,archiveSha256:built.archiveDigest,artifactDigest:built.digest,cacheKey:built.cacheKey,cacheHit:built.cacheHit,service:descriptor.service?{...descriptor.service,entry:'games/'+game.id+'/'+descriptor.service.entry}:null});
   }
   const platformCommit=await run('git',['rev-parse','HEAD'],{cwd:root}).catch(()=>null),platformDirty=Boolean(await run('git',['status','--porcelain'],{cwd:root}).catch(()=>''));
   const compression=await precompressPublic(path.join(staging,'public'),state);
   const lock={schemaVersion:1,releaseId:id,createdAt:new Date().toISOString(),platform:{commit:platformCommit,workingTreeDirty:platformDirty},publicBaseURL,compression,games};
   await saveJSON(path.join(staging,'release-lock.json'),lock);await saveJSON(path.join(staging,'public/deployment.json'),{releaseId:id,platformCommit,games:games.map(({id,version,commit})=>({id,version,commit}))});
   const files=await checksums(staging);await saveJSON(path.join(staging,'release-integrity.json'),{schemaVersion:1,files,digest:digest(JSON.stringify(files))});
   await rename(staging,output);return {releaseId:id,directory:output,lock};
  }catch(error){await discard(staging);throw error;}
 });
}
export async function verifyRelease(state,releaseId){
 if(!RELEASE.test(releaseId))throw Error('Invalid release id');const directory=path.join(state,'releases',releaseId),actual=await realpath(directory),expected=await realpath(path.join(state,'releases'));if(!inside(expected,actual)||actual===expected)throw Error('Release escaped state directory');
 const integrity=await readJSON(path.join(actual,'release-integrity.json')),files=await checksums(actual);delete files['release-integrity.json'];
 if(integrity.schemaVersion!==1||integrity.digest!==digest(JSON.stringify(files))||JSON.stringify(integrity.files)!==JSON.stringify(files))throw Error('Release integrity verification failed');
 const lock=await readJSON(path.join(actual,'release-lock.json'));if(lock.releaseId!==releaseId)throw Error('Release identity mismatch');return {directory:actual,lock};
}
async function currentTarget(state,name){const link=path.join(state,name);const info=await lstat(link).catch(()=>null);if(!info)return null;if(!info.isSymbolicLink())throw Error(name+' must be a symlink');const actual=await realpath(link),base=await realpath(path.join(state,'releases'));if(!inside(base,actual)||actual===base)throw Error('Unsafe '+name+' link');return actual;}
async function switchLink(state,name,target){const pending=path.join(state,'.'+name+'-'+randomUUID());await symlink(target,pending,'dir');await rename(pending,path.join(state,name));}
function statusTime(value){return typeof value==='number'?value:Date.parse(value);}
async function gatewayStatus(state){const file=path.join(state,'run/gateway-status.json');let status;try{status=await readJSON(file);}catch(error){if(error.code==='ENOENT')return null;throw Error('Invalid gateway status');}
 if(!Number.isInteger(status.pid)||status.pid<=0||typeof status.instanceId!=='string'||!status.instanceId)throw Error('Invalid gateway status identity');
 try{process.kill(status.pid,0);}catch(error){if(error.code==='ESRCH')return null;throw Error('Cannot verify gateway process');}
 if(!Number.isFinite(statusTime(status.updatedAt))||Date.now()-statusTime(status.updatedAt)>5000||statusTime(status.updatedAt)>Date.now()+1000)throw Error('Gateway status is stale; current was not changed');return status;
}
async function waitForGateway(state,expected,releaseId,since,timeout){
 const end=Date.now()+timeout;while(Date.now()<end){let status;try{status=await readJSON(path.join(state,'run/gateway-status.json'));}catch{}
  if(status?.pid===expected.pid&&status.instanceId===expected.instanceId&&statusTime(status.updatedAt)>=since){
   if(status.ready===true&&status.releaseId===releaseId)return;
   if(status.lastReload?.requestedReleaseId===releaseId&&status.lastReload.ok===false&&statusTime(status.lastReload.at)>=since)throw Error('Gateway rejected release: '+(status.lastReload.error||'reload failed'));
  }await delay(50);
 }throw Error('Gateway did not acknowledge the selected release before timeout');
}
async function activateSelected(state,releaseId,probe,ackTimeoutMs){
 const selected=await verifyRelease(state,releaseId),current=await currentTarget(state,'current'),previous=await currentTarget(state,'previous'),live=await gatewayStatus(state);
 if(live&&(!current||live.releaseId!==path.basename(current)||live.ready!==true))throw Error('Gateway and current pointer disagree; inspect before deployment');
 const verify=probe||(await import('../../services/gateway/index.mjs')).probeRelease;
 await verify({releaseDir:selected.directory,runtimeDir:path.join(state,'run')});await verifyRelease(state,releaseId);
 const selectedAt=Date.now();if(current)await switchLink(state,'previous',current);await switchLink(state,'current',selected.directory);
 try{if(live)await waitForGateway(state,live,releaseId,selectedAt,ackTimeoutMs);}catch(error){
  if(current)await switchLink(state,'current',current);else await rm(path.join(state,'current'),{force:true});
  if(previous)await switchLink(state,'previous',previous);else await rm(path.join(state,'previous'),{force:true});throw error;
 }
 return {releaseId,directory:selected.directory,previous:current?path.basename(current):null,selection:'selected',liveStatus:live?'ready':'not-running'};
}
export async function activateRelease({stateDir,releaseId,probe,ackTimeoutMs=20000}={}){
 const state=await stateDirectory(stateDir);return withStateLock(state,()=>activateSelected(state,releaseId,probe,ackTimeoutMs));
}
export async function rollbackRelease({stateDir,probe,ackTimeoutMs=20000}={}){
 const state=await stateDirectory(stateDir);return withStateLock(state,async()=>{const previous=await currentTarget(state,'previous');if(!previous)throw Error('No previous release exists');return activateSelected(state,path.basename(previous),probe,ackTimeoutMs);});
}
