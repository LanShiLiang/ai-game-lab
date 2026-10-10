import path from 'node:path';
import {constants} from 'node:fs';
import {lstat, readdir, open} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';

const contentTypes = new Map(Object.entries({
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.webm': 'video/webm', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.webmanifest': 'application/manifest+json', '.ktx2': 'image/ktx2',
}));
const noticeFiles = new Set(['LICENSE', 'NOTICE', 'COPYING']);
const privateDirectories = new Set(['server', 'backend', 'services', 'scripts', 'node_modules', 'private', 'config', 'configs', 'test', 'tests']);

export function publicPathAllowed(relative) {
  const segments = relative.split('/');
  if (segments.some(segment => !segment || segment === '..' || segment.startsWith('.') || privateDirectories.has(segment.toLowerCase()))) return false;
  const filename = segments.at(-1).toLowerCase();
  if (/^(?:package(?:-lock)?|npm-shrinkwrap|release-lock|artifact|game\.manifest|tsconfig)(?:\.[\w-]+)?\.json$/.test(filename) || /(?:^|[._-])(?:server|backend|secret|credentials|config)(?:[._-]|$)/.test(filename) && !/^(?:runtime-)?config\.js$/.test(filename)) return false;
  return contentTypes.has(path.extname(filename)) || noticeFiles.has(filename.toUpperCase());
}

export async function indexPublicFiles(publicRoot, checksums) {
  const files = new Map();
  async function visit(directory, relative = '') {
    for (const item of await readdir(directory, {withFileTypes: true})) {
      const name = relative ? `${relative}/${item.name}` : item.name;
      if (item.isSymbolicLink() || item.name.startsWith('.') || privateDirectories.has(item.name.toLowerCase())) continue;
      const filename = path.join(directory, item.name);
      if (item.isDirectory()) await visit(filename, name);
      else if (item.isFile() && publicPathAllowed(name)) {
        const metadata = await lstat(filename);
        if (!metadata.isFile()) continue;
        const type = contentTypes.get(path.extname(name).toLowerCase()) ?? 'text/plain; charset=utf-8';
        const file = {filename, metadata, type, tag: checksums[`public/${name}`]};
        const gzipTag = checksums[`public/${name}.gz`];
        if (gzipTag) {
          const gzipFilename = `${filename}.gz`;
          const gzipMetadata = await lstat(gzipFilename);
          if (!gzipMetadata.isFile()) throw new Error(`Precompressed release asset is not a regular file: ${name}.gz`);
          file.gzip = {filename: gzipFilename, metadata: gzipMetadata, tag: gzipTag};
        }
        files.set(`/${name}`, file);
      }
    }
  }
  await visit(publicRoot);
  if (!files.has('/index.html')) throw new Error('Release public/index.html is missing');
  return files;
}

function acceptsGzip(header = '') {
  let wildcard = false;
  for (const item of header.toLowerCase().split(',')) {
    const [name, ...parameters] = item.trim().split(';');
    const quality = parameters.find(value => value.trim().startsWith('q='));
    const enabled = !quality || Number(quality.trim().slice(2)) > 0;
    if (name === 'gzip') return enabled;
    if (name === '*') wildcard = enabled;
  }
  return wildcard;
}

export async function serveStatic(files, pathname, request, response) {
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, {Allow: 'GET, HEAD'}); response.end(); return; }
  const file = files.get(pathname) ?? files.get(`${pathname.replace(/\/$/, '')}/index.html`);
  if (!file) { response.writeHead(404); response.end('Not found'); return; }
  const compressed = Boolean(file.gzip) && acceptsGzip(request.headers['accept-encoding']);
  const selected = compressed ? file.gzip : file;
  const etag = `W/"${selected.tag}"`;
  response.setHeader('Content-Type', file.type);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  response.setHeader('ETag', etag);
  response.setHeader('Last-Modified', selected.metadata.mtime.toUTCString());
  if (file.gzip) response.setHeader('Vary', 'Accept-Encoding');
  if (compressed) response.setHeader('Content-Encoding', 'gzip');
  response.setHeader('Content-Length', selected.metadata.size);
  let handle;
  try {
    // O_NOFOLLOW blocks replaced file symlinks; inode/metadata validation also catches
    // replaced parent directories. Release files are immutable after activation.
    handle = await open(selected.filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const current = await handle.stat();
    if (!current.isFile() || current.dev !== selected.metadata.dev || current.ino !== selected.metadata.ino || current.size !== selected.metadata.size || current.mtimeMs !== selected.metadata.mtimeMs) throw new Error('Release asset changed after activation');
    const conditional = request.headers['if-none-match'];
    if (conditional && (conditional.split(',').some(value => value.trim().replace(/^W\//, '') === etag.replace(/^W\//, '')) || conditional.trim() === '*')) {
      response.writeHead(304); response.end(); return;
    }
    const modifiedSince = Date.parse(request.headers['if-modified-since']);
    if (conditional === undefined && Number.isFinite(modifiedSince) && Math.floor(selected.metadata.mtimeMs / 1000) * 1000 <= modifiedSince) {
      response.writeHead(304); response.end(); return;
    }
    if (request.method === 'HEAD') { response.writeHead(200); response.end(); return; }
    const stream = handle.createReadStream({autoClose: true});
    handle = null;
    response.writeHead(200);
    await pipeline(stream, response);
  } catch {
    if (!response.headersSent) {
      for (const header of ['Content-Length', 'Content-Encoding', 'ETag']) response.removeHeader(header);
      response.writeHead(404); response.end('Not found');
    } else response.destroy();
  } finally {
    await handle?.close();
  }
}
