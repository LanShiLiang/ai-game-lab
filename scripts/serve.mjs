import {publicFilename,publicURLForFile,isContractRoute} from '../packages/game-contracts/public-files.mjs';
import { createServer } from 'node:http';
import { stat, realpath } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from './catalog.mjs';

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.ogg': 'audio/ogg', '.mp4': 'video/mp4', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary'
};

export function resolveRequest(base, rawUrl) {
  let pathname;
  try { pathname = decodeURIComponent(rawUrl.split('?')[0]); } catch { return null; }
  if (!pathname.startsWith('/') || /[\\\0]/.test(pathname)) return null;
  const segments = pathname.split('/');
  if (segments.some((segment) => segment === '..' || segment.startsWith('.'))) return null;
  if (!['', 'index.html', 'src', 'games', 'games.json', '_shared'].includes(segments[1]) && !isContractRoute(pathname)) return null;
  const filename = publicFilename(base,pathname);
  const relative = path.relative(base, filename);
  return relative.startsWith('..') || path.isAbsolute(relative) ? null : filename;
}

export function resolveArtifactRequest(base, rawUrl) {
  let pathname;try {pathname=decodeURIComponent(rawUrl.split('?')[0]);}catch{return null;}
  if(!pathname.startsWith('/') || /[\\\0]/.test(pathname) || pathname.split('/').some(part=>part==='..'||part.startsWith('.')) || /(?:^|\/)(?:package(?:-lock)?\.json|node_modules|scripts|services|tests)(?:\/|$)/.test(pathname))return null;
  const file=path.resolve(base,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
  return types[path.extname(file)] && !path.relative(base,file).startsWith('..') ? file : null;
}
export function makeServer(base, {standalone=false}={}) {
  const resolve=standalone?resolveArtifactRequest:resolveRequest;
  return createServer(async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return;
    }
    const filename = resolve(base, request.url || '/');
    if (!filename) { response.writeHead(404); response.end('Not found'); return; }
    try {
      const actual = await realpath(filename), relative = path.relative(await realpath(base), actual);
      if (relative.startsWith('..') || path.isAbsolute(relative) || !resolve(base,publicURLForFile(relative))) throw new Error('Not a public file');
      const info = await stat(actual);
      if (!info.isFile()) throw new Error('Not a file');
      const etag = `W/"${info.size.toString(16)}-${info.mtimeMs.toString(16)}"`;
      const headers = {
        'Content-Type': types[path.extname(filename).toLowerCase()] || 'application/octet-stream',
        'ETag': etag,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer'
      };
      if (String(request.headers['if-none-match'] || '').split(',').some(tag => tag.trim() === '*' || tag.trim().replace(/^W\//, '') === etag.replace(/^W\//, ''))) {
        response.writeHead(304, headers); response.end(); return;
      }
      response.writeHead(200, { ...headers, 'Content-Length': info.size });
      if (request.method === 'HEAD') response.end();
      else await pipeline(createReadStream(actual), response);
    } catch {
      if (response.headersSent) { response.destroy(); return; }
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('文件不存在');
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const artifactIndex=args.indexOf('--artifact');
  const base = artifactIndex>=0 ? path.resolve(args[artifactIndex+1]) : args.includes('--preview') ? path.join(root, 'dist') : root;
  const portIndex = args.indexOf('--port');
  const port = Number(portIndex >= 0 ? args[portIndex + 1] : process.env.PORT || 5173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('端口必须在 1–65535 之间');
  if (!(await stat(publicFilename(base, '/index.html')).catch(() => null))?.isFile()) {
    throw new Error('未找到首页。预览前请先运行 npm run build。');
  }
  const server = makeServer(base,{standalone:artifactIndex>=0 && args.includes('--standalone')});
  server.on('error', (error) => { console.error(`启动失败：${error.message}。可用 --port 5174 指定其他端口。`); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => {
    console.log(`AI Game Lab · ${args.includes('--preview') ? '构建预览' : '开发'}\nhttp://127.0.0.1:${port}${args.includes('--game')?'/games/'+args[args.indexOf('--game')+1]+'/':'/'}\n修改文件后刷新浏览器。按 Ctrl+C 结束。`);
  });
}
