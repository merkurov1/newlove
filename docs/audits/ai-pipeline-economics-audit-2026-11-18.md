# AI pipeline and model economics audit

Date: 2026-11-18  
Repository: `merkurov1/newlove`  
Base ref: `main`  
Audit type: end-to-end code and production-path audit, plus telemetry and
evaluation tooling.

## 0. Evidence boundary (read first)

This workspace had **no production database, no Gemini/DeepSeek/OpenRouter API
keys and no Google Cloud billing export**. The following could not be measured
here and are explicitly marked as unverified:

- the number of production conversations and provider calls on 16–18 Nov;
- the exact Google Cloud invoice or the API key's project number;
- the actual Gemini model tier/price attached to that project;
- provider-side request IDs for individual calls.

The audit therefore uses committed code, migration/config history, unit tests,
and the repository's own operational reports. It does **not** invent a
production total. Section 6 states the minimum evidence needed to close the £5
question.

No secret file was read, printed or copied. No production deploy, provider API
call or paid evaluation was performed.

## 1. Actual message path

1. `app/api/pierrot-web/route.ts` receives the turn, normalises consent,
   identity and project/history scope, and builds `normalizedHistory`.
2. Retrieval runs before generation:
   - Brain: `retrieveBrainEvidenceWithRefinement` in
     `lib/knowledge/rag/pierrotRetrieval.ts`, up to **4** retrieval attempts
     (`original`, `broaden_time`, `lexical`, `broader_topk`) inside a 9 s
     budget (`BRAIN_RAG_TOTAL_TIMEOUT_MS`).
   - Optional web search (`lib/knowledge/web/exaSearch.ts`) and media/journal
     evidence.
3. `buildPierrotExecutionPlan` / `planPierrotTurn` decide intent, tool and
   whether the model is needed.
4. `resolvePierrotGenerationPolicy` selects task class, output cap and timeout
   (`lib/pierrot/generationPolicy.ts`).
5. `callPierrotModel` or `streamPierrotModel` runs the provider chain.
6. The assistant row is stored under a deterministic id
   (`createAssistantMessageId`) and an `assistant_replied` event is written.
7. `retrieval analytics` is stored separately as the `brain_retrieval` event.

The public and owner paths share this pipeline. Owner-only material is gated by
server-verified identity, not by the model or UI.

## 2. Provider routing chronology (commit evidence)

| Date (UTC)    | Commit                                                                        | What changed                                                                                                                                                                                                                            |
| ------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-31    | `0f656009` `feat(ai): use Gemini for Pierrot and Flow with DeepSeek fallback` | Introduced pinned `gemini-3.5-flash` and the order **Gemini → DeepSeek Direct → OpenRouter DeepSeek**.                                                                                                                                  |
| 2026-10-31    | `48574b0f` `fix(build): move Pierrot model routing out of route file`         | Moved `callPierrotModel` to `lib/pierrot/model.ts`; order unchanged.                                                                                                                                                                    |
| 2026-11-01    | `26f7b838` `feat(pierrot): stream owner chat with SSE and provider fallback`  | Added native streaming for all three providers and the rule that fallback stops after the first emitted token.                                                                                                                          |
| 2026-11-15–18 | env recovery / dev workbench commits                                          | No commit changed the production model order. The 15 Nov audit (`docs/audits/modernization-final-2026.md`) records that `DEEPSEEK_API_KEY` and `OPENROUTER_API_KEY` were among values Vercel CLI did not return to the local workspace. |

Conclusion: there is **no committed change from Gemini to DeepSeek as the
default**. The effective provider is decided at runtime by configuration:

- `GEMINI_API_KEY` present → Gemini first;
- otherwise → DeepSeek Direct first;
- `DEEPSEEK_API_KEY` missing/failing → OpenRouter DeepSeek;
- all unavailable → controlled error.

This distinction matters: a report that says "production was switched to
DeepSeek" is not supported by the repository history. A missing or rotated
Gemini key would silently change the effective provider while the code order
stays the same. If the production provider really changed, the authoritative
evidence is the Vercel environment-variable history (when `GEMINI_API_KEY`
became absent or invalid), which is not stored in the repository and was not
accessible here. The UI/model metadata now records which provider actually ran.

## 3. Exact Gemini billing path

Code: `lib/ai/gemini.ts`.

- Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent`
  and `:streamGenerateContent?alt=sse`.
- Authentication: `x-goog-api-key: <GEMINI_API_KEY>` header. The key is not put
  in the URL.
- No Vertex AI endpoint, no service account, no region/project parameter.
- Therefore usage is attributed to the **Google Cloud project that owns the API
  key**, through the Generative Language API, and appears in that project's
  Cloud Billing / Gemini API usage report.
- The app has no billing API call and no invoice import. It cannot see the
  amount charged.

`GEMINI_MODEL` is pinned to `gemini-3.5-flash`; an alias change cannot silently
change the model. `thinkingConfig.thinkingBudget = 0` prevents hidden reasoning
tokens from consuming the visible output budget.

## 4. Why £5 in a few days is plausible (and what is still unknown)

The code can generate more billable work than one visible answer suggests:

1. **Long prompts.** History is capped at 24 items / 16,000 characters, each
   item at 4,000 characters (`lib/pierrot/conversation.ts`). Owner turns add
   project brief, decisions, tasks, materials, memory, skills, a versioned
   summary and a project transcript (`route.ts`, owner context block). Brain
   evidence adds up to 8 chunks (plus a web-evidence block when relevant).
2. **Retrieval refinement.** Brain retrieval can perform up to four
   embedding/search attempts per user turn. Embeddings use OpenRouter
   (`baai/bge-m3`) and are **not currently counted in model telemetry**.
3. **Fallbacks duplicate the prompt.** If Gemini fails before emitting a token,
   the same system prompt and history are sent to DeepSeek, then possibly
   OpenRouter. The failed attempt is billable on the provider side even when it
   returns no text. Before this change only the final success was visible.
4. **Streaming usage was invisible.** OpenAI-compatible streaming APIs only
   return the final usage frame when requested. DeepSeek/OpenRouter requests
   did not set `stream_options.include_usage`, so their token usage was always
   `null`. Any cost estimate based on those rows would have been fake.
5. **Output cap is per task.** Conversation 1,400; analysis 3,500; research
   6,000; structured 8,000 (`lib/pierrot/generationPolicy.ts`). A handful of
   long analysis/research turns is much more expensive than chat.

Illustrative arithmetic only (not a production measurement): at a
Gemini-Flash-like rate of $0.30/M input and $2.50/M output, one turn with
8,000 input + 1,500 output tokens costs about **$0.0062**. About **800 such
turns** would be roughly £5 (at ~$1.27/£). If the account is on a more
expensive tier, or many turns are research/structured with retries and
fallbacks, the same £5 is reached with far fewer turns. This shows plausibility,
not the actual cause.

**To prove or disprove the £5, the owner must provide at minimum:**

1. Google Cloud project number/ID that owns the Gemini API key.
2. Billing export or invoice lines for the period, with SKU and usage quantity
   (input/output tokens, cached tokens, requests).
3. Gemini API request count for the same period (Cloud Monitoring or AI Studio
   usage).
4. Whether the key was used outside this application (AI Studio experiments,
   other deployments, local scripts).

Until then the correct status is **"plausible from code, not measured"**, not a
confirmed invoice explanation.

## 5. Findings

Severity: P0 blocks answers or corrupts accounting; P1 misleads the owner or
loses recent context; P2 observability/quality gap.

### Confirmed and fixed in this task

| ID  | Sev | Finding                                                                                                                                                                          | Evidence / fix                                                                                                                                                                 |
| --- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1  | P0  | Streaming DeepSeek/OpenRouter never requested usage, so `input/output/total tokens` were always null and costs unknowable.                                                       | `lib/pierrot/model.ts` now sends `stream_options: { include_usage: true }` for both streaming clients. Regression test asserts the request and the captured final usage frame. |
| F2  | P0  | Failed provider attempts were not recorded anywhere. A Gemini failure followed by DeepSeek success looked like one call; fallback spend was invisible.                           | Every provider attempt now emits an `onAttempt` record; the route persists one row per attempt, including failures and fallbacks.                                              |
| F3  | P1  | No per-call token/cost telemetry existed. `assistant_replied.usage` only covered the final success and was not priced.                                                           | New `lib/ai/telemetry.ts`, `pierrot_llm_calls` additive migration, admin report page. Null tokens/costs stay null.                                                             |
| F4  | P1  | History window walked oldest→newest and stopped at the character budget, silently dropping the most recent turns.                                                                | `lib/pierrot/historyWindow.ts` selects newest→oldest, then restores chronological order. Tests cover long older messages.                                                      |
| F5  | P1  | A retry with the same `userMessageId` already had the current user turn in stored history, then appended it again to the model request. The model was asked the same turn twice. | `dropTrailingDuplicateTurn` removes the stored copy; the current turn is appended exactly once. Test covers retry shape.                                                       |
| F6  | P1  | Generation failure logs hard-coded `provider: 'gemini'` even when Gemini was not configured or DeepSeek failed.                                                                  | `app/api/pierrot-web/route.ts` now logs `usedProvider` or omits the provider.                                                                                                  |
| F7  | P2  | Dashboard could not distinguish calls, messages, retries, tokens, estimated cost and provider-reported cost.                                                                     | New `/admin/pierrot/ai-costs` page and `lib/ai/telemetryReport.ts`; message count comes from `assistant_replied`, calls from attempts.                                         |
| F8  | P2  | No identical-case evaluation existed for Gemini vs DeepSeek.                                                                                                                     | `lib/ai/evaluation/*` plus owner-only `POST /api/admin/pierrot/ai-evaluation`; six synthetic bilingual cases, deterministic checks, latency and cost per successful task.      |
| F9  | P2  | Provider failure metrics had no regression coverage for fallback chains.                                                                                                         | `lib/pierrot/__tests__/modelAttempts.test.ts` covers Gemini→DeepSeek, single-provider mode and all-three-fail.                                                                 |

### Confirmed, not fixed (requires owner decision or production access)

| ID  | Sev | Finding                                                                                                                                                                                              | Why it is open                                                                                                                                                                                                |
| --- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O1  | P1  | Gemini cost is unknown. No verified tariff is bundled and no billing export is available.                                                                                                            | Estimates require `GEMINI_INPUT_USD_PER_MILLION` / `GEMINI_OUTPUT_USD_PER_MILLION` from a real invoice, or a billing integration. Setting a guessed price would violate the "no fabricated cost" requirement. |
| O2  | P1  | Embedding usage is not recorded. Brain refinement can issue up to four OpenRouter embedding calls per turn.                                                                                          | Requires threading a telemetry callback through `lib/knowledge/rag/embeddings.ts` and the retrieval call stack. The user-visible answer and cost of the generation calls are unaffected.                      |
| O3  | P2  | The browser keeps a failed optimistic user message; a manual resend creates a second user-visible message with a new id. Server-side retry with the **same** id is idempotent (existing route test). | Fixing this changes the client transcript contract and needs a UI decision (edit/retry vs resend). Not changed here.                                                                                          |
| O4  | P2  | The 18 Nov project-chat blocker (`bd59fbe6`, PR #43) was a PWA/project-chat route issue, not a model issue.                                                                                          | Fixed in the merged commit; this audit adds no competing fix. Existing project-chat matrix tests remain the regression guard.                                                                                 |
| O5  | P2  | 16 Nov was an environment/operations incident: local `.env` recovery lost sensitive provider keys; it did not change production code or the model order.                                             | Production/Vercel was not affected. Local live-call verification is impossible in this workspace.                                                                                                             |

### Separating cause classes

- **Model quality:** not measured in production (no live keys). The harness now
  makes it measurable on identical cases. Do not attribute billing or routing
  defects to model quality.
- **Context/retrieval:** F4/F5 are real context-assembly defects. Brain
  retrieval quality itself is covered by the existing C1–C4 evaluation reports,
  not re-evaluated here.
- **Router/tool:** no evidence of a wrong tool being executed in the audited
  code. The failure-log provider label (F6) was wrong and is fixed.
- **UI/navigation:** O3 is a retry/resend UX issue. The 18 Nov project-chat
  blocker was a route/PWA issue, fixed before this task.
- **Billing:** F1/F2/F3 made spend invisible; O1/O2 mean the exact total still
  cannot be proven from the app alone.

## 6. What changed

- `lib/ai/gemini.ts` — provider-level telemetry for non-Pierrot Gemini callers;
  `skip` prevents double counting in the Pierrot route.
- `lib/knowledge/graph/deepseek.ts` — provider-level telemetry for shared
  DeepSeek graph/media/synthesis calls.
- `lib/ai/telemetry.ts` — provider tariffs, explicit unknown values, per-attempt
  record builder, service-role insert, redacted log.
- `lib/ai/telemetryReport.ts` — aggregation for calls/messages/retries/tokens/
  estimates/provider-reported cost.
- `lib/pierrot/model.ts` — one attempt record per provider, streaming usage
  request, OpenRouter provider cost capture.
- `app/api/pierrot-web/route.ts` — persists every attempt, adds attempt/retry
  counts to the success event and response, fixes failure provider label,
  fixes history-window and retry-duplicate assembly.
- `lib/pierrot/historyWindow.ts` — pure, tested context-window rules.
- `migrations/2026-11-18_pierrot_llm_call_telemetry.sql` (+ rollback) —
  additive, RLS-enabled, service-role-only table. **Not applied.**
- `app/admin/pierrot/(workspace)/ai-costs/page.tsx` — dashboard.
- `lib/ai/evaluation/*`, `app/api/admin/pierrot/ai-evaluation/route.ts` —
  identical-case Gemini/DeepSeek harness (live run requires
  `ALLOW_PAID_AI_EVALUATION=true`).
- Tests listed in section 8.

No production default was changed. No paid provider call was made. No migration
was applied.

## 7. Telemetry contract

Each row stores:

- provider, model, attempt number, `is_retry`, `fallback_from`;
- success/failure, latency, finish/error code;
- input/output/total tokens with `usage_source` (`provider_reported`,
  `partial`, `unknown`);
- `estimated_cost_usd` with `cost_source` (`provider_reported`,
  `estimated_from_tariff`, `unknown`) and pricing version/source;
- `provider_reported_cost_usd` when the provider returns it;
- request/conversation/session ids only when consent allows metadata storage;
- prompt/response **character counts**, never prompt or answer text.

If the table is missing, inserts fail closed, the answer still succeeds, and
failed attempts are emitted as redacted structured logs. A turn where the
visitor denied transcript consent creates no database client for telemetry; its
attempts are only redacted logs.

### Covered call paths

Covered now: `/api/pierrot-web` in both JSON and SSE modes, and all three
providers in that chain (Gemini, DeepSeek Direct, OpenRouter DeepSeek). This is
the path that handles Pierrot conversations, project/history scope, Brain
retrieval prompts and fallbacks. The shared Gemini adapter also records every
other Gemini call (for example Flow issue analysis) under the surface supplied
by the caller or `unknown`; the Pierrot route sets `skip` so the same call is
not counted twice.

Still not covered, and not claimed as covered: DeepSeek calls made by direct
clients outside the shared graph adapter (Flow issue analysis, question
synthesis, intake/art-engine, knowledge-map and the dev workbench) and OpenAI
embeddings. Extending the same attempt contract to those adapters is follow-up
work (O2); their spend is not present in this dashboard yet. This is intentional: consent limits
persistence, and telemetry must not become a side channel around it.

## 8. Verification performed

Commands are run from the repository root. This workspace had no installed
`node_modules`; `pnpm install --frozen-lockfile` was run first.

Targeted tests:

```bash
npx jest lib/ai/__tests__/telemetry.test.ts \
  lib/ai/evaluation/__tests__/compare.test.ts \
  lib/pierrot/__tests__/modelAttempts.test.ts \
  lib/pierrot/__tests__/historyWindow.test.ts \
  lib/pierrot/__tests__/streamingModel.test.ts \
  app/api/pierrot-web/__tests__/route.test.ts --runInBand
```

Static checks:

```bash
pnpm typecheck
pnpm lint
```

Actual result at the time of this report: `pnpm typecheck` exit 0; `pnpm lint`
exit 0 with pre-existing warnings and no errors; full `pnpm test --runInBand`
passed **423 suites / 3059 tests**. No live provider call was executed.

## 9. Minimum next steps for the owner

1. Apply the telemetry migration manually after review.
2. Configure verified Gemini rates (or a billing export) so Gemini estimates
   stop being null.
3. Let telemetry run for 48–72 hours, then read `/admin/pierrot/ai-costs`
   alongside the Google Cloud invoice for the same dates.
4. Decide whether to extend telemetry to embeddings (O2) and whether to change
   the retry UX (O3).
5. Run the live evaluation only after approving its bounded spend.
