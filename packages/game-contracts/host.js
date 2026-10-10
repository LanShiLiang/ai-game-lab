// Protocol v1 is shared by the platform and independently built game clients.
export const LAB_PROTOCOL = 1;
export const LAB_MESSAGES = Object.freeze({ pause: 'ai-game-lab:pause', ready: 'ai-game-lab:ready', exit: 'ai-game-lab:exit', expand: 'ai-game-lab:expand' });
export const isSlug = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
export function isGameAsset(value, id) {
  if (typeof value !== 'string') return false;
  if (value.startsWith(`games/${id}/`)) return !/[\\?#%]|\.\./.test(value);
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}
export function validateGameRegistration(game) {
  return game && isSlug(game.id) && Array.isArray(game.tags) && Array.isArray(game.controls)
    && ['entry', 'cover'].every(field => isGameAsset(game[field], game.id))
    && (game.integration === undefined || (game.integration?.protocol === LAB_PROTOCOL
      && (game.integration.pointerLock === undefined || typeof game.integration.pointerLock === 'boolean')));
}
export function isLabMessage(event, { source, origin, session }) {
  return Boolean(source && session && origin && origin !== 'null' && event.source === source
    && event.origin === origin && event.data?.session === session
    && Object.values(LAB_MESSAGES).includes(event.data?.type));
}
export function gameEntryURL(game, href, session) {
  if (!validateGameRegistration(game)) throw Error('Invalid game registration');
  const entry = new URL(game.entry, href);
  entry.searchParams.set('labSession', session);
  entry.searchParams.set('labOrigin', new URL(href).origin);
  return entry;
}
export function gameSandbox(game) {
  return game.integration?.protocol === LAB_PROTOCOL
    ? 'allow-scripts allow-same-origin' + (game.integration.pointerLock ? ' allow-pointer-lock' : '')
    : 'allow-scripts';
}
