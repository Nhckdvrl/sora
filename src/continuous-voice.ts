import {SpeechGate,encodeWav,audioBase64} from './speech-gate.ts';
type VoiceCallbacks={speechStarted():void;transcribed(text:string):void;status(text:string):void;level(value:number):void;playing():{active:boolean;age:number};recognize(audio:string,signal:AbortSignal):Promise<string>};
export class ContinuousVoice {
 private context:AudioContext|null=null;private stream:MediaStream|null=null;private capture:AudioWorkletNode|null=null;
 private source:MediaStreamAudioSourceNode|null=null;private silent:GainNode|null=null;private gate=new SpeechGate();
 private generation=0;private pending:AbortController|null=null;private connecting=false;
 private callbacks:VoiceCallbacks;
 constructor(callbacks:VoiceCallbacks){this.callbacks=callbacks;}
 get active(){return !!this.stream||this.connecting;}
 cancelPending(){this.generation++;this.pending?.abort();this.pending=null;}
 async start(){
  if(this.active)return;this.connecting=true;const generation=++this.generation;this.callbacks.status('正在连接麦克风…');
  let stream:MediaStream|null=null,context:AudioContext|null=null;
  try{
   if(!navigator.mediaDevices?.getUserMedia||!window.AudioWorkletNode)throw Error('unsupported');
   stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1},video:false});
   if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}
   context=new AudioContext({latencyHint:'interactive'});await context.audioWorklet.addModule(new URL('./voice-capture.worklet.js?no-inline',import.meta.url));
   if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());await context.close();return;}
   this.stream=stream;this.context=context;this.source=context.createMediaStreamSource(stream);
   this.capture=new AudioWorkletNode(context,'sora-capture',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]});
   this.silent=context.createGain();this.silent.gain.value=0;this.source.connect(this.capture).connect(this.silent).connect(context.destination);
   this.capture.port.onmessage=event=>{
    if(!(event.data instanceof Float32Array)||!this.stream)return;
    const playing=this.callbacks.playing(),result=this.gate.process(event.data,{playing:playing.active,playbackAge:playing.age});this.callbacks.level(result.level);
    if(result.started){this.cancelPending();this.callbacks.speechStarted();this.callbacks.status('在听你说…');}
    if(result.discarded)this.callbacks.status('这句有点长，请分成短句说。');
    if(result.audio)void this.transcribe(result.audio);
   };
   for(const track of stream.getTracks())track.addEventListener('ended',()=>{if(this.stream===stream){this.stop();this.callbacks.status('麦克风已断开');}},{once:true});
   this.connecting=false;await context.resume();this.callbacks.status('语音已连接 · 开口可打断');
  }catch(error){
   stream?.getTracks().forEach(t=>t.stop());if(context&&context!==this.context)await context.close().catch(()=>{});if(generation!==this.generation)return;this.stop();
   const name=error instanceof Error?error.name:'';this.callbacks.status(name==='NotAllowedError'?'麦克风未获授权，可以继续文字聊天。':name==='NotFoundError'?'没有找到麦克风，可以继续文字聊天。':'麦克风暂不可用，可以继续文字聊天。');
  }finally{if(generation===this.generation)this.connecting=false;}
 }
 private async transcribe(samples:Float32Array){
  this.cancelPending();const generation=this.generation,controller=new AbortController();this.pending=controller;this.callbacks.status('正在听清这句话…');
  try{
   const text=await this.callbacks.recognize(audioBase64(encodeWav(samples)),controller.signal);
   if(generation!==this.generation||!this.stream)return;
   if(text.trim().replace(/[\s。，！？,.!?]/g,'').length){this.callbacks.transcribed(text.trim());this.callbacks.status('语音已连接 · 开口可打断');}
   else this.callbacks.status('刚才没听清，继续说就好。');
  }catch(error){if(generation===this.generation&&this.stream)this.callbacks.status(error instanceof Error?error.message:'语音识别暂不可用，请稍后再说。');}
  finally{if(generation===this.generation)this.pending=null;}
 }
 stop(){
  this.cancelPending();this.connecting=false;const stream=this.stream;this.stream=null;
  stream?.getTracks().forEach(t=>t.stop());if(this.capture)this.capture.port.onmessage=null;
  this.source?.disconnect();this.capture?.disconnect();this.silent?.disconnect();void this.context?.close().catch(()=>{});
  this.context=null;this.source=null;this.capture=null;this.silent=null;this.gate.reset();this.callbacks.level(0);
 }
}
