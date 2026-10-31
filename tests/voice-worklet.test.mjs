import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
test('capture worklet resamples native devices to bounded mono 16 kHz frames and emits silence',()=>{
 const source=fs.readFileSync(new URL('../src/voice-capture.worklet.js',import.meta.url),'utf8');
 for(const sampleRate of [44100,48000]){
  let Capture;const messages=[];
  class Processor{port={postMessage:frame=>messages.push(frame.slice())};}
  vm.runInNewContext(source,{AudioWorkletProcessor:Processor,sampleRate,Float32Array,registerProcessor(name,constructor){assert.equal(name,'sora-capture');Capture=constructor;}});
  const capture=new Capture(),output=new Float32Array(128);let samples=0;
  for(let n=0;n<100;n++){const input=Float32Array.from({length:128},(_,i)=>.1*Math.sin((samples+i)*180*Math.PI*2/sampleRate));samples+=128;output.fill(1);assert.equal(capture.process([[input]],[[output]]),true);assert.ok(output.every(v=>v===0));}
  assert.equal(messages.length,Math.floor(Math.floor(samples*16000/sampleRate)/320));assert.ok(messages.every(m=>m.length===320&&m.every(Number.isFinite)));
 }
});
