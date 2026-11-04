# Pierrot Owner Chat — Native Streaming Report

**Date:** 4 November 2026  
**Repository:** `merkurov1/newlove`  
**Scope:** owner-only streaming in Pierrot Owner Workspace chat. No redesign, no migration, no model-priority change.

---

## 1. Files changed

### Server

- `app/api/pierrot-web/route.ts`
  - accepts explicit `stream: true` for verified owners;
  - creates SSE responses with `ReadableStream`;
  - streams model deltas through the existing retrieval/orchestration flow;
  - emits `accepted`, `status`, `sources`, `completed` and `error`;
  - keeps the existing JSON path for every non-streaming caller;
  - aborts before persistence when the request is cancelled;
  - marks post-first-token provider failures as interrupted.

- `lib/pierrot/streamProtocol.ts` _(new)_
  - versioned event types;
  - SSE encoding/decoding;
  - client-side event consumer;
  - malformed/unsupported event detection.

- `lib/pierrot/streamResponse.ts` _(new)_
  - SSE response helper;
  - `no-cache, no-transform` + `X-Accel-Buffering: no` headers;
  - cancellation lifecycle and client-disconnect handling.

- `lib/pierrot/model.ts`
  - `streamPierrotModel()`;
  - Gemini → DeepSeek Direct → OpenRouter fallback, but only before the first delta;
  - `PierrotStreamInterruptedError` after output has started;
  - abort propagation and no fallback after client cancellation.

- `lib/ai/gemini.ts`
  - `streamGeminiText()` using `streamGenerateContent?alt=sse`;
  - whitespace-preserving chunk extraction;
  - malformed/empty stream handling;
  - same circuit breaker and pinned model.

### Client

- `components/pierrot/workspace/ChatWorkspace.tsx`
  - native `fetch` + `ReadableStream` reader;
  - incremental assistant text;
  - `requestAnimationFrame` batching of deltas;
  - stop button with `AbortController`;
  - retry with the original prompt;
  - no duplicate submissions while active;
  - safe Markdown rendering already provided by `WorkspaceMarkdown`;
  - auto-scroll only when the transcript is at/near the bottom;
  - minimal actual status text (`retrieving`, `generating`, `persisting`);
  - interrupted-response note.

- `app/admin/pierrot/(workspace)/workspace.css`
  - minimal stop-button and interrupted-note styles only.

### Documentation and tests

- `docs/pierrot-production.md`
- `lib/pierrot/workspace/chatParser.ts` (contract comment)
- `app/api/pierrot-web/__tests__/route.test.ts`
- `lib/ai/__tests__/gemini.test.ts`
- `lib/pierrot/__tests__/streamProtocol.test.ts` _(new)_
- `lib/pierrot/__tests__/streamResponse.test.ts` _(new)_
- `lib/pierrot/__tests__/streamingModel.test.ts` _(new)_

---

## 2. Streaming architecture

```
Owner Chat
  fetch('/api/pierrot-web', { stream: true })
    → existing auth / ownership / rate limit
    → existing intent detection / RAG / web / media / tools
    → streamPierrotModel(...)
    → SSE event stream
    → client batches deltas
    → completed payload replaces partial text
    → existing appendPierrotMessage persistence
```

Streaming is **owner-only**: `streaming = rawStream === true && ownerMode`. Public chat, Telegram and any other JSON consumer keep the old response contract.

The existing JSON path remains intact. A stream request that reaches an early JSON branch (auth error, replay, human takeover, rate limit) is handled by the client as a normal JSON response.

---

## 3. Event protocol

Transport: `POST /api/pierrot-web`, `Content-Type: text/event-stream; charset=utf-8`.

Version: `1`.

Each SSE frame has an `event:` name and a JSON `data:` object. The JSON object also includes `type` and `version`.

| Event       | Payload                                                                            |
| ----------- | ---------------------------------------------------------------------------------- |
| `accepted`  | `conversationId`, `sessionId`, `userMessageId`, `assistantMessageId`               |
| `status`    | `stage`: `retrieving`, `generating`, `persisting`                                  |
| `delta`     | `text`                                                                             |
| `sources`   | actual `rag`, `web`, `answerSources`, `sourceStatus`                               |
| `completed` | authoritative final JSON payload (`reply`, provider, sources, ids, recorded, etc.) |
| `error`     | sanitized `error`, `code`, optional `retryAfter`, `retryable`, `interrupted`       |

Only `retrieving`, `generating` and `persisting` are emitted, and only when the server actually reaches those stages. No fake progress events are sent.

The completed payload is authoritative. If the deterministic evidence guard rewrites or strips anything after generation, the client replaces the streamed text with the final completed payload.

---

## 4. Provider streaming

### Gemini

- Endpoint: `streamGenerateContent?alt=sse`.
- Deltas are parsed from SSE `data:` frames.
- The final content is trimmed once; individual deltas keep whitespace so words do not run together.
- Malformed and empty streams are rejected.

### DeepSeek Direct

- OpenAI-compatible SDK with `stream: true`.
- Streams `choices[0].delta.content`.
- Existing circuit breaker and timeout are preserved.

### OpenRouter DeepSeek

- Same streaming mechanism through the OpenRouter base URL.
- Existing headers and model selection are preserved.

Provider order is unchanged: Gemini → DeepSeek Direct → OpenRouter DeepSeek.

---

## 5. Fallback behavior

- Before the first delta: provider failure follows the existing fallback policy.
- After the first delta: the provider is **not** replaced and no second answer is appended.
- A post-delta failure throws `PierrotStreamInterruptedError`.
- The route emits `error` with `interrupted: true`.
- The partial answer remains visible only as an interrupted UI message and is **not persisted as a completed assistant message**.
- Client cancellation propagates through the request/lifecycle signal; no fallback provider is started after cancellation.

---

## 6. Cancellation and persistence

- Client Stop button calls `AbortController.abort()`.
- The server stream helper aborts its lifecycle signal and closes the SSE response.
- The model provider receives the same signal.
- The route checks the generation signal before persistence.
- Only a fully generated, evidence-guarded answer reaches `appendPierrotMessage`.
- Assistant persistence still happens once, through the existing deterministic `assistantMessageId`.
- Interrupted or cancelled responses are not written as completed assistant messages.
- The user prompt remains in the UI and can be retried without duplicating it.

---

## 7. Tests

Relevant suites:

```bash
npx jest lib/pierrot lib/ai app/api/pierrot-web app/api/pierrot \
  --runInBand --forceExit
```

Result:

- **52 suites passed**
- **481 tests passed**
- **0 failed**

Coverage added:

1. successful Gemini streaming;
2. DeepSeek streaming and fallback;
3. fallback before the first token;
4. interrupted stream after the first token, no fallback;
5. cancellation before fallback;
6. SSE close on client disconnect;
7. empty provider response;
8. malformed SSE frames;
9. persistence after successful completion;
10. no assistant persistence after interruption;
11. legacy JSON compatibility for a caller sending `stream:true` without owner mode;
12. owner deterministic replies also stream through the protocol;
13. source/completed payload dispatch;
14. sanitized generic stream errors.

Typecheck:

```bash
npx tsc --noEmit
```

- **passes**

Lint:

```bash
npm run lint
```

- fails on existing repository-wide lint debt unrelated to this change;
- no errors are reported for the streaming files, route, ChatWorkspace, Gemini helper or model router.

Build:

- not run in this session; no build result is claimed.

---

## 8. Remaining issues / limitations

1. Early JSON branches (replay, auth error, human takeover, rate limit) are not converted into SSE. The owner client handles both content types. The generation path and deterministic owner replies stream.
2. The client has the existing 60-second request timeout. Long generations are still bounded by that policy.
3. The streamed deltas are raw provider text. The `completed` event contains the evidence-guarded authoritative reply; the client replaces the partial text at completion.
4. No database migration was needed or added.
5. No change was made to Telegram, public chat, model priority, RAG, Flow, Media or Commercial logic.
6. Hosting must allow streaming responses. The route sets `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no`.
