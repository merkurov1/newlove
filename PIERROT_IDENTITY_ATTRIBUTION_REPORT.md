# Pierrot Identity, Session Attribution & Visitor Analytics — Delivery Report

**Date:** 2 November 2026  
**Repository:** `merkurov1/newlove`  
**Status:** implemented, tested, build passing. **Migration not applied. Not deployed.**

---

## 1. Changed files

### New code

| File                                                     | Purpose                                                                                  |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `lib/pierrot/identity.ts`                                | Owner/visitor/unknown contract, server-only validation, missing-column fallback detector |
| `lib/analytics/pierrotIdentity.ts`                       | Pure identity metrics, new/returning, entry pages, referrers, prior-visitor lookup       |
| `migrations/2026-11-12_pierrot_identity_attribution.sql` | Additive attribution columns, constraints and indexes                                    |

### Modified code

| File                                    | Change                                                                                                                |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `app/api/pierrot-web/route.ts`          | Resolves owner source/user id, uses consented visitor pseudonym, persists identity, ignores all client identity flags |
| `app/api/pierrot/events/route.ts`       | Resolves identity for client events, persists visitor/owner attribution                                               |
| `lib/pierrot/serverStore.ts`            | Identity-aware conversation creation/update; owner upgrade; visitor never downgrades owner; pre-migration fallback    |
| `lib/pierrot/clientTelemetry.ts`        | Persistent first-party visitor id; consent-gated; rotation on auth changes; sent with chat/events                     |
| `components/pierrot/PierrotContext.tsx` | Sends `visitorId`; rotates visitor id on sign-in/sign-out/account change                                              |
| `lib/analytics/pierrotIntelligence.ts`  | Identity fields, filter, snapshot metrics, transcript identity, missing-column fallback                               |
| `lib/pierrot/ownerTools.ts`             | Identity-aware analytics tool and routing for visitor/unknown questions                                               |
| `app/admin/pierrot/page.tsx`            | Compact identity section, identity filter, identity column                                                            |
| `tsconfig.json`                         | Excludes `**/__tests__/**` from production typecheck (tests are run by Jest/SWC); clean `tsc` and build               |

### New tests

- `lib/pierrot/__tests__/identity.test.ts`
- `lib/pierrot/__tests__/identityMigration.test.ts`
- `lib/pierrot/__tests__/serverIdentityStore.test.ts`
- `lib/analytics/__tests__/pierrotIdentity.test.ts`
- `app/api/pierrot/events/__tests__/route.test.ts`
- additions to `app/api/pierrot-web/__tests__/route.test.ts`
- additions to `lib/pierrot/__tests__/consent.test.ts`
- additions to `lib/analytics/__tests__/pierrotIntelligence.test.ts`

### Documentation

- `PIERROT_IDENTITY_AUDIT.md`
- `PIERROT_IDENTITY_ATTRIBUTION_REPORT.md`

No secrets, `.env` files, cron jobs, workers or Vercel configuration were changed.

---

## 2. SQL migration

File: `migrations/2026-11-12_pierrot_identity_attribution.sql`

Adds to `public.pierrot_conversations`:

```sql
identity_type TEXT NOT NULL DEFAULT 'unknown'
visitor_id TEXT
user_id UUID
identity_verified_at TIMESTAMPTZ
identity_source TEXT
```

Constraints:

- `identity_type IN ('owner','visitor','unknown')`;
- `visitor_id` matches `^[A-Za-z0-9_-]{8,64}$` or is null;
- `identity_source` is one of the documented server sources;
- consistency: owner requires `identity_verified_at`; visitor requires `visitor_id` and no verification timestamp; unknown has no `visitor_id`.

Indexes:

- `(identity_type, started_at DESC)`;
- `(visitor_id, started_at DESC) WHERE visitor_id IS NOT NULL`;
- `(user_id) WHERE user_id IS NOT NULL`.

The migration is additive and non-destructive. It does not change RLS, grants, policies, data or retention.

---

## 3. Manual Supabase step

**Apply `migrations/2026-11-12_pierrot_identity_attribution.sql` manually through the project's existing Supabase migration workflow.**

Until it is applied:

- chat still works;
- events still work;
- attribution stays `unknown`;
- identity analytics shows legacy rows as unknown;
- owner/visitor/new/returning metrics remain empty or incomplete.

The application has a missing-column fallback in `ensurePierrotConversation`, `loadPierrotDashboard` and `loadConversationTranscript`, so the pre-migration deployment is safe.

No production migration was executed by this task.

---

## 4. Environment variables

No new environment variables are required.

No Vercel/Supabase setting changes are required for the code. The existing `NEXT_PUBLIC_SUPABASE_*` and service-role credentials are reused.

---

## 5. Test results

| Check                       | Result                                            |
| --------------------------- | ------------------------------------------------- |
| Full Jest                   | **162 / 162 suites, 1103 / 1103 tests passed**    |
| Identity-focused suites     | 30+ tests passed                                  |
| TypeScript (`tsc --noEmit`) | **PASS**                                          |
| Production build            | **PASS** (`next build --debug`, BUILD_ID created) |

Key regression scenarios:

| Scenario                                                                  | Result                                            |
| ------------------------------------------------------------------------- | ------------------------------------------------- |
| A. Owner signed in on public page → owner                                 | PASS                                              |
| B. Owner opens `/admin/pierrot` → owner                                   | PASS                                              |
| C. External visitor → visitor                                             | PASS                                              |
| D. Returning visitor with same visitor id                                 | PASS (new/returning metrics)                      |
| E. New device → separate visitor                                          | PASS (storage isolation test)                     |
| F. Visitor sends `is_owner=true` → not owner                              | PASS                                              |
| G. Visitor opens `/admin` without rights → not owner                      | PASS                                              |
| H. Owner signs out → next anonymous conversation not owner                | PASS                                              |
| I. Telegram owner attribution                                             | PASS (`telegram_owner`, user_id null)             |
| J. Historical conversation without proof → unknown                        | PASS                                              |
| K. Visitor cannot access owner Brain/tools                                | PASS (existing 403/owner-mode tests remain green) |
| L. Owner tests excluded from visitor metrics                              | PASS                                              |
| M. Unknown not included in visitor totals                                 | PASS                                              |
| N. Multiple tabs / cleared sessionStorage keep visitor, separate sessions | PASS                                              |
| O. Cleared localStorage creates a new visitor, no false merge             | PASS                                              |

---

## 6. Security checks

- Owner comes only from Supabase ADMIN session, verified Bearer JWT, verified Telegram initData, or the existing allowlisted Telegram owner + internal secret.
- `x-admin-key`, `x-admin-secret` and service-role secrets do not create owner identity.
- Client-supplied `is_owner`, `owner`, `identity_type`, `user_id` are ignored.
- A visitor cannot open owner mode by calling `/api/pierrot-web` with `mode:'unframed'`; the existing 403 remains.
- No IP, geolocation, fingerprint, email, advertising id or user-agent identity is collected.
- Visitor id is generated only after explicit consent (`consent.state === 'granted'`).
- Visitor id is a random UUID, not derived from any account or device signal.
- No public read endpoint was added.
- `pierrot_conversations`, messages and events keep their existing RLS and service-role-only access.
- No new background worker, cron, polling or LLM call was added.

---

## 7. Identity lifecycle

```text
Incoming request
  │
  ├─ verified ADMIN session ───────────────► owner
  │                                         user_id = UUID (if available)
  │                                         source = supabase_session
  │                                         verified_at = now
  │
  ├─ verified Bearer JWT / Telegram ───────► owner
  │                                         source = bearer_jwt / telegram_init_data
  │                                         / telegram_owner
  │
  ├─ no owner + consent granted + ────────► visitor
  │  valid first-party visitorId             visitor_id = pseudonym
  │                                         source = visitor_local_storage
  │                                         verified_at = null
  │
  └─ otherwise ───────────────────────────► unknown
                                            visitor_id = null
                                            user_id = null
```

Persistence rules:

- owner may upgrade an existing visitor conversation;
- visitor/anonymous updates carry `neq(identity_type,'owner')` and cannot downgrade owner;
- an owner upgrade clears the visitor pseudonym from that conversation;
- new conversation after sign-out starts without owner attribution;
- historical rows are not modified.

---

## 8. Historical classification report

Read-only production snapshot (last 30 days):

| Metric                          | Value |
| ------------------------------- | ----: |
| Conversations                   |   127 |
| Unique sessions                 |    79 |
| Conversations with `user_id`    |     0 |
| Sessions with `/admin*`         |    12 |
| Conversations in those sessions |    15 |
| Sessions without `/admin*`      |    67 |
| Conversations in those sessions |   112 |
| Consent granted                 |   124 |
| Consent pending                 |     3 |

Classification:

| Class   | Conversations | Basis                                           |
| ------- | ------------: | ----------------------------------------------- |
| Owner   |         **0** | no server-verified user link                    |
| Visitor |         **0** | no visitor pseudonym existed before this change |
| Unknown |       **127** | no provable identity                            |

Admin-page visits are not proof. All 79 historical sessions and all 127 conversations remain Unknown. New/returning history for the old period is not claimed.

No historical rows were updated, deleted or recreated.

---

## 9. SQL checks for the owner

After the migration and after new traffic:

```sql
-- Identity breakdown for the last 30 days
select identity_type, count(*) as conversations
from public.pierrot_conversations
where started_at >= now() - interval '30 days'
group by identity_type
order by identity_type;

-- Unique visitor pseudonyms and sessions
select
  count(distinct visitor_id) as unique_visitors,
  count(distinct session_id) as visitor_sessions,
  count(*) as visitor_conversations
from public.pierrot_conversations
where identity_type = 'visitor'
  and started_at >= now() - interval '30 days';

-- Owner tests excluded from visitor metrics
select count(*) as owner_tests
from public.pierrot_conversations
where identity_type = 'owner'
  and started_at >= now() - interval '30 days';

-- Unknown is a separate bucket, never visitor
select count(*) as unknown_conversations
from public.pierrot_conversations
where identity_type = 'unknown'
  and started_at >= now() - interval '30 days';

-- Returning visitors: visitor ids seen before the window and again inside it
with prior as (
  select distinct visitor_id
  from public.pierrot_conversations
  where identity_type = 'visitor'
    and visitor_id is not null
    and started_at < now() - interval '30 days'
),
current as (
  select distinct visitor_id
  from public.pierrot_conversations
  where identity_type = 'visitor'
    and visitor_id is not null
    and started_at >= now() - interval '30 days'
)
select count(*) as returning_visitors
from current
join prior using (visitor_id);

-- Recent conversations with attribution
select id, identity_type, identity_source, visitor_id, user_id,
       identity_verified_at, start_page, started_at
from public.pierrot_conversations
order by started_at desc
limit 50;
```

---

## 10. Analytics changes

### Admin `/admin/pierrot`

- New compact “Identity attribution” section:
  - owner conversations/sessions;
  - visitor conversations/sessions/unique visitors;
  - unknown conversations/sessions;
  - new/returning visitors;
  - conversations per visitor;
  - owner tests excluded.
- New `identity` filter: All / Visitor only / Owner only / Unknown only.
- Conversation table now shows identity type and source.
- Transcript header shows identity type.

### Owner analytics via Pierrot

Questions such as:

- «Сколько реальных посетителей общалось со мной за неделю?»
- «Сколько было новых и вернувшихся посетителей?»
- «Какие диалоги принадлежат мне и должны быть исключены?»
- «Сколько сессий пока невозможно классифицировать?»

now route to the existing `analytics` owner tool. The response includes:

- owner / visitor / unknown counts;
- unique visitors;
- new / returning;
- conversations per visitor;
- explicit note that owner tests are excluded and Unknown is not a visitor.

The calculations are SQL/Supabase reads, not LLM calls.

### Unit of count

| Metric                              | Unit                                              |
| ----------------------------------- | ------------------------------------------------- |
| owner/visitor/unknown conversations | conversations                                     |
| owner/visitor/unknown sessions      | distinct `session_id`                             |
| unique visitors                     | distinct `visitor_id` among visitor conversations |
| new visitors                        | visitor ids not seen before the period            |
| returning visitors                  | visitor ids seen before and inside the period     |
| conversations per visitor           | visitor conversations ÷ unique visitors           |
| entry pages / referrers             | visitor conversations                             |

---

## 11. Latency and cost impact

- Chat request: one additional `localStorage` read and one extra validated body field. No extra network or LLM call.
- Conversation persistence: one upsert/update already existed; only additional scalar columns. No new query.
- Client events: one existing conversation ensure; now also resolves the Supabase session to avoid misclassifying owner events. This is an auth/profile read per event, not per chat turn. It does not affect the normal dialogue latency path.
- Analytics: identity summary is computed from the existing conversation rows; one additional lightweight query for prior visitor ids. No transcript loading, no LLM.
- Owner analytics tool loads a lightweight identity projection in addition to the existing observatory snapshot.
- No new worker, cron, polling or retry loop.

Estimated impact on normal chat: **negligible** (local storage read + one body field). Event traffic gets one auth lookup per event; this is bounded by the existing event rate limit.

---

## 12. Deployment status

**Not deployed.** The production migration must be applied manually first or immediately after deployment. The code is backward-compatible before the migration, but identity analytics cannot be complete until the columns exist.

Recommended sequence:

1. Review this report and the migration.
2. Apply `migrations/2026-11-12_pierrot_identity_attribution.sql` manually in Supabase.
3. Deploy the application through the existing Vercel workflow.
4. Sign in as owner, open the public page, chat, and verify the conversation is `owner`.
5. Use an incognito window, grant consent, chat, and verify `visitor` + stable `visitor_id` on return.
6. Verify `/admin/pierrot?identity=visitor` excludes owner and unknown conversations.

### Explicit limitation

An owner who is **not signed in** and not using a trusted Telegram owner flow cannot be proven to be the owner. Such a conversation will be `visitor` (if consent + visitor id) or `unknown`. This is intentional: the alternative would be an insecure bypass based on `/admin`, IP, browser or a client flag. The owner should sign in (or use the existing Telegram owner flow) when testing public pages if the conversation must be excluded from visitor metrics.
