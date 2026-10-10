import {mkdir,stat,rename,readFile,writeFile,cp} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {run,runBytes,digest,saveJSON,readJSON,checksums,validateDistribution,extractArchive,discard} from './common.mjs';
const SHA=/^[0-9a-f]{40}$/;
function githubIdentity(repository){const match=/^https:\/\/github\.com\/([^/]+)\/([^/]+)\.git$/.exec(repository);return match?{owner:match[1],repo:match[2]}:null;}
async function githubJSON(url){
 const headers={'Accept':'application/vnd.github+json','User-Agent':'ai-game-lab-deployer'};
 // Authentication stays in the operator's environment, never registry/locks/logs.
 if(process.env.GITHUB_TOKEN)headers.Authorization='Bearer '+process.env.GITHUB_TOKEN;
 const response=await fetch(url,{headers,signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('GitHub metadata request failed ('+response.status+')');return response.json();
}
export async function mirrorRepository(game,state){
 const folder=path.join(state,'repositories',digest(game.repository).slice(0,24)+'.git');await mkdir(path.dirname(folder),{recursive:true});
 if(!(await stat(folder).catch(()=>null))){const temporary=folder+'.tmp-'+randomUUID();try{await run('git',['clone','--mirror','--',game.repository,temporary],{env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});await rename(temporary,folder);}catch(error){await discard(temporary);throw error;}}
 else {if(await run('git',['--git-dir',folder,'remote','get-url','origin'])!==game.repository)throw Error('Cached repository origin does not match trusted registry');await run('git',['--git-dir',folder,'fetch','--prune','origin'],{env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});}
 return folder;
}
export async function queryVersions(game,state){const mirror=await mirrorRepository(game,state);const lines=await run('git',['--git-dir',mirror,'for-each-ref','--format=%(refname) %(objectname)','refs/heads','refs/tags']);const versions=[];for(const line of lines?lines.split('\n'):[]){const [ref]=line.split(' '),commit=await run('git',['--git-dir',mirror,'rev-parse','--verify',ref+'^{commit}']);versions.push({ref,commit});}return versions;}
export async function resolveVersion(game,state){
 const mirror=await mirrorRepository(game,state);let requested=game.ref,ref=requested,release=null;
 if(requested.startsWith('release:')){const identity=githubIdentity(game.repository);if(!identity)throw Error('Release queries require a GitHub repository');const tag=requested.slice(8);release=await githubJSON(`https://api.github.com/repos/${identity.owner}/${identity.repo}/releases/`+(tag==='latest'?'latest':'tags/'+encodeURIComponent(tag)));ref='refs/tags/'+release.tag_name;}
 else if(!SHA.test(ref)&&ref!=='HEAD'&&!ref.startsWith('refs/')){const branch='refs/heads/'+ref;ref=await run('git',['--git-dir',mirror,'rev-parse','--verify',branch]).then(()=>branch,()=> 'refs/tags/'+ref);}
 if(!(SHA.test(ref)||ref==='HEAD'||/^refs\/(heads|tags)\/[A-Za-z0-9_./-]+$/.test(ref)))throw Error('Invalid version reference');
 const commit=await run('git',['--git-dir',mirror,'rev-parse','--verify',ref+'^{commit}']);if(!SHA.test(commit))throw Error('Version did not resolve to an exact commit');
 // Branch/tag deployments also prefer an immutable artifact when its release tag
 // resolves to this very commit. Metadata permission failures fall back only if
 // the registry explicitly permits a source build.
 if(!release&&githubIdentity(game.repository)&&game.releaseArtifacts){try{const {owner,repo}=githubIdentity(game.repository),releases=await githubJSON(`https://api.github.com/repos/${owner}/${repo}/releases?per_page=20`);for(const candidate of releases){if(candidate.draft||!candidate.tag_name)continue;const sha=await run('git',['--git-dir',mirror,'rev-parse','--verify','refs/tags/'+candidate.tag_name+'^{commit}']).catch(()=>null);if(sha===commit){release=candidate;break;}}}catch(error){if(!game.allowSourceBuild)throw error;}}
 const lockBytes=await runBytes('git',['--git-dir',mirror,'show',commit+':package-lock.json']);const lockfileDigest=digest(lockBytes);
 return {repository:game.repository,requestedRef:requested,commit,lockfileDigest,mirror,release};
}
async function downloadAsset(url,file,{api=false}={}){
 const first=new URL(url);if(first.protocol!=='https:'||first.hostname!==(api?'api.github.com':'github.com')||first.username||first.password)throw Error('Untrusted release asset URL');
 let current=first;for(let redirects=0;redirects<5;redirects++){
  const headers={'User-Agent':'ai-game-lab-deployer','Accept':'application/octet-stream'};if(api&&current.href===first.href&&process.env.GITHUB_TOKEN)headers.Authorization='Bearer '+process.env.GITHUB_TOKEN;
  const response=await fetch(current,{headers,redirect:'manual',signal:AbortSignal.timeout(60000)});
  if([301,302,303,307,308].includes(response.status)){current=new URL(response.headers.get('location'),current);if(current.protocol!=='https:'||!['api.github.com','github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(current.hostname)||current.username||current.password)throw Error('Untrusted asset redirect');if(current.hostname==='api.github.com'&&current.href!==first.href)throw Error('API asset redirect changed endpoint');continue;}
  if(!response.ok)throw Error('Release asset download failed ('+response.status+')');if(Number(response.headers.get('content-length'))>256*1024*1024)throw Error('Release asset exceeds size limit');const chunks=[];let total=0;for await(const chunk of response.body){total+=chunk.length;if(total>256*1024*1024)throw Error('Release asset exceeds size limit');chunks.push(chunk);}const bytes=Buffer.concat(chunks,total);await writeFile(file,bytes);return bytes;
 }throw Error('Too many asset redirects');
}
export async function verifyArtifactEnvelope({archive,checksum,provenance},game,resolved){
 const expected=checksum.trim().split(/\s+/)[0];if(!/^[a-f0-9]{64}$/.test(expected)||digest(archive)!==expected)throw Error('Release archive checksum mismatch');
 if(provenance.schemaVersion!==1||provenance.gameId!==game.id||provenance.repository!==game.repository||provenance.commit!==resolved.commit||provenance.lockfileSha256!==resolved.lockfileDigest||provenance.artifactSha256!==expected)throw Error('Release artifact provenance mismatch');return expected;
}
async function releaseArtifact(game,resolved,work){
 const spec=game.releaseArtifacts;if(!resolved.release||!spec)return null;const assets=resolved.release.assets||[],find=name=>assets.find(asset=>asset.name===name);
 const archiveAsset=find(spec.archive),checksumAsset=find(spec.checksum),provenanceAsset=find(spec.provenance);if(!archiveAsset||!checksumAsset||!provenanceAsset)return null;
 const allowedPrefix=game.repository.slice(0,-4)+'/releases/download/',identity=githubIdentity(game.repository),apiPrefix=`https://api.github.com/repos/${identity.owner}/${identity.repo}/releases/assets/`;
 const files={};for(const [kind,asset]of Object.entries({archive:archiveAsset,checksum:checksumAsset,provenance:provenanceAsset})){
  const api=Number.isSafeInteger(asset.id)&&asset.id>0&&asset.url===apiPrefix+asset.id;
  if(asset.url&&!api)throw Error('Release asset API does not match trusted repository metadata');
  if(!api&&!asset.browser_download_url?.startsWith(allowedPrefix))throw Error('Release asset belongs to another repository');
  const file=path.join(work,kind);files[kind]=await downloadAsset(api?asset.url:asset.browser_download_url,file,{api});}
 const archiveDigest=await verifyArtifactEnvelope({archive:files.archive,checksum:files.checksum.toString(),provenance:JSON.parse(files.provenance.toString())},game,resolved);
 const folder=path.join(work,'artifact');await extractArchive(path.join(work,'archive'),folder);return {folder,archiveDigest,kind:'release-artifact'};
}
export function buildEnvironment(state){const env={};for(const key of ['PATH','SystemRoot','WINDIR','COMSPEC','PATHEXT','TEMP','TMP','TMPDIR'])if(process.env[key])env[key]=process.env[key];for(const key of ['HTTP_PROXY','HTTPS_PROXY','http_proxy','https_proxy'])if(process.env[key]){try{const url=new URL(process.env[key]);if(['http:','https:'].includes(url.protocol)&&!url.username&&!url.password)env[key]=url.href;}catch{}}for(const key of ['NODE_EXTRA_CA_CERTS','SSL_CERT_FILE','SSL_CERT_DIR','npm_config_cafile'])if(process.env[key])env[key]=process.env[key];for(const key of ['NO_PROXY','no_proxy'])if(process.env[key])env[key]=process.env[key];env.HOME=path.join(state,'build-home');env.npm_config_cache=path.join(state,'npm-cache');env.CI='true';return env;}
export async function obtainBuild(game,resolved,state){
 const cacheKey=digest(JSON.stringify({repository:game.repository,commit:resolved.commit,lockfile:resolved.lockfileDigest,node:process.version,platform:process.platform,arch:process.arch,recipe:1}));
 const cache=path.join(state,'cache',game.id,cacheKey),recordFile=path.join(cache,'cache-entry.json');
 if(await stat(recordFile).catch(()=>null)){const record=await readJSON(recordFile);if(record.kind==='source-build'&&!game.allowSourceBuild)throw Error('Cached source build is not authorized by current registry');if(record.repository!==game.repository||record.lockfileDigest!==resolved.lockfileDigest)throw Error('Cached provenance mismatch');const actual=await validateDistribution(path.join(cache,'dist'),game);if(record.digest!==actual.digest||record.commit!==resolved.commit)throw Error('Cached artifact failed integrity verification');return {...record,folder:path.join(cache,'dist'),cacheHit:true,cacheKey};}
 const work=path.join(state,'work',game.id+'-'+randomUUID());await mkdir(work,{recursive:true});await mkdir(path.dirname(cache),{recursive:true});
 try{
  let built=await releaseArtifact(game,resolved,work);
  if(!built){if(!game.allowSourceBuild)throw Error('No verified immutable release artifact; source build is not authorized');
   const source=path.join(work,'source');await run('git',['clone','--no-hardlinks','--no-checkout','--',resolved.mirror,source]);await run('git',['-C',source,'checkout','--detach',resolved.commit]);
   const tracked=await run('git',['-C',source,'ls-files','--stage']);if(tracked.split('\n').some(line=>line.startsWith('120000 ')||line.startsWith('160000 ')))throw Error('Source build cannot contain symlinks or unreviewed submodules');
   if(digest(await readFile(path.join(source,'package-lock.json')))!==resolved.lockfileDigest)throw Error('Source dependency lock changed after resolution');
   const env=buildEnvironment(state);await mkdir(env.HOME,{recursive:true});
   await run(process.platform==='win32'?'npm.cmd':'npm',['ci','--ignore-scripts','--no-audit','--no-fund'],{cwd:source,env});
   await run(process.platform==='win32'?'npm.cmd':'npm',['run','--ignore-scripts','build'],{cwd:source,env});built={folder:path.join(source,'dist'),kind:'source-build',archiveDigest:null};
  }
  const validation=await validateDistribution(built.folder,game),temporary=cache+'.tmp-'+randomUUID();await mkdir(temporary);await cp(built.folder,path.join(temporary,'dist'),{recursive:true});
  const record={schemaVersion:1,gameId:game.id,repository:game.repository,commit:resolved.commit,lockfileDigest:resolved.lockfileDigest,kind:built.kind,archiveDigest:built.archiveDigest,digest:validation.digest,files:validation.files};await saveJSON(path.join(temporary,'cache-entry.json'),record);await rename(temporary,cache);return {...record,folder:path.join(cache,'dist'),cacheHit:false,cacheKey};
 }finally{await discard(work);}
}
