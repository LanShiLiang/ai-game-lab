// Each game keeps its bridge so standalone exports retain their own runtime.
export function installLabBridge({onPause=()=>{},onExit=()=>{}}={}){
 const session=new URLSearchParams(location.search).get('labSession'),embedded=parent!==window;
 if(embedded&&session)for(const link of document.querySelectorAll('a[href="./"]')){
  const target=new URL(link.href);target.searchParams.set('labSession',session);link.href=target.href;
 }
 const send=type=>{if(embedded&&session)parent.postMessage({type,session},location.origin);};
 addEventListener('message',event=>{
  if(!embedded||event.source!==parent||event.origin!==location.origin||!session||event.data?.session!==session)return;
  if(event.data.type==='ai-game-lab:pause')onPause();
 });
 for(const link of document.querySelectorAll('a[href="../../index.html"]')){
  link.addEventListener('click',event=>{
   onExit();if(document.pointerLockElement)document.exitPointerLock();
   if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});
   if(embedded&&session){event.preventDefault();send('ai-game-lab:exit');}
  });
 }
 return {ready:()=>send('ai-game-lab:ready'),expand:()=>send('ai-game-lab:expand')};
}
