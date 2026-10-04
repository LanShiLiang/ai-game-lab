export const ONLINE_GAME_URL='https://lslzqco.cn/ai-game-lab/games/apex-rush/';
// The service sits beside the game, including when deployed under a URL prefix.
export function racingServiceBase(href=import.meta.url){const url=new URL(href),at=url.pathname.lastIndexOf('/games/apex-rush/');url.pathname=at>=0?url.pathname.slice(0,at+1):'/';url.search='';url.hash='';return url;}
export function remainingTime(expiresAt,stamp=Date.now()){const seconds=Math.max(0,Math.ceil((expiresAt-stamp)/1000));return String(Math.floor(seconds/3600)).padStart(2,'0')+':'+String(Math.floor(seconds/60)%60).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');}
