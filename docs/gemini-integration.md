# Gemini integration for Pierrot and Flow

**Status:** implemented in the working tree, not deployed.  
**Primary model:** `gemini-3.5-flash`  
**Fallback:** DeepSeek Direct, then OpenRouter DeepSeek where the module already
provided it.

This is a targeted provider change. The RAG, prompts, schemas, Supabase schema,
Flow translations, embeddings, Media Intelligence, Knowledge Graph and Telegram
Research pipelines are unchanged.

## 1. Shared provider helper

`lib/ai/gemini.ts` makes one bounded REST call to the Gemini API:

- reads the existing `GEMINI_API_KEY`;
- pins `gemini-3.5-flash` (no alias that can move silently);
- sends the key in `x-goog-api-key`, never in the URL;
- applies the existing per-call timeout and token budget;
- disables hidden thinking tokens (`thinkingBudget: 0`) so the full output
  budget is available for the visible answer/JSON;
- uses the existing circuit breaker with dependency `gemini`;
- logs no prompt, history, RAG context or response text.

No new environment variables are required.

## 2. Pierrot

`app/api/pierrot-web/route.ts` now uses:

```text
Gemini → DeepSeek Direct → OpenRouter DeepSeek
```

- The same system prompt, conversation history, RAG evidence and output
  contract are passed to every provider.
- Gemini timeout/429/5xx/auth/empty response automatically falls through to
  DeepSeek Direct.
- If DeepSeek Direct is unavailable, the existing OpenRouter fallback is used.
- If all providers fail, the route returns its existing controlled error; it
  does not loop.
- The response includes `provider`, `model`, `latencyMs` and `fallbackUsed`.
  The `assistant_replied` analytics event stores provider/model/latency/fallback
  without storing private content.
- Server-side owner authorization and RAG boundaries are unchanged.
- Pierrot remains non-streaming, so no partial answer can be duplicated or
  cut off during failover.

## 3. Flow item context

`lib/flow/ai.ts` uses the same order:

```text
Gemini → DeepSeek Direct → OpenRouter DeepSeek
```

The existing `FlowAIResult` contract, bilingual RU/EN prompt, type-specific
instructions, RAG source references, retrieval metadata and persistence are
unchanged. The provider metadata is added to `retrieval_diagnostics.generation`
as provider/model/latency/fallback.

### Automatic context after publication

Context is generated exactly once when an Item becomes public:

- `PATCH /api/admin/items/[id]` after a successful publish;
- `POST /api/flow/items` after a published insertion.

Both call `ensurePublishedFlowContext()`:

- only `published` + `public`, `ai_allowed !== false`, non-photo items;
- skips when a `flow_ai_context` row already exists;
- writes `generating`, then `ready`, or `error` with the provider message;
- never runs on a public page view;
- never regenerates an existing ready row automatically.

The admin item page still provides explicit **Generate AI context** /
**Regenerate AI context** for manual repair or refresh.

## 4. Flow Issue analysis

`lib/flow-issue/deepseek.ts` now uses Gemini for the existing editorial
analysis, with DeepSeek Direct as fallback:

- strict `AnalysisResponseSchema` / Zod validation remains the gate;
- invalid JSON, invalid enum values or schema mismatch trigger DeepSeek, not a
  cache write;
- `ANALYSIS_VERSION` is bumped to `3` because the prompt now names the exact
  `lang`, `kind` and `role` enum values and the primary provider changed;
- `contentHash`, `cachedAnalysis`, `ai_allowed`, heuristic fallback, batching,
  time budgets and editorial rules are unchanged;
- the cached analysis stores the actual `model`, `provider`, `latencyMs` and
  `fallbackUsed` alongside the existing fields;
- no background reprocessing was started. Old version-2 analyses will be
  recomputed only when they are next needed by an issue run.

Flow translations remain on DeepSeek. `translateIssueEntries()` now gates on
`DEEPSEEK_API_KEY`, so a Gemini-only configuration leaves original copy intact
instead of attempting a translation request.

## 5. Failover and recovery

Failover happens on:

- network error / timeout;
- HTTP 429 or quota exhaustion;
- HTTP 5xx;
- HTTP 400/401/403/404 configuration or authorization errors;
- empty or blocked Gemini response;
- invalid JSON or Zod validation failure (Flow Issue);
- an open Gemini circuit.

The Gemini circuit is independent of the DeepSeek/Pierrot circuits. After the
existing cooldown it becomes half-open; the next successful Gemini call closes
it and Gemini returns as the primary provider. A failed Gemini request never
disables it permanently.

There are no retries around Gemini itself in Pierrot or Flow Issue. Flow Issue
retains its existing one retry for DeepSeek Direct only. This prevents duplicate
operations and unbounded spend.

## 6. Costs and limits

- No new AI calls are added on the happy path: Gemini replaces DeepSeek as the
  single primary call.
- A fallback adds one DeepSeek call only when Gemini fails.
- Existing token limits, timeouts, batching, circuit breaker and caching remain.
- Automatic post-publish generation adds one call per newly published Item,
  once, only when no context row exists.
- No new cron jobs, background workers or mass reprocessing.
- No new dependencies (the project already had `@google/generative-ai`, and the
  helper uses the platform `fetch`).

## 7. Tests

```bash
npx jest lib/ai lib/flow lib/flow-issue app/api/pierrot-web --runInBand --forceExit
```

Covered:

- Gemini success, empty response, HTTP 429, circuit opening and recovery;
- Flow AI: Gemini primary, DeepSeek fallback, identical prompt, Gemini recovery,
  controlled failure when all providers fail;
- Pierrot: Gemini primary, DeepSeek fallback on 429, prompt/history preservation,
  Gemini recovery;
- Flow Issue: Gemini success with cache write, invalid-schema fallback,
  429 fallback, `ai_allowed` privacy, cache reuse/recompute;
- post-publish context: skip rules, no regeneration when a row exists, ready
  persistence and error persistence.

A small real Gemini smoke test was run manually with the existing key:
`gemini-3.5-flash` answered Pierrot and produced a valid bilingual Flow context.
No mass API run was performed.

## 8. Untouched systems

- Media Intelligence
- Knowledge Graph
- Telegram Research
- Flow translations
- embeddings / BGE-M3
- Supabase schema
- existing cron jobs and workers
