import {replaceFile} from './files.mjs';
import {readReleasePointer} from './pointers.mjs';
import http from 'node:http';
import path from 'node:path';
import {lstat, realpath, mkdir, writeFile, rename, readFile, rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {readRelease, isInside, matchesPrefix} from './release.mjs';
import {indexPublicFiles, serveStatic} from './static.mjs';
import {bootServices, serviceStatus, readServiceHealth} from './processes.mjs';

const hopHeaders = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);

function cleanHeaders(headers) {
  const removed = new Set([...hopHeaders, ...(headers.connection ?? '').toLowerCase().split(',').map(value => value.trim())]);
  return Object.fromEntries(Object.entries(headers).filter(([key]) => !removed.has(key) && key !== 'forwarded' && !key.startsWith('x-forwarded-')));
}

function requestPath(request, bundle, options) {
  const raw = request.url ?? '';
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  const [rawPath] = raw.split('?');
  if (/%(?:2f|5c)/i.test(rawPath)) return null;
  let pathname;
  try { pathname = decodeURIComponent(rawPath); } catch { return null; }
  if (/[\\\x00-\x1f\x7f]/.test(pathname) || pathname.includes('//') || pathname.split('/').some(segment => segment === '.' || segment === '..')) return null;
  if (bundle.basePath) {
    if (pathname === bundle.basePath) pathname = '/';
    else if (pathname.startsWith(`${bundle.basePath}/`)) pathname = pathname.slice(bundle.basePath.length);
    else if (options.requirePublicPrefix) return {outsideBase: true};
    // Existing reverse proxies may already have removed the public URL prefix.
  }
  const query = raw.includes('?') ? raw.slice(raw.indexOf('?')) : '';
  // Re-encode decoded path segments rather than letting decoded '#' or '?' alter routing.
  return {pathname, upstreamPath: pathname.split('/').map(segment => encodeURIComponent(segment)).join('/') + query};
}

function normalizedHost(value, protocol = 'http:') {
  if (typeof value !== 'string' || !/^(?:[a-zA-Z0-9.-]+|\[[0-9a-fA-F:]+\])(?::[0-9]{1,5})?$/.test(value)) return null;
  try { return new URL(`${protocol}//${value}`).host; } catch { return null; }
}

function requestIdentity(request, bundle, server, options) {
  const rawHost = request.headers.host;
  const host = normalizedHost(rawHost);
  if (!host) return null;
  const address = server.address();
  const localPort = address?.port;
  const publicURL = bundle.origin ? new URL(bundle.origin) : null;
  const matchesPublic = publicURL && normalizedHost(rawHost, publicURL.protocol) === publicURL.host;
  const allowedHosts = new Set([
    ...(options.allowedHosts ?? []).map(value => normalizedHost(value)),
    `127.0.0.1:${localPort}`, `localhost:${localPort}`, `[::1]:${localPort}`,
  ].map(value => normalizedHost(value)));
  if (address && !['0.0.0.0', '::', '127.0.0.1', '::1'].includes(address.address)) {
    const addressHost = address.address.includes(':') ? `[${address.address}]` : address.address;
    allowedHosts.add(normalizedHost(`${addressHost}:${localPort}`));
  }
  if (!matchesPublic && !allowedHosts.has(host)) return null;
  const protocol = matchesPublic ? publicURL.protocol.slice(0, -1) : 'http';
  return {host: rawHost, protocol, origin: new URL(`${protocol}://${rawHost}`).origin};
}

function acceptsOrigin(request, bundle, identity) {
  const origin = request.headers.origin;
  if (origin === undefined) return true;
  try {
    const parsed = new URL(origin);
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.origin === origin && !parsed.username && !parsed.password && (origin === identity.origin || bundle.allowedOrigins.includes(origin));
  } catch { return false; }
}

function forwardedHeaders(request, identity, websocket = false) {
  const headers = cleanHeaders(request.headers);
  headers.host = identity.host;
  if (request.headers.origin !== undefined) headers.origin = request.headers.origin;
  headers['x-forwarded-host'] = identity.host;
  headers['x-forwarded-proto'] = identity.protocol;
  headers['x-forwarded-for'] = request.socket.remoteAddress ?? '';
  if (websocket) { headers.connection = 'Upgrade'; headers.upgrade = 'websocket'; }
  return headers;
}

function endHTTP(response, status, message) {
  if (!response.headersSent) { response.writeHead(status, {'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff'}); response.end(message); }
  else response.destroy();
}

function endSocket(socket, status, message) {
  const body = Buffer.from(message);
  socket.end(`HTTP/1.1 ${status} ${http.STATUS_CODES[status]}\r\nConnection: close\r\nContent-Type: text/plain\r\nContent-Length: ${body.length}\r\n\r\n${message}`);
}

function proxyHTTP(request, response, service, upstreamPath, identity, options) {
  if (!service?.ready) { endHTTP(response, 503, 'Service unavailable'); return; }
  const upstream = http.request({host: '127.0.0.1', port: service.port, path: upstreamPath, method: request.method, headers: forwardedHeaders(request, identity), agent: false}, reply => {
    response.writeHead(reply.statusCode, cleanHeaders(reply.headers));
    reply.on('error', () => response.destroy());
    reply.pipe(response);
  });
  upstream.setTimeout(options.proxyTimeoutMs ?? 30_000, () => upstream.destroy(new Error('Upstream timeout')));
  upstream.on('error', () => endHTTP(response, 502, 'Service unavailable'));
  request.once('aborted', () => upstream.destroy());
  response.once('close', () => upstream.destroy());
  request.pipe(upstream);
}

function proxyWebSocket(request, socket, head, service, upstreamPath, identity, bundle, options) {
  if (!service?.ready) { endSocket(socket, 503, 'Service unavailable'); return; }
  const upstream = http.request({host: '127.0.0.1', port: service.port, path: upstreamPath, method: 'GET', headers: forwardedHeaders(request, identity, true), agent: false});
  upstream.setTimeout(options.proxyTimeoutMs ?? 30_000, () => upstream.destroy(new Error('Upstream timeout')));
  socket.once('close', () => upstream.destroy());
  upstream.on('error', () => { if (!socket.destroyed) endSocket(socket, 502, 'Service unavailable'); });
  upstream.once('response', response => { response.resume(); endSocket(socket, response.statusCode ?? 502, 'Upgrade refused'); });
  upstream.once('upgrade', (response, backendSocket, backendHead) => {
    backendSocket.setTimeout(0);
    socket.setTimeout(0);
    const headers = cleanHeaders(response.headers);
    headers.connection = 'Upgrade'; headers.upgrade = 'websocket';
    const lines = Object.entries(headers).flatMap(([name, value]) => Array.isArray(value) ? value.map(item => `${name}: ${item}`) : [`${name}: ${value}`]);
    socket.write(`HTTP/1.1 101 Switching Protocols\r\n${lines.join('\r\n')}\r\n\r\n`);
    if (backendHead.length) socket.write(backendHead);
    if (head.length) backendSocket.write(head);
    bundle.websockets.add(socket);
    const cleanup = () => { bundle.websockets.delete(socket); socket.destroy(); backendSocket.destroy(); };
    socket.once('error', cleanup); backendSocket.once('error', cleanup);
    socket.once('close', cleanup); backendSocket.once('close', cleanup);
    socket.pipe(backendSocket).pipe(socket);
  });
  upstream.end();
}

async function prepareBundle(releaseDir, options) {
  if (options.signal?.aborted) throw new Error('Gateway startup aborted');
  const release = await readRelease(releaseDir, options);
  if (options.signal?.aborted) throw new Error('Gateway startup aborted');
  const files = await indexPublicFiles(release.publicRoot, release.checksums);
  const runtime = await bootServices(release, options);
  if (options.signal?.aborted) { await runtime.close(); throw new Error('Gateway startup aborted'); }
  return {...release, files, runtime, websockets: new Set(), activeHTTP: 0, idleWaiters: []};
}

async function retireBundle(bundle, options) {
  if (!bundle) return;
  if (bundle.activeHTTP) {
    await Promise.race([new Promise(resolve => bundle.idleWaiters.push(resolve)), delay(options.drainTimeoutMs ?? 1_500, undefined, {ref: false})]);
  }
  for (const socket of bundle.websockets) socket.destroy();
  await bundle.runtime.close();
}

function validateOptions(options) {
  if (!Number.isInteger(options.port ?? 0) || (options.port ?? 0) < 0 || (options.port ?? 0) > 65535) throw new Error('port must be an integer from 0 to 65535');
  for (const key of ['startupTimeoutMs', 'shutdownTimeoutMs', 'drainTimeoutMs', 'proxyTimeoutMs', 'pollIntervalMs']) {
    if (options[key] !== undefined && (!Number.isFinite(options[key]) || options[key] < 1)) throw new Error(`${key} must be positive`);
  }
  if (options.allowedHosts !== undefined && (!Array.isArray(options.allowedHosts) || options.allowedHosts.some(host => !normalizedHost(host)))) throw new Error('allowedHosts must be normalized host[:port] values');
}

async function createGateway(releaseDir, options) {
  validateOptions(options);
  let bundle = await prepareBundle(releaseDir, options);
  let closed = false, closePromise;
  const sockets = new Set();
  const server = http.createServer(async (request, response) => {
    const selected = bundle;
    const identity = requestIdentity(request, selected, server, options);
    if (!identity) { endHTTP(response, 421, 'Unrecognized Host'); return; }
    const route = requestPath(request, selected, options);
    if (!route) { endHTTP(response, 400, 'Invalid path'); return; }
    if (route.outsideBase) { endHTTP(response, 404, 'Not found'); return; }
    const target = selected.httpRoutes.find(candidate => matchesPrefix(route.pathname, candidate.path));
    if (target && !acceptsOrigin(request, selected, identity)) { endHTTP(response, 403, 'Origin not allowed'); return; }
    selected.activeHTTP++;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (--selected.activeHTTP === 0) for (const resolve of selected.idleWaiters.splice(0)) resolve();
    };
    response.once('close', finish); response.once('finish', finish);
    try {
      if (target) proxyHTTP(request, response, selected.runtime.services.get(target.id), route.upstreamPath, identity, options);
      else await serveStatic(selected.files, route.pathname, request, response);
    } catch { endHTTP(response, 500, 'Request failed'); }
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  server.on('upgrade', (request, socket, head) => {
    const selected = bundle;
    const identity = requestIdentity(request, selected, server, options);
    if (!identity) { endSocket(socket, 421, 'Unrecognized Host'); return; }
    const route = requestPath(request, selected, options);
    if (!route) { endSocket(socket, 400, 'Invalid path'); return; }
    if (route.outsideBase) { endSocket(socket, 404, 'Not found'); return; }
    if (request.method !== 'GET' || request.headers.upgrade?.toLowerCase() !== 'websocket') { endSocket(socket, 400, 'Invalid upgrade'); return; }
    const target = selected.websocketRoutes.find(candidate => candidate.path === route.pathname);
    if (!target) { endSocket(socket, 404, 'Not found'); return; }
    if (!acceptsOrigin(request, selected, identity)) { endSocket(socket, 403, 'Origin not allowed'); return; }
    proxyWebSocket(request, socket, head, selected.runtime.services.get(target.id), route.upstreamPath, identity, selected, options);
  });
  server.on('clientError', (_error, socket) => { if (socket.writable) endSocket(socket, 400, 'Bad request'); });
  try {
    await new Promise((resolve, reject) => {
      const fail = error => { server.off('listening', ready); reject(error); };
      const ready = () => { server.off('error', fail); resolve(); };
      server.once('error', fail); server.once('listening', ready);
      server.listen(options.port ?? 0, options.host ?? '127.0.0.1');
    });
  } catch (error) { await retireBundle(bundle, options); throw error; }
  const api = {
    server,
    get releaseId() { return bundle.releaseId; },
    get releaseDir() { return bundle.directory; },
    get services() { return [...bundle.runtime.services.values()].map(serviceStatus); },
    get closed() { return closed; },
    async close() {
      if (closePromise) return closePromise;
      closed = true;
      closePromise = (async () => {
        const listenerClosed = new Promise(resolve => server.close(resolve));
        server.closeIdleConnections();
        await retireBundle(bundle, options);
        for (const socket of sockets) socket.destroy();
        await listenerClosed;
      })();
      return closePromise;
    },
  };
  return {api, async assertUnoccupied() {
    for (const service of bundle.runtime.services.values()) {
      const health = await readServiceHealth(service);
      if (health && Object.hasOwn(health, 'rooms')) {
        if (!Number.isSafeInteger(health.rooms) || health.rooms < 0) throw new Error(`Active service ${service.id} reports invalid rooms count`);
        if (health.rooms > 0) throw new Error(`Active service ${service.id} has ${health.rooms} occupied rooms; release reload postponed`);
      }
    }
  }, async replace(next) {
    if (closed) { await retireBundle(next, options); throw new Error('Gateway is closed'); }
    const previous = bundle;
    bundle = next;
    await retireBundle(previous, options);
  }};
}

export async function startGateway(options = {}) {
  if (!options.releaseDir) throw new Error('releaseDir is required');
  return (await createGateway(options.releaseDir, options)).api;
}

export async function probeRelease(options = {}) {
  validateOptions(options);
  const bundle = await prepareBundle(options.releaseDir, options);
  const result = {releaseId: bundle.releaseId, releaseDir: bundle.directory, services: [...bundle.runtime.services.values()].map(serviceStatus)};
  await retireBundle(bundle, options);
  return result;
}

export async function startCurrentGateway(options = {}) {
  if (typeof options.stateDir !== 'string' || !path.isAbsolute(options.stateDir)) throw new Error('stateDir must be an absolute directory');
  const stateDir = await realpath(options.stateDir);
  const releasesRoot = path.join(stateDir, 'releases');
  const settings = {...options, runtimeDir: options.runtimeDir ?? path.join(stateDir, 'run')};
  async function currentSelection() {return readReleasePointer(stateDir,'current',{optional:false});}
  const currentTarget = async () => (await currentSelection()).target;
  const initialSelection = await currentSelection();
  const first = initialSelection.target;
  const gateway = await createGateway(first, settings);
  const {api} = gateway;
  let closing = false, inFlight = null, lastError = null, lastObserved = initialSelection.token;
  let lastReload = {requestedReleaseId: api.releaseId, ok: true, at: new Date().toISOString()};
  const instanceId = randomUUID();
  const statusDirectory = path.join(stateDir, 'run');
  const statusFile = path.join(statusDirectory, 'gateway-status.json');
  try { await mkdir(statusDirectory, {recursive: true, mode: 0o700}); }
  catch (error) { await api.close(); throw error; }
  let statusWriting = Promise.resolve();
  const publishStatus = () => {
    if (closing) return statusWriting;
    const status = {pid: process.pid, instanceId, releaseId: api.releaseId, ready: api.services.every(service => service.ready), updatedAt: new Date().toISOString(), lastReload};
    statusWriting = statusWriting.catch(() => {}).then(async () => {
      const temporary = path.join(statusDirectory, `.gateway-status-${instanceId}-${randomUUID()}`);
      try { await writeFile(temporary, JSON.stringify(status) + '\n', {mode: 0o600}); await replaceFile(temporary, statusFile); }
      finally { await rm(temporary, {force: true}); }
    });
    return statusWriting;
  };
  const reportReloadError = error => { try { options.onReloadError?.(error); } catch { /* Notification callbacks must not compromise a live release. */ } };
  const baseClose = api.close;
  api.reload = () => {
    if (closing || api.closed) return Promise.reject(new Error('Gateway is closed'));
    if (inFlight) return inFlight;
    inFlight = (async () => {
      let next, requestedReleaseId = null;
      try {
        const selection = await currentSelection();
        const target = selection.target;
        lastObserved = selection.token;
        requestedReleaseId = path.basename(target);
        if (target === api.releaseDir) { lastError = null; lastReload = {requestedReleaseId, ok: true, at: new Date().toISOString()}; await publishStatus(); return false; }
        lastReload = {requestedReleaseId, ok: null, at: new Date().toISOString()};
        await publishStatus();
        await gateway.assertUnoccupied();
        next = await prepareBundle(target, settings);
        requestedReleaseId = next.releaseId;
        await gateway.assertUnoccupied();
        if (closing || (await currentSelection()).token !== selection.token) throw new Error('Current release changed while warming services');
        const readyBundle = next;
        next = null;
        await gateway.replace(readyBundle);
        lastError = null;
        lastReload = {requestedReleaseId, ok: true, at: new Date().toISOString()};
        await publishStatus();
        try { options.onReload?.({releaseId: api.releaseId, releaseDir: api.releaseDir}); } catch { /* Observers cannot undo activation. */ }
        return true;
      } catch (error) {
        if (next) await retireBundle(next, settings);
        lastError = error;
        lastReload = {requestedReleaseId, ok: false, error: error.message, at: new Date().toISOString()};
        await publishStatus().catch(() => {});
        reportReloadError(error);
        throw error;
      } finally { inFlight = null; }
    })();
    return inFlight;
  };
  Object.defineProperty(api, 'lastReloadError', {get: () => lastError});
  Object.defineProperty(api, 'instanceId', {value: instanceId});
  Object.defineProperty(api, 'statusFile', {value: statusFile});
  const timer = options.watch === false ? null : setInterval(async () => {
    if (closing || inFlight) return;
    try {
      const selection = await currentSelection();
      if (selection.token !== lastObserved) await api.reload();
    } catch (error) {
      if (!lastError || lastError.message !== error.message) { lastError = error; reportReloadError(error); }
    }
  }, options.pollIntervalMs ?? 1_000);
  timer?.unref();
  const heartbeat = setInterval(() => { publishStatus().catch(reportReloadError); }, 1_000);
  heartbeat.unref();
  api.close = async () => {
    closing = true;
    if (timer) clearInterval(timer);
    clearInterval(heartbeat);
    await inFlight?.catch(() => {});
    await statusWriting.catch(() => {});
    await baseClose();
    const currentStatus = await readFile(statusFile, 'utf8').then(JSON.parse, () => null).catch(() => null);
    if (currentStatus?.instanceId === instanceId) await rm(statusFile, {force: true});
  };
  try { await publishStatus(); }
  catch (error) { await api.close(); throw error; }
  // If activation changed during initial warmup, reconcile before returning.
  try { if (await currentTarget() !== first) await api.reload(); }
  catch (error) { await api.close(); throw error; }
  return api;
}
