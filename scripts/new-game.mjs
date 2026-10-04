import { cp, access, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { root, isSlug, readCatalog } from './catalog.mjs';

const [id, ...words] = process.argv.slice(2);
if (!isSlug(id)) {
  console.error('用法：npm run new:game -- my-game "我的游戏"\nid 只允许小写字母、数字和短横线。');
  process.exit(1);
}
const title = words.join(' ').trim() || id;
const target = path.join(root, 'games', id);
const games = await readCatalog();
if (games.some((game) => game.id === id) || await access(target).then(() => true, () => false)) {
  throw new Error(`${id} 已存在，未覆盖任何文件。`);
}
await cp(path.join(root, 'templates/game'), target, { recursive: true, force: false, errorOnExist: true });
// Only replace the safe ASCII slug. Render the human title through metadata/textContent.
for (const filename of await readdir(target)) {
  if (!/\.(html|js|css|svg)$/.test(filename)) continue;
  const file = path.join(target, filename);
  const content = await readFile(file, 'utf8');
  await writeFile(file, content.replaceAll('__GAME_ID__', id));
}
games.push({
  id, title, subtitle: 'New experiment', description: '点击目标，收集分数。把这个小实验改造成你的游戏。',
  category: '实验', tags: ['新作品'], controls: ['鼠标', '触控'],
  entry: `games/${id}/index.html`, cover: `games/${id}/cover.svg`, accent: '#d3654f', featured: false
});
await writeFile(path.join(root, 'games.json'), `${JSON.stringify(games, null, 2)}\n`);
console.log(`已创建并注册：games/${id}\n修改独立的 HTML / CSS / JS，再刷新首页。`);
