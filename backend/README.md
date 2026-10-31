# Sora AI gateway

Standalone Worker ESM backend for the public Sora GitHub Pages UI. Credentials are runtime secrets, never source files. Both models use only `/step_plan/v1/`; there is no standard-account endpoint or retry/fallback path.

Models: `step-5-preview`, `stepaudio-2.5-tts`. Speech uses only the operator's `STEP_VOICE_ID` cloned from Sora's original reference. There is no preset-voice fallback. Routes: POST `/api/chat`, POST `/api/speech`, GET `/api/health`. Speech requires a signed, short-lived, one-use ticket generated from a chat reply. Without a cloned voice, text remains available and speech fails closed before reserving quota.

The D1 `DB` binding applies atomic shared request limits: 200 calls/day across the service, 20/day/visitor, 6/minute/visitor. A chat plus speech uses two calls. Limits count reservations conservatively, including unsuccessful attempts. Visitor buckets use a daily salted hash; conversation text is not stored in D1. Missing storage/configuration fails closed.

Required secrets: `STEPFUN_API_KEY`, `TICKET_SECRET`. Set `STEP_VOICE_ID` after cloning. `STEP_REGION` is `cn` (default) or `global`. These select only the corresponding official Step Plan host. Optional limits: `MAX_DAILY_CALLS`, `MAX_VISITOR_DAILY`, `MAX_VISITOR_MINUTE`. Local preview CORS requires `ALLOW_LOCAL=1`.

`npm test` uses mocked models and real in-memory SQLite, consuming no provider quota. `npm run build` creates a standalone Worker. Sites applies migrations during deployment. This server never auto-purchases quota or switches to cash billing.

## Clone setup

Selected reference: original `新海天素材库/03_语音参考/sr0018.wav`, 7.27 seconds, clean mono 32 kHz, with the matching Japanese transcript and source hash in `voice-reference.json`. Original audio is not bundled into the public site. Do not use the separate AI-generated sample as a cloning reference.

The official clone APIs require a previously uploaded `file_id`. The Step Plan `/files` route returned HTTP 404 on 2026-10-31. The documented standard `/v1/files` upload has separately priced file storage, so this project does not call it under the user's no-cash constraint. An existing source File ID or explicit authorization for that storage step is required before cloud cloning can continue.

With `STEPFUN_API_KEY` provided securely as a process environment variable, use `node backend/setup-voice.mjs preview --file-id file-... --output F:/work/sora/verification/cloned-voice.wav`, listen to the result, then run `node backend/setup-voice.mjs create --file-id file-...`. Both operations are locked to `/step_plan/v1/audio/voices...`; HTTP failures and redirects stop immediately. Save the returned voice ID as the backend runtime secret `STEP_VOICE_ID`, then redeploy. It is never supplied by visitors. These cloned voices support Chinese/English output; the current UI uses Chinese.

References: [clone API](https://platform.stepfun.ai/docs/en/api-reference/audio/create-voice), [preview API with Step Plan path](https://platform.stepfun.ai/docs/en/api-reference/audio/voices-preview), [file upload](https://platform.stepfun.ai/docs/en/api-reference/files/create), [storage pricing](https://platform.stepfun.ai/docs/en/guides/pricing/details).
