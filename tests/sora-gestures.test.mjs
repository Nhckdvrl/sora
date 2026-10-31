import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleGesture,advanceGesture,gestureLimits} from '../src/sora-gestures.ts';

test('wave articulates elbow and wrist in both directions before returning',()=>{
 const poses=Array.from({length:180},(_,i)=>sampleGesture('wave',i/60,3.25,-1));
 assert.ok(poses.some(p=>p.ParamArmLWrist>10));
 assert.ok(poses.some(p=>p.ParamArmLWrist<-10));
 assert.ok(poses.some(p=>p.ParamArmLElbow>7));
 assert.ok(poses.some(p=>p.ParamArmLShoulder<-4));
 assert.ok(Object.values(sampleGesture('wave',3.25,3.25,-1)).every(n=>n===0));
});
test('high five anticipates, reaches with the selected arm and recovers',()=>{
 assert.ok(sampleGesture('hand',.11,2.2,-1).ParamArmLShoulder>0);
 const contact=sampleGesture('hand',.7,2.2,-1);
 assert.ok(contact.ParamPalmReach>.95&&contact.ParamArmLElbow<-7);
 const other=sampleGesture('hand',.7,2.2,1);
 assert.ok(other.ParamArmRShoulder<-8&&other.ParamArmRWrist>6);
 assert.equal(other.ParamArmLShoulder,0);
 assert.ok(Object.values(sampleGesture('hand',2.2,2.2,-1)).every(n=>n===0));
});
test('cancelled gestures glide back without snapping and settle',()=>{
 const pose={},velocity={};
 for(let i=0;i<60;i++)advanceGesture(pose,velocity,sampleGesture('hand',.7,2.2,-1),1/60);
 const old=pose.ParamArmLShoulder;
 advanceGesture(pose,velocity,{},1/60);
 assert.ok(Math.abs(pose.ParamArmLShoulder-old)<1);
 assert.ok(Math.abs(pose.ParamArmLShoulder)>5);
 for(let i=0;i<180;i++)advanceGesture(pose,velocity,{},1/60);
 assert.ok(Object.values(pose).every(n=>Math.abs(n)<1e-7));
});
test('jacket and waist reactions change cloth and balance in the intended directions',()=>{
 const jacket=sampleGesture('chest',.5,2.3,1);
 assert.ok(jacket.ParamJacketTouch>.5&&jacket.ParamArmRElbow>0);
 const l=sampleGesture('waist',.5,2.6,-1),r=sampleGesture('waist',.5,2.6,1);
 assert.ok(l.ParamWaistTouch>0&&r.ParamWaistTouch<0);
 assert.ok(l.ParamArmRShoulder<0&&r.ParamArmRElbow>0);
});
test('rapid retargeting and long frames keep every driven parameter finite and bounded',()=>{
 const pose={},velocity={},kinds=['wave','hand','chest','waist','sleeve',null];
 for(let i=0;i<900;i++){
  const target=sampleGesture(kinds[Math.floor(i/5)%kinds.length],(i%150)/60,3.25,i%2?1:-1);
  advanceGesture(pose,velocity,target,i%90===0?.8:1/60);
  for(const [id,[lo,hi]] of Object.entries(gestureLimits))assert.ok(Number.isFinite(pose[id])&&pose[id]>=lo&&pose[id]<=hi,id);
 }
});
