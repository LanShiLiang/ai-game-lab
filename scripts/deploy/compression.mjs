import {readFile,writeFile,readdir,mkdir,lstat,rm} from 'node:fs/promises';
import {gzip,gunzip} from 'node:zlib';
import {promisify} from 'node:util';
import path from 'node:path';
import {digest} from './common.mjs';
const pack=promisify(gzip),unpack=promisify(gunzip);
// Content-addressed derivatives are prepared once during deployment, never in a
// player request. Original immutable game artifact bytes remain unchanged.
export async function precompressPublic(publicRoot,state){
 const cache=path.join(state,'compression-cache');await mkdir(cache,{recursive:true});let files=0,reused=0;
 async function visit(folder){for(const item of await readdir(folder,{withFileTypes:true})){const file=path.join(folder,item.name);if(item.isDirectory())await visit(file);else if(item.isFile()&&/\.(js|json|html|css|svg|glb)$/.test(item.name)){
  const source=await readFile(file);if(source.length<256)continue;const key=digest(source),cached=path.join(cache,key+'.gz');let compressed;
  const info=await lstat(cached).catch(()=>null);if(info){if(!info.isFile())throw Error('Invalid compression cache entry');compressed=await readFile(cached);const restored=await unpack(compressed,{maxOutputLength:source.length});if(!restored.equals(source))throw Error('Compression cache integrity mismatch');reused++;}
  else{compressed=await pack(source,{level:6});if(compressed.length<source.length*.9)await writeFile(cached,compressed);}
  if(compressed.length<source.length*.9){await writeFile(file+'.gz',compressed);files++;}else await rm(file+'.gz',{force:true});
 }}}
 await visit(publicRoot);return {files,reused};
}
