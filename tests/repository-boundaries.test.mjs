import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {root} from '../scripts/catalog.mjs';
import {buildWeb} from '../scripts/build-web.mjs';
test('platform current tree contains no game implementation, fixtures, vendored engines or backend simulation',async()=>{
 for(const entry of ['games','templates/game','services/game-server','tests/fixtures','artifacts/build/games'])assert.equal(await stat(path.join(root,entry)).catch(()=>null),null,entry);
 async function visit(dir){for(const item of await readdir(dir,{withFileTypes:true})){if(['.git','node_modules','dist'].includes(item.name))continue;const file=path.join(dir,item.name);if(item.isDirectory())await visit(file);else if(/\.(js|mjs)$/.test(item.name)){const text=await readFile(file,'utf8');assert.doesNotMatch(text,/from\s*['"][^'"]*(?:games\/(?:freight-fire|apex-rush|orbit-dash)|game-server\/)/,file);assert.ok(!['sim.js','render.js','character-v2.js','three.module.js','cannon-es.js'].includes(item.name),file);}}}
 await visit(root);
});
test('platform build remains platform-only and runtime never resolves repositories',async()=>{
 const output=await buildWeb();assert.equal(await stat(path.join(output,'games')).catch(()=>null),null);assert.equal(await stat(path.join(output,'server')).catch(()=>null),null);
 const app=await readFile(path.join(output,'src/app.js'),'utf8');assert.doesNotMatch(app,/git\s+fetch|cloneRepository|resolveVersion/);
});
