import { isLabMessage, LAB_MESSAGES } from './host.js';
// A standalone game has no host dependency. Embedded games bind messages to the
// expected parent window, exact origin and per-mount session, including cross-origin hosts.
export function installLabBridge({onPause=()=>{},onExit=()=>{}}={}) {
  const params = new URLSearchParams(location.search), session = params.get('labSession'), embedded = parent !== window;
  let origin = location.origin;
  try { const configured = params.get('labOrigin'); if (configured) { const url = new URL(configured); if (!['https:', 'http:'].includes(url.protocol) || url.origin !== configured) throw Error(); origin = url.origin; } } catch { return {ready() {}, expand() {}}; }
  if (embedded && session) for (const link of document.querySelectorAll('a[href="./"]')) {
    const target = new URL(link.href); target.searchParams.set('labSession', session); target.searchParams.set('labOrigin', origin); link.href = target.href;
  }
  const send = type => { if (embedded && session) parent.postMessage({type,session}, origin); };
  addEventListener('message', event => {
    if (!embedded || !isLabMessage(event, {source:parent,origin,session})) return;
    if (event.data.type === LAB_MESSAGES.pause) onPause();
  });
  const returnLinks=document.querySelectorAll('a[href="../../index.html"]');
  if(!embedded)for(const link of returnLinks){
    const configured=params.get('labReturn') || globalThis.AI_GAME_LAB_CONFIG?.lobbyURL;
    if(configured){try{const target=new URL(configured,location.href);if(['http:','https:'].includes(target.protocol)&&!target.username&&!target.password)link.href=target.href;}catch{}}
    else if(globalThis.AI_GAME_LAB_CONFIG?.standalone || !location.pathname.includes('/games/')){link.href='./';link.textContent='返回游戏菜单';}
  }
  for (const link of returnLinks) link.addEventListener('click', event => {
    onExit(); if (document.pointerLockElement) document.exitPointerLock();
    if (document.fullscreenElement) document.exitFullscreen().catch(()=>{});
    if (embedded && session) { event.preventDefault(); send(LAB_MESSAGES.exit); }
  });
  return {ready:()=>send(LAB_MESSAGES.ready),expand:()=>send(LAB_MESSAGES.expand)};
}
