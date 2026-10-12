import {mkdir,readdir,readFile,writeFile,cp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {root} from './catalog.mjs';
export const buildRoot=path.join(root,'dist');
export async function resetOutput(output){if(path.resolve(output)!==path.resolve(buildRoot))throw Error('Only platform dist may be replaced');await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});}
export async function copyDirectory(source,target,{rewriteContracts=false,contractsPrefix='./_shared/'}={}){
 await mkdir(target,{recursive:true});
 for(const item of await readdir(source,{withFileTypes:true})){
  if(item.name.startsWith('.')||['node_modules','dist','package.json','package-lock.json'].includes(item.name))continue;
  const from=path.join(source,item.name),to=path.join(target,item.name);
  if(item.isSymbolicLink())throw Error('Symlink in platform source');
  if(item.isDirectory())await copyDirectory(from,to,{rewriteContracts,contractsPrefix:'../'+contractsPrefix.replace(/^\.\//,'')});
  else if(rewriteContracts&&item.name.endsWith('.js'))await writeFile(to,(await readFile(from,'utf8')).replace(/(?:\.\.\/)+packages\/game-contracts\//g,contractsPrefix));
  else await cp(from,to);
 }
}
export async function copyContracts(output){await mkdir(output,{recursive:true});for(const name of ['host.js','lab-bridge.js','endpoints.js'])await cp(path.join(root,'packages/game-contracts',name),path.join(output,name));}
export async function saveJSON(file,data){await writeFile(file,JSON.stringify(data,null,2)+'\n');}
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
