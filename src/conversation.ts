import {requestPlan} from './plan-request';
export type AIReply={reply:string;emotion:string;gesture:string;ticket:string};
export interface ConversationController {mouthOpen():number|null;stop():void;}
const GATEWAY='https://sora-breeze-api-nhckdvrl.nhckdvrl.chatgpt.site';
export function initConversation(callbacks:{thinking():void;reply(value:AIReply):void;error(message:string):void}):ConversationController{
 const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
 const form=$<HTMLFormElement>('chat-form'),input=$<HTMLTextAreaElement>('chat-input'),send=$<HTMLButtonElement>('chat-send'),stopButton=$<HTMLButtonElement>('chat-stop'),replay=$<HTMLButtonElement>('chat-replay'),voice=$<HTMLInputElement>('chat-voice'),state=$('chat-state'),log=$('chat-log');
 let history:{role:'user'|'assistant';content:string}[]=[],epoch=0,busy=false,controller:AbortController|null=null;
 let context:AudioContext|null=null,analyser:AnalyserNode|null=null,source:AudioBufferSourceNode|null=null,cached:AudioBuffer|null=null,mouth=0;
 const samples=new Float32Array(512);
 function status(text:string){state.textContent=text;send.disabled=busy;stopButton.disabled=!busy&&!source;replay.disabled=!cached||busy;}
 function message(who:'user'|'assistant',text:string){const row=document.createElement('div');row.className='chat-message '+who;const name=document.createElement('span');name.className='chat-author';name.textContent=who==='user'?'你':'天';const content=document.createElement('p');content.textContent=text;row.append(name,content);log.append(row);while(log.children.length>8)log.firstElementChild?.remove();log.scrollTop=log.scrollHeight;}
 function audioContext(){
  if(!context){context=new AudioContext();analyser=context.createAnalyser();analyser.fftSize=1024;analyser.smoothingTimeConstant=.35;analyser.connect(context.destination);}
  return context;
 }
 function stopSound(){const prior=source;source=null;if(prior){prior.onended=null;try{prior.stop();}catch{}prior.disconnect();}mouth=0;}
 function stop(){epoch++;controller?.abort();controller=null;stopSound();busy=false;status('已停下 · 可以继续聊');}
 async function play(buffer:AudioBuffer){
  const current=epoch,audio=audioContext();await audio.resume();if(current!==epoch)return;if(audio.state!=='running')throw Error('请点击重播，允许浏览器播放声音。');
  stopSound();const next=audio.createBufferSource();next.buffer=buffer;next.connect(analyser!);source=next;
  next.onended=()=>{if(source!==next)return;source=null;mouth=0;status('听着呢');next.disconnect();};next.start();status('正在说话…');
 }
 async function post(path:string,body:unknown,signal:AbortSignal){
  return requestPlan(GATEWAY+'/api/'+path,body,{signal,onAttempt(){if(path==='chat')status('正在想一想…');},onRetry({seconds,attempt,limit}){status(`模型忙 · ${seconds} 秒后重试（${attempt}/${limit}）`);}});
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;const text=input.value.trim();if(!text)return;
  if(Array.from(text).length>500){status('一条消息最多 500 字哦');return;}
  stopSound();controller?.abort();const current=++epoch,abort=new AbortController();controller=abort;busy=true;cached=null;replay.disabled=true;
  if(voice.checked){try{void audioContext().resume().catch(()=>{});}catch{/* Text remains available on devices without Web Audio. */}}
  message('user',text);input.value='';callbacks.thinking();status('正在想一想…');
  try{
   const response=await post('chat',{message:text,history:history.slice(-8)},abort.signal),reply:AIReply=await response.json();if(current!==epoch)return;
   if(typeof reply.reply!=='string'||typeof reply.ticket!=='string')throw Error('这次没有收到完整回应。');
   message('assistant',reply.reply);history.push({role:'user',content:text},{role:'assistant',content:reply.reply});history=history.slice(-8);callbacks.reply(reply);
   if(voice.checked){
    status('正在准备语音…');
    try{
     const sound=await post('speech',{ticket:reply.ticket},abort.signal);const bytes=await sound.arrayBuffer();if(current!==epoch)return;
     if(bytes.byteLength>4000000)throw Error('这段语音太长了，文字仍可查看。');
     const buffer=await audioContext().decodeAudioData(bytes);if(current!==epoch)return;cached=buffer;
     busy=false;if(voice.checked)await play(buffer);else status('已关闭朗读');
    }catch(error){if(current!==epoch)return;busy=false;status(error instanceof Error?error.message:'语音暂不可用，文字仍可查看。');}
   }else{busy=false;status('听着呢');}
  }catch(error){
   if(current!==epoch)return;busy=false;if(!input.value.trim())input.value=text;const detail=error instanceof Error?error.message:'连接暂时不顺畅，请稍后再试。';status(detail);callbacks.error(detail);
  }finally{if(current===epoch){busy=false;controller=null;send.disabled=false;stopButton.disabled=!source;replay.disabled=!cached;}}
 });
 stopButton.addEventListener('click',stop);
 replay.addEventListener('click',()=>{if(cached)void play(cached).catch(error=>status(String(error.message??error)));});
 voice.addEventListener('change',()=>{if(!voice.checked){stopSound();status(busy?'正在回应…':'已关闭朗读');}});
 input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();form.requestSubmit();}});
 send.disabled=false;status('听着呢');
 voice.checked=false;voice.disabled=true;
 void fetch(GATEWAY+'/api/health').then(response=>{if(!response.ok)throw Error();return response.json();}).then(health=>{
  if(health.voiceReady===true){voice.disabled=false;voice.checked=true;if(!busy)status('听着呢');}
  else if(!busy)status('可以文字聊天 · 原作音色准备中');
 }).catch(()=>{if(!busy)status('可以尝试文字聊天 · 音色服务暂不可用');});
 return {stop,mouthOpen(){if(!source||!analyser||context?.state!=='running')return null;analyser.getFloatTimeDomainData(samples);let sum=0;for(const sample of samples)sum+=sample*sample;const target=Math.max(0,Math.min(1,(Math.sqrt(sum/samples.length)-.008)*9));mouth+=(target-mouth)*.55;return mouth;}};
}
