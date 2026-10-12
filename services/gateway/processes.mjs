import {spawn} from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {mkdir, mkdtemp, writeFile, rm, realpath} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {isInside} from './release.mjs';

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const {port} = server.address();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

function healthCheck(port, healthPath, timeout) {
  return new Promise(resolve => {
    const request = http.get({host: '127.0.0.1', port, path: healthPath, timeout, agent: false}, response => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 300);
    });
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(false));
  });
}

export function readServiceHealth(service, timeout = 1000) {
  return new Promise((resolve, reject) => {
    let bytes = 0, chunks = [];
    const request = http.get({host: '127.0.0.1', port: service.port, path: service.healthPath, timeout, agent: false}, response => {
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 64 * 1024) request.destroy(new Error('Service health response is too large'));
        else chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) { reject(new Error(`Active service ${service.id} is unhealthy`)); return; }
        let body = null;
        try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { /* JSON room reporting is optional. */ }
        resolve(body);
      });
    });
    const deadlineTimer = setTimeout(() => request.destroy(new Error(`Active service ${service.id} health check timed out`)), timeout);
    deadlineTimer.unref();
    request.once('close', () => clearTimeout(deadlineTimer));
    request.on('timeout', () => request.destroy(new Error(`Active service ${service.id} health check timed out`)));
    request.on('error', reject);
  });
}

function signalChild(service, signal) {
  try {
    if (service.child.pid && process.platform !== 'win32') process.kill(-service.child.pid, signal);
    else service.child.kill(signal);
  } catch (error) { if (error.code !== 'ESRCH') throw error; }
}

async function stopService(service, timeout) {
  service.ready = false;
  signalChild(service, 'SIGTERM');
  await Promise.race([service.exited, delay(timeout, undefined, {ref: false})]);
  // A process group can outlive its entry process, so signal it even after exit.
  signalChild(service, 'SIGKILL');
  await service.exited;
}

export function serviceStatus(service) {
  return {id: service.id, pid: service.child.pid ?? null, port: service.port, ready: service.ready && service.child.exitCode === null && service.child.signalCode === null, exitCode: service.child.exitCode, signal: service.child.signalCode, healthPath: service.healthPath, logs: service.logs};
}

export async function bootServices(release, options = {}) {
  const timeout = options.startupTimeoutMs ?? 10_000;
  const stopTimeout = options.shutdownTimeoutMs ?? 1_500;
  let runtimeRoot = path.resolve(options.runtimeDir ?? tmpdir());
  if (isInside(release.directory, runtimeRoot)) throw new Error('runtimeDir must be outside the immutable release');
  await mkdir(runtimeRoot, {recursive: true, mode: 0o700});
  runtimeRoot = await realpath(runtimeRoot);
  if (isInside(release.directory, runtimeRoot)) throw new Error('runtimeDir must resolve outside the immutable release');
  const runtimeDir = await mkdtemp(path.join(runtimeRoot, 'game-gateway-'));
  const services = new Map(), allocatedPorts = new Set();
  async function reservePort() {
    for (let attempt = 0; attempt < 32; attempt++) {
      const port = await availablePort();
      if (!allocatedPorts.has(port)) { allocatedPorts.add(port); return port; }
    }
    throw new Error('Could not allocate distinct loopback service ports');
  }
  let stopped = false, failure = null;
  const close = async () => {
    if (stopped) return;
    stopped = true;
    await Promise.all([...services.values()].map(service => stopService(service, stopTimeout)));
    await rm(runtimeDir, {recursive: true, force: true});
  };
  try {
    const results = await Promise.allSettled(release.services.map(async descriptor => {
      try {
        if (options.signal?.aborted) throw new Error('Service startup aborted');
        const port = await reservePort();
        const configFile = path.join(runtimeDir, `${descriptor.id}.json`);
        await writeFile(configFile, JSON.stringify({host: '127.0.0.1', port, publicBaseURL: release.publicBaseURL, allowedOrigins: release.allowedOrigins}), {mode: 0o600});
        const home = path.join(runtimeDir, descriptor.id);
        await mkdir(home, {mode: 0o700});
        const environment = Object.fromEntries(['PATH', 'TZ', 'LANG', 'LC_ALL', 'LC_CTYPE', 'SystemRoot', 'WINDIR'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
        if (options.signal?.aborted) throw new Error('Service startup aborted');
        const child = spawn(process.execPath, [descriptor.entry], {
          cwd: path.dirname(descriptor.entry),
          env: {...environment, NODE_ENV: 'production', HOME: home, TMPDIR: home, TMP: home, TEMP: home, GAME_SERVER_PORT: String(port), GAME_SERVER_CONFIG: configFile},
          detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'],
        });
        const service = {...descriptor, port, child, ready: false, logs: '', spawnError: null};
        service.exited = new Promise(resolve => {
          child.once('error', error => { service.spawnError = error; resolve(); });
          child.once('exit', () => { service.ready = false; resolve(); });
        });
        services.set(descriptor.id, service);
        const log = data => { service.logs = (service.logs + data.toString()).slice(-8192); };
        child.stdout.on('data', log); child.stderr.on('data', log);
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
          if (options.signal?.aborted) throw new Error('Service startup aborted');
          if (failure) throw new Error('Release startup cancelled after another service failed');
          if (service.spawnError || child.exitCode !== null || child.signalCode !== null) throw new Error(`Service ${service.id} exited before healthy: ${service.spawnError?.message ?? service.logs}`);
          if (await healthCheck(port, descriptor.healthPath, Math.min(500, Math.max(1, deadline - Date.now())))) {
            if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Service ${service.id} exited during health check`);
            service.ready = true;
            return;
          }
          await delay(50);
        }
        throw new Error(`Service ${service.id} health check timed out after ${timeout}ms: ${service.logs}`);
      } catch (error) { failure ??= error; throw error; }
    }));
    const failures = results.filter(result => result.status === 'rejected');
    if (!failures.length && [...services.values()].some(service => !service.ready)) throw new Error('A service exited while the release was warming');
    if (failures.length) throw new AggregateError(failures.map(result => result.reason), failures.map(result => result.reason.message).join('; '));
    return {services, close, runtimeDir};
  } catch (error) { await close(); throw error; }
}
