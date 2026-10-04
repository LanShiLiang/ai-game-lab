import { mkdir, cp, rm } from 'node:fs/promises';
import path from 'node:path';
import { root, readCatalog } from './catalog.mjs';

await readCatalog();
const output = path.join(root, 'dist');
if (path.dirname(output) !== path.resolve(root) || path.basename(output) !== 'dist') throw new Error('构建目录不在项目内');
// Only this fixed project-local build directory is replaced.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const name of ['index.html', 'games.json', 'src', 'games', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'licenses']) {
  await cp(path.join(root, name), path.join(output, name), { recursive: true });
}
console.log(`构建完成：${output}（纯静态文件，无运行时依赖）`);
