// Included in standalone runtime configuration by the game artifact builder.
// Works for classic-script games too, without requiring platform code or modules.
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => {
  if (parent !== window || !globalThis.AI_GAME_LAB_CONFIG?.standalone) return;
  const configured = new URLSearchParams(location.search).get('labReturn') || globalThis.AI_GAME_LAB_CONFIG.lobbyURL;
  for (const link of document.querySelectorAll('a[href="../../index.html"]')) {
    if (configured) {
      try { const target = new URL(configured,location.href); if (['http:','https:'].includes(target.protocol) && !target.username && !target.password) { link.href = target.href; continue; } } catch {}
    }
    link.href = './'; link.textContent = '返回游戏菜单';
  }
}, {once:true});
