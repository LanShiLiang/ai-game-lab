import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { root, readCatalog } from './catalog.mjs';

async function checkJS(folder) {
  for (const item of await readdir(folder, { withFileTypes: true })) {
    if (['dist', 'node_modules', '.git', 'artifacts'].includes(item.name)) continue;
    const filename = path.join(folder, item.name);
    if (item.isDirectory()) await checkJS(filename);
    else if (/\.(mjs|js)$/.test(item.name)) {
      const result = spawnSync(process.execPath, ['--check', filename], { encoding: 'utf8' });
      if (result.status !== 0) throw new Error(result.stderr || `语法检查失败：${filename}`);
    }
  }
}

try {
  const games = await readCatalog();
  await checkJS(root);
  console.log(`检查通过：${games.length} 个游戏，注册文件、资源路径与全部 JS 语法有效。`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
