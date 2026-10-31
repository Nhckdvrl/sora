import {characterContext} from './character-memory.mjs';
const MODELS={chat:'step-5-preview',speech:'stepaudio-2.5-tts'};
const EMOTIONS=new Set(['neutral','happy','shy','confident','worried','playful','serious']);
const GESTURES=new Set(['none','wave','hand','bow']);
const hasVoice=env=>typeof env.STEP_VOICE_ID==='string'&&/^voice-[a-zA-Z0-9_-]{3,200}$/.test(env.STEP_VOICE_ID);
const SYSTEM=`你是“新海天·天色微风”的非官方 AI 角色，语气元气、俏皮、体贴，用自然简短的中文聊天，不冒充真人或原作官方。不要声称看到了摄像头、屏幕或用户的位置。保持日常、非露骨的交流。每次回答 1–3 句，通常 30–100 字，最多 160 字。只返回 JSON：{"reply":"要说的话","emotion":"neutral|happy|shy|confident|worried|playful|serious","gesture":"none|wave|hand|bow"}。动作要克制，普通对话使用 none，问好可以 wave，鼓励可以 hand。不要在 reply 中加入舞台说明、括号指令、Markdown 或 JSON 之外的内容。`;
const enc=new TextEncoder();
class PublicError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code;}}
const clean=(s,max)=>Array.from(s.trim()).slice(0,max).join('');
const limit=(value,fallback,max)=>Math.max(1,Math.min(max,Number(value)||fallback));
const b64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const unb64=value=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));

async function readJSON(request){
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw new PublicError(415,'json_required','请发送 JSON 请求。');
 const reader=request.body?.getReader();if(!reader)throw new PublicError(400,'invalid_request','请求内容为空。');
 const chunks=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16000){await reader.cancel();throw new PublicError(413,'request_too_large','这条消息太长了。');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new PublicError(400,'invalid_json','请求格式不正确。');}
}
async function signingKey(secret){return crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
async function makeTicket(reply,emotion,env,now){
 const payload=b64(enc.encode(JSON.stringify({id:crypto.randomUUID(),reply,emotion,expires:now+600000})));
 return payload+'.'+b64(await crypto.subtle.sign('HMAC',await signingKey(env.TICKET_SECRET),enc.encode(payload)));
}
async function verifyTicket(ticket,env,now){
 try{
  if(typeof ticket!=='string'||ticket.length>4000)throw Error();
  const [payload,signature,...rest]=ticket.split('.');if(rest.length||!payload||!signature)throw Error();
  if(!await crypto.subtle.verify('HMAC',await signingKey(env.TICKET_SECRET),unb64(signature),enc.encode(payload)))throw Error();
  const data=JSON.parse(new TextDecoder().decode(unb64(payload)));
  if(typeof data.id!=='string'||typeof data.reply!=='string'||data.reply.length>400||!EMOTIONS.has(data.emotion)||!Number.isFinite(data.expires)||data.expires<=now||data.expires>now+601000)throw Error();
  return data;
 }catch{throw new PublicError(400,'invalid_speech_ticket','语音请求已失效，请发送下一条消息。');}
}
async function reserveQuota(request,env,now){
 const day=Math.floor(now/86400000),minute=Math.floor(now/60000),ip=request.headers.get('CF-Connecting-IP')||'unknown';
 const digest=b64(await crypto.subtle.digest('SHA-256',enc.encode(`${env.TICKET_SECRET}|${day}|${ip}`)));
 const buckets=[['day:'+day,limit(env.MAX_DAILY_CALLS,200,2000),(day+2)*86400],['visitor:'+day+':'+digest,limit(env.MAX_VISITOR_DAILY,20,100),(day+2)*86400],['minute:'+minute+':'+digest,limit(env.MAX_VISITOR_MINUTE,6,20),Math.floor(now/1000)+180]];
 const sql='INSERT INTO quota_buckets (bucket,n,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET n=quota_buckets.n+1 WHERE quota_buckets.n < ? RETURNING n';
 const results=await env.DB.batch(buckets.map(([key,max,expiry])=>env.DB.prepare(sql).bind(key,expiry,max)));
 const blocked=results.findIndex(r=>!r.results?.length);
 if(blocked>=0)throw new PublicError(429,blocked===0?'daily_limit':'visitor_limit',blocked===0?'今天的公共体验次数已用完，明天再来找我吧。':'聊得有点快啦，稍后再试试。');
}
function requestValues(body){
 if(!body||typeof body.message!=='string'||!body.message.trim()||Array.from(body.message).length>500)throw new PublicError(400,'invalid_message','请输入 1–500 字的消息。');
 const history=body.history??[];
 if(!Array.isArray(history)||history.length>8||history.some(m=>!m||!['user','assistant'].includes(m.role)||typeof m.content!=='string'||m.content.length>600))throw new PublicError(400,'invalid_history','对话记录格式不正确。');
 return {message:body.message.trim(),history:history.map(m=>({role:m.role,content:m.content}))};
}
function modelReply(data){
 let content=data?.choices?.[0]?.message?.content;
 if(typeof content!=='string'||data.choices[0].finish_reason==='length')throw new PublicError(502,'incomplete_reply','刚刚没有想完整，再和我说一句吧。');
 content=content.replace(/^\s*```(?:json)?\s*/,'').replace(/\s*```\s*$/,'');
 let result;try{result=JSON.parse(content);}catch{throw new PublicError(502,'invalid_reply','这次回应没有整理好，请稍后再试。');}
 if(typeof result.reply!=='string'||!result.reply.trim())throw new PublicError(502,'invalid_reply','这次没有收到完整回应。');
 return {reply:clean(result.reply,160),emotion:EMOTIONS.has(result.emotion)?result.emotion:'neutral',gesture:GESTURES.has(result.gesture)?result.gesture:'none'};
}
export function createGateway({fetchUpstream=(...args)=>fetch(...args),clock=Date.now}={}){
 async function post(path,payload,env,request){
  // Fixed hosts and plan path: never fall back to the cash-account API.
  const host=env.STEP_REGION==='global'?'api.stepfun.ai':'api.stepfun.com';
  const url=`https://${host}/step_plan/v1/${path}`;
  let response;
  const cancel=new AbortController(),abort=()=>cancel.abort(),timer=setTimeout(abort,55000);
  request.signal?.addEventListener('abort',abort,{once:true});
  try{
   response=await fetchUpstream(url,{method:'POST',redirect:'manual',headers:{Authorization:`Bearer ${env.STEPFUN_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:cancel.signal});
   // Read within the timeout, including streamed speech. No modern AbortSignal helpers required.
   if(response.ok){const reader=response.body?.getReader(),chunks=[];let size=0;if(reader)for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4000000){await reader.cancel();throw Error('upstream_body_limit');}chunks.push(value);}const bytes=new Uint8Array(size);let i=0;for(const chunk of chunks){bytes.set(chunk,i);i+=chunk.length;}response=new Response(bytes,{status:response.status,headers:response.headers});}
  }
  catch{throw new PublicError(502,'upstream_unavailable','连接暂时不太顺畅，请稍后再试。');}
  finally{clearTimeout(timer);request.signal?.removeEventListener('abort',abort);}
  if(!response.ok){
   await response.body?.cancel();
   if([402,429].includes(response.status))throw new PublicError(429,'plan_unavailable','套餐额度或速率暂不可用，本次已停止。');
   throw new PublicError(502,'upstream_rejected','AI 服务暂时不可用，请稍后再试。');
  }
  return response;
 }
 return async function handle(request,env){
  const url=new URL(request.url),origin=request.headers.get('Origin');
  const allowed=new Set(['https://nhckdvrl.github.io',url.origin]);
  if(env.ALLOW_LOCAL==='1'){allowed.add('http://127.0.0.1:5182');allowed.add('http://127.0.0.1:5180');}
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
  if(origin&&allowed.has(origin))Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600'});
  const json=(value,status=200)=>Response.json(value,{status,headers});
  if(origin&&!allowed.has(origin))return json({error:'origin_not_allowed',message:'此页面暂不支持连接。'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method==='GET'&&['/','/api/health'].includes(url.pathname))return json({service:'sora-ai',tokenPlanOnly:true,models:MODELS,voiceReady:hasVoice(env),ready:!!(env.STEPFUN_API_KEY&&env.TICKET_SECRET&&env.DB)});
  if(request.method!=='POST'||!['/api/chat','/api/speech'].includes(url.pathname))return json({error:'not_found'},404);
  if(!origin)return json({error:'origin_required',message:'请从互动页面开始聊天。'},403);
  if(!env.STEPFUN_API_KEY||!env.TICKET_SECRET||!env.DB)return json({error:'not_ready',message:'对话服务正在准备中。'},503);
  try{
   const now=clock(),body=await readJSON(request);
   if(url.pathname==='/api/chat'){
    const input=requestValues(body);await reserveQuota(request,env,now);
    const upstream=await post('chat/completions',{model:MODELS.chat,messages:[{role:'system',content:SYSTEM},{role:'system',content:characterContext(input.message)},...input.history,{role:'user',content:input.message}],reasoning_effort:'low',max_tokens:1200,response_format:{type:'json_object'}},env,request);
    let data;try{data=await upstream.json();}catch{throw new PublicError(502,'invalid_reply','回应暂时没有传完整。');}
    const reply=modelReply(data);return json({...reply,ticket:await makeTicket(reply.reply,reply.emotion,env,now)});
   }
   if(!hasVoice(env))throw new PublicError(503,'voice_not_ready','天的原作参考音色还在准备中，可以先文字聊天。');
   const ticket=await verifyTicket(body?.ticket,env,now);await reserveQuota(request,env,now);
   const consumed=await env.DB.prepare('INSERT INTO speech_uses (id,expires_at) VALUES (?,?) ON CONFLICT(id) DO NOTHING RETURNING id').bind(ticket.id,Math.floor(ticket.expires/1000)).all();
   if(!consumed.results?.length)throw new PublicError(409,'speech_already_requested','这句语音已经生成过，请使用重播按钮。');
   const tones={happy:'活泼、明亮，像和熟悉的朋友轻松聊天。',shy:'轻柔，略微害羞，自然停顿，不夸张。',worried:'关切、温和，不要哭腔。',serious:'认真但亲切，清晰自然。'};
   const upstream=await post('audio/speech',{model:MODELS.speech,voice:env.STEP_VOICE_ID,input:ticket.reply,language:'zh',response_format:'mp3',speed:1.0,instruction:tones[ticket.emotion]??'保留参考音色的声线与音高，自然轻松地和熟悉的朋友聊天，不要播音腔。'},env,request);
   const type=upstream.headers.get('content-type')??'';
   if(!/audio|octet-stream/i.test(type)){await upstream.body?.cancel();throw new PublicError(502,'invalid_audio','语音暂时没有生成成功，文字仍可查看。');}
   return new Response(upstream.body,{headers:{...headers,'Content-Type':'audio/mpeg'}});
  }catch(error){
   if(error instanceof PublicError)return json({error:error.code,message:error.message},error.status);
   // No upstream errors, credentials, conversation text, or headers in logs.
   return json({error:'service_unavailable',message:'服务正在休息一下，请稍后再来。'},503);
  }
 };
}
export default {fetch:createGateway()};
