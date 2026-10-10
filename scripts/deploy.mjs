import path from 'node:path';
import {root} from './catalog.mjs';
import {stateDirectory} from './deploy/common.mjs';
import {readRegistry} from './deploy/registry.mjs';
import {queryVersions} from './deploy/resolver.mjs';
import {prepareRelease,activateRelease,rollbackRelease} from './deploy/releases.mjs';
const [command,...args]=process.argv.slice(2),value=flag=>{const i=args.indexOf(flag);return i<0?undefined:args[i+1];};
const stateDir=value('--state-dir'),registryFile=path.resolve(value('--registry')||path.join(root,'deployment/registry.json')),allowLocal=args.includes('--allow-local');
try{
 if(command==='versions'){const state=await stateDirectory(stateDir),registry=await readRegistry(registryFile,{allowLocal});for(const game of registry.games)console.log(JSON.stringify({id:game.id,versions:await queryVersions(game,state)},null,2));}
 else if(command==='prepare'){const result=await prepareRelease({stateDir,registryFile,allowLocal,publicBaseURL:value('--public-url')||'',releaseId:value('--release')});console.log(JSON.stringify({releaseId:result.releaseId,directory:result.directory,games:result.lock.games.map(({id,commit,cacheHit,artifactKind})=>({id,commit,cacheHit,artifactKind}))},null,2));console.log('Prepared only. current has not changed.');}
 else if(command==='activate')console.log(JSON.stringify(await activateRelease({stateDir,releaseId:value('--release')}),null,2));
 else if(command==='rollback')console.log(JSON.stringify(await rollbackRelease({stateDir}),null,2));
 else throw Error('Usage: deploy.mjs versions|prepare|activate|rollback --state-dir /absolute/external/path [--registry file] [--release id] [--allow-local]');
}catch(error){console.error(error.message);process.exitCode=1;}
