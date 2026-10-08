import { cp, mkdir, readFile, writeFile, readdir, stat, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const publication = path.join(root, 'artifacts/online-lab');
const audit = path.join(root, 'artifacts/experience-20261007');
const git = (...args) => execFileSync('git', ['-C', publication, ...args], { encoding: 'utf8' }).trim();
if (git('remote', 'get-url', 'origin') !== 'https://github.com/LanShiLiang/ai-game-lab.git') throw Error('Unexpected publication repository');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const save = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n');
async function files(dir) {
  const result = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) result.push(...await files(file));
    else if (item.isFile()) result.push(file);
    else throw Error('Unexpected link: ' + file);
  }
  return result;
}

if (process.argv[2] === '--sync') {
  for (const name of ['index.html', 'README.md']) await cp(path.join(root, name), path.join(publication, name));
  // Copy existing source files, never old research assets or hosting metadata.
  for (const name of git('ls-files').split('\n').filter(file => /^(src|tests|templates)\//.test(file) || /^games\/[^/]+\/[^/]+\.(js|html|css|md)$/.test(file) && !file.endsWith('/credits.html'))) {
    if((await stat(path.join(root,name)).catch(()=>null))?.isFile())await cp(path.join(root, name), path.join(publication, name));
  }
  for (const name of ['games/apex-rush/performance.js', 'games/freight-fire/performance.js', 'src/community.json', 'src/submission.js', 'tests/performance.test.mjs', 'tests/submission.test.mjs', 'tests/online-rooms.test.mjs', 'games/apex-rush/rooms.js', 'games/apex-rush/lab-bridge.js', 'games/freight-fire/lab-bridge.js', 'games/freight-fire/config.js', 'games/freight-fire/room-rules.js', 'games/apex-rush/camera-rig.js', 'games/apex-rush/drift-trails.js', 'tests/fps-rooms.test.mjs', 'tests/racing-render.test.mjs', 'games/freight-fire/cover.svg', 'docs/freight-fire.md', 'docs/online-deployment.md']) { await mkdir(path.dirname(path.join(publication,name)),{recursive:true}); await cp(path.join(root,name),path.join(publication,name)); }
  // Keep the production catalog's featured selection.
  const catalog = JSON.parse(await readFile(path.join(publication, 'games.json'), 'utf8'));
  const working = JSON.parse(await readFile(path.join(root, 'games.json'), 'utf8'));
  await save(path.join(publication, 'games.json'), working.map(game => {
    const previous = catalog.find(entry => entry.id === game.id);
    return { ...game, featured: previous?.featured ?? game.featured };
  }));
  const scripts = ['catalog.mjs', 'check.mjs', 'build.mjs', 'serve.mjs', 'new-game.mjs', 'test.mjs', 'fps-server.mjs', 'racing-server.mjs', 'prepare-original-skins.mjs', 'community-skins-verification.mjs', 'lab-upgrade-qa.mjs', 'play-experience-qa.mjs', 'racing-browser-qa.mjs', 'fps-browser-qa.mjs', 'freight-rebuild-qa.mjs', 'prepare-lab-release.mjs', 'activate-lab-release.sh', 'install-online.sh'];
  for (const name of scripts) await cp(path.join(root, 'scripts', name), path.join(publication, 'scripts', name));
  for (const name of ['package.json', 'package-lock.json', 'racing-online.config.json']) await cp(path.join(root, name), path.join(publication, name));
  const pkg = JSON.parse(await readFile(path.join(publication, 'package.json'), 'utf8'));
  // Public commands reference only source included in the public repository.
  pkg.scripts = {
    dev: 'node scripts/serve.mjs', build: 'node scripts/build.mjs', preview: 'node scripts/serve.mjs --preview',
    check: 'node scripts/check.mjs && node scripts/test.mjs', 'new:game': 'node scripts/new-game.mjs',
    'online:start': 'node scripts/racing-server.mjs',
    'test:display': 'node scripts/lab-upgrade-qa.mjs', 'test:experience': 'node scripts/play-experience-qa.mjs',
    'test:fps:browser': 'node scripts/fps-browser-qa.mjs --regression-only', 'test:racing:browser': 'node scripts/racing-browser-qa.mjs'
  };
  await save(path.join(publication, 'package.json'), pkg);
  for(const name of ['games/apex-rush/lan.js','scripts/lan-server.mjs','tests/racing-lan.test.mjs','start-racing-lan.cmd','start-racing-lan.sh','racing-server.config.json'])await rm(path.join(publication,name),{force:true});
  console.log('Synced authorized hall, games, tests and build/release scripts to the publication checkout.');
} else {
  const id = process.argv[2], phase = process.argv[3] || 'final';
  if (!/^\d{8}-\d{6}$/.test(id || '') || !['baseline', 'final'].includes(phase)) throw Error('Pass a fresh release identifier and baseline/final phase');
  if (git('status', '--porcelain', '--untracked-files=no')) throw Error('Commit the prepared source before packaging');
  const output = path.join(root, 'artifacts/online-deploy', id);
  try { await stat(output); throw Error('Release already exists'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const app = path.join(output, 'app'), patch = path.join(output, 'patch');
  await mkdir(patch, { recursive: true });
  for (const name of git('ls-files').split('\n').filter(file => ['index.html', 'games.json', 'LICENSE', 'LICENSE-SCOPE.md', 'THIRD_PARTY_NOTICES.md'].includes(file) || /^(src|games|licenses)\//.test(file))) {
    const target = path.join(app, name); await mkdir(path.dirname(target), { recursive: true }); await cp(path.join(publication, name), target);
  }
  await mkdir(path.join(app, 'scripts'));
  for(const name of ['racing-server.mjs','fps-server.mjs'])await cp(path.join(publication,'scripts',name),path.join(app,'scripts',name));
  await cp(path.join(publication, 'racing-online.config.json'), path.join(app, 'racing-online.config.json'));
  const packageInfo=JSON.parse(await readFile(path.join(publication,'package.json'),'utf8'));
  const wsManifest=fileURLToPath(import.meta.resolve('ws/package.json'));
  if(JSON.parse(await readFile(wsManifest,'utf8')).version!==packageInfo.dependencies.ws)throw Error('Installed ws version differs from publication dependency');
  await cp(path.dirname(wsManifest),path.join(app,'node_modules/ws'),{recursive:true});
  await save(path.join(app,'package.json'),{private:true,type:'module',dependencies:{ws:packageInfo.dependencies.ws}});
  const metadata = { id, phase, createdAt: new Date().toISOString(), sourceCommit: git('rev-parse', 'HEAD'), publicURL: 'https://lslzqco.cn/ai-game-lab/', maxRooms: 3, roomTtlMs: 28800000 };
  await save(path.join(app, 'release.json'), metadata);
  await save(path.join(app, 'src/release.json'), metadata);
  const config = JSON.parse(await readFile(path.join(app, 'racing-online.config.json'), 'utf8'));
  if (config.host !== '127.0.0.1' || config.maxRooms !== 3 || config.roomTtlMs !== 28800000 || !config.online || !config.serveLab) throw Error('Production configuration drift');
  for (const file of await files(app)) {
    if (/\.(js|json|glb|css|html|svg)$/.test(file)) {
      const source = await readFile(file), packed = gzipSync(source, { level: 9 });
      if (packed.length < source.length * .9) await writeFile(file + '.gz', packed);
    }
  }
  const previous = new Map();
  for (const line of (await readFile(path.join(audit, 'previous-files.sha256'), 'utf8')).split(/\r?\n/)) {
    const match = /^([a-f\d]{64})\s+(.+)$/.exec(line);
    if (match) previous.set(match[2], match[1]);
  }
  const checksums = [], desired = new Set(), changed = [];
  for (const file of (await files(app)).sort()) {
    const relative = path.relative(app, file).split(path.sep).join('/');
    const bytes = await readFile(file), digest = hash(bytes);
    desired.add(relative); checksums.push(`${digest}  ${relative}`);
    if (previous.get(relative) !== digest) {
      const target = path.join(patch, relative); await mkdir(path.dirname(target), { recursive: true }); await cp(file, target);
      changed.push({ path: relative, bytes: bytes.length });
    }
  }
  const stale = [...previous.keys()].filter(file => file.endsWith('.gz') && !desired.has(file));
  await writeFile(path.join(patch, 'SHA256SUMS.txt'), checksums.join('\n') + '\n');
  await writeFile(path.join(patch,'RETIRED_FILES.txt'),['games/apex-rush/lan.js','scripts/lan-server.mjs','tests/racing-lan.test.mjs','start-racing-lan.cmd','start-racing-lan.sh','racing-server.config.json'].join('\n')+'\n');
  await writeFile(path.join(patch, 'STALE_GZIP.txt'), stale.join('\n') + (stale.length ? '\n' : ''));
  await writeFile(path.join(output, 'update.sh'), (await readFile(path.join(root, 'scripts/activate-lab-release.sh'), 'utf8')).replaceAll('\r\n', '\n'));
  execFileSync('tar', ['-czf', path.join(output, 'release.tgz'), '-C', patch, '.'], { stdio: 'inherit' });
  const report = { metadata, checkedFiles: checksums.length, changed, staleGzip: stale, archiveBytes: (await stat(path.join(output, 'release.tgz'))).size, archiveSHA256: hash(await readFile(path.join(output, 'release.tgz'))) };
  await save(path.join(output, 'build-report.json'), report);
  console.log(JSON.stringify({ id, phase, checkedFiles: checksums.length, changedFiles: changed.length, archiveBytes: report.archiveBytes }));
}
