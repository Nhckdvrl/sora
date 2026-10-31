import {sampleGesture,type GesturePose} from './sora-gestures.ts';

export type Emotion='neutral'|'happy'|'shy'|'confident'|'worried'|'playful'|'serious';
export type DialoguePhase='idle'|'listening'|'thinking'|'waiting'|'replying'|'speaking'|'interrupted'|'error';
export type DialogueGesture='none'|'nod'|'shake'|'tilt'|'wave'|'hand';
export type PerformanceCue={at:number;emotion:Emotion;gesture:DialogueGesture};
export type PerformanceReply={reply:string;emotion:string;gesture:string;performance?:{intensity?:number;cues?:PerformanceCue[]}};
export interface PerformanceFrame {
 phase:DialoguePhase;expression:number;eyeOpen:number;mouthOpen:number;attention:number;
 gaze:{x:number;y:number};pose:Record<string,number>;gesture:GesturePose;progress:number;
}
export const performanceDemos:Record<string,{label:string;reply:PerformanceReply}>={
 happy:{label:'开心回应',reply:{reply:'这件事真让人高兴，一起击个掌吧！',emotion:'happy',gesture:'hand',performance:{intensity:.7,cues:[{at:0,emotion:'happy',gesture:'nod'},{at:.38,emotion:'happy',gesture:'hand'}]}}},
 shy:{label:'害羞回望',reply:{reply:'突然这样夸我，我也会有一点不好意思呀。',emotion:'shy',gesture:'tilt',performance:{intensity:.65,cues:[{at:0,emotion:'shy',gesture:'tilt'},{at:.67,emotion:'neutral',gesture:'none'}]}}},
 worried:{label:'认真倾听',reply:{reply:'嗯，我在听。先缓一缓，我们一起想想。',emotion:'worried',gesture:'nod',performance:{intensity:.48,cues:[{at:0,emotion:'worried',gesture:'nod'},{at:.6,emotion:'serious',gesture:'none'}]}}},
 playful:{label:'俏皮接话',reply:{reply:'欸，你以为我没发现呀？这次算你反应快。',emotion:'playful',gesture:'tilt',performance:{intensity:.6,cues:[{at:0,emotion:'playful',gesture:'tilt'},{at:.6,emotion:'confident',gesture:'nod'}]}}}
};
const emotions=new Set<Emotion>(['neutral','happy','shy','confident','worried','playful','serious']);
const gestures=new Set<DialogueGesture>(['none','nod','shake','tilt','wave','hand']);
const expressions:Record<Emotion,number>={neutral:0,happy:1,shy:2,confident:3,worried:4,playful:7,serious:9};
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
const ease=(a:number,b:number,x:number)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const pulse=(age:number,duration:number)=>age>=0&&age<duration?Math.sin(Math.PI*age/duration)**2:0;
const emotion=(value:string):Emotion=>emotions.has(value as Emotion)?value as Emotion:'neutral';
const gesture=(value:string):DialogueGesture=>value==='bow'?'nod':gestures.has(value as DialogueGesture)?value as DialogueGesture:'none';

/** Local direction and timing. The model supplies intent, never raw rig parameters. */
export class PerformanceDirector {
 private phase:DialoguePhase='idle';private age=0;private responseAge=0;private duration=4;
 private listening=false;private manualExpression=0;private displayExpression=0;
 private transition:{to:number;age:number}|null=null;private strength=.6;
 private cueAt=-1;private cueStarted=0;
 private cues:PerformanceCue[]=[];private lastReply:PerformanceReply|null=null;
 private smooth:Record<string,number>={};private attention=0;
 setPhase(phase:DialoguePhase){
  if(phase==='speaking'&&this.lastReply){this.respond(this.lastReply);this.phase='speaking';return;}
  if(phase===this.phase)return;this.phase=phase;this.age=0;
  if(phase==='speaking')this.responseAge=0;
  if(['thinking','interrupted','error'].includes(phase))this.cues=[];
  if(phase==='thinking')this.lastReply=null;
 }
 listen(active:boolean){this.listening=active;if(['idle','listening'].includes(this.phase))this.setPhase(active?'listening':'idle');}
 manual(index:number){this.manualExpression=Math.round(clamp(index,0,11));this.cues=[];this.lastReply=null;this.setPhase('idle');}
 cover(index:number){this.displayExpression=index;this.transition=null;}
 respond(reply:PerformanceReply){
  this.lastReply=reply;this.phase='replying';this.age=0;this.responseAge=0;this.cueAt=-1;
  this.duration=clamp(2.8+Array.from(reply.reply).length*.065,3.6,11);
  const n=reply.performance?.intensity;this.strength=typeof n==='number'&&Number.isFinite(n)?clamp(n,.25,.85):.6;
  this.cues=(reply.performance?.cues??[]).filter(c=>Number.isFinite(c.at)&&c.at>=0&&c.at<.9&&emotions.has(c.emotion)&&gestures.has(c.gesture)).slice(0,3).map(c=>({...c})).sort((a,b)=>a.at-b.at);
  if(!this.cues.length||this.cues[0].at>0)this.cues.unshift({at:0,emotion:emotion(reply.emotion),gesture:gesture(reply.gesture)});
  this.cues=this.cues.slice(0,3);
 }
 finishSpeech(){if(this.phase==='speaking'){this.phase='replying';this.responseAge=this.duration*.88;this.age=0;}}
 replay(){if(this.lastReply)this.respond(this.lastReply);this.setPhase('speaking');}
 update(dt:number,options:{blocked?:boolean;reduced?:boolean;speechProgress?:number|null}={}):PerformanceFrame{
  const seconds=clamp(Number.isFinite(dt)?dt:0,0,.1);this.age+=seconds;
  const replying=this.phase==='replying'||this.phase==='speaking';
  if(replying&&!options.blocked)this.responseAge+=seconds;
  if(this.phase==='replying'&&this.responseAge>=this.duration||['interrupted','error'].includes(this.phase)&&this.age>1.1)this.setPhase(this.listening?'listening':'idle');
  const progress=this.phase==='speaking'&&options.speechProgress!=null?clamp(options.speechProgress,0,1):clamp(this.responseAge/this.duration,0,1);
  let wanted=this.manualExpression,eyeOpen=1,mouthOpen=1,targetAttention=0,gazeX=0,gazeY=0;
  const p:Record<string,number>={yaw:0,pitch:0,roll:0,bodyYaw:0,bodyPitch:0,bodyRoll:0};
  let arm:GesturePose={};
  if(this.phase==='listening'){
   wanted=0;targetAttention=.85;mouthOpen=.2;
   p.pitch=.85*pulse(this.age,1.2);p.roll=.4*Math.sin(this.age*.9);p.bodyPitch=.18;
  }else if(this.phase==='thinking'||this.phase==='waiting'){
   wanted=this.phase==='thinking'?9:0;targetAttention=.8;mouthOpen=.15;
   const glance=this.phase==='thinking'?ease(.4,1,this.age)*(1-ease(2.3,3.8,this.age)):.25;
   gazeX=-.26*glance;gazeY=-.22*glance;p.yaw=-1.2*glance;p.roll=.8*glance;p.pitch=-.5*glance;
  }else if(this.phase==='interrupted'){
   wanted=0;targetAttention=1;mouthOpen=.1;p.pitch=1.1*pulse(this.age,.8);
  }else if(this.phase==='error'){
   wanted=this.age<.6?4:0;targetAttention=.7;mouthOpen=.15;p.roll=-.5*pulse(this.age,1.1);
  }else if(replying){
   targetAttention=.9;
   const cue=[...this.cues].reverse().find(c=>c.at<=progress)??{at:0,emotion:'neutral' as Emotion,gesture:'none' as DialogueGesture};
   if(this.cueAt!==cue.at){this.cueAt=cue.at;this.cueStarted=this.responseAge;}
   const local=this.responseAge-this.cueStarted,envelope=ease(0,.35,this.responseAge)*(1-ease(.82,1,progress));
   wanted=expressions[cue.emotion];
   // Hold expressive closed-eye artwork briefly, then make eye contact again.
   if(cue.emotion==='happy'&&local>1.2)wanted=0;
   if(cue.emotion==='playful'&&local>1.0)wanted=3;
   const a=this.strength*envelope;
   if(cue.emotion==='shy'){const away=ease(.15,.6,local)*(1-ease(1.6,3,local));gazeX=.42*away;gazeY=.28*away;p.yaw=2.3*away;p.pitch=1.1*a;p.roll=-1.25*a;p.bodyRoll=-.25*a;}
   else if(cue.emotion==='happy'){p.pitch=1.3*pulse(local,1.2)*a;p.roll=.9*a;p.bodyPitch=.25*a;}
   else if(cue.emotion==='confident'||cue.emotion==='playful'){p.roll=-1.4*a;p.pitch=-.7*a;gazeX=-.1*a;}
   else if(cue.emotion==='worried'){p.roll=1.1*a;p.pitch=.8*a;p.bodyPitch=.22*a;}
   else if(cue.emotion==='serious'){p.pitch=.5*a;p.bodyPitch=.2*a;}
   if(cue.gesture==='nod')p.pitch+=2.2*this.strength*pulse(local,1.1);
   if(cue.gesture==='shake')p.yaw+=1.8*this.strength*Math.sin(local*8)*pulse(local,1.5);
   if(cue.gesture==='tilt')p.roll+=1.7*this.strength*pulse(local,2.2);
   if(cue.gesture==='wave'||cue.gesture==='hand')arm=sampleGesture(cue.gesture,local,cue.gesture==='wave'?3.25:2.2,-1);
   if(progress>.9)wanted=this.manualExpression;
  }
  const blocked=!!options.blocked,reduced=!!options.reduced;
  if(blocked){targetAttention=0;for(const k of Object.keys(p))p[k]=0;arm={};}
  if(!blocked){
   if(this.transition){this.transition.age+=seconds;if(this.transition.age>=.095)this.displayExpression=this.transition.to;if(this.transition.age>=.24)this.transition=null;}
   if(!this.transition&&wanted!==this.displayExpression)this.transition={to:wanted,age:0};
   if(this.transition){const age=this.transition.age;eyeOpen=1-ease(0,.08,age)*(1-ease(.13,.24,age));}
  }
  this.attention+=(targetAttention-this.attention)*(1-Math.exp(-seconds*5));
  const factor=1-Math.exp(-seconds*7);
  for(const [key,target] of Object.entries({...p,gazeX,gazeY})){this.smooth[key]=(this.smooth[key]??0)+(target-(this.smooth[key]??0))*factor;}
  return {phase:this.phase,expression:this.displayExpression,eyeOpen:blocked?1:eyeOpen,mouthOpen,attention:this.attention,gaze:{x:this.smooth.gazeX,y:this.smooth.gazeY},pose:Object.fromEntries(Object.keys(p).map(k=>[k,reduced?0:this.smooth[k]])),gesture:reduced?{}:arm,progress};
 }
}
