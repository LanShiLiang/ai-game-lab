import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
import {isSlug,isGameAsset,validateGameRegistration} from '../packages/game-contracts/host.js';
export {isSlug};

export async function readCatalog(projectRoot = root, {checkFiles=false}={}) {
  const games = JSON.parse(await readFile(path.join(projectRoot, 'games.json'), 'utf8'));
  if (!Array.isArray(games)) throw new Error('games.json 必须是数组。');
  const seen = new Set();
  for (const game of games) {
    if (!isSlug(game.id) || seen.has(game.id)) throw new Error(`游戏 id 无效或重复：${game.id}`);
    seen.add(game.id);
    if(!validateGameRegistration(game))throw Error(`${game.id}: 无效游戏入口或集成协议`);
    if(game.source && !['repository','external'].includes(game.source.kind))throw Error(`${game.id}: 无效来源类型`);
    for (const field of ['title', 'description', 'category']) {
      if (typeof game[field] !== 'string' || !game[field].trim()) throw new Error(`${game.id}: 缺少 ${field}`);
    }
    for (const field of ['tags', 'controls']) {
      if (!Array.isArray(game[field]) || !game[field].every((item) => typeof item === 'string' && item.trim())) {
        throw new Error(`${game.id}: ${field} 必须是文字数组`);
      }
    }
    if (!/^#[0-9a-f]{6}$/i.test(game.accent)) throw new Error(`${game.id}: accent 必须是六位十六进制颜色`);
    if (game.featured !== undefined && typeof game.featured !== 'boolean') throw new Error(`${game.id}: featured 必须是布尔值`);
    for (const field of ['entry', 'cover']) {
      const value = game[field];
      if (!isGameAsset(value,game.id)) {
        throw new Error(`${game.id}: ${field} 必须指向自身游戏目录内的本地文件`);
      }
      const local= !/^https:\/\//.test(value);
      const info = checkFiles && local ? await stat(path.join(projectRoot, value)).catch(() => null) : null;
      if (checkFiles && local && !info?.isFile()) throw new Error(`${game.id}: 找不到文件 ${value}`);
    }
    if (!/^https:\/\//.test(game.entry) && !game.entry.endsWith('.html')) throw new Error(`${game.id}: entry 必须是 HTML 文件`);
  }
  return games;
}
