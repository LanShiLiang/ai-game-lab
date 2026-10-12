import {readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {startCurrentGateway} from './gateway.mjs';
export {startGateway, startCurrentGateway, probeRelease} from './gateway.mjs';

export async function runCLI(args = process.argv.slice(2)) {
  const options = {};
  for (let index = 0; index < args.length; index++) {
    const option = args[index];
    if (option === '--help' || option === '-h') {
      process.stdout.write('Usage: node services/gateway/index.mjs --state-dir /absolute/deployment/state [--port 8080] [--host 127.0.0.1]\n');
      return null;
    }
    if (!['--state-dir', '--port', '--host'].includes(option) || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Unknown or incomplete argument: ${option}`);
    const value = args[++index];
    if (option === '--state-dir') options.stateDir = path.resolve(value);
    if (option === '--port') options.port = Number(value);
    if (option === '--host') options.host = value;
  }
  if (!options.stateDir) throw new Error('--state-dir is required');
  options.port ??= 8080;
  options.onReload = result => process.stdout.write(`Activated release ${result.releaseId}\n`);
  options.onReloadError = error => process.stderr.write(`Release reload failed; keeping active release: ${error.message}\n`);
  const controller = new AbortController();
  let gateway, stopping = false, stopWatcher;
  const removeSignals = () => { process.off('SIGTERM', shutdown); process.off('SIGINT', shutdown); process.off('message', onMessage); };
  const onMessage = message => {if(message?.type==='shutdown')void shutdown();};
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(stopWatcher);
    controller.abort();
    if (gateway) { await gateway.close(); removeSignals(); process.disconnect?.(); }
  };
  // Install before warming children so termination during startup also cleans them.
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  process.on('message',onMessage);
  try {
    gateway = await startCurrentGateway({...options, signal: controller.signal});
    if (stopping) { await gateway.close(); removeSignals(); process.disconnect?.(); return null; }
    const stopFile=path.join(options.stateDir,'run','stop-request.json');
    stopWatcher=setInterval(async()=>{try{const request=JSON.parse(await readFile(stopFile,'utf8')),status=JSON.parse(await readFile(path.join(options.stateDir,'run','gateway-status.json'),'utf8'));if(request.pid===process.pid&&request.instanceId===status.instanceId&&request.command==='shutdown'){await rm(stopFile,{force:true});await shutdown();}}catch{}},250);stopWatcher.unref();
    process.stdout.write(`Gateway listening on ${gateway.server.address().address}:${gateway.server.address().port}, release ${gateway.releaseId}\n`);
  } catch (error) {
    removeSignals();
    if(stopping)process.disconnect?.();
    if (stopping) return null;
    throw error;
  }
  return gateway;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCLI().catch(error => { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1; });
}
