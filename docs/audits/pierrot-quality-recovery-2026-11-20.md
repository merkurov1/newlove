# Pierrot quality recovery after Gemini became unavailable

Date: 2026-11-20  
Repository: `merkurov1/newlove`  
Base ref: `main`  
Task: `00390ed2-19e5-4f75-bdad-f0ae12ad3bda`  
Related PR: #44 (`[Pierrot] Pierrot — полный аудит качества AI, model routing и экономики Gemini/DeepSeek`)

## 0. Evidence boundary

This workspace does **not** contain production Supabase credentials, Vercel
environment values, provider keys or Google Cloud billing data. No secret file
was read or printed. No production deployment, live provider call or paid
evaluation was performed.

Therefore this report separates:

- **verified in code, git and tests** — stated as verified;
- **inferred from the task's production observations** — clearly marked;
- **not measured** — listed in section 9 and never presented as a fact.

The owner observations used as input are: Gemini API returned HTTP 429
“monthly spending cap exceeded” on 2026-11-20; production env names include
`GOOGLE_API_KEY`, `DEEPSEEK_API_KEY` and `OPENROUTER_API_KEY`; Supabase history
shows Gemini on 16 Nov and DeepSeek from 17 Nov; some recent
`pierrot_messages.provider` values are NULL.

## 1. Actual request paths

### 1.1 Website and ordinary Telegram Pierrot

Both channels converge on the same server route:

```text
Browser ───────────────► POST /api/pierrot-web
Telegram /api/pierrot ─► POST /api/pierrot-web   (same pipeline, JSON reply)
                                   │
                                   ├─ retrieval (Brain / Media / Journal / Flow / Web)
                                   ├─ deterministic plan (navigation, offers, tools, human presence)
                                   └─ streamPierrotModel / callPierrotModel
                                          Gemini → DeepSeek Direct → OpenRouter DeepSeek
```

Evidence: `app/api/pierrot/route.ts` `requestPierrot()` calls
`${siteUrl}/api/pierrot-web`; `app/api/pierrot-web/route.ts` selects
`streamPierrotModel` or `callPierrotModel`; provider order is defined in
`lib/pierrot/model.ts`.

### 1.2 Isolated Telegram Personal Assistant

The allowlisted private-chat profile is routed before the main pipeline:

```text
/api/pierrot (headers x-telegram-sender-id, x-telegram-chat-type=private)
  → /api/pierrot-web personal-assistant branch
  → runPersonalAssistantTurn()
  → callPersonalAssistantModel()
       DeepSeek Direct → OpenRouter DeepSeek → Gemini
```

Evidence: `lib/pierrot/personalAssistant/identity.ts`,
`lib/pierrot/personalAssistant/webhookAuth.ts`,
`lib/pierrot/personalAssistant/pipeline.ts`,
`lib/pierrot/model.ts` (`PERSONAL_ASSISTANT_PROVIDER_ORDER`).

This is an intentional difference: the personal assistant never used Gemini
as its primary model. A site-only Gemini outage can therefore not explain a
personal-assistant regression by itself.

### 1.3 Deterministic answers

Navigation, offer qualification, verified owner tools and human-presence copy
do not call a model. They are now stored with explicit provenance
(`provider = 'deterministic'`) instead of NULL. See section 5.

## 2. PR #44: real state

PR #44 is **merged**, not pending:

- state: `closed`, `merged: true`;
- merged at `2026-11-19T06:35:58Z`;
- head branch: `pierrot/dev/69ba98a7-7813-4326-8434-bf3aec88bf15/2`;
- 22 changed files, +3481 / -58;
- merge commit: `26c81495` (its merged parent is `d0ada17b`, the task
  `69ba98a7-7813-4326-8434-bf3aec88bf15 attempt 2` commit).

It introduced the work this task reuses rather than duplicates:

- `lib/ai/telemetry.ts`, `lib/ai/telemetryReport.ts` and the
  `pierrot_llm_calls` migration;
- per-attempt `onAttempt` telemetry in `lib/pierrot/model.ts`;
- `lib/ai/evaluation/*` and the owner-only evaluation endpoint;
- the `historyWindow` newest-first fix and retry-duplicate fix;
- `docs/audits/ai-pipeline-economics-audit-2026-11-18.md`.

The PR body itself says “requires explicit owner review”, but the GitHub API
shows it was merged later. The correct status is **merged, with owner review
still expected for follow-up work**, not “unmerged audit”.

## 3. Changes around 16 November

Verified from git history:

| Date (UTC) | Commit | Relevance |
| --- | --- | --- |
| 2026-11-15 | `0c5de715` | Routing/source-integrity/retrieval changes (`lib/pierrot/context/retrieval.ts` and response composition). This is before the Gemini 429. |
| 2026-11-15 | `fd0f98e2`, `27e3dcf2` | Next 16 / pnpm migration and async request API changes. No model order or prompt change. |
| 2026-11-16 | dev workbench / Codespaces commits | Task orchestration only; no Pierrot generation path change. |
| 2026-11-17 | dev workbench commits | Same. |
| 2026-11-18 | PR #44 `d0ada17b` | Telemetry, evaluation, history window, attempt recording. No change of default provider order. |
| 2026-11-19 | `98fa9891` | Adds the isolated personal-assistant profile with DeepSeek-first order. |
| 2026-11-20 | production Gemini 429 observed | Runtime provider availability event, not a committed routing change. |

No commit was found that switches the website from Gemini to DeepSeek as a
static default. The effective provider changed at runtime when Gemini began
returning 429.

## 4. Root causes by confidence

### High confidence — verified in code

1. **The website still asks Gemini first.** The chain is
   `Gemini → DeepSeek Direct → OpenRouter DeepSeek`
   (`lib/pierrot/model.ts`). A Gemini 429 therefore produces a DeepSeek answer,
   while the repository’s default order is unchanged. This matches the
   reported “Gemini 429 then DeepSeek” sequence.

2. **A production deployment that only exposes `GOOGLE_API_KEY` silently
   skipped Gemini.** Before this change `isGeminiConfigured()` and both Gemini
   request functions read only `GEMINI_API_KEY`. If that exact name was absent,
   the website went straight to DeepSeek even when a valid Google key existed
   under the Google-standard name. This is a concrete, testable defect and the
   most likely silent switch. It is fixed in `lib/ai/gemini.ts`.

3. **A monthly spending cap was treated as a transient error.** Gemini’s 429 was
   retried as an ordinary failure. Every request made one more doomed Gemini
   call until a short circuit window expired, adding latency and noise and
   occasionally re-probing a cap that cannot recover within the month. The
   provider now distinguishes `gemini_quota_exhausted` from a transient 429 and
   opens the circuit for `OPS_PROVIDER_QUOTA_COOLDOWN_SECONDS` (default 6
   hours) instead of the normal exponential cooldown.

4. **Provider attribution was incomplete.** Model attempts were recorded only
   for the main website path; the Telegram personal assistant did not persist
   `pierrot_llm_calls` rows. Deterministic assistant answers were persisted with
   `provider = NULL`. Both are fixed (section 5).

### Medium confidence — requires production data

5. **DeepSeek answers can be qualitatively worse on long RAG-style prompts even
   when the prompt is identical.** The adapter preserves system prompt, full
   history, RAG evidence and output format (regression-tested), so the loss is
   not caused by dropping context. It may still come from model behaviour,
   instruction-following, truncation or latency. This cannot be settled without
   a live identical-case evaluation, because the workspace has no provider
   keys.

6. **Retrieval failures were only visible as one aggregate count.** The
   existing `pierrot_v_retrieval_failures` view groups by outcome/code but not
   by day or channel. Time/channel correlation with the quality drop therefore
   could not be read directly. A new view and a derived failure taxonomy are
   added, but the production data has not been queried here.

### Low confidence / not supported

7. There is no committed change that lowers temperature, token limits or
   context truncation after 16 Nov. Generation budgets and history limits were
   last materially changed before the incident.
8. There is no evidence that the website and ordinary Telegram chat use
   different providers; they share `/api/pierrot-web`. The personal assistant
   is the only deliberate provider-order difference.

## 5. What was changed

### Provider key compatibility and quota-aware fallback

- `lib/ai/gemini.ts`
  - `geminiApiKey()` reads `GEMINI_API_KEY` first, then `GOOGLE_API_KEY`.
  - `geminiApiKeySource()` exposes the variable name only (never the value).
  - A 429 containing a monthly/quota/billing/resource-exhausted signal becomes
    `gemini_quota_exhausted` and opens the circuit for the long quota cooldown.
  - Ordinary 429/5xx remains a bounded transient failure.
  - Evaluation can pass an explicit key without logging it.

- `lib/operations/circuitBreaker.ts`
  - Always checks the in-process breaker before the shared table, so a missing
    or unreachable ops table cannot bypass a local quota shutdown.
  - Accepts an explicit `cooldownSeconds` (clamped to the configured maximum)
    for known long outages.

- `lib/operations/config.ts`
  - New `OPS_PROVIDER_QUOTA_COOLDOWN_SECONDS` (default 21 600 s, max 86 400 s).

### Provider/model telemetry

- `lib/pierrot/model.ts`
  - `isRetry` now means “same provider retried”, not “any later fallback”.
  - Results include `providerChain` (ordered providers contacted).
  - Streaming and non-streaming paths use the same rules.

- `lib/pierrot/personalAssistant/pipeline.ts`
  - Accepts an `onAttempt` callback and passes it to the model router.
  - Stores `provider_chain` in assistant message metadata.

- `app/api/pierrot-web/route.ts`
  - Persists one `pierrot_llm_calls` row per personal-assistant attempt under
    the new `telegram_personal_assistant` surface.
  - Assistant transcript rows always receive a non-NULL provider:
    the actual model provider, `deterministic` for server-built answers, or
    `unknown` only as a defensive last resort.
  - `assistant_replied` and `assistant_partial` events now carry
    `answer_provider`, `answer_source` and `provider_chain`.

- `lib/pierrot/serverStore.ts`
  - If the provenance migration is not applied yet, a rejected
    `deterministic`/`unknown` provider is retried with NULL so an answer is
    never lost during deploy ordering. The explicit reason remains in metadata
    and the event.

### Database changes (additive, not applied)

`migrations/2026-11-20_pierrot_answer_provenance.sql`:

- widens `pierrot_messages.provider` to allow `deterministic` and `unknown`;
- updates both append RPCs to the same list;
- adds `telegram_personal_assistant` to `pierrot_llm_calls.surface`;
- adds `pierrot_v_retrieval_failures_by_day_mode`, grouping retrieval failures
  by day, mode/channel, outcome and code, service-role only.

No billing setting, Gemini cap or paid plan is changed.

### Retrieval taxonomy

- `lib/knowledge/rag/failureClassification.ts` derives:
  `timeout`, `embedding_unavailable`, `database_unavailable`,
  `index_mismatch`, `empty_corpus`, `no_relevant_match`, `weak_match`,
  `invalid_request`, `disabled`, `unexpected`.
- The classification is written into `brain_retrieval` events as
  `failure_class` (no query or passage text).
- The new SQL view exposes the same split by day and channel mode.

## 6. Controlled evaluation

`lib/ai/evaluation/*` already compares providers on the same synthetic,
bilingual cases with the same system prompt, user prompt and output budget.
Six cases cover direct facts, navigation, honest uncertainty, non-fabrication
and bounded answers. The harness records quality checklist score, latency,
tokens, cost when known and cost per successful task.

This task adds regression coverage for the property that matters when a
provider changes: the system prompt and full conversation history reach every
fallback provider unchanged (`lib/pierrot/__tests__/modelAttempts.test.ts`).

A **live** Gemini-vs-DeepSeek run was **not executed** because this workspace
has no provider keys and the owner explicitly restricted paid calls. The
harness remains the correct instrument once the owner supplies keys and
approves a bounded run (`ALLOW_PAID_AI_EVALUATION=true`).

## 7. RAG failure interpretation

The production view should now answer four distinct questions:

| Observed class | Meaning | Typical next action |
| --- | --- | --- |
| `timeout` | embedding or search exceeded its budget | inspect provider latency and the 3 s / 5 s / 9 s split |
| `embedding_unavailable` | OpenRouter embedding request failed | check key/quota/provider status; generation still works without RAG |
| `database_unavailable` | Supabase search/RPC unavailable | check database health, not the model |
| `index_mismatch` | model/dimension mismatch after re-index | re-ingest with the pinned `baai/bge-m3` contract |
| `empty_corpus` / `no_published_records` | nothing is published/eligible | content/approval problem, not retrieval code |
| `no_relevant_match` | index exists, query simply did not match | query phrasing or threshold calibration |
| `weak_match` | matches exist but below threshold | inspect top similarity; do not assume “no data” |
| `invalid_request` / `disabled` | bad query, unauthorized scope or flag off | configuration, not failure |

Without production database access this report cannot state which class
dominated on 16–20 Nov. That classification is the first owner-side query after
deploy (section 9).

## 8. Verification run in this workspace

- `pnpm typecheck` — passed (exit 0).
- Targeted Jest suites for routing, fallback, telemetry, Gemini quota, personal
  assistant, retrieval classification and the route — passed.
- Full `pnpm test --runInBand` — passed: **462 suites / 3329 tests**, 0 failures.
- `pnpm lint` — exit 0. 1385 pre-existing warnings across the repository, 0
  errors; every changed file was also linted individually with no errors.
- `pnpm build` with CI placeholder Supabase values — passed, including the
  `/api/pierrot-web` and `/api/pierrot` routes.
- No live provider call, no production deploy, no Preview observation and no
  migration applied.

## 9. Remaining unknown and owner actions

1. Apply `migrations/2026-11-20_pierrot_answer_provenance.sql` manually after
   review. Code keeps working before it is applied (server-store fallback), but
   deterministic rows stay NULL until then.
2. Deploy and observe 48–72 hours. Read:
   - `pierrot_messages` provider distribution for new assistant rows;
   - `pierrot_llm_calls` by surface/provider/attempt/fallback;
   - `pierrot_v_retrieval_failures_by_day_mode`.
3. Confirm whether the production deployment has `GEMINI_API_KEY`,
   `GOOGLE_API_KEY`, or both. Do not copy key values into logs or tickets.
4. If Gemini remains over its monthly cap, keep DeepSeek as the effective
   provider. Restoring Gemini or changing the paid plan requires a separate
   owner decision; this task does not change billing.
5. Run the identical-case evaluation with live keys and an approved bounded
   budget, then compare quality, latency and cost per successful task.
6. Treat any remaining quality gap as a model/context question and use
   retrieval classes plus evaluation results, not the single fact of a provider
   switch, to decide the next fix.

## 10. Expected operational effect

- No repeated Gemini calls while the monthly cap is exhausted; the first
  attempt is short-circuited for the quota cooldown.
- The website and ordinary Telegram chat use the same provider order and both
  record the actual provider/model, attempt number, fallback source, latency
  and usage.
- The personal assistant has separate, attributable telemetry.
- Deterministic answers are explicitly attributable after migration.
- Cost does not increase: Gemini is not re-enabled and no paid plan changes.
