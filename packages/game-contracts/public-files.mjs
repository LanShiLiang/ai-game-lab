import { existsSync } from 'node:fs';
import path from 'node:path';
// Map stable public URLs to the platform workspace without a second source copy.
export function publicFilename(base, pathname) {
  const route = pathname.endsWith('/') ? pathname + 'index.html' : pathname;
  if (existsSync(path.join(base, 'apps/web/index.html')) && (route === '/index.html' || route.startsWith('/src/'))) return path.resolve(base, 'apps/web', '.' + route);
  return path.resolve(base, '.' + route);
}
export function publicURLForFile(relative) {
  const route = relative.split(path.sep).join('/');
  return '/' + (route.startsWith('apps/web/') ? route.slice('apps/web/'.length) : route);
}
export const isContractRoute = route => /^\/packages\/game-contracts\/(host|lab-bridge|endpoints)\.js$/.test(route);
