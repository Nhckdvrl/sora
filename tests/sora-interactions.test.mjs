import test from 'node:test';
import assert from 'node:assert/strict';
import {reactions,reactionAt,faceReactionPose} from '../src/sora-reactions.ts';

test('jacket, waist and mouth use the original shy expression',()=>{
 for(const id of ['chest','waist','mouth'])assert.equal(reactions.find(r=>r.id===id).expression,2,id);
});
test('a touch on the lips takes precedence over the larger cheek region',()=>{
 assert.equal(reactionAt({x:674,y:358},'face-02-mouth'),'mouth');
 assert.equal(reactionAt({x:707,y:343}),'cheek');
 assert.equal(reactionAt({x:673,y:326}),'nose');
});
test('mouth reaction gently closes both eyes, holds, reopens, and releases control',()=>{
 const start=faceReactionPose('mouth',0,2.2),closing=faceReactionPose('mouth',.08,2.2),hold=faceReactionPose('mouth',.7,2.2),opening=faceReactionPose('mouth',2.1,2.2);
 assert.equal(start.ParamEyeLOpen,1);
 assert.ok(closing.ParamEyeLOpen>0&&closing.ParamEyeLOpen<1);
 assert.deepEqual(hold,{ParamEyeLOpen:0,ParamEyeROpen:0,ParamMouthOpen:0});
 assert.ok(opening.ParamEyeROpen>0&&opening.ParamEyeROpen<1);
 assert.deepEqual(faceReactionPose('mouth',2.2,2.2),{});
 assert.deepEqual(faceReactionPose('waist',.7,2.6),{});
});
