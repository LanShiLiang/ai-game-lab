import {replaceFile} from '../../services/gateway/files.mjs';
import {readFile,writeFile,mkdir,readdir,lstat,realpath,rename,rm,open} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {root} from '../catalog.mjs';
const exec=promisify(execFile);
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export const saveJSON=(file,value)=>writeFile(file,JSON.stringify(value,null,2)+'\n');
export const readJSON=async file=>JSON.parse(await readFile(file,'utf8'));
export const inside=(parent,child)=>{const rel=path.relative(path.resolve(parent),path.resolve(child));return rel===''||(!rel.startsWith('..')&&!path.isAbsolute(rel));};
export function safeRelative(value){return typeof value==='string'&&value.length>0&&!value.startsWith('/')&&!/[\\\0\r\n]/.test(value)&&value.split('/').every(part=>part&&part!=='.'&&part!=='..');}
export async function stateDirectory(value){
 const requested=path.resolve(value||path.join(root,'..','ai-game-lab-state'));
 if(inside(root,requested)||inside(requested,root))throw Error('Deployment state must be outside and separate from the platform repository');
 await mkdir(requested,{recursive:true});const actual=await realpath(requested);
 if(inside(await realpath(root),actual)||inside(actual,await realpath(root)))throw Error('Deployment state resolves into the platform repository');
 return actual;
}
export async function run(command,args,options={}){if(process.platform==='win32'&&/^npm(?:\.cmd)?$/i.test(command)){const cli=[path.dirname(process.execPath),...(process.env.PATH||'').split(path.delimiter)].map(dir=>path.join(dir,'node_modules/npm/bin/npm-cli.js')).find(existsSync);if(!cli)throw Error('Cannot locate npm CLI; install Node with npm');args=[cli,...args];command=process.execPath;}return (await exec(command,args,{encoding:'utf8',maxBuffer:8*1024*1024,timeout:120000,...options})).stdout.trim();}
export async function runBytes(command,args,options={}){return (await exec(command,args,{encoding:'buffer',maxBuffer:16*1024*1024,timeout:120000,...options})).stdout;}
export async function withStateLock(state,action){const file=path.join(state,'deployment.lock');let handle;try{handle=await open(file,'wx');}catch(error){if(error.code==='EEXIST')throw Error('Another deployment operation holds the state lock; inspect it before retrying');throw error;}try{await handle.writeFile(JSON.stringify({pid:process.pid,createdAt:new Date().toISOString()}));return await action();}finally{await handle.close();await rm(file,{force:true});}}
export async function checksums(folder){
 const result=Object.create(null);
 async function visit(dir){for(const item of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){const file=path.join(dir,item.name),relative=path.relative(folder,file).split(path.sep).join('/');
  if(item.isSymbolicLink())throw Error('Symlinks are not accepted in release artifacts: '+relative);
  if(item.isDirectory())await visit(file);else if(item.isFile()){if(relative.split('/').some(part=>part==='.git'||part==='.env'||part.startsWith('.env.')))throw Error('Private file in release artifact');result[relative]=digest(await readFile(file));}else throw Error('Unsupported artifact file');}}
 await visit(folder);return result;
}
export async function validateDistribution(folder,game){
 const file=path.join(folder,'game-release.json');if(!(await lstat(file)).isFile())throw Error('Game manifest must be a regular file');
 const m=await readJSON(file);if(m.schemaVersion!==1||m.id!==game.id||m.client!=='client'||typeof m.version!=='string')throw Error('Game artifact identity/contract mismatch: '+game.id);
 const files=await checksums(folder);if(!files['client/index.html'])throw Error('Game client entry missing');
 const expected=game.serviceRoutes||null;
 if(Boolean(m.service)!==Boolean(expected))throw Error('Unexpected game service: '+game.id);
 if(m.service){if(!safeRelative(m.service.entry)||!m.service.entry.startsWith('server/')||!files[m.service.entry])throw Error('Unsafe or missing service entry');
  for(const key of ['healthPath','httpPrefixes','websocketPaths'])if(JSON.stringify(m.service[key])!==JSON.stringify(expected[key]))throw Error('Service route differs from trusted registry: '+key);}
 return {manifest:m,files,digest:digest(JSON.stringify(files))};
}
export function archiveEntryBytes(line){const fields=line.trim().split(/\s+/),value=fields[1]?.includes('/')?fields[2]:fields[4];if(!/^\d+$/.test(value))throw Error('Invalid archive listing');const bytes=Number(value);if(!Number.isSafeInteger(bytes))throw Error('Invalid archive size');return bytes;}
export async function extractArchive(archive,destination){
 // Validate archive paths, entry types and total expanded size before extraction.
 const names=(await run('tar',['-tf',archive])).split(/\r?\n/).filter(Boolean),details=(await run('tar',['-tvf',archive])).split(/\r?\n/).filter(Boolean);
 if(names.length>30000||details.some(line=>!['-','d'].includes(line[0])))throw Error('Archive contains links or unsupported entries');
 let size=0;for(const line of details){size+=archiveEntryBytes(line);}
 if(size>1024*1024*1024)throw Error('Archive expands beyond 1 GiB limit');
 for(let name of names){while(name.startsWith('./'))name=name.slice(2);if(name.endsWith('/'))name=name.slice(0,-1);if(!name)continue;if(!safeRelative(name)||name.split('/').some(part=>part==='.git'||part==='.env'||part.startsWith('.env.')))throw Error('Unsafe archive path');}
 await mkdir(destination,{recursive:true});await run('tar',['-xf',archive,'-C',destination,'--no-same-owner','--no-same-permissions']);
 await checksums(destination);
}
export async function atomicJSON(file,value){const temporary=file+'.tmp-'+randomUUID();await saveJSON(temporary,value);await replaceFile(temporary,file);}
export async function discard(file){await rm(file,{recursive:true,force:true});}
