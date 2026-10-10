import path from 'node:path';
import {readFile, realpath, stat} from 'node:fs/promises';
import {verifyReleaseIntegrity} from './integrity.mjs';

export function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export function normalizePublicURL(value = '') {
  if (!value) return {publicBaseURL: '', basePath: '', origin: ''};
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || /%|\\|\/\//.test(url.pathname)) {
    throw new Error('publicBaseURL must be an HTTP(S) URL without credentials, query, fragment, or encoded path');
  }
  return {publicBaseURL: url.href, basePath: url.pathname.replace(/\/$/, ''), origin: url.origin};
}

export function normalizeOrigins(values = [], publicOrigin = '') {
  if (!Array.isArray(values)) throw new Error('allowedOrigins must be an array');
  return [...new Set([...values, ...(publicOrigin ? [publicOrigin] : [])].map(value => {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== value || url.username || url.password) {
      throw new Error('allowedOrigins must contain exact HTTP(S) origins');
    }
    return value;
  }))];
}

function route(value, label) {
  if (typeof value !== 'string' || !/^\/[A-Za-z0-9/_~!$&'()*+,;=:@.-]*$/.test(value) || value.includes('//') || value.split('/').some(part => part === '.' || part === '..')) {
    throw new Error(`Invalid ${label}: routes must be absolute, normalized URL paths`);
  }
  return value;
}

export function matchesPrefix(pathname, prefix) {
  return prefix.endsWith('/') ? pathname.startsWith(prefix) || pathname === prefix.slice(0, -1) : pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export async function readRelease(releaseDir, options = {}) {
  if (typeof releaseDir !== 'string' || !path.isAbsolute(releaseDir)) throw new Error('releaseDir must be an absolute directory');
  const directory = await realpath(releaseDir);
  const checksums = await verifyReleaseIntegrity(directory);
  const lockPath = await realpath(path.join(directory, 'release-lock.json'));
  if (!isInside(directory, lockPath)) throw new Error('Release lock escapes release directory');
  const lockStat = await stat(lockPath);
  if (!lockStat.isFile() || lockStat.size > 4 * 1024 * 1024) throw new Error('Invalid release lock file');
  const lock = JSON.parse(await readFile(lockPath, 'utf8'));
  if (lock.schemaVersion !== 1 || typeof lock.releaseId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(lock.releaseId) || !Array.isArray(lock.games)) {
    throw new Error('Invalid release lock schema');
  }
  const publicRoot = await realpath(path.join(directory, 'public'));
  if (!isInside(directory, publicRoot) || publicRoot === directory || !(await stat(publicRoot)).isDirectory()) throw new Error('Public directory escapes release');
  const publicURL = normalizePublicURL(options.publicBaseURL ?? lock.publicBaseURL ?? '');
  const allowedOrigins = normalizeOrigins(options.allowedOrigins ?? [], publicURL.origin);
  const ids = new Set(), httpRoutes = [], websocketRoutes = [], services = [];
  for (const game of lock.games) {
    if (!game || typeof game.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(game.id) || ids.has(game.id)) throw new Error('Invalid or duplicate game id');
    ids.add(game.id);
    if (game.service == null) continue;
    const descriptor = game.service;
    const expectedEntry = `games/${game.id}/server/index.mjs`;
    if (descriptor.entry !== expectedEntry) throw new Error(`Invalid service entry for ${game.id}`);
    const entry = await realpath(path.join(directory, expectedEntry));
    const gameRoot = path.join(directory, 'games', game.id);
    if (!isInside(gameRoot, entry) || !(await stat(entry)).isFile()) throw new Error(`Service entry escapes game artifact: ${game.id}`);
    const healthPath = route(descriptor.healthPath, 'healthPath');
    if (!Array.isArray(descriptor.httpPrefixes) || !Array.isArray(descriptor.websocketPaths)) throw new Error(`Missing service routes: ${game.id}`);
    const service = {id: game.id, entry, healthPath, httpPrefixes: [], websocketPaths: []};
    for (const value of descriptor.httpPrefixes) {
      const prefix = route(value, 'httpPrefix');
      if (prefix === '/' || ['/games', '/src', '/_shared'].some(reserved => matchesPrefix(reserved, prefix) || matchesPrefix(prefix, reserved))) throw new Error(`Service route overlaps static namespace: ${prefix}`);
      if (httpRoutes.some(existing => matchesPrefix(prefix, existing.path) || matchesPrefix(existing.path, prefix))) throw new Error(`Duplicate or overlapping HTTP route: ${prefix}`);
      httpRoutes.push({path: prefix, id: game.id});
      service.httpPrefixes.push(prefix);
    }
    for (const value of descriptor.websocketPaths) {
      const websocketPath = route(value, 'websocketPath');
      if (websocketPath === '/' || websocketRoutes.some(existing => existing.path === websocketPath)) throw new Error(`Duplicate or invalid WebSocket route: ${websocketPath}`);
      websocketRoutes.push({path: websocketPath, id: game.id});
      service.websocketPaths.push(websocketPath);
    }
    services.push(service);
  }
  for (const ws of websocketRoutes) {
    if (httpRoutes.some(http => http.id !== ws.id && matchesPrefix(ws.path, http.path))) throw new Error(`WebSocket route overlaps another service: ${ws.path}`);
  }
  return {directory, publicRoot, checksums, releaseId: lock.releaseId, services, httpRoutes, websocketRoutes, allowedOrigins, ...publicURL};
}
