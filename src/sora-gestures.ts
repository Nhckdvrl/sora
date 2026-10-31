export type GesturePose=Record<string,number>;
export const gestureLimits:Record<string,[number,number]>={
 ParamArmLShoulder:[-10,10],ParamArmLElbow:[-12,12],ParamArmLWrist:[-18,18],
 ParamArmRShoulder:[-12,12],ParamArmRElbow:[-10,10],ParamArmRWrist:[-12,12],
 ParamPalmReach:[0,1],ParamJacketTouch:[0,1],ParamWaistTouch:[-1,1]
};
const smooth=(a:number,b:number,t:number)=>{const s=Math.max(0,Math.min(1,(t-a)/(b-a)));return s*s*(3-2*s);};

/** Anticipation, contact/oscillation, then a deliberately longer recovery. */
export function sampleGesture(kind:string|null,age:number,duration:number,side:number):GesturePose{
 const p:GesturePose=Object.fromEntries(Object.keys(gestureLimits).map(k=>[k,0]));
 if(!kind||age<0||age>=duration)return p;
 const envelope=smooth(0,.24,age)*(1-smooth(Math.max(.3,duration-.75),duration,age));
 if(kind==='wave'){
  p.ParamArmLShoulder=envelope*(-3+4*Math.sin(age*7));
  p.ParamArmLElbow=envelope*(6+4*Math.sin(age*7+.4));
  p.ParamArmLWrist=envelope*16*Math.sin(age*9);
  p.ParamArmRShoulder=-envelope*2;
 }else if(kind==='hand'){
  const reach=smooth(.12,.42,age)*(1-smooth(duration-.85,duration-.05,age));
  const prepare=smooth(0,.12,age)*(1-smooth(.12,.3,age));
  if(side<0){p.ParamArmLShoulder=-9*reach+2*prepare;p.ParamArmLElbow=-9*reach;p.ParamArmLWrist=7*reach;p.ParamPalmReach=reach;}
  else{p.ParamArmRShoulder=-10*reach;p.ParamArmRElbow=7*reach;p.ParamArmRWrist=9*reach;}
 }else if(kind==='chest'){
  p.ParamJacketTouch=envelope*(.8+.2*Math.exp(-(((age-.3)/.2)**2)));
  p.ParamWaistTouch=-.22*side*envelope;
  p.ParamArmRShoulder=-4*envelope;p.ParamArmRElbow=5*envelope;p.ParamArmRWrist=4*envelope;
 }else if(kind==='waist'){
  p.ParamWaistTouch=-side*.8*envelope;p.ParamArmRShoulder=-8*envelope;
  p.ParamArmRElbow=7*envelope;p.ParamArmRWrist=5*envelope;p.ParamArmLShoulder=2*envelope;
 }else if(kind==='sleeve'||kind==='shoulder'){
  p.ParamArmRShoulder=(kind==='sleeve'?-6:-3)*envelope;
  p.ParamArmRElbow=5*envelope;p.ParamArmRWrist=3*envelope;
 }
 return p;
}

/** Exact critically damped spring: retargeting/cancellation never resets pose. */
export function advanceGesture(pose:GesturePose,velocity:GesturePose,target:GesturePose,dt:number):GesturePose{
 const seconds=Math.max(0,Math.min(.1,dt));
 for(const [id,[lo,hi]] of Object.entries(gestureLimits)){
  const to=Math.max(lo,Math.min(hi,target[id]??0)),x=pose[id]??0,v=velocity[id]??0;
  const omega=id.includes('Touch')?12:19,decay=Math.exp(-omega*seconds),delta=x-to,temp=(v+omega*delta)*seconds;
  pose[id]=Math.max(lo,Math.min(hi,to+(delta+temp)*decay));
  velocity[id]=(v-omega*temp)*decay;
 }
 return pose;
}
