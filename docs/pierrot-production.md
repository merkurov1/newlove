# Pierrot production readiness

## Brain and owner scope

- `PIERROT_RAG_ENABLED=true` enables owner Brain retrieval for verified owners.
- The flag now controls every owner retrieval call. There is no `enabled: true`
  override in the web route.
- Owner identity comes only from a verified user/admin session, Telegram Mini
  App `initData`, or a Bearer user JWT. `x-admin-key` and shared service secrets
  never grant manuscript or owner Brain access.
- Public Pierrot has a separate opt-in flag, `PIERROT_PUBLIC_RAG_ENABLED`
  (default `false`), and uses only documents with
  `knowledge_documents.public_retrieval_allowed = true`.
- Manuscripts and `personal_writing` are never public-retrievable.

## Model providers

Pierrot uses `gemini-3.5-flash` as the primary model and falls back
automatically to DeepSeek Direct, then OpenRouter DeepSeek. The same system
prompt, history and RAG evidence are preserved across providers. Owner
authorization and retrieval boundaries are unchanged. The default response
remains the existing JSON contract; Owner Workspace chat can opt into SSE with
`stream: true`. See `docs/gemini-integration.md`.

## Owner chat streaming

Owner Workspace chat sends `stream: true` and `Accept: text/event-stream` to
`POST /api/pierrot-web`. The route returns `text/event-stream` only for a
verified owner; every other caller keeps the JSON response.

Protocol version 1 uses SSE `event:` + JSON `data:` frames:

- `accepted` — ids for the accepted turn;
- `status` — `retrieving`, `generating`, `persisting`;
- `delta` — incremental provider text;
- `sources` — actual Brain/Web/source-status payload;
- `completed` — the authoritative final JSON payload;
- `error` — sanitized error, stable code, `retryable`/`interrupted` flags.

Gemini streams through `streamGenerateContent?alt=sse`; DeepSeek and OpenRouter
stream through their OpenAI-compatible chat completion streams. Provider
fallback is allowed only before the first emitted delta. After the first delta,
a failure produces `error` with `interrupted: true` and the partial answer is
never persisted. The client can retry with the original prompt.

Cancellation uses `AbortController` on the client and propagates through the
request signal to the provider. A cancelled or interrupted turn is not written
as a completed assistant message. Only the final successful answer is persisted
through the existing `appendPierrotMessage` path.

## Autonomous web search

Web evidence is an independent third source, added through Exa Search
(`POST https://api.exa.ai/search`). It is server-only and never replaces Brain
retrieval or the existing Gemini/DeepSeek chain.

- `PIERROT_WEB_SEARCH_ENABLED=true` and `EXA_API_KEY` are both required. If
  either is missing, chat continues normally with model knowledge and Brain.
- The decision to search is deterministic (`lib/knowledge/web/searchDecision.ts`)
  and makes no extra LLM call. Greetings, casual messages, writing tasks,
  short follow-ups, and questions about Anton's own texts stay off the web
  path. Current events, explicit verification and general factual lookups
  search. A question that needs both the owner's archive and current external
  evidence runs Brain and Exa in parallel.
- Only the user's external research query is sent to Exa. Brain passages,
  private manuscript text, unpublished columns, owner-only material and the
  conversation history are never part of the Exa request.
- Results are bounded (default 5, maximum 6), deduplicated by URL, time-limited
  (default 6 s, maximum 10 s) and reduced to a bounded text budget. The full
  extracted text remains on the server; the browser receives only short
  excerpts. A failed search never prevents a normal answer.
- Search results are untrusted data. The generation prompt delimits them as
  JSON and instructs the model to ignore instructions found inside a page, to
  synthesize rather than copy snippets, and never to invent URLs, dates or
  quotations. The deterministic Sources section is built only from URLs Exa
  actually returned.
- The response includes an informational `answerSources` indicator (`MODEL`,
  `BRAIN`, `WEB`, `BRAIN + WEB`). It is not a user-controlled search mode.
  No web results are ingested into Brain and no background/cron search exists.

Relevant modules: `lib/knowledge/web/{config,exaSearch,searchDecision,webContext,types}.ts`.

## Retrieval quality

Owner retrieval now uses deterministic refinement:

1. original source-aware hybrid query;
2. broaden a too-narrow date filter;
3. retry with the lexical query;
4. retry with a larger top-K and merge unique chunks.

A single empty result is not treated as proof that the archive has no answer.
The prompt explicitly distinguishes “retrieved evidence does not establish it”
from “the book has no answer”.

Specific queries covered:

- Novaya Gazeta + “last two months” date parsing;
- UNFRAMED/manuscript scope;
- archive relationship questions;
- public site structure and Pierrot’s own concept.

## Public / owner separation

Public Pierrot never calls owner retrieval. If public RAG is enabled, it uses the
same public-only RPC and post-verification as Flow:

- explicit document allowlist;
- `public_retrieval_allowed = true`;
- no manuscript/private columns;
- application-side re-verification after retrieval.

## Commercial planner

The deterministic planner remains the source of truth for offers, prices,
availability, CTA routes and refusals. No model may invent a price or route.

`offer_viewed` is now stored separately from `cta_shown` in the analytics
conversation summary. The funnel still reports each stage independently.

## Human handover

The server workflow is:

```text
REQUESTED -> TELEGRAM NOTIFIED -> ACCEPTED / DECLINED / EXPIRED
```

- Telegram notification failure returns the “Anton unavailable” copy and never
  claims that the request is pending.
- A pending response is returned only after Telegram confirms the send.
- “Anton is here” is shown only for an active accepted session.
- Duplicate requests are idempotent and do not spam Telegram.

## Consent, retention and reliability

- No stored consent is `pending`, not `granted`. No transcript is written until
  the visitor explicitly allows saving.
- Telegram defaults to `pending`; `/privacy on` grants saving, `/privacy off`
  denies it.
- `/api/cron/pierrot-retention` runs the existing
  `purge_expired_pierrot_conversations()` RPC and removes stale rate-limit
  buckets. It must be called by an external scheduler; `vercel.json` currently
  has no cron entries.
- Rate limiting is cross-instance through `pierrot_rate_limit()`; the in-memory
  limiter remains only as a fallback. Raw IPs/Telegram ids are hashed before
  storage.
- Server-only modules call `assertServerOnly()` so accidental client imports
  fail fast.

## Analytics

Retrieval events now include:

- mode (`brain_v2`, `brain_v1`, `media`, `public_brain`, `disabled`);
- outcome, selected sources, document/chunk counts, latency;
- whether context was used, generation success/failure, refinement attempts;
- media fallback count.

No query text, passages, visitor text or email is stored in these payloads.

The admin Overview now also shows a compact **RAG / Brain** panel: corpus by
source type, embedded chunks, ingestion/graph/media queue health, retrieval
outcomes and latency over 30 days. It exposes counts only, never query text or
passages.

The admin dashboard now shows:

- answer success/failure and feedback;
- retrieval quality, context use, media retrieval and latency;
- handover requests/outcomes;
- subscriber catalogue confirmed/pending/unsubscribed counts;
- conversations requiring attention;
- the existing offer funnels and confirmed outcomes.

`subscription_failed` diagnostics now include a database error code. The 63
historical failures all had `reason=lookup` on 2026-10-30, before
`confirmedAt`/`unsubscribedAt` existed. The production schema now has those
columns and `subscriber_tokens.usedAt/expires_at`; the exact PostgREST lookup
used by `/api/subscribe` succeeds.

Postcard runtime availability is read from the `postcards` catalogue and the
order route requires `available=true` and a positive integer price. The
production catalogue currently has `postcard_1` available at £29.

## Brain Research inventory questions

Questions such as «найти все мои колонки в новой газете» or «сколько я написал
колонок в новую газету» are answered deterministically from
`knowledge_documents`, not from top-K retrieval. The inventory path:

- detects a publication inventory question;
- filters `source_type = article` on `novayagazeta.ru/.eu`;
- removes duplicate URLs and `media_coverage` mirrors;
- applies an explicit date range when the question contains one;
- lists every matching document with its date.

It returns a caveat stating that the count describes the indexed Brain corpus,
not the publication's complete archive. The same function is unit-tested in
`lib/knowledge/graph/__tests__/researchInventory.test.ts`.

## Food and recipe retrieval

The owner's 2018/2019 TXT archive contains many recipe instructions, but the
chunks are short and often lose a pure vector-similarity race to one-line
markers such as «Рецепт недели:» or «Приятного аппетита!». The owner Brain
retrieval now has a deterministic food fallback:

- detects recipe/food terms in the query plan (`topic:food`);
- reads only `access_class='owner'` chunks (never public scope);
- ranks chunks by cooking verbs, ingredients and content length;
- drops one-line markers and false positives such as «победа» or «сковорода»
  used as a metaphor;
- allows up to six chunks from the same archive document so a list of recipes
  is not reduced to one marker.

The fallback runs only for owner mode. Public Pierrot still cannot read these
documents because `public_retrieval_allowed=false`. To expose recipes publicly,
the owner must explicitly approve those documents; the code will not flip the
flag automatically.

## Operational settings

```env
PIERROT_RAG_ENABLED=true
PIERROT_PUBLIC_RAG_ENABLED=false
PIERROT_BRAIN_RETRIEVAL_V2=true
PIERROT_WEB_SEARCH_ENABLED=true
EXA_API_KEY=...
# Optional: PIERROT_WEB_SEARCH_TIMEOUT_MS=6000
# Optional: PIERROT_WEB_SEARCH_MAX_RESULTS=5
CRON_SECRET=...
```

`PIERROT_RAG_ENABLED` is configured in Vercel Production. The public flag stays
off until explicitly approved public documents exist. Web search requires both
`PIERROT_WEB_SEARCH_ENABLED=true` and a server-side `EXA_API_KEY`; the key must
never be prefixed with `NEXT_PUBLIC_`.

## Tests

```bash
npx tsc --noEmit
npx jest lib/pierrot lib/analytics/__tests__/pierrotIntelligence.test.ts \
  app/api/pierrot-web app/api/pierrot/human app/api/admin/pierrot \
  app/api/subscribe lib/knowledge/rag/__tests__/pierrotRetrieval.test.ts \
  --runInBand
```

Coverage includes owner flag enforcement, shared-secret rejection, retrieval
refinement, public-scope filtering, consent default, analytics semantics,
handover copy and subscription lookup compatibility.
