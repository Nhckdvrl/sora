export type SpeechEvent={level:number;started?:boolean;audio?:Float32Array;discarded?:boolean};
/** Bounded local VAD. Audio leaves the browser only after a complete speech turn. */
export class SpeechGate {
 private noise=.003;private candidate=0;private silence=0;private voiced=0;private active=false;
 private frames:Float32Array[]=[];private pre:Float32Array[]=[];private samples=0;private overflow=false;
 reset(){this.candidate=0;this.silence=0;this.voiced=0;this.active=false;this.frames=[];this.pre=[];this.samples=0;this.overflow=false;}
 process(frame:Float32Array,options:{playing?:boolean;playbackAge?:number}={}):SpeechEvent{
  const dt=frame.length/16000;let sum=0,crossings=0;
  for(let i=0;i<frame.length;i++){sum+=frame[i]*frame[i];if(i&&frame[i]*frame[i-1]<0)crossings++;}
  const rms=Math.sqrt(sum/Math.max(1,frame.length)),threshold=Math.max(.012,this.noise*3.2);
  const warmup=options.playing&&(options.playbackAge??1)<.22;
  const speech=!warmup&&rms>threshold&&crossings/Math.max(1,frame.length)<.42;
  const result:SpeechEvent={level:Math.min(1,rms*6)};
  if(!this.active){
   if(rms<threshold)this.noise=this.noise*.98+Math.min(.02,rms)*.02;
   this.pre.push(frame.slice());while(this.pre.reduce((n,x)=>n+x.length,0)>4800)this.pre.shift();
   this.candidate=speech?this.candidate+dt:Math.max(0,this.candidate-dt*2);
   if(this.candidate>=(options.playing ? .28 : .16)){
    this.active=true;this.frames=this.pre;this.pre=[];this.samples=this.frames.reduce((n,x)=>n+x.length,0);this.voiced=this.candidate;this.silence=0;result.started=true;
   }
  }else{
   if(!this.overflow){this.frames.push(frame.slice());this.samples+=frame.length;if(this.samples>288000){this.overflow=true;this.frames=[];}}
   if(speech){this.voiced+=dt;this.silence=0;}else this.silence+=dt;
   if(this.silence>=.8){
    if(this.overflow)result.discarded=true;
    else if(this.voiced>=.35){const tail=Math.max(0,Math.round((this.silence-.18)*16000)),audio=new Float32Array(Math.max(0,this.samples-tail));let offset=0;for(const part of this.frames){const length=Math.min(part.length,audio.length-offset);if(length<=0)break;audio.set(part.subarray(0,length),offset);offset+=length;}result.audio=audio;}
    this.reset();
   }
  }
  return result;
 }
}
export function encodeWav(samples:Float32Array):Uint8Array{
 const buffer=new ArrayBuffer(44+samples.length*2),v=new DataView(buffer);
 const tag=(offset:number,value:string)=>{for(let i=0;i<value.length;i++)v.setUint8(offset+i,value.charCodeAt(i));};
 tag(0,'RIFF');v.setUint32(4,36+samples.length*2,true);tag(8,'WAVE');tag(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);tag(36,'data');v.setUint32(40,samples.length*2,true);
 for(let i=0;i<samples.length;i++){const value=Math.max(-1,Math.min(1,samples[i]));v.setInt16(44+i*2,value<0?value*32768:value*32767,true);}return new Uint8Array(buffer);
}
export function audioBase64(bytes:Uint8Array):string{
 let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);
}
