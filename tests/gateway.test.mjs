import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {gunzipSync, gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {mkdtemp, mkdir, readFile, writeFile, readdir, rm, symlink, rename} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {startGateway, probeRelease, startCurrentGateway} from '../services/gateway/index.mjs';

const fixtureSource = `
import http from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
const config = JSON.parse(await readFile(process.env.GAME_SERVER_CONFIG, 'utf8'));
const fixture = JSON.parse(await readFile('fixture.json', 'utf8'));
await writeFile(fixture.pidFile, String(process.pid));
if (fixture.crash) throw new Error('intentional startup failure');
await delay(fixture.delay ?? 0);
const server = http.createServer(async (req,res) => {
  if (req.url.startsWith('/api/unit/health') && fixture.unhealthy) { res.writeHead(503); res.end('not ready'); return; }
  let body = ''; for await (const chunk of req) body += chunk;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({release: fixture.release, rooms: fixture.roomsFile ? Number(await readFile(fixture.roomsFile,'utf8')) : fixture.rooms, config, envPort: Number(process.env.GAME_SERVER_PORT), cwd: process.cwd(), inheritedSecret: process.env.GATEWAY_TEST_SECRET, inheritedNodeOptions: process.env.NODE_OPTIONS, host:req.headers.host, origin:req.headers.origin, forwarded:req.headers['x-forwarded-for'], forwardedHost:req.headers['x-forwarded-host'], forwardedProto:req.headers['x-forwarded-proto'], leaked:req.headers['x-spoofed'], method:req.method, url:req.url, body}));
});
server.on('upgrade',(req,socket) => {
  const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\\r\\nUpgrade: websocket\\r\\nConnection: Upgrade\\r\\nSec-WebSocket-Accept: '+accept+'\\r\\nX-Seen-Host: '+req.headers.host+'\\r\\nX-Seen-Origin: '+(req.headers.origin ?? '')+'\\r\\n\\r\\n');
  socket.on('data',data=>socket.write(data));
});
server.listen(Number(process.env.GAME_SERVER_PORT),config.host);
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
`;

async function fixture(root, releaseId = 'one', settings = {}) {
  const directory = path.join(root, releaseId);
  const pidFile = path.join(root, releaseId + '-pid.txt');
  await mkdir(path.join(directory, 'public', 'src'), {recursive: true});
  await mkdir(path.join(directory, 'public', '_shared'), {recursive: true});
  await mkdir(path.join(directory, 'public', 'games', 'fixture-game'), {recursive: true});
  await writeFile(path.join(directory, 'public', 'index.html'), `<h1>${releaseId}</h1>`);
  await writeFile(path.join(directory, 'public', 'src', 'app.js'), 'export const build = ' + JSON.stringify(releaseId) + ';\n'.repeat(800));
  await writeFile(path.join(directory, 'public', 'src', 'app.js.gz'), gzipSync(await readFile(path.join(directory, 'public', 'src', 'app.js')), {level: 1}));
  await writeFile(path.join(directory, 'public', '_shared', 'bridge.js'), 'export const shared = true;');
  await writeFile(path.join(directory, 'public', 'games', 'fixture-game', 'index.html'), 'client ' + releaseId);
  await writeFile(path.join(directory, 'public', 'runtime-config.js'), 'globalThis.runtime = {};');
  const service = settings.noService ? null : {entry: 'games/fixture-game/server/index.mjs', healthPath: '/api/unit/health', httpPrefixes: ['/api/unit/'], websocketPaths: ['/unit']};
  if (service) {
    const serverDir = path.join(directory, 'games', 'fixture-game', 'server');
    await mkdir(serverDir, {recursive: true});
    await writeFile(path.join(serverDir, 'index.mjs'), fixtureSource);
    await writeFile(path.join(serverDir, 'fixture.json'), JSON.stringify({release: releaseId, pidFile, ...settings}));
  }
  const lock = {schemaVersion: 1, releaseId, publicBaseURL: settings.publicBaseURL ?? '', games: [{id: 'fixture-game', repo: 'https://example.invalid/game.git', commit: 'a'.repeat(40), service}]};
  await writeFile(path.join(directory, 'release-lock.json'), JSON.stringify(lock));
  await seal(directory);
  return {directory, lock, pidFile};
}

async function seal(directory) {
  const files = Object.create(null);
  async function visit(folder) {
    const entries = (await readdir(folder, {withFileTypes: true})).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      const filename = path.join(folder, entry.name), relative = path.relative(directory, filename).split(path.sep).join('/');
      if (entry.isDirectory()) await visit(filename);
      else if (entry.isFile() && relative !== 'release-integrity.json') files[relative] = createHash('sha256').update(await readFile(filename)).digest('hex');
    }
  }
  await visit(directory);
  await writeFile(path.join(directory, 'release-integrity.json'), JSON.stringify({schemaVersion: 1, files, digest: createHash('sha256').update(JSON.stringify(files)).digest('hex')}));
}

async function temporary(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'generic-gateway-test-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  return root;
}

function request(gateway, pathname = '/', headers = {}, method = 'GET', body = '') {
  return new Promise((resolve, reject) => {
    const req = http.request({host: '127.0.0.1', port: gateway.server.address().port, path: pathname, headers, method, agent: false}, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), text: Buffer.concat(chunks).toString()}));
    });
    req.on('error', reject); req.end(body);
  });
}

async function switchCurrent(state, releaseId) {
  const temporary = path.join(state, 'current-next');
  await rm(temporary, {force: true});
  await symlink(path.join('releases', releaseId), temporary);
  await rename(temporary, path.join(state, 'current'));
}

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}

async function eventually(check, timeout = 3000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await check()) return; await delay(20); }
  assert.fail('Condition did not become true before timeout');
}

async function upgrade(gateway, {pathname = '/unit', origin, host} = {}) {
  const port = gateway.server.address().port;
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    let buffer = Buffer.alloc(0);
    socket.setTimeout(2000, () => { socket.destroy(); reject(new Error('Upgrade timeout')); });
    socket.once('error', reject);
    socket.once('connect', () => socket.write(`GET ${pathname} HTTP/1.1\r\nHost: ${host ?? `127.0.0.1:${port}`}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n${origin ? `Origin: ${origin}\r\n` : ''}\r\n`));
    const receive = data => {
      buffer = Buffer.concat([buffer, data]);
      const delimiter = buffer.indexOf('\r\n\r\n');
      if (delimiter < 0) return;
      socket.off('data', receive);
      socket.setTimeout(0);
      resolve({socket, headers: buffer.subarray(0, delimiter).toString(), head: buffer.subarray(delimiter + 4)});
    };
    socket.on('data', receive);
  });
}

test('generic gateway serves isolated public assets with prepared gzip, ETag and HEAD', async t => {
  const root = await temporary(t);
  const {directory} = await fixture(root, 'static', {noService: true});
  const gateway = await startGateway({releaseDir: directory}); t.after(() => gateway.close());
  assert.equal(gateway.releaseId, 'static'); assert.deepEqual(gateway.services, []);
  assert.equal((await request(gateway)).text, '<h1>static</h1>');
  for (const item of ['/src/app.js', '/_shared/bridge.js', '/games/fixture-game/', '/runtime-config.js']) assert.equal((await request(gateway, item)).status, 200, item);
  const compressed = await request(gateway, '/src/app.js', {'accept-encoding': 'gzip'});
  assert.equal(compressed.headers['content-encoding'], 'gzip');
  const preparedGzip = await readFile(path.join(directory, 'public/src/app.js.gz'));
  assert.deepEqual(compressed.body, preparedGzip);
  assert.equal(Number(compressed.headers['content-length']), preparedGzip.length);
  assert.equal(compressed.headers.etag, `W/"${createHash('sha256').update(preparedGzip).digest('hex')}"`);
  assert.match(gunzipSync(compressed.body).toString(), /export const build/);
  const head = await request(gateway, '/src/app.js', {}, 'HEAD');
  assert.equal(head.status, 200); assert.equal(head.body.length, 0); assert.ok(Number(head.headers['content-length']) > 512);
  const cached = await request(gateway, '/src/app.js', {'accept-encoding': 'gzip', 'if-none-match': compressed.headers.etag});
  assert.equal(cached.status, 304); assert.equal(cached.body.length, 0);
  const identity = await request(gateway, '/src/app.js', {'accept-encoding': 'gzip;q=0, *;q=1'});
  assert.equal(identity.headers['content-encoding'], undefined);
  assert.equal((await request(gateway, '/', {}, 'POST')).status, 405);
});

test('static boundary rejects private files, traversal, symlinks and replaced assets', async t => {
  const root = await temporary(t);
  const {directory} = await fixture(root, 'private', {noService: true});
  const publicDir = path.join(directory, 'public');
  const forbidden = ['package.json', 'package-lock.json', 'release-lock.json', 'game.manifest.json', 'online.config.json', '.env', 'server/index.mjs', 'private/tokens.json', 'node_modules/dependency/index.js', 'services/worker.js', 'credentials.json'];
  for (const relative of forbidden) { await mkdir(path.dirname(path.join(publicDir, relative)), {recursive: true}); await writeFile(path.join(publicDir, relative), 'secret'); }
  await writeFile(path.join(root, 'secret.txt'), 'outside secret');
  await writeFile(path.join(publicDir, 'replace.txt'), 'public content');
  await seal(directory);
  const gateway = await startGateway({releaseDir: directory}); t.after(() => gateway.close());
  await symlink(path.join(root, 'secret.txt'), path.join(publicDir, 'leak.txt'));
  for (const relative of [...forbidden, 'leak.txt', '../release-lock.json', '%2e%2e/games/fixture-game/server/index.mjs', 'games%2ffixture-game/server/index.mjs', 'a%5cb.js']) {
    const response = await request(gateway, '/' + relative);
    assert.ok([400, 404].includes(response.status), relative + ' status ' + response.status);
    assert.doesNotMatch(response.text, /secret/);
  }
  await rm(path.join(publicDir, 'replace.txt'));
  await symlink(path.join(root, 'secret.txt'), path.join(publicDir, 'replace.txt'));
  assert.equal((await request(gateway, '/replace.txt')).status, 404);
});

test('service launch is cwd-independent and proxy preserves safe Host/Origin, methods and paths', async t => {
  const root = await temporary(t);
  const {directory} = await fixture(root);
  const runtimeDir = path.join(root, 'run');
  process.env.GATEWAY_TEST_SECRET = 'must-not-leak';
  t.after(() => delete process.env.GATEWAY_TEST_SECRET);
  const gateway = await startGateway({releaseDir: directory, runtimeDir, allowedOrigins: ['https://frontend.example']}); t.after(() => gateway.close());
  assert.equal(gateway.services.length, 1); assert.equal(gateway.services[0].ready, true);
  const port = gateway.server.address().port;
  const response = await request(gateway, '/api/unit/echo?number=1', {origin: 'https://frontend.example', 'x-forwarded-for': 'spoofed', 'x-forwarded-host': 'attacker.example', 'x-forwarded-proto': 'https', connection: 'close, x-spoofed', 'x-spoofed': 'bad'}, 'POST', 'hello');
  assert.equal(response.status, 200);
  const data = JSON.parse(response.text);
  assert.equal(data.inheritedSecret, undefined); assert.equal(data.inheritedNodeOptions, undefined);
  assert.equal(data.config.host, '127.0.0.1'); assert.equal(data.config.port, data.envPort);
  assert.deepEqual(data.config.allowedOrigins, ['https://frontend.example']);
  assert.equal(data.cwd, path.join(directory, 'games/fixture-game/server'));
  assert.equal(data.host, `127.0.0.1:${port}`); assert.equal(data.origin, 'https://frontend.example');
  assert.equal(data.forwarded, '127.0.0.1'); assert.equal(data.forwardedHost, data.host); assert.equal(data.forwardedProto, 'http'); assert.equal(data.leaked, undefined);
  assert.equal(data.method, 'POST'); assert.equal(data.body, 'hello'); assert.equal(data.url, '/api/unit/echo?number=1');
  assert.equal((await request(gateway, '/api/unit/echo', {origin: 'https://attacker.example'})).status, 403);
  assert.equal((await request(gateway, '/api/unit/echo', {host: 'attacker.example', origin: 'http://attacker.example'})).status, 421);
  assert.equal((await request(gateway, '/api/unit-no-match')).status, 404);
  const pid = gateway.services[0].pid; await gateway.close();
  assert.equal(alive(pid), false); assert.deepEqual(await readdir(runtimeDir), []);
});

test('generic WebSocket upgrade transparently proxies bytes and validates origins', async t => {
  const root = await temporary(t); const {directory} = await fixture(root);
  const gateway = await startGateway({releaseDir: directory}); t.after(() => gateway.close());
  const origin = `http://127.0.0.1:${gateway.server.address().port}`;
  const accepted = await upgrade(gateway, {origin}); t.after(() => accepted.socket.destroy());
  assert.match(accepted.headers, /^HTTP\/1.1 101/); assert.ok(accepted.headers.includes(`x-seen-origin: ${origin}`));
  const echoed = new Promise((resolve, reject) => { accepted.socket.once('data', resolve); accepted.socket.once('error', reject); });
  accepted.socket.write('transparent-upgrade-payload');
  assert.equal((await echoed).toString(), 'transparent-upgrade-payload');
  accepted.socket.destroy();
  const denied = await upgrade(gateway, {origin: 'https://attacker.example'}); denied.socket.destroy();
  assert.match(denied.headers, /^HTTP\/1.1 403/);
  const missing = await upgrade(gateway, {pathname: '/unknown', origin}); missing.socket.destroy();
  assert.match(missing.headers, /^HTTP\/1.1 404/);
});

test('public URL prefix is stripped for routing while canonical Host and Origin survive', async t => {
  const root = await temporary(t); const {directory} = await fixture(root, 'prefix', {publicBaseURL: 'https://games.example/lab/'});
  const gateway = await startGateway({releaseDir: directory}); t.after(() => gateway.close());
  const headers = {host: 'games.example', origin: 'https://games.example'};
  assert.equal((await request(gateway, '/lab/games/fixture-game/', headers)).status, 200);
  assert.equal((await request(gateway, '/games/fixture-game/', headers)).status, 200);
  assert.equal((await request(gateway, '/api/unit/health', headers)).status, 200);
  const echo = JSON.parse((await request(gateway, '/lab/api/unit/echo?q=yes', headers)).text);
  assert.equal(echo.url, '/api/unit/echo?q=yes'); assert.equal(echo.host, 'games.example'); assert.equal(echo.forwardedProto, 'https');
  assert.equal(echo.config.publicBaseURL, 'https://games.example/lab/');
  assert.deepEqual(echo.config.allowedOrigins, ['https://games.example']);
  const explicitDefaultPort = await request(gateway, '/lab/api/unit/echo', {host: 'Games.Example:443', origin: 'https://games.example'});
  assert.equal(explicitDefaultPort.status, 200); assert.equal(JSON.parse(explicitDefaultPort.text).host, 'Games.Example:443');
  const websocket = await upgrade(gateway, {pathname: '/lab/unit', host: 'games.example', origin: 'https://games.example'});
  assert.match(websocket.headers, /^HTTP\/1.1 101/); websocket.socket.destroy();
});

test('duplicate routes, unsafe service entries and escaping current symlinks fail before launch', async t => {
  const root = await temporary(t); const {directory, lock} = await fixture(root);
  for (const mutate of [
    value => value.games.push({...value.games[0]}),
    value => value.games[0].service.entry = '../outside.mjs',
    value => value.games[0].service.httpPrefixes.push('/api/unit/child/'),
    value => value.games[0].service.websocketPaths.push('/unit'),
    value => value.games[0].service.healthPath = '/api/../private',
    value => value.games[0].service.httpPrefixes = ['/games/'],
  ]) {
    const modified = structuredClone(lock); mutate(modified);
    await writeFile(path.join(directory, 'release-lock.json'), JSON.stringify(modified));
    await seal(directory);
    await assert.rejects(() => probeRelease({releaseDir: directory}), /Invalid|duplicate|Duplicate|overlap/i);
  }
  await writeFile(path.join(directory, 'release-lock.json'), JSON.stringify(lock));
  await seal(directory);
  await symlink(directory, path.join(root, 'current'));
  await assert.rejects(() => startCurrentGateway({stateDir: root}), /escapes/);
  await rm(path.join(directory, 'games/fixture-game/server/index.mjs'));
  await writeFile(path.join(root, 'outside.mjs'), fixtureSource);
  await symlink(path.join(root, 'outside.mjs'), path.join(directory, 'games/fixture-game/server/index.mjs'));
  await assert.rejects(() => probeRelease({releaseDir: directory}), /symlinks/);
});

test('probe boots and closes services without a public listener; failed health startup cleans processes', async t => {
  const root = await temporary(t); const good = await fixture(root, 'good'); const runtimeDir = path.join(root, 'run');
  const result = await probeRelease({releaseDir: good.directory, runtimeDir});
  assert.equal(result.releaseId, 'good'); assert.equal(result.services[0].ready, true); assert.equal(alive(result.services[0].pid), false);
  const unhealthy = await fixture(root, 'unhealthy', {unhealthy: true});
  await assert.rejects(() => startGateway({releaseDir: unhealthy.directory, runtimeDir, startupTimeoutMs: 600, shutdownTimeoutMs: 100}), /timed out/);
  const pid = Number(await readFile(unhealthy.pidFile, 'utf8'));
  assert.equal(alive(pid), false); assert.deepEqual(await readdir(runtimeDir), []);
  const crash = await fixture(root, 'crash', {crash: true});
  await assert.rejects(() => startGateway({releaseDir: crash.directory, runtimeDir}), /exited before healthy/);
  assert.deepEqual(await readdir(runtimeDir), []);
});

test('warm reload keeps old release available until ready, then atomically swaps and retires old services', async t => {
  const root = await temporary(t); const releases = path.join(root, 'releases'); await mkdir(releases);
  await fixture(releases, 'one'); await fixture(releases, 'two', {delay: 250});
  await switchCurrent(root, 'one');
  const gateway = await startCurrentGateway({stateDir: root, watch: false}); t.after(() => gateway.close());
  const oldPid = gateway.services[0].pid;
  await switchCurrent(root, 'two'); const reloading = gateway.reload();
  await delay(60);
  assert.equal(gateway.releaseId, 'one'); assert.equal((await request(gateway)).text, '<h1>one</h1>');
  assert.equal(JSON.parse((await request(gateway, '/api/unit/health')).text).release, 'one');
  assert.equal(await reloading, true);
  assert.equal(gateway.releaseId, 'two'); assert.equal((await request(gateway)).text, '<h1>two</h1>');
  assert.equal(JSON.parse((await request(gateway, '/api/unit/health')).text).release, 'two');
  assert.equal(alive(oldPid), false); assert.equal(gateway.services[0].ready, true);
  assert.equal(await gateway.reload(), false);
});

test('failed and superseded release reloads retain active bundle and clean candidate processes', async t => {
  const root = await temporary(t); const releases = path.join(root, 'releases'); await mkdir(releases);
  await fixture(releases, 'good'); const bad = await fixture(releases, 'bad', {unhealthy: true}); await fixture(releases, 'slow', {delay: 170});
  await switchCurrent(root, 'good');
  const gateway = await startCurrentGateway({stateDir: root, watch: false, startupTimeoutMs: 1000}); t.after(() => gateway.close());
  const originalPid = gateway.services[0].pid;
  await switchCurrent(root, 'bad'); await assert.rejects(() => gateway.reload(), /timed out/);
  assert.equal(gateway.releaseId, 'good'); assert.equal(gateway.services[0].pid, originalPid); assert.equal((await request(gateway)).status, 200); assert.ok(gateway.lastReloadError);
  const failedPid = Number(await readFile(bad.pidFile, 'utf8')); assert.equal(alive(failedPid), false);
  await switchCurrent(root, 'slow'); const reloading = gateway.reload(); await delay(60); await switchCurrent(root, 'good');
  await assert.rejects(() => reloading, /changed while warming/);
  assert.equal(gateway.releaseId, 'good'); assert.equal(gateway.services[0].pid, originalPid);
  assert.equal((await readdir(path.join(root, 'run'))).filter(name => name.startsWith('game-gateway-')).length, 1);
});

test('current symlink watcher activates a prepared release automatically', async t => {
  const root = await temporary(t); const releases = path.join(root, 'releases'); await mkdir(releases);
  await fixture(releases, 'watch-one', {noService: true}); await fixture(releases, 'watch-two', {noService: true}); await switchCurrent(root, 'watch-one');
  const gateway = await startCurrentGateway({stateDir: root, pollIntervalMs: 25}); t.after(() => gateway.close());
  await switchCurrent(root, 'watch-two'); await eventually(() => gateway.releaseId === 'watch-two');
  assert.equal((await request(gateway)).text, '<h1>watch-two</h1>');
});

test('CLI SIGTERM shuts down listener and child processes', async t => {
  const root = await temporary(t); const releases = path.join(root, 'releases'); await mkdir(releases);
  const release = await fixture(releases, 'cli'); await switchCurrent(root, 'cli');
  const child = spawn(process.execPath, [fileURLToPath(new URL('../services/gateway/index.mjs', import.meta.url)), '--state-dir', root, '--port', '0'], {cwd: root, stdio: ['ignore', 'pipe', 'pipe']});
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  let output = '', errors = ''; child.stdout.on('data', data => output += data); child.stderr.on('data', data => errors += data);
  await eventually(() => output.includes('Gateway listening'), 5000);
  const pid = Number(await readFile(release.pidFile, 'utf8'));
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({code, signal}))); child.kill('SIGTERM');
  const outcome = await exited; assert.equal(outcome.code, 0, errors); assert.equal(outcome.signal, null); assert.equal(alive(pid), false); assert.deepEqual(await readdir(path.join(root, 'run')), []);
});

test('gateway implementation imports only Node builtins and its own generic modules', async () => {
  const folder = fileURLToPath(new URL('../services/gateway/', import.meta.url));
  for (const filename of await readdir(folder)) {
    if (!filename.endsWith('.mjs')) continue;
    const source = await readFile(path.join(folder, filename), 'utf8');
    for (const match of source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)) assert.ok(match[1].startsWith('node:') || /^\.\/[\w-]+\.mjs$/.test(match[1]), `${filename}: ${match[1]}`);
    assert.doesNotMatch(source, /\b(?:fetch|execFile|execSync)\s*\(|git\s+(?:clone|fetch|pull)/);
  }
});

test('integrity verification covers backend bytes, extra files and symlinks before any child starts', async t => {
  const root = await temporary(t);
  const tampered = await fixture(root, 'tampered');
  await writeFile(path.join(tampered.directory, 'games/fixture-game/server/index.mjs'), "throw new Error('untrusted replacement');");
  await assert.rejects(() => probeRelease({releaseDir: tampered.directory}), /integrity verification failed/);
  await assert.rejects(() => readFile(tampered.pidFile), {code: 'ENOENT'});
  const extra = await fixture(root, 'extra');
  await writeFile(path.join(extra.directory, 'games/fixture-game/server/injected.mjs'), 'export const injected = true;');
  await assert.rejects(() => probeRelease({releaseDir: extra.directory}), /integrity verification failed/);
  const linked = await fixture(root, 'linked');
  await symlink(path.join(root, 'extra'), path.join(linked.directory, 'public', 'escape'));
  await assert.rejects(() => probeRelease({releaseDir: linked.directory}), /symlinks are forbidden/);
  const missing = await fixture(root, 'missing'); await rm(path.join(missing.directory, 'release-integrity.json'));
  await assert.rejects(() => probeRelease({releaseDir: missing.directory}), {code: 'ENOENT'});
});

test('client configuration modules remain public while backend config remains private', async t => {
  const root = await temporary(t); const {directory} = await fixture(root, 'client-config', {noService: true});
  await writeFile(path.join(directory, 'public/games/fixture-game/config.js'), 'export const clientTuning = { speed: 4 };');
  await writeFile(path.join(directory, 'public/games/fixture-game/service.config.json'), '{"secret":"private"}');
  await seal(directory);
  const gateway = await startGateway({releaseDir: directory}); t.after(() => gateway.close());
  assert.equal((await request(gateway, '/games/fixture-game/config.js')).status, 200);
  assert.equal((await request(gateway, '/games/fixture-game/service.config.json')).status, 404);
});

test('candidate failure cleans other ready services as well as the failing process', async t => {
  const root = await temporary(t); const release = await fixture(root, 'multi');
  const serverDir = path.join(release.directory, 'games/second-game/server');
  await mkdir(serverDir, {recursive: true});
  const secondPid = path.join(root, 'second-pid.txt');
  await writeFile(path.join(serverDir, 'index.mjs'), "import {writeFile,readFile} from 'node:fs/promises'; import {setTimeout as delay} from 'node:timers/promises'; await writeFile(" + JSON.stringify(secondPid) + ",String(process.pid)); while (!await readFile(" + JSON.stringify(release.pidFile) + ").then(()=>true,()=>false)) await delay(5); await delay(100); throw new Error('intentional second child failure');");
  release.lock.games.push({id: 'second-game', service: {entry: 'games/second-game/server/index.mjs', healthPath: '/api/second/health', httpPrefixes: ['/api/second/'], websocketPaths: ['/second']}});
  await writeFile(path.join(release.directory, 'release-lock.json'), JSON.stringify(release.lock)); await seal(release.directory);
  const runtimeDir = path.join(root, 'run');
  await assert.rejects(() => startGateway({releaseDir: release.directory, runtimeDir}), /second-game/);
  assert.equal(alive(Number(await readFile(release.pidFile, 'utf8'))), false);
  assert.equal(alive(Number(await readFile(secondPid, 'utf8'))), false);
  assert.deepEqual(await readdir(runtimeDir), []);
});

test('CLI SIGTERM during backend warmup also cleans detached children', async t => {
  const root = await temporary(t); const releases = path.join(root, 'releases'); await mkdir(releases);
  const release = await fixture(releases, 'slow-cli', {delay: 2000}); await switchCurrent(root, 'slow-cli');
  const child = spawn(process.execPath, [fileURLToPath(new URL('../services/gateway/index.mjs', import.meta.url)), '--state-dir', root, '--port', '0'], {cwd: root, stdio: ['ignore', 'pipe', 'pipe']});
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  let output = '', errors = ''; child.stdout.on('data', data => output += data); child.stderr.on('data', data => errors += data);
  await eventually(() => readFile(release.pidFile, 'utf8').then(() => true, () => false));
  const pid = Number(await readFile(release.pidFile, 'utf8'));
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({code, signal}))); child.kill('SIGTERM');
  const outcome = await exited;
  assert.equal(outcome.code, 0, errors); assert.equal(outcome.signal, null); assert.equal(alive(pid), false); assert.doesNotMatch(output, /Gateway listening/); assert.deepEqual(await readdir(path.join(root, 'run')), []);
});

test('status acknowledges live activation and failures with current instance and timestamps', async t => {
  const root = await temporary(t); const releases = path.join(root, 'releases'); await mkdir(releases);
  await fixture(releases, 'ack-one'); await fixture(releases, 'ack-two'); await fixture(releases, 'ack-bad', {crash: true}); await switchCurrent(root, 'ack-one');
  const gateway = await startCurrentGateway({stateDir: root, watch: false}); t.after(() => gateway.close());
  const status = () => readFile(gateway.statusFile, 'utf8').then(JSON.parse);
  let latest = await status();
  assert.equal(latest.pid, process.pid); assert.equal(latest.instanceId, gateway.instanceId); assert.equal(latest.releaseId, 'ack-one'); assert.equal(latest.ready, true); assert.ok(Date.parse(latest.updatedAt));
  const selectedAt = Date.now(); await switchCurrent(root, 'ack-two'); await gateway.reload(); latest = await status();
  assert.equal(latest.releaseId, 'ack-two'); assert.equal(latest.lastReload.requestedReleaseId, 'ack-two'); assert.equal(latest.lastReload.ok, true); assert.ok(Date.parse(latest.lastReload.at) >= selectedAt);
  await switchCurrent(root, 'ack-bad'); await assert.rejects(() => gateway.reload(), /exited/); latest = await status();
  assert.equal(latest.releaseId, 'ack-two'); assert.equal(latest.ready, true); assert.equal(latest.lastReload.requestedReleaseId, 'ack-bad'); assert.equal(latest.lastReload.ok, false); assert.match(latest.lastReload.error, /exited/);
  const beforeHeartbeat = Date.parse(latest.updatedAt); await eventually(async () => Date.parse((await status()).updatedAt) > beforeHeartbeat, 2500);
  await gateway.close(); await assert.rejects(() => status(), {code: 'ENOENT'});
});

test('reload refuses occupied active rooms and preserves their process and WebSocket', async t => {
  const root = await temporary(t); const releases = path.join(root, 'releases'); await mkdir(releases);
  const roomsFile = path.join(root, 'rooms.txt'); await writeFile(roomsFile, '1');
  await fixture(releases, 'occupied', {roomsFile}); const candidate = await fixture(releases, 'candidate'); await switchCurrent(root, 'occupied');
  const gateway = await startCurrentGateway({stateDir: root, watch: false}); t.after(() => gateway.close());
  const activePid = gateway.services[0].pid;
  const websocket = await upgrade(gateway); t.after(() => websocket.socket.destroy());
  await switchCurrent(root, 'candidate'); await assert.rejects(() => gateway.reload(), /occupied rooms/);
  assert.equal(gateway.releaseId, 'occupied'); assert.equal(gateway.services[0].pid, activePid); assert.equal(alive(activePid), true);
  await assert.rejects(() => readFile(candidate.pidFile), {code: 'ENOENT'});
  const echoed = new Promise(resolve => websocket.socket.once('data', resolve)); websocket.socket.write('room-still-live'); assert.equal((await echoed).toString(), 'room-still-live');
  const status = JSON.parse(await readFile(gateway.statusFile, 'utf8')); assert.equal(status.lastReload.ok, false); assert.match(status.lastReload.error, /occupied rooms/);
  websocket.socket.destroy(); await writeFile(roomsFile, '0'); assert.equal(await gateway.reload(), true); assert.equal(gateway.releaseId, 'candidate'); assert.equal(alive(activePid), false);
});

test('watcher observes fresh selections of the same release, so activation retries get fresh acknowledgments', async t => {
  const root = await temporary(t); const releases = path.join(root, 'releases'); await mkdir(releases);
  await fixture(releases, 'same', {noService: true}); await switchCurrent(root, 'same');
  const gateway = await startCurrentGateway({stateDir: root, pollIntervalMs: 25}); t.after(() => gateway.close());
  const before = JSON.parse(await readFile(gateway.statusFile, 'utf8')).lastReload.at;
  await delay(10); await switchCurrent(root, 'same');
  await eventually(async () => JSON.parse(await readFile(gateway.statusFile, 'utf8')).lastReload.at !== before);
  const status = JSON.parse(await readFile(gateway.statusFile, 'utf8'));
  assert.equal(status.lastReload.ok, true); assert.equal(status.releaseId, 'same');
});

test('prepared GLB gzip has representation-specific ETag, HEAD length and identity fallback', async t => {
  const root = await temporary(t); const {directory} = await fixture(root, 'prepared-model', {noService: true});
  const source = Buffer.alloc(16 * 1024, 17); source.write('glTF');
  const packed = gzipSync(source, {level: 1});
  await writeFile(path.join(directory, 'public/model.glb'), source);
  await writeFile(path.join(directory, 'public/model.glb.gz'), packed);
  await writeFile(path.join(directory, 'public/no-gzip.glb'), source);
  await seal(directory);
  const gateway = await startGateway({releaseDir: directory}); t.after(() => gateway.close());
  const gzip = await request(gateway, '/model.glb', {'accept-encoding': 'gzip'});
  assert.equal(gzip.status, 200); assert.equal(gzip.headers['content-type'], 'model/gltf-binary');
  assert.equal(gzip.headers['content-encoding'], 'gzip'); assert.equal(gzip.headers.vary, 'Accept-Encoding');
  assert.equal(Number(gzip.headers['content-length']), packed.length); assert.deepEqual(gzip.body, packed); assert.deepEqual(gunzipSync(gzip.body), source);
  assert.equal(gzip.headers.etag, `W/"${createHash('sha256').update(packed).digest('hex')}"`);
  const head = await request(gateway, '/model.glb', {'accept-encoding': 'gzip'}, 'HEAD');
  assert.equal(head.status, 200); assert.equal(head.body.length, 0); assert.equal(head.headers['content-encoding'], 'gzip'); assert.equal(Number(head.headers['content-length']), packed.length); assert.equal(head.headers.etag, gzip.headers.etag);
  const cached = await request(gateway, '/model.glb', {'accept-encoding': 'gzip', 'if-none-match': gzip.headers.etag});
  assert.equal(cached.status, 304); assert.equal(cached.body.length, 0);
  const identity = await request(gateway, '/model.glb', {'accept-encoding': 'gzip;q=0, *;q=1', 'if-none-match': gzip.headers.etag});
  assert.equal(identity.status, 200); assert.equal(identity.headers['content-encoding'], undefined); assert.equal(Number(identity.headers['content-length']), source.length); assert.deepEqual(identity.body, source); assert.notEqual(identity.headers.etag, gzip.headers.etag);
  const absent = await request(gateway, '/no-gzip.glb', {'accept-encoding': 'gzip'});
  assert.equal(absent.status, 200); assert.equal(absent.headers['content-encoding'], undefined); assert.deepEqual(absent.body, source);
  assert.equal((await request(gateway, '/model.glb.gz')).status, 404);
  await rm(path.join(directory, 'public/model.glb.gz'));
  await symlink(path.join(directory, 'public/no-gzip.glb'), path.join(directory, 'public/model.glb.gz'));
  assert.equal((await request(gateway, '/model.glb', {'accept-encoding': 'gzip'})).status, 404);
  assert.equal((await request(gateway, '/model.glb', {'accept-encoding': 'gzip'}, 'HEAD')).status, 404);
  assert.equal((await request(gateway, '/model.glb')).status, 200);
  const implementation = await readFile(fileURLToPath(new URL('../services/gateway/static.mjs', import.meta.url)), 'utf8');
  assert.doesNotMatch(implementation, /node:zlib|createGzip|createHash/);
});

test('public license notices remain readable and conditional dates defer to ETags', async t => {
  const root = await temporary(t); const {directory} = await fixture(root, 'notices', {noService: true});
  for (const name of ['LICENSE', 'NOTICE', 'COPYING', 'CREDITS.md']) await writeFile(path.join(directory, 'public', name), `${name}: public attribution`);
  await mkdir(path.join(directory, 'public/private'), {recursive: true}); await writeFile(path.join(directory, 'public/private/NOTICE'), 'private');
  await seal(directory);
  const gateway = await startGateway({releaseDir: directory}); t.after(() => gateway.close());
  for (const name of ['LICENSE', 'NOTICE', 'COPYING', 'CREDITS.md']) {
    const result = await request(gateway, '/' + name);
    assert.equal(result.status, 200); assert.equal(result.headers['content-type'], 'text/plain; charset=utf-8'); assert.match(result.text, /public attribution/);
  }
  assert.equal((await request(gateway, '/private/NOTICE')).status, 404);
  const initial = await request(gateway, '/LICENSE');
  assert.equal((await request(gateway, '/LICENSE', {'if-modified-since': initial.headers['last-modified']})).status, 304);
  assert.equal((await request(gateway, '/LICENSE', {'if-modified-since': 'Thu, 01 Jan 1970 00:00:00 GMT'})).status, 200);
  assert.equal((await request(gateway, '/LICENSE', {'if-modified-since': 'invalid date'})).status, 200);
  assert.equal((await request(gateway, '/LICENSE', {'if-none-match': '"different"', 'if-modified-since': initial.headers['last-modified']})).status, 200);
  assert.equal((await request(gateway, '/LICENSE', {'if-none-match': initial.headers.etag, 'if-modified-since': 'Thu, 01 Jan 1970 00:00:00 GMT'})).status, 304);
});
