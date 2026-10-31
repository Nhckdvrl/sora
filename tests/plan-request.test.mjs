import test from 'node:test';
import assert from 'node:assert/strict';
import {requestPlan,waitForRetry} from '../src/plan-request.ts';
const url='https://sora.test/api/chat';
const busy=()=>Response.json({error:'model_busy',message:'模型并发已满',retryable:true,retryAfter:3},{status:429});

test('temporary model contention retries the same chat with bounded backoff',async()=>{
 let calls=0;const delays=[],notices=[],bodies=[];
 const response=await requestPlan(url,{message:'你好'},{signal:new AbortController().signal,onRetry:n=>notices.push(n),wait:async ms=>{delays.push(ms);},fetchImpl:async(u,init)=>{assert.equal(u,url);bodies.push(init.body);return ++calls<3?busy():Response.json({reply:'你好呀'});}});
 assert.equal((await response.json()).reply,'你好呀');assert.equal(calls,3);assert.deepEqual(delays,[3000,6000]);assert.equal(new Set(bodies).size,1);assert.equal(notices.length,2);
});
test('persistent contention stops after three retries and a long provider delay stops immediately',async()=>{
 let calls=0;const delays=[];
 await assert.rejects(requestPlan(url,{}, {signal:new AbortController().signal,onRetry(){},wait:async ms=>{delays.push(ms);},fetchImpl:async()=>{calls++;return busy();}}),/模型并发已满/);
 assert.equal(calls,4);assert.deepEqual(delays,[3000,6000,12000]);
 calls=0;await assert.rejects(requestPlan(url,{}, {signal:new AbortController().signal,onRetry(){},wait:async()=>assert.fail('must not wait'),fetchImpl:async()=>{calls++;return Response.json({error:'model_busy',message:'稍后再试',retryable:true,retryAfter:60},{status:429});}}));assert.equal(calls,1);
});
test('balance, visitor, auth, transport, and one-use speech failures never auto-retry',async()=>{
 const cases=[[402,'plan_quota_unavailable',url],[429,'visitor_limit',url],[401,'auth_error',url],[429,'model_busy','https://sora.test/api/speech']];
 for(const [status,error,target] of cases){let calls=0;await assert.rejects(requestPlan(target,{}, {signal:new AbortController().signal,onRetry(){},fetchImpl:async()=>{calls++;return Response.json({error,message:'停止',retryable:true,retryAfter:3},{status});}}));assert.equal(calls,1);}
 let calls=0;await assert.rejects(requestPlan(url,{}, {signal:new AbortController().signal,onRetry(){},fetchImpl:async()=>{calls++;throw Error('network');}}),/network/);assert.equal(calls,1);
});
test('interrupting the backoff cancels the timer and sends no further request',async()=>{
 const controller=new AbortController();let calls=0;
 const pending=requestPlan(url,{}, {signal:controller.signal,onRetry(){controller.abort();},wait:waitForRetry,fetchImpl:async()=>{calls++;return busy();}});
 await assert.rejects(pending,{name:'AbortError'});assert.equal(calls,1);
 const delayed=new AbortController(),timer=waitForRetry(10000,delayed.signal);delayed.abort();await assert.rejects(timer,{name:'AbortError'});
});
