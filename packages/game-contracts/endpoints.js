// Same-origin/prefix-aware by default. Deployments can set explicit backend URLs
// in runtime-config.js; no public hostname is hardcoded into client networking.
export function serviceBase(gameId, service, href, runtime = globalThis.AI_GAME_LAB_CONFIG || {}) {
  const page = new URL(href), configured = runtime.services?.[service];
  if (configured !== undefined) {
    const url = new URL(configured, page);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw Error('Invalid service endpoint');
    if (page.protocol === 'https:' && url.protocol !== 'https:') throw Error('HTTPS game requires HTTPS backend');
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    return url;
  }
  const at = page.pathname.lastIndexOf(`/games/${gameId}/`);
  page.pathname = at >= 0 ? page.pathname.slice(0,at+1) : '/'; page.search = ''; page.hash = ''; return page;
}
export function gameInviteURL(href, roomId, advertised) {
  // An API server may advertise an absolute public client URL. Relative legacy
  // hints are resolved from the current game entry, never from the API origin.
  if(advertised && /^https?:\/\//.test(advertised)) {
    const url=new URL(advertised);
    if(url.username||url.password)throw Error('Invalid public invite URL');
    return url.href;
  }
  const url=new URL(href);url.hash='';url.search='';url.searchParams.set('online','1');url.searchParams.set('room',roomId);return url.href;
}
