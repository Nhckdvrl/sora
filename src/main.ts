import { RigRuntime, type RenderOptions } from '@standrig/runtime';
import { loadSoraModel } from './model';
import { triangleUvAtPoint } from '@standrig/core/hitTesting';
import type { ParameterValues } from '@standrig/core/types';
import { reactions, reactionAt, faceReactionPose, type ReactionKind } from './sora-reactions';
import {sampleGesture,advanceGesture,type GesturePose} from './sora-gestures';
import {initConversation,type ConversationController,type AIReply} from './conversation';
import {PerformanceDirector,performanceDemos} from './performance';
import {initScreenWake} from './screen-wake';
import './sora.css';

const $=<T extends HTMLElement>(s:string)=>document.querySelector<T>(s)!;
const canvas=$<HTMLCanvasElement>('#sora-canvas'),stage=$('#stage'),scene=$('.stage-column');
const names=['自然','开心','害羞','得意','担心','坏笑','含泪','俏皮','撒娇','认真','单眼眨眼','轻闭双眼'];
const status=$('#status'),exportStatus=$('#export-status'),feedback=$('#touch-feedback'),hint=$('#interaction-hint');
let conversation:ConversationController|undefined;
const director=new PerformanceDirector();
let performanceLabel='';
let expression=0,paused=false,portrait=true,background=0,ready=false,runtime:RigRuntime,modelSource='';
let pointer={x:0,y:0},look={x:0,y:0},eyeTarget={x:0,y:0},gaze={x:0,y:0};
let last=performance.now(),lastRender=0,elapsed=0,nextBlink=2.8,blinkStart=-1;
let winkUntil=0,greetUntil=0,hairImpulse=0,breezeUntil=0;
let dragging=false,dragX=0,lastPet=-10,lastHit=0,hover:ReactionKind|null=null;
let values:ParameterValues={};
const gesturePose:GesturePose={},gestureVelocity:GesturePose={};
let reaction:{kind:ReactionKind;start:number;until:number;base:number;side:number}|null=null;
const history=new Map<ReactionKind,{at:number;count:number}>();
const enabled=(id:string)=>$<HTMLInputElement>('#'+id).checked;
const value=(id:string)=>Number($<HTMLInputElement>('#'+id).value);
const clamp=(v:number,e=1)=>Math.max(-e,Math.min(e,v));
const camera=():RenderOptions=>{
 const w=canvas.clientWidth,h=canvas.clientHeight,fit=Math.max(.001,Math.min((w-50)/1300,(h-50)/1800));
 const scale=portrait?Math.max(.05,Math.min((w-40)/600,(h-40)/760)):fit*1.08;
 return {transparent:true,webglWarp:true,fitPadding:25,zoom:scale/fit,panY:portrait?810*scale-.44*h:0};
};
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
if(reduced){$<HTMLInputElement>('#idle').checked=false;$<HTMLInputElement>('#follow').checked=false;document.body.classList.add('reduced');}
const buttons=names.map((name,i)=>{const b=document.createElement('button');b.textContent=name;b.setAttribute('aria-pressed',String(i===0));b.onclick=()=>selectExpression(i);$('#expressions').append(b);return b;});
const actionButtons=reactions.map(def=>{const b=document.createElement('button');b.textContent=def.label;b.title=def.hint;b.dataset.reactionId=def.id;b.setAttribute('aria-pressed','false');b.onclick=()=>touch(def.id,{x:def.anchor[0],y:def.anchor[1]});$('#interaction-actions').append(b);return b;});
initScreenWake($<HTMLButtonElement>('#wake-screen'));
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-dialogue-demo]'))button.onclick=()=>{
 const demo=performanceDemos[button.dataset.dialogueDemo??''];if(!ready||!demo)return;conversation?.stop();reaction=null;director.respond(demo.reply);paused=false;
 $('#chat-state').textContent='动作预览 · 不发送消息';feedback.textContent='动作预览 · '+demo.label;feedback.classList.add('visible');canvas.dataset.demo=button.dataset.dialogueDemo!;
};
function selectExpression(i:number,transient=false){
 if(!transient){director.manual(i);reaction=null;feedback.classList.remove('visible');feedback.textContent='轻轻碰一碰，她会回应你。';delete canvas.dataset.reaction;actionButtons.forEach(b=>b.setAttribute('aria-pressed','false'));paused=false;}
 else if(reaction)director.cover(i);
 expression=i;buttons.forEach((b,j)=>b.setAttribute('aria-pressed',String(i===j)));$('#expression-name').textContent=names[i];
}
function touch(kind:ReactionKind,p:{x:number;y:number}){
 if(!ready)return;
 if(kind==='mouth')conversation?.stop();
 const def=reactions.find(r=>r.id===kind)!,prior=history.get(kind);
 const count=prior&&elapsed-prior.at<2.8?prior.count+1:1;history.set(kind,{at:elapsed,count});
 const base=reaction?.base??expression;reaction={kind,start:elapsed,until:elapsed+def.duration,base,side:p.x<684?-1:1};
 paused=false;status.textContent='原作模型 · 轻动态';selectExpression(kind==='cheek'&&count>=3?5:def.expression,true);
 feedback.textContent=kind==='cheek'&&count>=3?def.lines[2]:def.lines[(count-1)%def.lines.length];feedback.classList.add('visible');canvas.dataset.reaction=kind;
 if(kind==='mouth')$('#expression-name').textContent='害羞 · 轻闭双眼';
 actionButtons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.reactionId===kind)));
 hairImpulse=clamp(hairImpulse+def.hair*reaction.side);if(kind==='eye')winkUntil=elapsed+.5;if(kind==='skirt')breezeUntil=elapsed+3.2;
 stage.classList.remove('touch-pulse');void stage.offsetWidth;stage.classList.add('touch-pulse');
}
function stagePoint(clientX:number,clientY:number){
 const r=canvas.getBoundingClientRect(),view=camera(),scale=Math.min((r.width-50)/1300,(r.height-50)/1800)*(view.zoom??1);
 return {x:(clientX-r.left-(r.width-1300*scale)/2)/scale,y:(clientY-r.top-(r.height-1800*scale)/2-(view.panY??0))/scale};
}
// Barycentric UV recovery keeps small targets aligned with the actual mesh.
function materialHit(clientX:number,clientY:number):{point:{x:number;y:number};id:string}|null{
 if(!ready)return null;
 const id=runtime.hitTestPart(canvas,values,clientX,clientY,camera());if(!id)return null;
 const part=runtime.rig.parts.find(p=>p.id===id)!,asset=runtime.rig.assets.find(a=>a.id===part.assetId)!;
 const handles=runtime.getArtMeshVertexHandles(canvas,values,id,camera()),triangles=part.artMesh?.triangles??[];
 const rect=canvas.getBoundingClientRect(),point={x:clientX-rect.left,y:clientY-rect.top};
 for(let i=0;i<triangles.length;i+=3){const a=handles[triangles[i]],b=handles[triangles[i+1]],c=handles[triangles[i+2]];if(!a||!b||!c)continue;const uv=triangleUvAtPoint(point,[a,b,c]);if(uv)return {id,point:{x:part.transform.x+uv.u*(asset.width??1),y:part.transform.y+uv.v*(asset.height??1)}};}
 return {id,point:stagePoint(clientX,clientY)};
}
document.addEventListener('pointermove',e=>{
 const p=stagePoint(e.clientX,e.clientY);pointer={x:clamp((p.x-684)/360),y:clamp((p.y-330)/480)};eyeTarget={x:clamp((p.x-684)/155),y:clamp((p.y-310)/210)};
 canvas.dataset.pointer=JSON.stringify({clientX:e.clientX,clientY:e.clientY,stageX:p.x,stageY:p.y});
 if(e.target===canvas&&performance.now()-lastHit>90){const hit=materialHit(e.clientX,e.clientY);hover=hit?reactionAt(hit.point,hit.id):null;lastHit=performance.now();}else if(e.target!==canvas)hover=null;
 canvas.dataset.hoverRegion=hover??'';canvas.style.cursor=hover&&['hair','ponytail','side-lock','braid'].includes(hover)?(dragging?'grabbing':'grab'):hover?'pointer':'default';
 hint.textContent=hover?reactions.find(r=>r.id===hover)!.hint:'试试挥手和击掌 · 衣襟、腰侧也有回应 · 拖动发梢会回弹';
 if(dragging){hairImpulse=clamp(hairImpulse+(p.x-dragX)/55);dragX=p.x;if(hover==='hair'&&elapsed-lastPet>.6){lastPet=elapsed;touch('hair',p);}}
});
document.documentElement.addEventListener('pointerleave',()=>{pointer={x:0,y:0};eyeTarget={x:0,y:0};hover=null;dragging=false;});
canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;const hit=materialHit(e.clientX,e.clientY);if(!hit)return;const kind=reactionAt(hit.point,hit.id);if(!kind)return;touch(kind,hit.point);lastPet=elapsed;if(['hair','ponytail','side-lock','braid'].includes(kind)){dragging=true;dragX=stagePoint(e.clientX,e.clientY).x;}});
canvas.addEventListener('dblclick',e=>{const hit=materialHit(e.clientX,e.clientY);if(hit&&reactionAt(hit.point,hit.id)==='hand')touch('wave',hit.point);});
for(const event of ['pointerup','pointercancel'])document.addEventListener(event,()=>{dragging=false;});
for(const id of ['yaw','pitch','roll'])$<HTMLInputElement>('#'+id).oninput=()=>{$('#'+id+'-value').textContent=value(id).toFixed(1);};
$('#wink').onclick=()=>touch('eye',{x:727,y:302});
$('#greet').onclick=()=>{greetUntil=elapsed+3.25;touch('wave',{x:490,y:313});};
$('#breeze').onclick=()=>{touch('ponytail',{x:879,y:430});breezeUntil=elapsed+3.2;feedback.textContent='风来了，头发都飘起来啦。';};
$('#reset').onclick=()=>{conversation?.stop();selectExpression(0);pointer=look={x:0,y:0};eyeTarget=gaze={x:0,y:0};hairImpulse=0;breezeUntil=0;dragging=false;history.clear();runtime?.resetPhysics();for(const id of ['yaw','pitch','roll']){$<HTMLInputElement>('#'+id).value='0';$('#'+id+'-value').textContent='0';}};
$('#portrait').onclick=()=>{portrait=!portrait;$('#portrait').setAttribute('aria-pressed',String(portrait));$('#portrait').textContent=portrait?'全身立绘':'半身近景';};
$('#background').onclick=()=>{background=(background+1)%3;stage.classList.toggle('night',background===1);stage.classList.toggle('clear',background===2);$('#background').textContent='背景 · '+['晴空','暮蓝','透明'][background];};
$('#fullscreen').onclick=()=>{if(document.fullscreenElement)void document.exitFullscreen();else void scene.requestFullscreen();};
function download(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
$('#save-png').onclick=()=>{if(ready)canvas.toBlob(b=>{if(b){download(b,'新海天_天色微风.png');exportStatus.textContent='已保存透明 PNG 画面';}});};
$('#export-model').onclick=async()=>{const b=$<HTMLButtonElement>('#export-model');b.disabled=true;try{if(!modelSource)throw Error('请等待模型载入完成');download(new Blob([modelSource],{type:'application/json'}),'新海天_天色微风_v0.3.1.srig');exportStatus.textContent='已导出含独立眼球、手臂、衣料反馈和发束物理的模型';}catch(e){exportStatus.textContent=String(e);}finally{b.disabled=false;}};
let recording=false;
$('#record').onclick=()=>{
 if(!ready||recording)return;const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(m=>MediaRecorder.isTypeSupported(m));if(!mime){exportStatus.textContent='当前浏览器不支持 WebM 录制';return;}
 recording=true;const b=$<HTMLButtonElement>('#record');b.disabled=true;const out=document.createElement('canvas');out.width=960;out.height=1280;const ctx=out.getContext('2d')!;
 const stream=out.captureStream(30),recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:6000000}),chunks:BlobPart[]=[];const start=performance.now();let frame=0;
 const capture=()=>{ctx.fillStyle=background===1?'#2e405c':'#eaf3fa';ctx.fillRect(0,0,960,1280);const scale=Math.min(960/canvas.width,1280/canvas.height);ctx.drawImage(canvas,(960-canvas.width*scale)/2,(1280-canvas.height*scale)/2,canvas.width*scale,canvas.height*scale);if(performance.now()-start>=8000){recorder.stop();return;}frame=requestAnimationFrame(capture);};
 recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onstop=()=>{cancelAnimationFrame(frame);stream.getTracks().forEach(t=>t.stop());download(new Blob(chunks,{type:mime}),'新海天_天色微风_v0.3.1_8s.webm');recording=false;b.disabled=false;b.textContent='录制 8 秒动态';exportStatus.textContent='已保存 8 秒 WebM 动态（无音轨）';};recorder.start(500);b.textContent='正在录制…';exportStatus.textContent='保持页面可见，8 秒后自动下载';capture();
};
document.addEventListener('keydown',e=>{if((e.target instanceof HTMLElement&&e.target.closest('input,textarea,select,button,[contenteditable="true"]'))||e.ctrlKey||e.metaKey||e.altKey)return;if(e.code==='Space'){e.preventDefault();paused=!paused;status.textContent=paused?'动作已暂停':'原作模型 · 轻动态';}else if(e.key.toLowerCase()==='f')$('#fullscreen').click();else if(/^[1-9]$/.test(e.key))selectExpression(Number(e.key)-1);});
function tick(now:number){
 requestAnimationFrame(tick);if(!ready||document.hidden||now-lastRender<1000/30)return;const dt=Math.min(.1,(now-last)/1000);last=now;lastRender=now;if(paused)return;elapsed+=dt;
 const t=elapsed,idle=enabled('idle'),follow=enabled('follow'),eyeFollow=enabled('gaze'),headEase=1-Math.exp(-dt*6.5),eyeEase=1-Math.exp(-dt*22);
 if(reaction&&t>=reaction.until){const base=reaction.base;reaction=null;selectExpression(base,true);feedback.classList.remove('visible');delete canvas.dataset.reaction;actionButtons.forEach(b=>b.setAttribute('aria-pressed','false'));}
 const auto=director.update(dt,{blocked:!!reaction,reduced,speechProgress:conversation?.speechProgress()}),attention=auto.attention;
 look.x+=((follow?pointer.x*(1-attention*.75):0)-look.x)*headEase;look.y+=((follow?pointer.y*(1-attention*.75):0)-look.y)*headEase;
 gaze.x+=((eyeFollow?eyeTarget.x*(1-attention)+auto.gaze.x*attention:0)-gaze.x)*eyeEase;gaze.y+=((eyeFollow?eyeTarget.y*(1-attention)+auto.gaze.y*attention:0)-gaze.y)*eyeEase;
 const def=reaction?reactions.find(r=>r.id===reaction!.kind)!:null,age=reaction?t-reaction.start:0,response=reaction?(1-Math.exp(-age*18))*Math.exp(-age*1.1):0,side=reaction?.side??1;
 const touchRoll=(def?.tilt??0)*response*side,touchNod=(def?.nod??0)*response;let eye=1;
 if(enabled('blink')){if(t>=nextBlink){blinkStart=t;nextBlink=t+3.4+(Math.sin(t*2.7)+1)*1.2;}const bt=t-blinkStart;if(bt>=0&&bt<.16)eye=Math.abs(bt-.08)/.08;}
 if(reaction?.kind==='nose'&&age<.16)eye=Math.abs(age-.08)/.08;if(!dragging)hairImpulse*=Math.exp(-dt*4);
 const breeze=breezeUntil>t?Math.sin((1-(breezeUntil-t)/3.2)*Math.PI)*.9:0,physics=enabled('hair-motion');if(runtime.rig.physics.enabled!==physics){runtime.rig.physics.enabled=physics;runtime.resetPhysics();}const flutter=Math.sin(age*12)*Math.exp(-age*2.2);
 values={ParamExpression:reaction?expression:auto.expression,ParamAngleX:clamp(value('yaw')+auto.pose.yaw+look.x*10+(idle?Math.sin(t*.49)*1:0),10),ParamAngleY:clamp(value('pitch')+auto.pose.pitch+look.y*7.5+touchNod+(idle?Math.sin(t*.68)*.65:0),8),ParamAngleZ:clamp(value('roll')+auto.pose.roll-look.x*2.8+touchRoll+(idle?Math.sin(t*.42)*.8:0)+(greetUntil>t?Math.sin(t*4)*.65:0),6),ParamBodyAngleX:clamp(auto.pose.bodyYaw+look.x*1.6+(idle?Math.sin(t*.49-.65)*.65:0),6),ParamBodyAngleY:clamp(auto.pose.bodyPitch+look.y*.45+(idle?Math.sin(t*.66)*.3:0)+touchNod*.2,4),ParamBodyAngleZ:clamp(auto.pose.bodyRoll-look.x*.65+(idle?Math.sin(t*.42-.6)*.4:0)+(def?.body??0)*response*side,3),ParamBreath:idle?(1-Math.cos(t*1.34))*.5:0,ParamEyeBallX:clamp(gaze.x+(idle ? .025*Math.sin(t*2.1) : 0)),ParamEyeBallY:clamp(gaze.y),ParamHairFront:0,ParamHairSide:0,ParamHairBack:0,ParamHairImpulse:hairImpulse,ParamBreeze:breeze,ParamBowFlutter:reaction?.kind==='bow'?flutter:0,ParamSkirtFlutter:reaction?.kind==='skirt'?flutter*.8:breeze*.4,ParamEyeLOpen:(winkUntil>t?0:eye)*auto.eyeOpen,ParamEyeROpen:eye*auto.eyeOpen,ParamMouthOpen:reaction?1:auto.mouthOpen};
 const targetGesture=sampleGesture(reaction?.kind??null,age,def?.duration??0,side);
 if(!reaction)for(const [id,value] of Object.entries(auto.gesture))targetGesture[id]=value;
 if(idle&&!reaction){targetGesture.ParamArmRShoulder=(targetGesture.ParamArmRShoulder??0)+.6*Math.sin(t*.85+.4);targetGesture.ParamArmRElbow=(targetGesture.ParamArmRElbow??0)+.45*Math.sin(t*.85-.3);targetGesture.ParamArmLWrist=(targetGesture.ParamArmLWrist??0)+.35*Math.sin(t*.7);}
 advanceGesture(gesturePose,gestureVelocity,targetGesture,dt);
 Object.assign(values,gesturePose,faceReactionPose(reaction?.kind??null,age,def?.duration??0));
 const speechMouth=conversation?.mouthOpen();if(speechMouth!==undefined&&speechMouth!==null)values.ParamMouthOpen=speechMouth;
 const phaseNames={idle:'自在待着',listening:'认真听你说',thinking:'想一想',waiting:'等你片刻',replying:'回应你',speaking:'正在说话',interrupted:'你说，我在听',error:'稍等一下'};
 const label=phaseNames[auto.phase],key=label+':'+values.ParamExpression+':'+(reaction?.kind??'');
 if(key!==performanceLabel){performanceLabel=key;$('#performance-state').textContent=label;if(!reaction){buttons.forEach((b,i)=>b.setAttribute('aria-pressed',String(i===values.ParamExpression)));$('#expression-name').textContent=names[values.ParamExpression??0]+' · '+label;}}
 canvas.dataset.phase=auto.phase;canvas.dataset.performance=JSON.stringify({phase:auto.phase,progress:auto.progress,attention:auto.attention});
 const started=performance.now();runtime.render(canvas,values,camera());canvas.dataset.ready='true';canvas.dataset.expression=String(expression);canvas.dataset.time=t.toFixed(3);canvas.dataset.pose=JSON.stringify(values);canvas.dataset.frameMs=(performance.now()-started).toFixed(1);
}
try{const model=await loadSoraModel();modelSource=model.source;runtime=new RigRuntime(model.rig,{cacheEvaluation:true});await runtime.loadAssets();ready=true;status.textContent='原作模型 · 目光与发丝';conversation=initConversation({thinking(){director.setPhase('thinking');paused=false;feedback.textContent='让我想一想……';},reply(reply:AIReply){director.respond(reply);paused=false;feedback.textContent=reply.reply;feedback.classList.add('visible');},error(message:string){director.setPhase('error');feedback.textContent=message;},phase(phase){if(phase==='finished')director.finishSpeech();else director.setPhase(phase);paused=false;},attention(active){director.listen(active);}});requestAnimationFrame(tick);}catch(e){$('#error').textContent='模型载入失败：'+String(e)+'。请刷新页面重试。';status.textContent='模型未载入';}
