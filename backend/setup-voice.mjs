// One-time operator tool. Never exposed by the public Worker.
// Requires an existing StepFun File ID; deliberately has no cash upload endpoint.
import fs from 'node:fs/promises';
import path from 'node:path';

const mode=process.argv[2];
const flags=new Map();
for(let i=3;i<process.argv.length;i+=2)flags.set(process.argv[i],process.argv[i+1]);
if(!['preview','create'].includes(mode)||!/^file-[A-Za-z0-9_-]+$/.test(flags.get('--file-id')??'')){
 console.error('Usage: node backend/setup-voice.mjs preview|create --file-id file-... [--output absolute.wav]');process.exit(1);
}
const key=process.env.STEPFUN_API_KEY;
if(!key||/[\r\n]/.test(key))throw Error('Set STEPFUN_API_KEY in the process environment; never paste it into source or arguments.');
const reference=JSON.parse(await fs.readFile(new URL('./voice-reference.json',import.meta.url),'utf8'));
const host=process.env.STEP_REGION==='global'?'api.stepfun.ai':'api.stepfun.com';
const route=mode==='preview'?'audio/voices/preview':'audio/voices';
const payload={model:'stepaudio-2.5-tts',file_id:flags.get('--file-id'),text:reference.text};
if(mode==='preview')Object.assign(payload,{sample_text:'回来啦？今天发生了什么，快跟我说说吧。',response_format:'wav',speed:1.0,instruction:'保留参考音色的声线与音高，自然、轻快，像在和熟悉的人聊天。'});
const response=await fetch(`https://${host}/step_plan/v1/${route}`,{method:'POST',redirect:'manual',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(90000)});
if(!response.ok){await response.body?.cancel();throw Error(`Step Plan HTTP ${response.status}; stopped without retry, redirect, or cash fallback.`);}
const data=await response.json();
if(mode==='create'){
 if(!/^voice-[A-Za-z0-9_-]+$/.test(data.id??''))throw Error('No valid cloned voice ID was returned.');
 console.log(JSON.stringify({voiceId:data.id,reference:reference.id,model:payload.model,billingMode:'tokenplan'}));
}else{
 const output=flags.get('--output');
 if(!output||!path.isAbsolute(output))throw Error('Preview needs an absolute --output WAV path.');
 if(typeof data.sample_audio!=='string'||data.sample_audio.length>6000000)throw Error('Invalid preview audio.');
 const bytes=Buffer.from(data.sample_audio,'base64');
 if(bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE')throw Error('Expected a WAV preview.');
 await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,bytes);
 console.log(JSON.stringify({output,bytes:bytes.length,reference:reference.id,billingMode:'tokenplan'}));
}
