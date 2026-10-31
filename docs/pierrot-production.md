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
  `purge_expired_pierrot_conversations()` RPC daily at 05:00 and removes stale
  rate-limit buckets.
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

## Operational settings

```env
PIERROT_RAG_ENABLED=true
PIERROT_PUBLIC_RAG_ENABLED=false
PIERROT_BRAIN_RETRIEVAL_V2=true
CRON_SECRET=...
```

`PIERROT_RAG_ENABLED` is configured in Vercel Production. The public flag stays
off until explicitly approved public documents exist.

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
