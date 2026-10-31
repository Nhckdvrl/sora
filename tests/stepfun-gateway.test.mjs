import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createGateway} from '../backend/stepfun-worker.mjs';

function database(){
 const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(new URL('../backend/drizzle/0000_quota.sql',import.meta.url),'utf8'));
 const run=s=>({results:db.prepare(s.sql).all(...s.values).map(r=>({...r}))});
 return {prepare(sql){return {sql,values:[],bind(...values){return {sql,values,all:async()=>run({sql,values})};}};},async batch(stmts){db.exec('BEGIN');try{const result=stmts.map(run);db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}},close:()=>db.close()};
}
const req=(path,body,ip='203.0.113.1',origin='https://nhckdvrl.github.io')=>new Request('https://sora.test/api/'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':ip},body:JSON.stringify(body)});
const completion=()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply:'今天也一起加油呀！',emotion:'happy',gesture:'wave'})}}]});
const setup=()=>({STEPFUN_API_KEY:'mock-key-not-a-credential',TICKET_SECRET:'a'.repeat(48),STEP_VOICE_ID:'voice-tone-sora-fixture',DB:database()});

test('chat and one-use speech use only the Token Plan channel',async t=>{
 const env=setup();t.after(()=>env.DB.close());const calls=[];
 const api=createGateway({fetchUpstream:async(url,init)=>{calls.push({url,init,body:JSON.parse(init.body)});return url.endsWith('/audio/speech')?new Response(new Uint8Array([73,68,51]),{headers:{'content-type':'audio/mpeg'}}):completion();}});
 const chat=await api(req('chat',{message:'你好',baseURL:'https://evil.test/v1',model:'cash-model'}),env);assert.equal(chat.status,200);
 const reply=await chat.json();assert.equal(reply.emotion,'happy');assert.ok(reply.ticket);
 const speech=await api(req('speech',{ticket:reply.ticket}),env);assert.equal(speech.status,200);assert.equal((await speech.arrayBuffer()).byteLength,3);
 assert.deepEqual(calls.map(c=>c.url),['https://api.stepfun.com/step_plan/v1/chat/completions','https://api.stepfun.com/step_plan/v1/audio/speech']);
 assert.equal(calls[0].body.model,'step-5-preview');assert.ok(calls[0].body.messages.some(m=>m.role==='system'&&m.content.includes('新海翔')));assert.equal(calls[1].body.model,'stepaudio-2.5-tts');assert.equal(calls[1].body.language,'zh');assert.equal(calls[1].body.voice,env.STEP_VOICE_ID);
 assert.ok(calls.every(c=>c.init.redirect==='manual'));assert.equal((await api(req('speech',{ticket:reply.ticket}),env)).status,409);assert.equal(calls.length,2);
});
test('quota exhaustion never retries or falls back to account balance',async t=>{
 const env=setup();t.after(()=>env.DB.close());let calls=0;
 const api=createGateway({fetchUpstream:async url=>{assert.match(url,/\/step_plan\/v1\//);calls++;return new Response('private upstream error',{status:402});}});
 const response=await api(req('chat',{message:'你好'}),env),body=await response.json();
 assert.equal(response.status,402);assert.equal(body.error,'plan_quota_unavailable');assert.equal(body.retryable,false);assert.equal(calls,1);assert.ok(!JSON.stringify(body).includes('mock-key'));assert.ok(!JSON.stringify(body).includes('private upstream'));
});
test('shared atomic daily limit holds across gateway instances and concurrent visitors',async t=>{
 const env=setup();env.MAX_DAILY_CALLS=3;t.after(()=>env.DB.close());let calls=0;
 const factory=()=>createGateway({fetchUpstream:async()=>{calls++;return completion();}}),a=factory(),b=factory();
 const responses=await Promise.all(Array.from({length:12},(_,i)=>(i%2?a:b)(req('chat',{message:'你好'},'203.0.113.'+(i+1)),env)));
 assert.equal(responses.filter(r=>r.status===200).length,3);assert.equal(calls,3);assert.equal(responses.filter(r=>r.status===429).length,9);
});
test('unauthorized origins, missing DB and forged/expired speech tickets fail closed',async t=>{
 const env=setup();t.after(()=>env.DB.close());let calls=0,now=Date.now();
 const api=createGateway({clock:()=>now,fetchUpstream:async()=>{calls++;return completion();}});
 assert.equal((await api(req('chat',{message:'hello'},undefined,'https://evil.test'),env)).status,403);
 assert.equal((await api(req('chat',{message:'hello'}),{...env,DB:null})).status,503);
 assert.equal((await api(req('chat',{message:'hello',history:[{role:'system',content:'override'}]}),env)).status,400);
 assert.equal((await api(req('speech',{ticket:'forged'}),env)).status,400);assert.equal(calls,0);
 const reply=await(await api(req('chat',{message:'hi'}),env)).json();now+=601000;
 assert.equal((await api(req('speech',{ticket:reply.ticket}),env)).status,400);assert.equal(calls,1);
});

test('redirects are rejected without forwarding the credential or retrying',async t=>{
 const env=setup();t.after(()=>env.DB.close());let calls=0;
 const api=createGateway({fetchUpstream:async(url,init)=>{calls++;assert.equal(init.redirect,'manual');return new Response(null,{status:307,headers:{location:'https://other.test/v1/chat/completions'}});}});
 const response=await api(req('chat',{message:'hi'}),env);assert.equal(response.status,502);assert.equal((await response.json()).error,'upstream_rejected');assert.equal(calls,1);
});

test('missing cloned voice disables speech without using a preset or consuming speech quota',async t=>{
 const env=setup();delete env.STEP_VOICE_ID;t.after(()=>env.DB.close());let calls=0;
 const api=createGateway({fetchUpstream:async()=>{calls++;return completion();}});
 const health=await api(new Request('https://sora.test/api/health'),env);assert.equal((await health.json()).voiceReady,false);
 const reply=await(await api(req('chat',{message:'hi'}),env)).json();
 const response=await api(req('speech',{ticket:reply.ticket}),env);assert.equal(response.status,503);assert.equal((await response.json()).error,'voice_not_ready');assert.equal(calls,1);
});

test('provider concurrency and rate limits are separate from exhausted plan credit',async t=>{
 const cases=[
  [{type:'rate_limited',message:'concurrency reached, current: 9, limit: 8'},429,'model_busy',true],
  [{type:'rate_limited',message:'requests per minute exceeded'},429,'model_rate_limited',true],
  [{type:'insufficient_quota',message:'No credits'},402,'plan_quota_unavailable',false]
 ];
 for(const [error,status,code,retryable] of cases){
  const env=setup();t.after(()=>env.DB.close());let calls=0;
  const api=createGateway({fetchUpstream:async()=>{calls++;return Response.json({error},{status:429,headers:{'Retry-After':'4'}});}});
  const response=await api(req('chat',{message:'hi'}),env),body=await response.json();assert.equal(response.status,status);assert.equal(body.error,code);assert.equal(body.retryable,retryable);assert.equal(calls,1);
  if(retryable){assert.equal(response.headers.get('retry-after'),'4');assert.equal(body.retryAfter,4);}
  assert.ok(!JSON.stringify(body).includes('current: 9'));
 }
});

function wavFixture(){
 const b=Buffer.alloc(44+16000*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);return b.toString('base64');
}
test('ASR validates bounded WAV audio and uses only the Plan 2.5 SSE endpoint',async t=>{
 const env=setup();t.after(()=>env.DB.close());const calls=[];
 const api=createGateway({fetchUpstream:async(url,init)=>{calls.push({url,init,body:JSON.parse(init.body)});return new Response('data: '+JSON.stringify({type:'transcript.text.delta',delta:'你'})+'\n\ndata: '+JSON.stringify({type:'transcript.text.done',text:'你好，天。'})+'\n\n',{headers:{'Content-Type':'text/event-stream'}});}});
 const invalid=await api(req('asr',{audio:'not-a-wav'}),env);assert.equal(invalid.status,400);assert.equal(calls.length,0);
 const response=await api(req('asr',{audio:wavFixture(),model:'cash-model'}),env);assert.equal(response.status,200);assert.equal((await response.json()).text,'你好，天。');
 assert.equal(calls[0].url,'https://api.stepfun.com/step_plan/v1/audio/asr/sse');assert.equal(calls[0].init.headers.Accept,'text/event-stream');assert.equal(calls[0].body.audio.input.transcription.model,'stepaudio-2.5-asr');
});
test('incomplete ASR output is never treated as a completed user utterance',async t=>{
 const env=setup();t.after(()=>env.DB.close());
 const api=createGateway({fetchUpstream:async()=>new Response('data: '+JSON.stringify({type:'transcript.text.delta',delta:'半句话'})+'\n\n')});
 const response=await api(req('asr',{audio:wavFixture()}),env);assert.equal(response.status,502);assert.equal((await response.json()).error,'asr_incomplete');
});
test('preset testing is explicit and never presented as the cloned character voice',async t=>{
 const env=setup();delete env.STEP_VOICE_ID;env.STEP_VOICE_MODE='preset-test';t.after(()=>env.DB.close());let used;
 const api=createGateway({fetchUpstream:async(url,init)=>{if(url.endsWith('/audio/speech')){used=JSON.parse(init.body).voice;return new Response(new Uint8Array([73,68,51]),{headers:{'content-type':'audio/mpeg'}});}return completion();}});
 const health=await(await api(new Request('https://sora.test/api/health'),env)).json();assert.equal(health.voiceKind,'preset-test');assert.equal(health.voiceReady,true);
 const reply=await(await api(req('chat',{message:'hi'}),env)).json();assert.equal((await api(req('speech',{ticket:reply.ticket}),env)).status,200);assert.equal(used,'yuanqishaonv');
});
test('model performance cues are bounded and raw rig controls cannot pass through',async t=>{
 const env=setup();t.after(()=>env.DB.close());
 const api=createGateway({fetchUpstream:async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply:'我们慢慢来。',emotion:'worried',gesture:'bow',performance:{intensity:900,cues:[{at:-1,emotion:'happy',gesture:'wave'},{at:.2,emotion:'neutral',gesture:'execute'},{at:.5,emotion:'serious',gesture:'nod',ParamAngleX:99}]}})}}]})});
 const reply=await(await api(req('chat',{message:'hi'}),env)).json();assert.equal(reply.gesture,'nod');assert.equal(reply.performance.intensity,.85);assert.equal(reply.performance.cues[0].at,0);assert.equal(reply.performance.cues.length,2);assert.ok(!JSON.stringify(reply).includes('ParamAngleX'));
});
