import path from 'node:path';
import {readJSON} from './common.mjs';
const slug=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export async function readRegistry(file,{allowLocal=false}={}){
 const registry=await readJSON(file);if(registry.schemaVersion!==1||!Array.isArray(registry.games)||!Array.isArray(registry.trustedRepositories))throw Error('Invalid deployment registry');
 const ids=new Set();for(const game of registry.games){
  if(!slug.test(game.id)||ids.has(game.id))throw Error('Invalid/duplicate game id');ids.add(game.id);
  if(!registry.trustedRepositories.includes(game.repository))throw Error('Repository is not explicitly trusted: '+game.id);
  const local=path.isAbsolute(game.repository);
  if(local&&!allowLocal)throw Error('Local repositories require explicit --allow-local');
  if(!local&&!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\.git$/.test(game.repository))throw Error('Only exact HTTPS GitHub repository URLs are supported');
  if(game.publication==='pending')throw Error('Repository publication is not yet verified: '+game.id);
  if(typeof game.ref!=='string'||!game.ref||game.ref.startsWith('-')||/[\s\\\0]/.test(game.ref))throw Error('Invalid requested version');
  if(typeof game.allowSourceBuild!=='boolean')throw Error('Source-build permission must be explicit');
  if(game.serviceRoutes){for(const key of ['httpPrefixes','websocketPaths'])if(!Array.isArray(game.serviceRoutes[key])||!game.serviceRoutes[key].every(route=>typeof route==='string'&&route.startsWith('/')&&!route.includes('..')&&!/[?#\\]/.test(route)))throw Error('Invalid service routes');if(typeof game.serviceRoutes.healthPath!=='string'||!game.serviceRoutes.healthPath.startsWith('/'))throw Error('Invalid service health route');}
 }
 return registry;
}
