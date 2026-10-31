export type ReactionKind='hair'|'ponytail'|'side-lock'|'braid'|'eye'|'nose'|'mouth'|'cheek'|'hand'|'wave'|'chest'|'waist'|'shoulder'|'bow'|'sleeve'|'skirt'|'shoe';
export interface ReactionDefinition {id:ReactionKind;label:string;hint:string;anchor:[number,number];expression:number;duration:number;tilt:number;nod:number;body:number;hair:number;lines:string[];}
export const reactions:ReactionDefinition[]=[
 {id:'hair',label:'摸摸头',hint:'轻摸头发 · 按住轻移',anchor:[690,180],expression:1,duration:2.3,tilt:2.4,nod:2,body:.15,hair:.1,lines:['嘿嘿，再摸一下嘛。','嗯……今天也辛苦啦。','头发没有乱吧？']},
 {id:'ponytail',label:'拨发梢',hint:'轻拨马尾 · 拖动后自然回弹',anchor:[879,430],expression:5,duration:2,tilt:-1.4,nod:-.8,body:.25,hair:.85,lines:['哇，发梢被你发现啦。','风把头发吹起来了呢。','轻一点，会痒啦。']},
 {id:'side-lock',label:'侧发',hint:'轻拨侧发 · 发根保持固定',anchor:[548,460],expression:2,duration:1.8,tilt:1.5,nod:.8,body:.15,hair:.45,lines:['这一缕又翘起来了？','帮我理好了吗？']},
 {id:'braid',label:'小编发',hint:'碰一碰编发与发饰',anchor:[767,435],expression:3,duration:2,tilt:1.5,nod:.7,body:.2,hair:.4,lines:['编得很漂亮对吧？','这个发饰，我很喜欢哦。']},
 {id:'eye',label:'眨个眼',hint:'轻点眼睛 · 回你一个眨眼',anchor:[727,302],expression:10,duration:1.5,tilt:1.2,nod:-.4,body:0,hair:0,lines:['看见你啦，眨个眼。','在看哪里呀？']},
 {id:'nose',label:'鼻尖',hint:'轻点鼻尖',anchor:[673,326],expression:4,duration:1.65,tilt:-1.8,nod:-1.5,body:-.2,hair:.12,lines:['欸？鼻尖会痒啦。','突然袭击，犯规！']},
 {id:'mouth',label:'轻碰嘴唇',hint:'轻碰嘴唇 · 害羞地轻闭双眼',anchor:[674,358],expression:2,duration:2.2,tilt:1.1,nod:1.3,body:.1,hair:.05,lines:['嗯……让我缓一缓。','我听见啦……']},
 {id:'cheek',label:'戳戳脸',hint:'戳戳脸颊 · 连续轻点还有回应',anchor:[707,343],expression:2,duration:1.9,tilt:-2.7,nod:-1.1,body:-.25,hair:.1,lines:['欸、突然戳过来也太狡猾了吧。','脸颊才不是玩具啦。','再戳就要反击啦！']},
 {id:'hand',label:'击掌',hint:'点手击掌，双击挥手 · 动作会慢慢收回',anchor:[490,313],expression:10,duration:2.2,tilt:2.2,nod:.7,body:.65,hair:.2,lines:['击掌！今天也要打起精神哦。','约好啦，今天也一起加油。']},
 {id:'wave',label:'挥挥手',hint:'肩、肘和手腕一起挥动',anchor:[490,313],expression:1,duration:3.25,tilt:1.5,nod:.5,body:.3,hair:.2,lines:['嗨——我在这里！','看见你啦，今天也一起加油。']},
 {id:'chest',label:'胸前衣襟',hint:'轻触衣襟 · 害羞地微微避让',anchor:[758,582],expression:2,duration:2.3,tilt:-1.3,nod:-1.4,body:-.2,hair:.12,lines:['欸……让我缓一缓。','慢一点，我听着呢。']},
 {id:'waist',label:'腰侧',hint:'轻碰腰侧 · 转移重心，再慢慢站稳',anchor:[756,754],expression:2,duration:2.6,tilt:-1.6,nod:.7,body:.2,hair:.22,lines:['欸，轻一点，会痒啦。','站稳啦……我还在这里呢。']},
 {id:'shoulder',label:'拍拍肩',hint:'轻拍肩膀 · 回头回应',anchor:[566,475],expression:0,duration:2.1,tilt:-1.5,nod:1.1,body:.6,hair:.22,lines:['嗯？我在听呢。','叫我吗？怎么啦？']},
 {id:'bow',label:'蝴蝶结',hint:'碰一碰蝴蝶结',anchor:[674,553],expression:3,duration:2.2,tilt:1.3,nod:1.4,body:.25,hair:.08,lines:['这个蝴蝶结，很可爱吧！','没有歪吧？帮我看看。']},
 {id:'sleeve',label:'袖口',hint:'轻碰袖口 · 拉一下注意力',anchor:[946,751],expression:8,duration:2,tilt:-1.4,nod:.6,body:.5,hair:.12,lines:['袖口没有歪啦……你再看看？','拉住我啦？那就一起走吧。']},
 {id:'skirt',label:'裙摆',hint:'轻碰裙摆 · 一阵微风',anchor:[703,975],expression:4,duration:2.4,tilt:-.8,nod:1.2,body:.3,hair:.5,lines:['风有点大呢，站稳啦！','哎呀，裙摆被风吹起来一点。']},
 {id:'shoe',label:'鞋尖',hint:'碰一下鞋尖 · 轻轻点拍',anchor:[625,1600],expression:1,duration:2,tilt:1,nod:1.8,body:.65,hair:.15,lines:['这双鞋跑起来很轻哦。','要出门走走吗？']}
];
export function reactionAt(p:{x:number;y:number},partId?:string):ReactionKind|null{
 if(partId==='hair-ponytail')return 'ponytail';
 if(partId==='hair-side-lock')return 'side-lock';
 if(partId==='hair-braid')return 'braid';
 const e=(x:number,y:number,rx:number,ry:number)=>((p.x-x)/rx)**2+((p.y-y)/ry)**2<=1;
 if(e(628,292,27,27)||e(727,305,28,27))return 'eye';
 if(e(673,326,14,14))return 'nose';
 if(e(674,358,28,17))return 'mouth';
 if(e(684,342,100,55))return 'cheek';
 if(e(490,313,74,88)||e(1020,782,73,48))return 'hand';
 if(e(695,204,155,128))return 'hair';
 if(e(674,554,63,70))return 'bow';
 if(e(610,571,52,66)||e(760,575,48,63))return 'chest';
 if(e(586,754,41,86)||e(784,754,42,86))return 'waist';
 if(e(436,362,42,37)||e(946,751,53,46)||e(411,438,48,37))return 'sleeve';
 if(e(566,475,50,49)||e(837,485,44,48))return 'shoulder';
 if(e(681,960,251,115))return 'skirt';
 if(e(625,1610,72,72)||e(554,1055,43,39))return 'shoe';
 return null;
}

/** Gentle close/hold/reopen, while retaining the original shy expression. */
export function faceReactionPose(kind:ReactionKind|null,age:number,duration:number):Record<string,number>{
 if(kind!=='mouth'||age<0||age>=duration)return {};
 const ease=(a:number,b:number)=>{const s=Math.max(0,Math.min(1,(age-a)/(b-a)));return s*s*(3-2*s);};
 const open=1-ease(0,.16)*(1-ease(duration-.35,duration));
 return {ParamEyeLOpen:open,ParamEyeROpen:open,ParamMouthOpen:open};
}
