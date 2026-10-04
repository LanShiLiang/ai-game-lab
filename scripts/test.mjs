import {readdir} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {root} from './catalog.mjs';

// Pass an explicit file list so Node never discovers research clones,
// generated dist copies or third-party test suites in the shared workspace.
const directory=path.join(root,'tests');
const files=(await readdir(directory,{withFileTypes:true}))
 .filter(entry=>entry.isFile()&&entry.name.endsWith('.test.mjs'))
 .map(entry=>path.join(directory,entry.name)).sort();
if(!files.length)throw new Error('No repository tests/*.test.mjs files found.');
console.log(`Running ${files.length} repository test files from tests/.`);
const result=spawnSync(process.execPath,['--test',...files],{cwd:root,stdio:'inherit'});
if(result.error)throw result.error;
if(result.signal)console.error('Repository tests terminated by '+result.signal);
process.exitCode=result.status??1;
