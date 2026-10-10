import {replaceFile} from './files.mjs';
import {lstat,realpath,readFile,writeFile,symlink,rename,rm} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
const inside=(parent,child)=>{const rel=path.relative(parent,child);return rel===''||(!rel.startsWith('..')&&!path.isAbsolute(rel));};
async function atomicJSON(file,data){const temporary=file+'.tmp-'+randomUUID();try{await writeFile(temporary,JSON.stringify(data)+'\n',{mode:0o600});await replaceFile(temporary,file);}finally{await rm(temporary,{force:true});}}
const valid = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/;
export async function readReleasePointer(state,name,{optional=true}={}) {
 if(!['current','previous'].includes(name))throw Error('Invalid release pointer');
 const file=path.join(state,name),info=await lstat(file).catch(error=>{if(optional&&error.code==='ENOENT')return null;throw error;});if(!info)return null;
 let target,token;
 if(info.isSymbolicLink()){target=await realpath(file);token=[info.dev,info.ino,info.mtimeMs,info.ctimeMs].join(':');}
 else if(info.isFile()){const data=JSON.parse(await readFile(file,'utf8'));if(data.schemaVersion!==1||typeof data.releaseId!=='string'||!valid.test(data.releaseId)||typeof data.selectionId!=='string'||!data.selectionId)throw Error('Invalid release pointer');target=await realpath(path.join(state,'releases',data.releaseId));token=data.selectionId;}
 else throw Error('Invalid release pointer type');
 const base=await realpath(path.join(state,'releases')).catch(error=>{if(error.code==='ENOENT')throw Error('Release pointer escapes the releases directory');throw error;});if(!inside(base,target)||base===target)throw Error('Release pointer escapes the releases directory');return {target,token};
}
export async function writeReleasePointer(state,name,target,{format=process.platform==='win32'?'json':'symlink'}={}) {
 if(!['current','previous'].includes(name))throw Error('Invalid release pointer');const base=await realpath(path.join(state,'releases')),actual=await realpath(target),id=path.basename(actual);
 if(!valid.test(id)||path.dirname(actual)!==base)throw Error('Unsafe release pointer target');
 if(format==='json'){const existing=await lstat(path.join(state,name)).catch(error=>{if(error.code==='ENOENT')return null;throw error;});if(existing&&!existing.isFile())throw Error('Existing release pointer needs explicit migration');await atomicJSON(path.join(state,name),{schemaVersion:1,releaseId:id,selectionId:randomUUID()});return;}
 const pending=path.join(state,'.'+name+'-'+randomUUID());try{await symlink(actual,pending,'dir');await rename(pending,path.join(state,name));}finally{await rm(pending,{force:true});}
}
