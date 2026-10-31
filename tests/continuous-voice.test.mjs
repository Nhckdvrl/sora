import test from 'node:test';
import assert from 'node:assert/strict';
import {ContinuousVoice} from '../src/continuous-voice.ts';
const speech=()=>Float32Array.from({length:320},(_,i)=>.08*Math.sin(i*Math.PI*2*180/16000));

test('continuous listening survives playback and stale ASR cannot replace a newer utterance',async t=>{
 const original={navigator:Object.getOwnPropertyDescriptor(globalThis,'navigator'),window:globalThis.window,AudioContext:globalThis.AudioContext,AudioWorkletNode:globalThis.AudioWorkletNode};
 const nodes=[],tracks=[];let closed=0,playing=false,interruptions=0;
 class Node{connect(next){return next;}disconnect(){}}
 class Worklet extends Node{port={onmessage:null};constructor(){super();nodes.push(this);}}
 class Context{audioWorklet={addModule:async()=>{}};destination={};createMediaStreamSource(){return new Node();}createGain(){const n=new Node();n.gain={value:1};return n;}async resume(){}async close(){closed++;}}
 const track={stopped:false,stop(){this.stopped=true;},addEventListener(){}};tracks.push(track);
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async constraints=>{assert.equal(constraints.audio.echoCancellation,true);return {getTracks:()=>tracks};}}}});
 globalThis.window={AudioWorkletNode:Worklet};globalThis.AudioWorkletNode=Worklet;globalThis.AudioContext=Context;
 t.after(()=>{if(original.navigator)Object.defineProperty(globalThis,'navigator',original.navigator);else delete globalThis.navigator;globalThis.window=original.window;globalThis.AudioContext=original.AudioContext;globalThis.AudioWorkletNode=original.AudioWorkletNode;});
 const requests=[],received=[];
 const voice=new ContinuousVoice({speechStarted(){interruptions++;},transcribed:text=>received.push(text),status(){},level(){},playing:()=>({active:playing,age:1}),recognize:(audio,signal)=>new Promise(resolve=>requests.push({audio,signal,resolve}))});
 await voice.start();assert.equal(voice.active,true);
 const utterance=()=>{for(let i=0;i<40;i++)nodes[0].port.onmessage({data:speech()});for(let i=0;i<50;i++)nodes[0].port.onmessage({data:new Float32Array(320)});};
 utterance();assert.equal(requests.length,1);playing=true;utterance();assert.equal(requests.length,2);assert.equal(requests[0].signal.aborted,true);assert.equal(track.stopped,false);assert.equal(interruptions,2);
 requests[1].resolve('新的一句');await Promise.resolve();await Promise.resolve();requests[0].resolve('过时的一句');await Promise.resolve();await Promise.resolve();assert.deepEqual(received,['新的一句']);
 voice.stop();assert.equal(voice.active,false);assert.equal(track.stopped,true);assert.equal(closed,1);
});

test('permission resolving after stop closes the late stream instead of activating the microphone',async t=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'navigator'),oldWindow=globalThis.window;
 let grant,stopped=false;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:()=>new Promise(resolve=>{grant=resolve;})}}});globalThis.window={AudioWorkletNode:class{}};
 t.after(()=>{if(original)Object.defineProperty(globalThis,'navigator',original);else delete globalThis.navigator;globalThis.window=oldWindow;});
 const voice=new ContinuousVoice({speechStarted(){},transcribed(){},status(){},level(){},playing:()=>({active:false,age:0}),recognize:async()=>''});
 const pending=voice.start();voice.stop();grant({getTracks:()=>[{stop(){stopped=true;}}]});await pending;assert.equal(stopped,true);assert.equal(voice.active,false);
});
