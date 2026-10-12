import {cp} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {root,readCatalog} from './catalog.mjs';
import {buildRoot,resetOutput,copyDirectory,copyContracts,saveJSON} from './build-support.mjs';
export async function buildWeb(){
 const catalog=await readCatalog(),output=buildRoot;await resetOutput(output);
 await copyDirectory(path.join(root,'apps/web'),output,{rewriteContracts:true});await copyContracts(path.join(output,'_shared'));
 await saveJSON(path.join(output,'games.json'),catalog);
 for(const name of ['LICENSE','LICENSE-SCOPE.md','THIRD_PARTY_NOTICES.md'])await cp(path.join(root,name),path.join(output,name));
 console.log('Platform-only static artifact: '+output+' (no game source or game artifacts)');return output;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildWeb();
