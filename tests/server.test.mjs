import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { makeServer, resolveRequest } from '../scripts/serve.mjs';
import { root } from '../scripts/catalog.mjs';

test('拒绝目录穿越、隐藏文件和非公开目录', () => {
  for (const url of ['/../package.json', '/%2e%2e/package.json', '/src/../../package.json', '/.git/config', '/scripts/serve.mjs', '/src/%5c..%5cpackage.json', '/%ZZ']) {
    assert.equal(resolveRequest(root, url), null, url);
  }
  assert.equal(resolveRequest(root, '/'), path.join(root, 'index.html'));
});
test('静态服务返回首页、游戏与正确 MIME；缺失文件为 404', async () => {
  const server = makeServer(root);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const home = await fetch(base); assert.equal(home.status, 200); assert.match(await home.text(), /AI GAME/);
    const game = await fetch(`${base}/games/orbit-dash/game.js`); assert.equal(game.status, 200); assert.match(game.headers.get('content-type'), /javascript/);
    assert.equal((await fetch(`${base}/games/missing/index.html`)).status, 404);
    assert.equal((await fetch(base, { method: 'POST' })).status, 405);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
