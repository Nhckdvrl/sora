type RetryNotice={seconds:number;attempt:number;limit:number};
type RequestOptions={signal:AbortSignal;onRetry(notice:RetryNotice):void;onAttempt?():void;fetchImpl?:typeof fetch;wait?:(ms:number,signal:AbortSignal)=>Promise<void>};
function abortError(){return new DOMException('已打断','AbortError');}
export function waitForRetry(ms:number,signal:AbortSignal):Promise<void>{
 return new Promise((resolve,reject)=>{
  if(signal.aborted){reject(abortError());return;}
  const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(abortError());};
  const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);
  signal.addEventListener('abort',abort,{once:true});
 });
}
export async function requestPlan(url:string,body:unknown,options:RequestOptions):Promise<Response>{
 const {signal,onRetry,fetchImpl=fetch,wait=waitForRetry}=options;
 let waited=0;
 for(let attempt=0;;attempt++){
  if(signal.aborted)throw abortError();
  options.onAttempt?.();
  const response=await fetchImpl(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
  if(response.ok)return response;
  const problem=await response.json().catch(()=>null);
  const error=Error(typeof problem?.message==='string'?problem.message:'连接暂时不顺畅，请稍后再试。');
  // Only chat requests explicitly classified as temporary may retry. No transport,
  // auth, balance, local visitor-limit, or one-use speech-ticket retries.
  if(!url.endsWith('/api/chat')||response.status!==429||problem?.retryable!==true||!['model_busy','model_rate_limited'].includes(problem.error)||attempt>=3)throw error;
  const requested=Number(problem.retryAfter??response.headers.get('retry-after'));
  const seconds=Math.max(Number.isFinite(requested)?requested:3,3*2**attempt);
  if(seconds>15||waited+seconds>25)throw error;
  waited+=seconds;onRetry({seconds,attempt:attempt+1,limit:3});
  await wait(seconds*1000,signal);
 }
}
