# 对话表演与连续语音设计

## 已阅读的项目和采用的原则

- [Live2D Cubism 官方参数更新顺序](https://docs.live2d.com/en/cubism-sdk-manual/parameters/)及[官方 Web 示例](https://github.com/Live2D/CubismWebSamples/blob/develop/Samples/TypeScript/Demo/src/lappmodel.ts)：眨眼、表情、视线、呼吸、物理和口型按明确顺序叠加，动作有优先级。此项目保持原画表情为整数编号，用短眨眼衔接纹理切换，不把相邻两套眼睛叠出重影。
- [Open-LLM-VTuber 的句子/动作提取](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber/blob/main/src/open_llm_vtuber/agent/transformers.py)：句子携带表现意图，显示文字、表情和声音相互关联。这里采用结构化、白名单化的情绪节点，模型不能输出任意骨骼参数或脚本。
- [pixi-live2d-display 表情管理器](https://github.com/guansss/pixi-live2d-display/blob/master/src/cubism-common/ExpressionManager.ts)：新请求取代表情的旧预约，默认表情与当前表情分开。这里用会话代次淘汰旧请求；自动回应结束后回到用户选定的基础表情。
- [Pipecat 的打断机制](https://docs.pipecat.ai/pipecat/fundamentals/interruptions)：打断优先于普通数据，取消在途推理、清除未播放音频，不能等 ASR 完成再停声音。此实现检测到有效开口就停止 AudioBufferSource、取消聊天/识别请求，并标记语音未完整播出。
- [LiveKit 的打断配置](https://github.com/livekit/agents-js/blob/main/agents/src/voice/turn_config/interruption.ts)及[会话运行时](https://github.com/livekit/agents/blob/main/livekit-agents/livekit/agents/voice/agent_session.py)：最低开口时长、回声消除准备期和误打断处理是连续对话的关键。这里启用浏览器回声消除、降噪、自动增益，加入播放初期保护与连续语音门限。没有宣称已实现模型级语义判停或专业声学回声消除。

以上作为设计参考，未复制其运行时代码或模型，也不引入这些项目的服务器依赖。

## 表现过程

输入框获得焦点时，角色收回夸张动作、看向你并轻点头；提交后短暂移开视线思考。模型限流等待时，保持轻呼吸，不一直僵着认真脸。回复按 1–3 个语意节点改变情绪、幅度与点头、摇头、歪头、挥手或击掌；眼神和头身变化平滑接上。开心、俏皮的闭眼原画只短暂停留，随后恢复目光交流。害羞时先避开目光，再看回来。回复结束会回到基础状态。

有音频时，节点按实际音频进度推进，口型只由实际波形音量驱动。没有声音时不会伪造连续说话口型。嘴唇触碰保持原有闭眼害羞回应，触碰动作优先于自动表演。减少动态效果时保留语意表情，关闭新增头身和手臂动作。

「试试她的反应」是明确标注的本地动作预览，不生成聊天消息，不调用模型。上游不可用时仍可检查开心、害羞、倾听和俏皮的动作过程。

## 连续语音链路

用户点击「开始语音」并授权麦克风后，AudioWorklet 持续采集单声道人声，转换成 16 kHz、20 ms 帧。播放回复时采集仍继续。有效开口约 160 ms 后开始一轮；正在播放时要求约 280 ms，并保留约 300 ms 前置音频。约 800 ms 静音后提交完整片段，超过约 18 秒的单轮会提示分句，避免无限录音。

链路为：本地语音活动检测 → StepAudio 2.5 ASR → Step 5 → StepAudio 2.5 TTS。三个模型仅使用官方 `/step_plan/v1/`。ASR 是按停顿提交音频、SSE 返回识别结果；此版本并非端到端原生实时语音模型，也没有逐词 TTS 时间戳。它实现持续收音与可打断播放，语义判停、扬声器回声环境下的体验仍需实机校准。

麦克风只在用户开启时工作；停止语音、页面切到后台或离开页面都会停止采集并释放轨道。录音与正文不写入服务端数据库。识别、聊天和朗读各计一次公共体验调用。原作克隆尚未可用时，只有操作者显式设置 `STEP_VOICE_MODE=preset-test` 才能使用普通测试音色，界面明确标为「测试音色朗读」。

## 亮屏与验收

网页通过 Screen Wake Lock 在前台请求亮屏，可点击「亮屏已开启」释放。本机另有进程持有的 Windows 显示/系统防休眠请求；终止该辅助进程即可释放，不永久修改电源计划。

自动检查覆盖情绪节点、眨眼换脸、回望、实际音频进度、触碰优先级、减少动态效果、采样转换、语音分段、噪声/过长片段、取消和过时 ASR 淘汰。浏览器检查已确认原画表情与界面正常。真实 ASR、TTS 测试仍返回 `concurrency reached, current: 9, limit: 8`；不能将这些本地检查当成云端通话验收成功。麦克风与扬声器的实际声学效果需要在服务可用时继续检查。
