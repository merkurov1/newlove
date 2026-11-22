# Pierrot AI usage: verified facts, unknowns and next steps

Date: 2026-11-21  
Scope: web Pierrot, Telegram bot, embeddings, Gemini pricing, evaluation
evidence. No secrets are printed below. No paid provider call and no production
schema change were performed in this task.

## 1. Provider routing in code

### Web Pierrot

Source of truth: `lib/pierrot/model.ts` (`callPierrotModel`,
`streamPierrotModel`) and `app/api/pierrot-web/route.ts`.

Order, identical for JSON and SSE:

1. **Gemini** — pinned `gemini-3.5-flash` in `lib/ai/gemini.ts`, endpoint
   `generativelanguage.googleapis.com`, key header `x-goog-api-key`.
2. **DeepSeek direct** — `deepseek-chat`, or `deepseek-reasoner` for the
   reasoning task class, endpoint `https://api.deepseek.com`.
3. **OpenRouter DeepSeek** — `deepseek/deepseek-chat`, or
   `deepseek/deepseek-r1-0528` for reasoning, endpoint
   `https://openrouter.ai/api/v1`.

The first provider is skipped only when its key is absent. Every attempt,
including a failed provider, records a telemetry row. A fallback is a new row
with `fallback_from` set; it is not overwritten by the successful provider.

**What is confirmed:** the code order, pinned model names and env-variable
names.  
**What cannot be confirmed from this workspace:** whether production Vercel
currently has `GEMINI_API_KEY`, `DEEPSEEK_API_KEY` and `OPENROUTER_API_KEY`
set. That determines the _effective_ first provider. The repository must not
invent the answer.

Safe ways to confirm without exposing secrets:

- run `pnpm ai:routing-report` in a production shell; it prints only booleans,
  model names and endpoint hosts;
- as an admin, call `GET /api/admin/pierrot/ai-evaluation`; the response now
  includes the same `providerRouting` snapshot from the live runtime;
- check Vercel Production → Environment Variables for the _presence_ of the
  names (never copy values);
- after the telemetry migration is applied, read
  `/admin/pierrot/ai-costs`; the first rows show the provider/model that
  actually answered.

### Telegram

Source of truth: `app/api/bot/route.ts`, `lib/telegram.ts`,
`lib/telegram-research/deepseek.ts`.

| Path                     | Provider                | Model                                                    | Endpoint                                          |
| ------------------------ | ----------------------- | -------------------------------------------------------- | ------------------------------------------------- |
| Bot text replies         | DeepSeek direct         | `DEEPSEEK_MODEL` or `deepseek-chat`                      | `DEEPSEEK_BASE_URL` or `https://api.deepseek.com` |
| Deep-research command    | Gemini Interactions API | `deep-research-pro-preview-12-2025`                      | `generativelanguage.googleapis.com`               |
| Channel-post enhancement | DeepSeek direct         | `deepseek-chat`                                          | `https://api.deepseek.com`                        |
| Telegram research CLI    | DeepSeek direct         | default `deepseek-flash` (`DEEPSEEK_MODEL` can override) | `DEEPSEEK_BASE_URL`                               |

So Telegram is **not** Gemini-first for ordinary replies. Its reply path is
DeepSeek-first by code and has no OpenRouter fallback. The research command is
a separate Gemini-powered feature. The effective reply model can be changed
only by `DEEPSEEK_MODEL`; the default is `deepseek-chat`.

Evidence without secrets: the report script above reports
`telegram.replyProvider = 'deepseek'`, `replyModel`, `replyHost` and
`researchConfigured: true/false` (boolean only).

## 2. What telemetry now records

Migration: `migrations/2026-11-18_pierrot_llm_call_telemetry.sql` (reviewed, not
applied; see the separate migration review document).

Covered runtime paths:

- `/api/pierrot-web` JSON and SSE: every Gemini/DeepSeek/OpenRouter attempt,
  including failures, fallbacks and provider-reported streaming usage.
- Shared Gemini adapter: non-Pierrot Gemini calls such as Flow issue analysis,
  with an explicit surface or `unknown`.
- Shared DeepSeek graph adapter: Brain graph, media analysis and synthesis
  calls.
- OpenRouter embeddings (`baai/bge-m3`): one row per embedding HTTP request,
  successful or failed, with `finish_reason = 'embedding'`.
- Brain retrieval v1 and v2, Brain workers/inline ingestion, media search,
  Flow retrieval, manuscript search, memory indexing and graph radar all use
  the instrumented embedding client.

Privacy and consent:

- No prompt, answer, history, RAG passage, vector, file content or credential is
  stored. Only character/token counts, provider/model, attempt flags, latency
  and stable error codes are stored.
- Embedding telemetry receives `store: null` when transcript consent is denied
  in `/api/pierrot-web`; the attempt is only a redacted log. It does not create
  a service-role client just for telemetry.
- Request/conversation/session/user identifiers are omitted when consent denies
  metadata storage.

## 3. Dashboard semantics

`/admin/pierrot/ai-costs` shows:

- messages (from `assistant_replied` events) separately from provider attempts;
- calls, ok/failed, retries (same provider) and fallbacks (provider switch)
  separately;
- input/output/total tokens and the count of attempts with unknown usage;
- average latency for all attempts and per provider/model/surface;
- estimated cost with a separate count of unknown-cost attempts;
- provider-reported cost separately from tariff estimates.

NULL tokens and NULL costs are rendered as `—` / `unknown`, never `0`. If the
migration is missing, the page shows `telemetry_migration_not_applied` instead
of an empty zero-cost report.

## 4. Gemini pricing

No Gemini rate is bundled. `lib/ai/telemetry.ts` reads rates only from
owner-supplied values:

- `GEMINI_INPUT_USD_PER_MILLION`
- `GEMINI_OUTPUT_USD_PER_MILLION`
- `GEMINI_CACHED_INPUT_USD_PER_MILLION`

These must come from a Google Cloud Billing export/invoice for the project that
owns the Gemini API key. Without them, every Gemini estimate stays
`cost_source = 'unknown'` and `estimated_cost_usd IS NULL`. The evaluation
harness applies the same rule: an unknown Gemini price makes
`costPerSuccessfulTaskUsd` null rather than a guessed number.

## 5. Gemini vs DeepSeek evaluation

Harness: `lib/ai/evaluation/*`, owner-only
`GET/POST /api/admin/pierrot/ai-evaluation`.

- Six fixed synthetic bilingual cases (direct fact, navigation, honest
  uncertainty, no fabrication, bounded answer).
- The same system prompt, user prompt and output budget are sent to both
  providers; the test asserts prompt equality.
- Quality is a deterministic checklist, latency is measured per call, and cost
  is estimated from the same tariff table with unknown kept unknown.
- A live run requires both `ALLOW_PAID_AI_EVALUATION=true` and
  `POST {"confirm":true}` from an admin session. No live run was made in this
  task, so the owner still needs to approve the bounded spend.

## 6. Confirmed facts vs unknowns

Confirmed:

- Web code order and pinned model names.
- Telegram reply provider/model defaults and the separate research agent.
- Embedding model `baai/bge-m3` through OpenRouter.
- Migration contents, RLS/grants and fail-closed application behaviour.
- Unit-level telemetry, report, fallback, streaming-usage, embedding and
  evaluation tests pass locally: `pnpm typecheck` exit 0, `pnpm lint` exit 0
  (warnings only), `pnpm test --runInBand` 473 suites / 3388 tests.

Unknown / owner-dependent:

- Production environment presence of each provider key and therefore the
  _effective_ production provider.
- Whether the telemetry migration has already been applied in production (this
  workspace has no production database access).
- Verified Gemini rates and the actual Google Cloud invoice.
- Results of a live Gemini vs DeepSeek evaluation (not run without consent).

## 7. Recommended next steps

1. Review and, if approved, apply the telemetry migration manually using the
   safe path in the migration review document.
2. Run `pnpm ai:routing-report` in production and record only the boolean/model
   output.
3. Let one real traffic day accumulate, then compare
   `/admin/pierrot/ai-costs` with the provider invoices for the same dates.
4. Add verified Gemini rates only when a real billing line exists.
5. Approve a bounded live evaluation run if quality/latency comparison is
   needed; the harness is ready but disabled by default.
