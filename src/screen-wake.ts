export function initScreenWake(button:HTMLButtonElement){
 let wanted=true,pending=false,lock:WakeLockSentinel|null=null;
 const paint=()=>{button.setAttribute('aria-pressed',String(!!lock));button.textContent=lock?'亮屏已开启':'保持亮屏';};
 async function acquire(){
  if(!wanted||pending||lock||document.visibilityState!=='visible')return;
  if(!navigator.wakeLock){button.title='当前浏览器不支持网页亮屏请求';return;}
  pending=true;
  try{const next=await navigator.wakeLock.request('screen');if(!wanted){await next.release();return;}lock=next;next.addEventListener('release',()=>{if(lock===next){lock=null;paint();}});}
  catch{button.title='亮屏请求未生效，可点击重试';}
  finally{pending=false;paint();}
 }
 button.addEventListener('click',()=>{if(lock){wanted=false;void lock.release();lock=null;paint();}else{wanted=true;void acquire();}});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void acquire();});
 window.addEventListener('pagehide',()=>{wanted=false;void lock?.release();},{once:true});
 void acquire();
}
