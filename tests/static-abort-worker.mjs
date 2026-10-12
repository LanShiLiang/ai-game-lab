import {createServer, get} from 'node:http';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {indexPublicFiles, serveStatic} from '../services/gateway/static.mjs';
const root = await mkdtemp(path.join(os.tmpdir(), 'lab-aborted-stream-'));
const pending = new Set();
let server;
try {
  await writeFile(path.join(root, 'index.html'), Buffer.alloc(4 * 1024 * 1024, 65));
  const files = await indexPublicFiles(root, {'public/index.html': 'fixture'});
  server = createServer((req, res) => {
    const task = serveStatic(files, '/', req, res);
    pending.add(task);
    task.finally(() => pending.delete(task));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const gc = setInterval(() => global.gc(), 2);
  try {
    for (let batch = 0; batch < 12; batch++) {
      await Promise.all(Array.from({length: 8}, () => new Promise((resolve, reject) => {
        const req = get(url, res => {
          res.once('data', () => res.destroy());
          res.once('close', resolve);
          res.on('error', () => {});
        });
        req.once('error', reject);
      })));
    }
    await Promise.all([...pending]);
    for (let i = 0; i < 10; i++) {
      global.gc();
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    const response = await fetch(url, {method: 'HEAD'});
    if (response.status !== 200) throw new Error('Static serving failed after aborted streams');
  } finally { clearInterval(gc); }
} finally {
  server?.closeAllConnections();
  await new Promise(resolve => server ? server.close(resolve) : resolve());
  await Promise.all([...pending]);
  await rm(root, {recursive: true, force: true});
}
