import test from 'node:test';
import assert from 'node:assert/strict';
import {PerformanceDirector,performanceDemos} from '../src/performance.ts';
const advance=(director,seconds,options={})=>Array.from({length:Math.ceil(seconds*60)},()=>director.update(1/60,options));

test('listening makes eye contact, keeps the mouth quiet and returns to the chosen expression',()=>{
 const d=new PerformanceDirector();d.manual(3);advance(d,.4);d.listen(true);
 const frame=advance(d,1).at(-1);assert.equal(frame.phase,'listening');assert.ok(frame.attention>.8);assert.ok(frame.mouthOpen<.3);
 d.listen(false);const idle=advance(d,2).at(-1);assert.equal(idle.expression,3);assert.equal(idle.phase,'idle');assert.ok(idle.attention<.01);
});
test('artwork switches only under a blink and a reply settles rather than freezing a face',()=>{
 const d=new PerformanceDirector();d.respond(performanceDemos.happy.reply);const frames=advance(d,9);
 let changed=0;for(let i=1;i<frames.length;i++)if(frames[i].expression!==frames[i-1].expression){changed++;assert.ok(frames[i].eyeOpen<.25);}
 assert.ok(changed>=2);assert.ok(frames.every(f=>Number.isInteger(f.expression)));assert.equal(frames.at(-1).phase,'idle');assert.equal(frames.at(-1).expression,0);
});
test('a shy reply looks aside, returns gaze, and touch keeps priority over automatic acting',()=>{
 const d=new PerformanceDirector();d.respond(performanceDemos.shy.reply);const shy=advance(d,3);
 assert.ok(shy.some(f=>f.gaze.x>.2));assert.ok(shy.at(-1).gaze.x<.15);
 d.cover(2);d.setPhase('thinking');const covered=advance(d,1,{blocked:true});assert.ok(covered.every(f=>f.expression===2&&f.eyeOpen===1&&Object.keys(f.gesture).length===0));
 assert.equal(advance(d,.5).at(-1).expression,9);
});
test('speech cues use actual audio progress and interruptions remove old actions',()=>{
 const d=new PerformanceDirector();d.respond({reply:'先打招呼，然后认真听你说。',emotion:'happy',gesture:'wave',performance:{cues:[{at:0,emotion:'happy',gesture:'wave'},{at:.5,emotion:'serious',gesture:'nod'}]}});d.setPhase('speaking');
 const first=advance(d,.8,{speechProgress:.1});assert.ok(first.some(f=>Math.abs(f.gesture.ParamArmLWrist??0)>5));
 const second=advance(d,.4,{speechProgress:.65});assert.equal(second.at(-1).expression,9);
 d.setPhase('interrupted');const after=advance(d,1.5);assert.ok(after.every(f=>!Object.keys(f.gesture).length));assert.equal(after.at(-1).phase,'idle');
});
test('reduced motion and rapid phase changes keep output bounded and finite',()=>{
 const d=new PerformanceDirector();for(const demo of Object.values(performanceDemos)){
  d.respond(demo.reply);for(const frame of advance(d,2,{reduced:true})){assert.ok(Object.values(frame.pose).every(n=>n===0));assert.deepEqual(frame.gesture,{});assert.ok(frame.eyeOpen>=0&&frame.eyeOpen<=1);}
  d.setPhase('interrupted');d.setPhase('thinking');d.setPhase('waiting');d.manual(0);
 }
 const frame=d.update(Number.NaN);assert.ok(Object.values(frame.pose).every(Number.isFinite));assert.ok(Number.isFinite(frame.attention));
});
