import test from 'node:test';
import assert from 'node:assert/strict';
import {SpeechGate,encodeWav,audioBase64} from '../src/speech-gate.ts';
const frame=(amplitude=.08)=>Float32Array.from({length:320},(_,i)=>amplitude*Math.sin(i*Math.PI*2*180/16000));
test('continuous capture finds a complete turn, keeps pre-roll and bounds silence',()=>{
 const gate=new SpeechGate();let starts=0,audio;
 for(let i=0;i<12;i++)gate.process(frame(0));for(let i=0;i<40;i++){const e=gate.process(frame());if(e.started)starts++;}
 for(let i=0;i<50;i++){const e=gate.process(frame(0));if(e.audio)audio=e.audio;}
 assert.equal(starts,1);assert.ok(audio?.length>12000&&audio.length<22000);
 const wav=encodeWav(audio),view=new DataView(wav.buffer);assert.equal(new TextDecoder().decode(wav.subarray(0,4)),'RIFF');assert.equal(view.getUint32(24,true),16000);assert.equal(view.getUint32(40,true),audio.length*2);assert.equal(Buffer.from(audioBase64(wav),'base64').length,wav.length);
});
test('short noises and playback warmup do not create cloud speech requests',()=>{
 const gate=new SpeechGate();let starts=0,ends=0;
 for(let i=0;i<8;i++){const e=gate.process(frame(),{playing:true,playbackAge:.1});if(e.started)starts++;}
 for(let i=0;i<5;i++)gate.process(frame());for(let i=0;i<50;i++){const e=gate.process(frame(0));if(e.audio)ends++;}
 assert.equal(starts,0);assert.equal(ends,0);
 for(let i=0;i<30;i++){const e=gate.process(frame(),{playing:true,playbackAge:1});if(e.started)starts++;}assert.equal(starts,1);
});
test('long utterances are discarded without unbounded buffering and the next turn still works',()=>{
 const gate=new SpeechGate();let discarded=0,turns=0;
 for(let i=0;i<1000;i++)gate.process(frame());for(let i=0;i<50;i++){const e=gate.process(frame(0));if(e.discarded)discarded++;}
 for(let i=0;i<40;i++)gate.process(frame());for(let i=0;i<50;i++)if(gate.process(frame(0)).audio)turns++;
 assert.equal(discarded,1);assert.equal(turns,1);
});
