import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import os from 'node:os';import {mkdtemp,mkdir,writeFile,rm,realpath} from 'node:fs/promises';import {archiveEntryBytes} from '../scripts/deploy/common.mjs';import {readReleasePointer,writeReleasePointer} from '../services/gateway/pointers.mjs';
test('archive limits count actual bytes in GNU and Windows BSD listings',()=>{assert.equal(archiveEntryBytes('-rw-r--r-- user/group 123 2026-10-10 12:00 ./asset'),123);assert.equal(archiveEntryBytes('-rw-rw-rw- 0 0 0 123 Oct 10 12:00 ./asset'),123);assert.equal(archiveEntryBytes('-rw-rw-rw- 0 0 0 1073741825 Oct 10 12:00 ./asset'),1073741825);assert.throws(()=>archiveEntryBytes('-rw-r--r-- user/group nope date'),/listing/);});
test('atomic JSON selections change identity and reject traversal, malformed data and escaped targets',async t=>{const state=await realpath(await mkdtemp(path.join(os.tmpdir(),'lab-pointer-')));t.after(()=>rm(state,{recursive:true,force:true}));const release=path.join(state,'releases','one');await mkdir(release,{recursive:true});await writeReleasePointer(state,'current',release,{format:'json'});const first=await readReleasePointer(state,'current');assert.equal(first.target,await realpath(release));await writeReleasePointer(state,'current',release,{format:'json'});assert.notEqual((await readReleasePointer(state,'current')).token,first.token);await writeFile(path.join(state,'current'),JSON.stringify({schemaVersion:1,releaseId:'../outside',selectionId:'a'}));await assert.rejects(()=>readReleasePointer(state,'current'),/Invalid/);await writeFile(path.join(state,'current'),'{}');await assert.rejects(()=>readReleasePointer(state,'current'),/Invalid/);await assert.rejects(()=>writeReleasePointer(state,'current',state),/Unsafe/);});

test('cancelled static streams retain and explicitly close their FileHandle during GC', async () => {
  const {execFile} = await import('node:child_process');
  const {promisify} = await import('node:util');
  const {stderr} = await promisify(execFile)(process.execPath, ['--expose-gc', 'tests/static-abort-worker.mjs'], {cwd: new URL('..', import.meta.url), timeout: 30000});
  assert.equal(stderr, '');
});

test('Windows sharing locks retry bounded atomic replacement without removing the old file', async()=>{
 const {replaceFile}=await import('../services/gateway/files.mjs');
 let calls=0;const waits=[];
 await replaceFile('new','old',{platform:'win32',operation:async()=>{if(++calls<3)throw Object.assign(new Error('Sharing lock'),{code:'EPERM'});},wait:async ms=>waits.push(ms)});
 assert.equal(calls,3);assert.deepEqual(waits,[20,40]);
 calls=0;await assert.rejects(replaceFile('new','old',{platform:'win32',operation:async()=>{calls++;throw Object.assign(new Error('Persistent denial'),{code:'EACCES'});},wait:async()=>{}}),/Persistent/);assert.equal(calls,8);
 calls=0;await assert.rejects(replaceFile('new','old',{platform:'linux',operation:async()=>{calls++;throw Object.assign(new Error('Permission'),{code:'EPERM'});}}),/Permission/);assert.equal(calls,1);
});
