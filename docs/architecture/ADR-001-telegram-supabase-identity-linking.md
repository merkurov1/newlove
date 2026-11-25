# ADR-001: Voluntary linking of Telegram and Supabase identities

| Field                 | Value                                                                                                                                                                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status                | **Proposed — discovery/design only. Not approved, not implemented.**                                                                                                                                                                                            |
| Date                  | 2026-11-25                                                                                                                                                                                                                                                      |
| Task                  | `382c7953-42a7-4696-8919-d15926f4a81a` (after priorities 1215 and 1210)                                                                                                                                                                                         |
| Scope                 | Architecture decision, threat model, data-model options, test plan, migration-risk assessment                                                                                                                                                                   |
| Deciders              | Repository owner / Temple product owner                                                                                                                                                                                                                         |
| Related               | `docs/temple/RITUAL_AUTH_MATRIX.md`, `docs/architecture/AUTH_IDENTITY_AND_SESSIONS.md`, `lib/temple/identity.ts`, `lib/vigil/claim.ts`, `lib/vigil/cooldown.ts`, `lib/session.ts`, `lib/telegram/initData.ts`, `migrations/2026-11-16_vigil_spark_cooldown.sql` |
| Implementation status | **None.** No linking endpoint, no schema change, no migration, no auth-provider change, no production data change                                                                                                                                               |

> **Decision in one sentence:** adopt **Option A — an internal participant (principal) with
> separate provider identities** — implemented later as an additive overlay behind a feature
> flag, with a three-step ceremony that requires fresh proof of control of **both** the Telegram
> account and the Supabase Auth account. Nothing in this ADR authorises code, migrations, or
> production changes; those require separate approval.

**Summary for the owner**

- **Recommended model:** Option A (participant + provider links). Option B (direct 1:1 pair) is a
  smaller but less extensible fallback; Option C (Supabase-native identity) is rejected because it
  requires auth-provider/schema changes forbidden by this task.
- **Proof:** a browser-created, single-use intent; fresh HMAC-valid Telegram `initData` (≤ 5 min)
  plus a Telegram bot confirmation; and an active Supabase session verified at intent creation and
  at confirmation. No email, username or display-name matching.
- **Safety:** unique active constraints fail closed on conflicts; no automatic merge, no history
  transfer and no retroactive authorship rewrite.
- **Cooldown:** the linked participant inherits `max(last_spark_at)` from both identities. Unlink
  copies the maximum back to both legacy keys, so neither linking nor unlinking grants a spark.
- **Telegram-only:** remains a complete, permanent path; linking is only an optional settings
  action and never blocks Temple entry.
- **This task:** design only. No code, no schema change, no migration, no production change. A
  phased, feature-flagged rollout and rollback plan is in §6.

---

## 1. Context

### 1.1 Current repository facts

The repository already has two deliberately separate identity namespaces. The facts below are
taken from source, not from production.

| Fact                                                                                                                                                                                                                             | Source                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Telegram identity key is `tg:<telegram numeric id>`; Supabase identity key is `sb:<supabase uuid>`. The two are never merged by username, display name or email.                                                                 | `lib/temple/identity.ts`, `docs/temple/RITUAL_AUTH_MATRIX.md`                               |
| `/api/temple/auth` exchanges raw, HMAC-verified Telegram `initData` for a signed `temple_session` JWT (30 days) in an HttpOnly cookie with `SameSite=None` (Secure in production). A body-supplied id/username is ignored.       | `app/api/temple/auth/route.ts`                                                              |
| `initData` verification enforces a 24-hour `auth_date` window and a 60-second future tolerance. The signed `temple_session` JWT is not the same thing as fresh `initData`.                                                       | `lib/telegram/initData.ts`, `lib/session.ts`                                                |
| Supabase Auth identity is `auth.users.id`; the canonical profile is `public.users` with the same id as text; `public.profiles` is a compatibility profile.                                                                       | `docs/architecture/AUTH_IDENTITY_AND_SESSIONS.md`                                           |
| `vigil_spark_claims.identity_key` is the primary key and is exactly `tg:<id>` or `sb:<uuid>`. The 24-hour cooldown is enforced by a conditional atomic `UPDATE`.                                                                 | `migrations/2026-11-16_vigil_spark_cooldown.sql`, `lib/vigil/claim.ts`                      |
| `vigil_spark_claims` is private: RLS enabled, no policies, no `anon`/`authenticated` grants, service role only.                                                                                                                  | same migration                                                                              |
| `temple_users` is a private Telegram profile table used with `telegram_id`, `username`, `first_name`, `last_seen_at`. Repository code never writes a Supabase identity into it.                                                  | `app/api/temple/auth/route.ts`, `migrations/2026-10-30_security_hardening_private_data.sql` |
| Repository code writes `temple_log.user_id` as a nullable Supabase UUID; Telegram ritual logs are written with `user_id = null` and only a human `author` string. No Telegram id is written to this table.                       | `lib/vigil/claim.ts`, `app/api/temple_logs/route.ts`                                        |
| `vigil_hearts.owner_id` is a nullable Supabase UUID; a Telegram-only spark leaves it `null`.                                                                                                                                     | `lib/vigil/claim.ts`, `sql/vigil_hearts.sql`                                                |
| `temple_log` is public-read, server-write-only; `vigil_hearts` is public-read, server-write-only; `temple_users` and `vigil_spark_claims` are private.                                                                           | `migrations/2026-10-30_security_hardening_private_data.sql`                                 |
| There is no participant, principal, identity-link, link-intent or link-audit table anywhere in the repository.                                                                                                                   | repository search at the time of this ADR                                                   |
| There is no general-purpose CSRF-token framework for authenticated mutations. Only ad-hoc origin/domain checks exist (for example `app/api/auth/set-cookie/route.ts` and SIWE origin binding in `app/api/auth/wallet/route.ts`). | repository search                                                                           |
| The shared rate limiter is an in-memory per-process map. It is not a distributed limiter across server instances.                                                                                                                | `lib/rateLimit.ts`                                                                          |

### 1.2 Problem

A person can already use the Temple in two independent ways:

- inside Telegram, authenticated by fresh `initData` → signed `temple_session` → `tg:<id>`;
- in a normal browser, authenticated by Supabase Auth → `sb:<uuid>`.

Today those are **two different participants**. They have two Vigil cooldown rows, two
attribution namespaces, and no shared story. The product wants a **voluntary** way for the same
human to connect the two identities so that:

- there is one Vigil cooldown for the linked participant;
- future rituals can be presented as one continuous story;
- the person can still use either surface alone.

The product does **not** want an automatic merge, a registration wall, or retroactive rewriting
of authorship.

### 1.3 Hard constraints from the task

1. Discovery/design only. No linking code, no database migration, no schema change, no session
   or auth-provider change, and no production change in this task.
2. No linking by matching `email`, `username`, `displayName`, `first_name`, phone, or any other
   profile field.
3. No account merge and no history transfer in this task.
4. Telegram-only must remain a complete, permanent path. A Telegram-only user must never be
   forced to create a Supabase account.
5. The design must address account takeover, replay, CSRF, session fixation, repeated linking,
   conflicts, unlink/relink, recovery, audit, provider deletion/blocking, cooldown continuity,
   ownership and historical records.
6. Existing URLs, flows, data compatibility and payment flows must not change.

### 1.4 Non-goals

- No merge of `auth.users`, `public.users`, `public.profiles`, `temple_users`, `vigil_hearts`,
  `temple_log` or `vigil_spark_claims` rows.
- No transfer of old Telegram ritual authorship to a Supabase account.
- No mandatory onboarding, no "sign in to continue", no linking prompt on Temple entry.
- No new auth provider, no custom Supabase JWT, no change to `temple_session` claims.
- No admin "merge accounts" tool in the first release.
- No production rollout plan executed by this task.

### 1.5 Glossary

| Term                        | Meaning in this ADR                                                                                                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Provider identity**       | A credential-backed identity: Telegram numeric id (`tg:<id>`) or Supabase Auth user id (`sb:<uuid>`).                                                                                   |
| **Participant / principal** | An internal, non-credential record that groups zero or more provider identities for product purposes. It cannot authenticate by itself.                                                 |
| **Link**                    | An active association between one provider identity and one participant.                                                                                                                |
| **Linking intent**          | A short-lived, single-use server record that proves a browser session and a Telegram session are participating in the same ceremony.                                                    |
| **Proof of control**        | A server-verifiable demonstration that the caller currently controls the provider account: fresh HMAC-valid `initData` for Telegram, and a verified Supabase Auth session for Supabase. |
| **Cooldown key**            | The key used by `vigil_spark_claims`. Today `tg:<id>` or `sb:<uuid>`; for a linked participant, a new `pt:<participant uuid>` key.                                                      |
| **Canonical identity**      | The identity the server derives after verifying credentials and resolving an active link. Never supplied by the client.                                                                 |

---

## 2. Requirements and invariants

These invariants are normative. Any future implementation that violates one of them must be
rejected in review.

| ID      | Invariant                                                                                                                                                                                |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **I1**  | **Telegram-only is a first-class permanent path.** No Temple action, including Vigil spark, Cast, trace, Absolution or Tribute, may require a Supabase account.                          |
| **I2**  | Linking is **opt-in**, initiated by the user, and never a registration barrier or a Temple-entry gate.                                                                                   |
| **I3**  | A link is created only with **proof of control of both active identities**: fresh Telegram `initData` **and** an active Supabase Auth session. Neither proof is inferred from the other. |
| **I4**  | The server never links by `email`, `username`, `displayName`, `first_name`, phone, profile similarity, IP, user agent or referrer.                                                       |
| **I5**  | A provider identity belongs to at most one active participant, and a participant has at most one active identity per provider. Conflicts fail closed.                                    |
| **I6**  | Linking, unlinking and relinking **never reduce** an existing cooldown. The linked participant inherits the later of the two `last_spark_at` values.                                     |
| **I7**  | Historical authorship is **not rewritten**. Existing `temple_log.author`, `temple_log.user_id`, `vigil_hearts.owner_id`, `vigil_hearts.owner_name` and timestamps stay untouched.        |
| **I8**  | Every link, unlink, relink, conflict, rejection and recovery action writes an append-only audit event.                                                                                   |
| **I9**  | Link state is server-side. It is never trusted from a client field, cookie body, query parameter or JWT claim.                                                                           |
| **I10** | The feature is behind a kill switch. Disabling it restores the current namespaced behaviour without data loss.                                                                           |
| **I11** | Existing URLs and response shapes remain compatible. A linked identity must not break an unlinked client.                                                                                |
| **I12** | No raw `initData`, auth token, session token, Supabase access token or refresh token is stored in the link tables or audit.                                                              |

---

## 3. Threat model for linking

### 3.1 Assets

| Asset                         | Why it matters                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Supabase account access       | Controls the web identity, profile and future private records.                                                |
| Telegram account identity     | Controls the Mini App identity and the Telegram-only path.                                                    |
| Cooldown fairness             | A link must not grant a free extra Vigil spark.                                                               |
| Ritual history and authorship | Public chronicle integrity; users must not be made authors of someone else's acts.                            |
| Link state and audit          | Needed for recovery, abuse investigation and non-repudiation.                                                 |
| Personal data                 | Telegram id, Supabase user id, IP/user-agent metadata, display names.                                         |
| Payment flow                  | Tribute is intentionally guest-friendly; linking must not become a payment requirement or a payment identity. |

### 3.2 Actors and trust boundaries

| Actor                                 | Capability                                                                                                                             |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Legitimate user                       | Controls their browser session and their Telegram client.                                                                              |
| Attacker with neither credential      | Can send arbitrary HTTP requests, craft bodies, replay observed tokens, attempt CSRF.                                                  |
| Attacker with one credential          | Has a Supabase session **or** Telegram `initData`/session, but not both. Must not be able to complete a link.                          |
| Attacker with stolen fresh `initData` | May replay a short-lived Telegram proof. Must not be able to silently attach the victim's Telegram to the attacker's Supabase account. |
| Malicious Telegram user               | Can launch the Mini App with arbitrary `start_param`; cannot forge HMAC.                                                               |
| Compromised browser                   | Has the Supabase cookie and CSRF token. Mitigated by short intent TTL, re-auth, notification and delayed unlink.                       |
| Insider / support                     | Must not be able to merge or transfer history without both proofs and audit.                                                           |
| Bot / automation                      | Must be rate-limited and unable to enumerate link state.                                                                               |
| External provider                     | Telegram and Supabase may rotate tokens, delete accounts, ban users or have outages.                                                   |

Trust boundaries:

1. Browser ↔ Next.js server (cookies, CSRF, Origin).
2. Telegram webview ↔ Next.js server (`initData`, `start_param`; no Supabase cookie assumption).
3. Supabase Auth ↔ Next.js server (SSR cookie or bearer; `auth.getUser`).
4. Server ↔ database (service role; private tables, RLS on, no Data API grants).
5. Support/admin ↔ audit (read-only, least privilege).

### 3.3 Threat register

| ID      | Threat                                                                                    | Impact                                                                      | Mitigation                                                                                                                                                                                                                                                                           | Residual risk                                                                                                           |
| ------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| **T1**  | Link by matching email/username/display name                                              | Account takeover; wrong authorship                                          | Explicitly forbidden; no lookup by those fields; tests assert that equal emails/names without proofs fail.                                                                                                                                                                           | A human support agent could still be socially engineered; require both proofs and audit.                                |
| **T2**  | CSRF: attacker makes the victim's browser create/confirm a link                           | Victim's account attached to attacker's Telegram                            | `Origin`/`Referer` allowlist; per-intent CSRF token; `SameSite=Lax`; POST only; no mutation on GET; re-auth.                                                                                                                                                                         | Same-site XSS would bypass CSRF; XSS is a separate application-wide risk.                                               |
| **T3**  | Attacker with stolen fresh `initData` silently links victim Telegram to attacker Supabase | Identity confusion; future Telegram acts attributed to attacker participant | Telegram proof must be bound to a browser-created intent; the bot sends a confirmation message/callback to the Telegram user (strong mode, required for GA). The browser confirmation protects the Supabase side; it does not by itself protect a victim who is not at that browser. | Malware that controls the Telegram client itself is indistinguishable from the user; out of scope for account linking.  |
| **T4**  | Replay of `initData`                                                                      | Unauthorised Telegram proof                                                 | Freshness tightened to ≤ 5 minutes for linking (not 24 hours); one-time `query_id` consumption when present; intent one-time; `auth_date` + Telegram id tuple replay window.                                                                                                         | Telegram may omit `query_id`; rely on the 5-minute window and bot confirmation.                                         |
| **T5**  | Replay of a linking intent                                                                | Attach a different Telegram/Supabase pair                                   | 256-bit opaque token; only its hash stored; TTL ≤ 10 minutes; single use; bound to Supabase user id + browser binding cookie; max attempts.                                                                                                                                          | A stolen browser cookie within the TTL is equivalent to a compromised browser; re-auth and audit.                       |
| **T6**  | Session fixation                                                                          | Attacker fixes a session/intent that the victim later confirms              | Intent bound to a random browser-binding cookie and CSRF secret; rotate link cookies after success; re-verify Supabase session at confirmation; never accept session tokens from URLs.                                                                                               | Compromised browser remains compromised; notify and allow unlink.                                                       |
| **T7**  | Repeated linking / oscillation                                                            | Cooldown evasion, audit noise, support abuse                                | Unique active constraints; relink cooldown; no cooldown reset on unlink/relink; rate limits; audit.                                                                                                                                                                                  | A determined user can create new Supabase accounts; per-IP and per-Telegram limits reduce this but cannot eliminate it. |
| **T8**  | Identity already belongs to another account                                               | Takeover or denial                                                          | Unique partial indexes; generic `409 identity_conflict`; no automatic merge; no disclosure of the other account; support recovery with both proofs.                                                                                                                                  | Support process errors; dual control for manual recovery.                                                               |
| **T9**  | Race between link/unlink and a Vigil claim                                                | Double spark or lost cooldown                                               | Link transaction seeds `max(last_spark_at)` and locks the affected keys; claims resolve the canonical key atomically; tests cover concurrent claims.                                                                                                                                 | Database function/locking must be reviewed carefully.                                                                   |
| **T10** | Unlink abuse from a hijacked Supabase session                                             | Availability / denial of the Telegram link                                  | Recent re-auth; notification to Telegram; delayed unlink with cancel window; both proofs for immediate unlink; audit.                                                                                                                                                                | A fully hijacked Supabase account can still request unlink; the user is notified.                                       |
| **T11** | Recovery social engineering                                                               | Takeover of another person's linked identity                                | No email-based recovery; support requires fresh Telegram proof **and** Supabase proof; no history transfer; audit and dual control.                                                                                                                                                  | Human process risk remains; keep recovery rare and logged.                                                              |
| **T12** | Provider account deleted or banned                                                        | Orphaned link, broken UX                                                    | No cascade delete of history; mark/revoke link with audit; the other provider path continues; no automatic re-link.                                                                                                                                                                  | Telegram deletion is not notified by Telegram; detect only when proof is absent.                                        |
| **T13** | Enumeration                                                                               | Learn whether a Telegram/Supabase account is linked                         | Uniform timing and generic errors; rate limits; no "this Telegram belongs to X" responses.                                                                                                                                                                                           | Timing side channels in DB lookups; keep responses constant-shaped.                                                     |
| **T14** | Audit tampering                                                                           | Loss of evidence                                                            | Append-only table; service-role only; no update/delete API; RLS on; retention job only.                                                                                                                                                                                              | Database superuser can alter data; operational controls apply.                                                          |
| **T15** | PII leakage in logs/audit                                                                 | Privacy harm                                                                | No raw `initData`/tokens; hash IP/user agent with a server secret; minimal metadata; retention policy.                                                                                                                                                                               | Display names are inherently personal and appear in public ritual logs already.                                         |
| **T16** | Rate-limit bypass across instances                                                        | Brute force / DoS                                                           | Shared rate-limit store before GA; per-IP, per-user, per-Telegram-id and per-intent limits; alerting.                                                                                                                                                                                | The current in-memory limiter is insufficient for a security-critical endpoint.                                         |
| **T17** | Token leakage through URL/referrer/logs                                                   | Intent hijack                                                               | Opaque short-TTL token; hash at rest; `Referrer-Policy`; no token in query strings where avoidable; `start_param` only for the Telegram deep link; no token logging.                                                                                                                 | Telegram may log `start_param`; the token is single-use and short-lived.                                                |
| **T18** | Bot token compromise                                                                      | Forged `initData` for any Telegram user                                     | Bot token rotation runbook; HMAC-only verification; link endpoint alerts on abnormal failure rates.                                                                                                                                                                                  | Total bot compromise is a platform-level incident; rotate and revoke.                                                   |
| **T19** | Supabase outage / auth change                                                             | Linking fails or stalls                                                     | Fail closed; no partial link; existing Telegram-only flows untouched; idempotent retries; feature flag off.                                                                                                                                                                          | Users may retry; support messaging needed.                                                                              |
| **T20** | Insider merge without proof                                                               | Wrong history/ownership                                                     | No admin merge endpoint in v1; support read-only audit; any manual recovery requires both proofs, dual control and an audit event.                                                                                                                                                   | Out-of-band database access is outside application controls.                                                            |
| **T21** | Telegram username recycling/change                                                        | Wrong person linked                                                         | Never key on username; numeric Telegram id only; display name is a label.                                                                                                                                                                                                            | A recycled numeric id is not expected by Telegram policy; treat as provider incident.                                   |
| **T22** | Same human with multiple Telegram accounts                                                | Multiple links or confusion                                                 | One Telegram per participant; explicit unlink first; conflicts fail closed; no auto-detection.                                                                                                                                                                                       | Product policy decision; not a security guarantee.                                                                      |
| **T23** | Historical misattribution after link                                                      | False authorship                                                            | Do not rewrite; label source; only future events may carry participant attribution; document that pre-link Telegram log rows lack a reliable provider key.                                                                                                                           | The "one story" read model is necessarily partial for old Telegram logs.                                                |
| **T24** | Cooldown bypass via link/unlink                                                           | Unfair extra spark                                                          | Seed from `max`; unlink copies `max` back to both keys; relink seeds from `max`; concurrency tests.                                                                                                                                                                                  | Clock skew; clamp future timestamps consistently with `vigilCooldownRemainingMs`.                                       |

### 3.4 Abuse cases explicitly rejected

- "The emails are equal, so link them." — Rejected. Email is not proof; it is not even present for
  Telegram-only users.
- "The Telegram username matches the Supabase display name." — Rejected. Usernames and display
  names are mutable labels and are already documented as untrusted for authorization.
- "The user is already signed in to Supabase, so accept the Telegram id from the request body." —
  Rejected. The Telegram id must come from HMAC-verified `initData`.
- "The `temple_session` JWT is valid for 30 days, so it proves Telegram control for linking." —
  Rejected for linking. A long-lived session JWT is not fresh proof; require fresh `initData`.
- "Auto-merge whenever a Telegram user later signs in with the same email." — Rejected. This is
  exactly the takeover path the task forbids.

---

## 4. Data-model options

Three options were evaluated. Only Option A is recommended. All options are additive and keep
the existing namespaced keys working during a transition.

### 4.1 Option A — Internal participant (principal) + provider identities (recommended)

Introduce a non-authenticating `temple_participants` row and one row per provider identity in
`temple_identity_links`. The participant is the stable product principal; provider rows are
credentials. A Telegram-only user can have a participant with only a Telegram link, or can stay
entirely outside the new tables until they opt in.

**Proposed shape (illustrative, not a migration):**

```sql
-- Illustrative only. No migration is created or applied by this task.
create table temple_participants (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'active'
    check (status in ('active', 'suspended', 'closed'))
);

create table temple_identity_links (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references temple_participants(id),
  provider text not null check (provider in ('telegram', 'supabase')),
  provider_user_id text not null, -- Telegram numeric id or Supabase UUID, never a name
  verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoke_reason text
);

-- At most one active identity per provider per participant:
create unique index temple_identity_links_one_per_provider
  on temple_identity_links (participant_id, provider)
  where revoked_at is null;

-- At most one active participant per provider identity:
create unique index temple_identity_links_one_participant
  on temple_identity_links (provider, provider_user_id)
  where revoked_at is null;
```

Supporting tables (also illustrative):

- `temple_identity_link_intents` — short-lived ceremony state: hashed token, Supabase user id,
  browser-binding hash, CSRF hash, Telegram id, `telegram_auth_date`, hashed `query_id`,
  status, attempts, expiry, consumed timestamp.
- `temple_identity_link_events` — append-only audit: event type, participant id, Supabase user id,
  Telegram id, intent id, result, reason code, hashed IP/user agent, metadata JSON without
  secrets.

**Effect on existing tables:**

| Table                                             | Effect under Option A                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `temple_users`                                    | **No change.** It remains a private Telegram profile. The link table is the source of truth. A nullable cache column is not needed and would create a second source of truth.                                                                                                                                    |
| `vigil_spark_claims`                              | **No destructive change.** Unlinked identities keep `tg:` / `sb:` keys. A linked participant uses a new `pt:<participant uuid>` key. Legacy rows are retained and seeded on link/unlink. An optional nullable `participant_id` column can be added later for operations, but it is not required for correctness. |
| `temple_log`                                      | **No rewrite.** Existing `author` / `user_id` / timestamps stay. Future events may gain an additive nullable `participant_id` and `identity_source`. Historical Telegram rows cannot be reliably joined: they have `user_id = null` and only a text `author`.                                                    |
| `vigil_hearts`                                    | **No rewrite.** `owner_id` keeps its current meaning (Supabase UUID only when the acting identity is Supabase). A future additive `participant_id` can support the read model. Telegram-only sparks stay `owner_id = null`.                                                                                      |
| `auth.users` / `public.users` / `public.profiles` | **No change.** No provider is added, no id is rewritten, no merge.                                                                                                                                                                                                                                               |

**Advantages**

- Clean separation between a human/product principal and credentials.
- Telegram-only remains first-class: a participant can exist with one provider link, or a user can
  stay entirely on the legacy `tg:` path.
- One canonical cooldown key (`pt:<uuid>`) prevents double sparks cleanly.
- Future providers, recovery states and account lifecycle have a home.
- No `auth.users` coupling; no auth-provider change.

**Disadvantages**

- More tables, joins and lifecycle states than a direct pair table.
- Requires a dual-read period: linked → `pt:`, unlinked → legacy namespaced key.
- Link/unlink transactions must be carefully serialised with cooldown claims.
- Participant lifecycle (suspend/close) is a new concept to document and operate.

### 4.2 Option B — Direct 1:1 Telegram ↔ Supabase link table

A single table records the pair, with `link_id` acting as the principal:

```sql
-- Illustrative only.
create table temple_identity_pair_links (
  link_id uuid primary key default gen_random_uuid(),
  supabase_user_id uuid not null,
  telegram_id text not null,
  linked_at timestamptz not null default now(),
  revoked_at timestamptz
);

create unique index temple_identity_pair_links_one_supabase
  on temple_identity_pair_links (supabase_user_id)
  where revoked_at is null;

create unique index temple_identity_pair_links_one_telegram
  on temple_identity_pair_links (telegram_id)
  where revoked_at is null;
```

**Effect on existing tables:** essentially the same as Option A, but the canonical cooldown key is
`lnk:<link_id>` instead of `pt:<participant uuid>`; history is still not rewritten.

**Advantages**

- Smallest schema and smallest code surface.
- Easy to reason about because the product currently has exactly two providers.
- Unique constraints map directly to the only two conflict cases.
- Easiest rollback: one table, no participant lifecycle.

**Disadvantages**

- `link_id` is a principal in disguise, with nowhere to put participant-level state.
- A third provider later needs either a schema change or a parallel table.
- Recovery and "account closed/suspended" states are awkward.
- Repeated unlink/relink creates many `link_id`s; cooldown continuity must copy history between
  them, which is the same hard part as Option A but with less structure.

### 4.3 Option C — Supabase-native identity (custom provider / `auth.identities`)

Model Telegram as a Supabase Auth identity or issue a Supabase-compatible JWT after Telegram
verification.

**Advantages**

- One auth system, one session model, one `auth.users` identity.
- RLS could use the Supabase user id directly.

**Disadvantages / blockers**

- Requires changing auth providers, sessions or `auth.users` / `auth.identities`; explicitly
  forbidden by this task's security constraints.
- Supabase does not currently expose a first-class Telegram provider in this repository's
  integration; implementing a custom provider is a large, security-sensitive project.
- Risks conflating Telegram-only users with Supabase accounts, or forcing account creation.
- Migration and rollback are much harder; existing Telegram sessions and history would need a
  compatibility layer.

**Decision:** rejected for this task. Revisit only if Supabase adds a supported Telegram identity
provider and the owner explicitly reopens auth-provider scope.

### 4.4 Comparison

| Criterion                               | Option A (participant + links)          | Option B (direct pair)                | Option C (Supabase-native)            |
| --------------------------------------- | --------------------------------------- | ------------------------------------- | ------------------------------------- |
| New tables                              | 1 principal + 1 link + intents + audit  | 1 pair + intents + audit              | Auth schema/provider changes          |
| Change to `auth.users` / auth providers | No                                      | No                                    | **Yes — forbidden**                   |
| Change to `temple_users`                | No                                      | No                                    | Likely                                |
| `vigil_spark_claims` impact             | Additive `pt:` rows; legacy retained    | Additive `lnk:` rows; legacy retained | Rework around Supabase id             |
| `temple_log` / history                  | No rewrite; future additive attribution | Same                                  | High risk of forced merge             |
| Telegram-only supported permanently     | **Yes**                                 | **Yes**                               | At risk; must be explicitly preserved |
| One cooldown for linked pair            | Yes                                     | Yes                                   | Yes                                   |
| Future third provider                   | Natural                                 | Schema change                         | Natural but heavy                     |
| Conflict handling                       | Unique active constraints               | Unique active constraints             | Depends on auth schema                |
| Recovery/lifecycle model                | Explicit participant state              | Ad hoc                                | Auth-managed                          |
| Migration risk                          | Medium (more tables, dual read)         | **Low**                               | **High**                              |
| Rollback                                | Flag off; tables unused                 | Flag off; one table unused            | Very hard                             |
| Complexity                              | Medium                                  | **Low**                               | High                                  |
| Recommendation                          | **Recommended**                         | Acceptable minimal fallback           | Rejected for now                      |

### 4.5 Recommendation and explicit tradeoffs

**Recommend Option A.** The deciding factors are:

1. It keeps Telegram-only and Supabase-only as independent first-class paths while giving the
   linked pair a stable internal principal.
2. It avoids touching `auth.users`, auth providers, sessions and existing identity records.
3. It gives cooldown continuity and future attribution a single canonical key without rewriting
   history.
4. It accommodates recovery, suspension, unlink/relink and a future third provider without a
   schema redesign.

The price is a larger schema, a dual-read transition and stricter transaction design. If the
owner prioritises the absolutely smallest change and accepts a future schema revision, Option B
is a legitimate MVP fallback. Option C is rejected because it conflicts with the task's explicit
no-auth-provider-change constraint.

---

## 5. Recommended design in detail (Option A)

### 5.1 Identity resolution at request time

The existing resolver stays the credential verifier. A link lookup is added **after**
verification, never before.

```
1. Verify the presented credential exactly as today:
   - signed temple_session / fresh-enough session for normal Temple requests → Telegram id;
   - Supabase Auth session (cookie or bearer) → Supabase user id.
2. Compute the provider key: tg:<telegram id> or sb:<supabase uuid>.
3. Look up an active temple_identity_links row for (provider, provider_user_id).
4. If found: canonical identity = pt:<participant id>.
   If not found: canonical identity = the legacy namespaced key.
5. Display name comes from the verified credential, never from a link lookup.
6. If the link table is absent or the feature flag is off: use the legacy key; no error.
```

Rules:

- A client-supplied `participant_id`, `link_id`, `identity_key`, `user_id`, `telegram_id`,
  `supabase_user_id`, `is_linked` or `source` is ignored.
- A valid Supabase bearer still wins over a stale Telegram cookie, as today. The linking endpoint
  is the only place where both proofs are deliberately combined.
- Link state is **not** added to the `temple_session` JWT. Adding it would create stale claims and
  force re-issuance; server-side lookup is the source of truth.
- If both a Supabase session and a Telegram session are present on a normal request, the server
  uses the existing precedence and does **not** merge them implicitly.

### 5.2 Linking ceremony: browser intent, Telegram proof, browser confirmation

The Telegram webview cannot be assumed to send the browser's Supabase cookie. A single-request
"both cookies at once" design is therefore fragile. Use a browser-owned intent with a
server-recorded Telegram proof, then a browser confirmation that re-verifies the Supabase session.

```
Browser (Supabase)                Server                         Telegram (initData)
       |                             |                                   |
       | 1. POST /link/intent        |                                   |
       |    cookie + CSRF + Origin   |                                   |
       |---------------------------->| verify Supabase session           |
       |                             | require recent auth / step-up     |
       |                             | create intent (hashed token,      |
       |                             |  sb_user, browser binding, TTL)   |
       |<----------------------------| HttpOnly intent cookie + deep link|
       |                             |                                   |
       | 2. open t.me/<bot>?startapp=<opaque token> --------------------->|
       |                             |<--- 3. POST /link/telegram-proof  |
       |                             |     token + raw initData          |
       |                             | verify HMAC, auth_date <= 5 min,  |
       |                             | query_id unused, intent match     |
       |                             | optional bot confirmation message |
       |                             | record Telegram proof on intent   |
       |                             |---------------------------------->| "return to browser"
       |                             |                                   |
       | 4. GET /link/intent/:id     |                                   |
       |    (intent cookie)          |                                   |
       |---------------------------->| return pending proof (masked)     |
       |<----------------------------|                                   |
       | 5. POST /link/confirm       |                                   |
       |    cookie + CSRF + Origin   |                                   |
       |---------------------------->| re-verify Supabase session/user   |
       |                             | proof fresh? uniqueness?          |
       |                             | transaction: insert link,          |
       |                             | seed cooldown max, audit, consume |
       |<----------------------------| linked                            |
```

**Why this proves both sides**

- **Telegram:** the raw `initData` is HMAC-signed with the bot token. Only Telegram can produce it
  for that numeric user id. The `auth_date` freshness (≤ 5 minutes for linking) plus one-time
  `query_id` consumption prevents replay. The intent token ties the proof to the browser-started
  ceremony.
- **Supabase:** the browser must present a valid Supabase Auth session at intent creation **and**
  at confirmation. The intent is bound to the Supabase user id; a different signed-in user cannot
  confirm it. A recent-auth/step-up requirement (for example `last_sign_in_at` within 10 minutes
  or a fresh email OTP) protects a hijacked long-lived session.
- Neither email, username, display name nor profile similarity participates.

**Strong mode (recommended for GA):** after accepting `initData`, the bot sends the Telegram user a
confirmation message with a one-time code or inline "Confirm linking" button. The bot verifies
the callback's `from.id` against the intent. This defeats an attacker who has stolen fresh
`initData` but does not control the Telegram client's message stream. The browser still confirms;
both sides see the operation.

### 5.3 Proof-of-control rules

| Proof    | Accepted as proof                                                                                                                                                                                      | Rejected / never proof                                                                                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Telegram | Raw `initData` with valid HMAC-SHA256 using `TEMPLE_BOT_TOKEN`; numeric `user.id`; `auth_date` ≤ 300 s; `query_id` not consumed; intent token hash matches; bot confirmation for GA (see strong mode). | `initDataUnsafe`; a body `telegram_id`; a `username`; a display name; the 30-day `temple_session` JWT alone; a stale `auth_date`; a replayed `query_id`; a forwarded screenshot; a query parameter. |
| Supabase | SSR cookie session or bearer access token verified with `auth.getUser`; same user id as the intent; recent auth/step-up; CSRF token; same-origin request.                                              | An email address typed into a field; a display name; `user_metadata`; a client `user_id`; a long-lived session with no re-auth for a high-risk link; a token in a URL.                              |

**Forbidden matching signals:** `email`, `username`, `displayName`, `first_name`, `last_name`,
phone number, Telegram `language_code`, IP address, user agent, referrer, approximate location,
avatar, or any fuzzy profile comparison. These may be displayed for human confirmation, but never
used to find or create a link.

### 5.4 CSRF, replay, session fixation and repeat protection

| Control                   | Requirement                                                                                                                                                                                                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CSRF                      | Mutations are POST only. Validate `Origin` (and `Referer` fallback) against the configured site origin. Require a per-intent CSRF token in a custom header, compared in constant time. Use `SameSite=Lax` for browser endpoints. No state change on GET.                      |
| Intent replay             | 256-bit random token; store only a hash; TTL ≤ 10 minutes; single use; max 5 attempts; bind to Supabase user id + browser-binding cookie + CSRF secret.                                                                                                                       |
| `initData` replay         | Freshness ≤ 5 minutes for linking; consume `query_id` when present; store a hash, not the raw value; reject a reused `(telegram_id, auth_date, query_id)` tuple.                                                                                                              |
| Session fixation          | Intent is bound to a random browser-binding cookie created by the server; do not accept an attacker-supplied session id; rotate the intent cookie and CSRF token after success/failure; invalidate other pending intents for the user; never accept session tokens from URLs. |
| Supabase session fixation | Supabase owns its session; the link flow only reads it. Require recent authentication or step-up; do not upgrade an anonymous session; do not accept a Supabase token from the Telegram `start_param`.                                                                        |
| Repeated linking          | Unique active constraints; if the exact same pair is already active, return idempotent success only with both proofs; do not create a duplicate; audit "already linked". Different pair → `409`.                                                                              |
| Rate limits               | Per IP, per Supabase user, per Telegram id and per intent. Use a shared store before GA; the current in-memory limiter is per-process only.                                                                                                                                   |
| Enumeration               | Uniform status/body for "not found", "not yours" and "already linked". Do not reveal the other account's email, name or id.                                                                                                                                                   |
| Logging                   | Never log raw `initData`, intent tokens, CSRF tokens, Supabase access/refresh tokens or cookies. Hash IP/user agent with a server secret if audit needs them.                                                                                                                 |

### 5.5 Conflict matrix

| Situation                                                       | Result                                                                                                      |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Telegram not linked; Supabase not linked; both proofs valid     | Create participant (if needed) + link; audit `link_confirmed`.                                              |
| Same Telegram + same Supabase already active, both proofs valid | Idempotent success; no duplicate row; audit `link_already_active`.                                          |
| Telegram already linked to another participant                  | `409 identity_conflict`; no row change; audit `link_conflict_telegram`; no details about the other account. |
| Supabase participant already has another Telegram               | `409 identity_conflict`; require unlink first; audit `link_conflict_supabase`.                              |
| Intent belongs to a different Supabase user                     | `403`; audit `link_intent_owner_mismatch`; do not link.                                                     |
| Telegram proof missing                                          | `409 link_proof_missing`; no link.                                                                          |
| Telegram proof stale (> 5 min)                                  | `401 link_proof_stale`; restart ceremony.                                                                   |
| Intent expired                                                  | `410 link_intent_expired`; no link.                                                                         |
| Concurrent confirmations                                        | Unique constraint + transaction; exactly one succeeds; the loser gets `409`; audit both.                    |
| Revoked link exists                                             | New link allowed only after relink cooldown and both proofs; old row retained.                              |
| Supabase account deleted/banned                                 | Do not auto-link/merge; mark/revoke with audit; Telegram-only continues.                                    |
| Telegram account unavailable/deleted                            | Link remains but cannot be proven; browser continues; unlink allowed; audit `telegram_unavailable`.         |

**No automatic merge.** A conflict never moves history, never transfers ownership and never
"claims" the other identity. The only resolution is an explicit unlink/relink by a person who can
prove control, or a support recovery with both proofs and audit.

### 5.6 Unlink, relink, recovery and provider lifecycle

**Unlink**

- Requires an active Supabase session, recent re-authentication and CSRF.
- If the link is younger than 7 days, require **both** proofs (fresh `initData` + Supabase) or use
  a delayed unlink. This prevents a freshly hijacked Supabase session from immediately detaching a
  victim's Telegram.
- Notify the linked Telegram account through the bot.
- Recommended default: a 24-hour pending unlink with a cancel action from either side; immediate
  unlink if both proofs are present.
- On completion: set `revoked_at`, keep the audit row, **copy the participant's `last_spark_at`
  to both legacy keys**, and start a relink cooldown (minimum 24 hours; a longer window for very
  new links is a policy choice).
- No history is deleted or rewritten.

**Relink**

- Always a new link row; never reactivate the old row.
- Both proofs again; relink cooldown; cooldown seeded from `max` of both current rows and any
  retained participant timestamp.
- Audit `relink_confirmed` with the previous link id.

**Recovery scenarios**

| Lost                 | Allowed recovery                                                                                                                                                                                                           | Not allowed                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Supabase account     | Unlink the old link only after proof of Telegram control + waiting period; create a new Supabase account; link the same Telegram after relink cooldown. Old history stays with the old participant and is not transferred. | Matching by email; support transferring history; silently moving the Telegram link. |
| Telegram account     | Unlink from the browser with Supabase re-auth (delayed); link a new Telegram after cooldown.                                                                                                                               | Taking over the old Telegram identity; editing the old audit.                       |
| Both                 | No self-service recovery. History remains but is inaccessible. Support cannot transfer it without both proofs.                                                                                                             | Email-based reset that grants the linked identity.                                  |
| Compromised Supabase | Revoke sessions, delayed/dual-proof unlink, audit, notify Telegram.                                                                                                                                                        | Immediate irreversible actions without re-auth.                                     |
| Compromised Telegram | Revoke the Telegram session/bot access; unlink from the browser; audit. An attacker with Telegram alone cannot link to a Supabase account without its session.                                                             | Using Telegram `initData` alone to attach to an unknown Supabase account.           |

**Provider deletion/blocking**

- **Telegram account deleted:** no new `initData`; the active link remains but is marked
  `telegram_unavailable` when evidence exists. Supabase web access continues. The user can unlink.
  Cooldown is not reset.
- **Supabase user deleted:** revoke/mark the link (for example `revoked_supabase_deleted`) and write
  audit. Do **not** cascade-delete the participant, audit or Telegram identity. The Telegram-only
  path continues. If the person creates a new Supabase account, no automatic match occurs; they
  must relink explicitly after any cooldown.
- **Supabase user banned/suspended:** sessions are invalid. Mark `provider_suspended` through an
  admin action; do not transfer identity or history; Telegram-only continues unless Telegram is
  separately blocked.
- **Bot token rotation:** old `initData` fails verification. Existing sessions remain valid until
  expiry. Linking requires a new proof after rotation; document the operational runbook.

### 5.7 Cooldown continuity

Define the canonical key:

```
linked active participant   → pt:<participant uuid>
unlinked Telegram           → tg:<telegram numeric id>
unlinked Supabase           → sb:<supabase uuid>
anonymous                   → none (cannot spark)
```

**On link confirmation** (inside the same transaction that creates the link):

```
ptLast = existing last_spark_at for pt:<participant>, or null
tgLast = valid last_spark_at for tg:<id>, or null
sbLast = valid last_spark_at for sb:<uuid>, or null
seeded = max(ptLast, tgLast, sbLast)  // the later timestamp = the longer remaining cooldown
upsert pt:<participant> last_spark_at = seeded
```

- `max` is chosen so linking can never grant a spark. It also never shortens an active cooldown,
  including when an existing participant row is present on relink.
- Invalid or missing timestamps are ignored. A future timestamp is preserved but the remaining
  time is clamped consistently with `vigilCooldownRemainingMs` (which caps remaining time at 24
  hours); the seed must never create an infinite cooldown.
- Legacy `tg:` / `sb:` rows are **not deleted**. While the link is active, claims and status read
  and write only `pt:`. This prevents a double spark from two rows.
- The claim remains an atomic conditional `UPDATE ... WHERE last_spark_at <= now() - 24h` on the
  canonical key, preserving the existing concurrency guarantee.

**On unlink** (same transaction):

```
last = max(participant.last_spark_at, tg.last_spark_at, sb.last_spark_at)
upsert tg:<id>  last_spark_at = last
upsert sb:<uuid> last_spark_at = last
mark participant cooldown released (or retain it for audit)
```

- Both sides inherit the **longest** cooldown. Neither side gains a spark by unlinking.
- No reset, no split, no "fresh start".

**On relink:** seed from `max` of both current keys and any retained participant timestamp. No
reset.

**Concurrency:** link/unlink and claim must agree on one lock order. Recommended:
`participant → tg → sb`, using `pg_advisory_xact_lock` on a stable hash of each key, or a single
SQL function that resolves the canonical key and performs the conditional update atomically. This
is a design requirement for the future implementation; it is not implemented here.

**Rate limiting remains a second layer:** per-IP `POST` limits (for example 20/minute) stay in
place. They do not replace the cooldown.

### 5.8 Ownership and historical records

**Principle: presentation may connect; storage must not rewrite.**

| Record                                                  | Policy                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `temple_log.author`, `temple_log.user_id`, `created_at` | **Never rewritten by linking.** A Telegram ritual performed before the link stays a Telegram-authored event with `user_id = null`. A browser event stays a Supabase event.                                                                                                                               |
| `temple_log` future rows                                | May add an additive nullable `participant_id` and `identity_source` for new events only. Existing rows are not backfilled.                                                                                                                                                                               |
| Pre-link Telegram history                               | **Cannot be reliably attributed from repository code.** No writer stores a Telegram id in `temple_log`; only a text `author` is available. The ADR explicitly rejects guessing by display name. The read model must label these as pre-link/Telegram history rather than merging them silently.          |
| `vigil_hearts.owner_id`                                 | Keep current semantics: Supabase UUID for Supabase-acting claims, `null` for Telegram-only claims. Do not rewrite old rows. A future `participant_id` can power a linked read model. Writing the linked Supabase UUID from a Telegram session is **not** recommended without a separate explicit policy. |
| `vigil_spark_claims`                                    | Legacy rows are retained. The `pt:` row is the canonical cooldown while linked. Historical cooldown timestamps may be copied forward; they are not rewritten in place.                                                                                                                                   |
| `temple_users`                                          | Remains a Telegram profile. Do not use it as a join key for Supabase identity.                                                                                                                                                                                                                           |
| "One story" UI                                          | A read model may union events **by `participant_id` for new events** and display source labels. It must not alter rows or imply that old Telegram acts were performed by the Supabase account.                                                                                                           |

If the owner later wants a retroactive attribution policy, it must be a separate ADR and a
separate audited migration with an explicit rule and user consent. It is out of scope here.

### 5.9 Audit trail

Append-only `temple_identity_link_events` (name illustrative):

| Column                                                           | Notes                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                                                             | Bigserial / UUID.                                                                                                                                                                                                                                                                                                                                                        |
| `occurred_at`                                                    | Server timestamp.                                                                                                                                                                                                                                                                                                                                                        |
| `event_type`                                                     | `intent_created`, `telegram_proof_accepted`, `telegram_proof_rejected`, `link_confirmed`, `link_already_active`, `link_conflict_telegram`, `link_conflict_supabase`, `link_intent_owner_mismatch`, `unlink_requested`, `unlink_cancelled`, `unlink_confirmed`, `relink_confirmed`, `provider_unavailable`, `provider_suspended`, `recovery_requested`, `intent_expired`. |
| `participant_id`, `supabase_user_id`, `telegram_id`, `intent_id` | Nullable where not applicable. Internal ids only.                                                                                                                                                                                                                                                                                                                        |
| `result`                                                         | `allowed` / `denied` / `conflict` / `error`.                                                                                                                                                                                                                                                                                                                             |
| `reason_code`                                                    | Stable machine-readable code; no free-form secrets.                                                                                                                                                                                                                                                                                                                      |
| `ip_hash`, `user_agent_hash`                                     | HMAC with a server secret; retention limited.                                                                                                                                                                                                                                                                                                                            |
| `metadata`                                                       | Small JSON object: link id, previous link id, cooldown seed values (timestamps only), no raw tokens/initData.                                                                                                                                                                                                                                                            |

Access: RLS enabled, no policies, revoke from `anon`/`authenticated`, service role only. No update
or delete API. A retention job may delete events older than the documented period, but never
individual evidence on request without a legal/privacy process.

### 5.10 RLS, grants and least privilege

- New tables: `enable row level security`; no policies; `revoke all from anon, authenticated`;
  `grant` only to `service_role`, matching `vigil_spark_claims` and `temple_users`.
- No new Data API surface. Link status is read only through an authenticated server route that
  verifies the Supabase session and returns only the caller's own state.
- Admin read access, if needed, goes through a server route with `requireAdminFromRequest` and is
  read-only.
- No broad `select` grant to `authenticated` just to make a policy meaningful.

### 5.11 UX requirements

**Principles**

1. Linking is **opt-in** and discoverable in account settings, not at registration and not on
   Temple entry.
2. Telegram-only is explicitly presented as complete: "You can keep using the Temple in Telegram
   without a web account."
3. No modal on first visit. At most one dismissible, non-blocking card, with a long suppression
   window (for example 30 days), and only after a deliberate action.
4. Never block Vigil spark, Cast, Absolution, Tribute, Chronicles or any public ritual.
5. Explain exactly what changes and what does not:

   > "Connecting Telegram keeps one Vigil cooldown and one story across Telegram and the web.
   > Your past entries keep their original author. You can disconnect at any time."

   Russian example:

   > «Связывание Telegram сохранит один cooldown Вигилии и одну историю в Telegram и браузере.
   > Прошлые записи сохранят исходного автора. Отключить можно в любой момент.»

6. Show state clearly: not connected, waiting for Telegram, waiting for browser confirmation,
   connected, unlink pending, disconnected, conflict, provider unavailable.
7. Conflict copy must not enumerate:

   > "This Telegram account is already connected to another web account. Sign in to that account
   > or contact support."

8. Unlink copy must state consequences: one cooldown remains, history is not deleted, relink has a
   cooldown.
9. Accessibility: keyboard operable, focus management, screen-reader labels, no colour-only state.
10. Localisation: RU/EN copy review; no dark patterns, no pre-checked consent, no repeated nagging.

**Entry points**

| Surface                         | Behaviour                                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `/profile` or account settings  | Primary "Connected accounts" section. Always available.                                                                               |
| Telegram Mini App settings      | Optional "Connect a web account" entry; opens Supabase Auth in an external browser or a supported flow. Never on launch.              |
| Temple / Vigil / Cast / Tribute | **No linking prompt.** A single dismissible card may appear only after a deliberate signed-in action and must never block the ritual. |
| Registration / first login      | **No linking prompt.**                                                                                                                |

---

## 6. Safe migration and rollout plan

### 6.1 This task

- **No migration file is created.**
- **No DDL is applied.**
- **No production data is read or changed.**
- **No linking endpoint is added.**
- The only artifact is this ADR.

### 6.2 Future phased plan (requires separate approval)

| Phase                                    | Work                                                                                                                                          | Production effect                       |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| **P0 — Decision**                        | Owner reviews and approves this ADR; resolves open questions in §8.                                                                           | None.                                   |
| **P1 — Additive schema review**          | Draft `create table if not exists` for participants, links, intents, audit; RLS on; service-role only; no backfill; review by owner/security. | None until separately applied.          |
| **P2 — Server implementation, flag off** | Implement intent/proof/confirm/unlink endpoints and identity resolution behind `TEMPLE_IDENTITY_LINKING=off`. Unit/integration tests only.    | No user-visible change; no link writes. |
| **P3 — Staff/shadow**                    | Enable for an allowlist; run shadow resolution (compute canonical key, do not use it for cooldown); collect audit and metrics.                | Internal only.                          |
| **P4 — Opt-in UI**                       | Add settings entry and linked-state UI; enable link creation for opted-in users; keep kill switch.                                            | Voluntary only.                         |
| **P5 — Cooldown canonicalisation**       | Enable `pt:` claims with max-seed and lock ordering; monitor double-spark and error rates.                                                    | Linked users only; unlinked unchanged.  |
| **P6 — GA**                              | Remove allowlist; publish help/runbook; continue audit review.                                                                                | Voluntary feature.                      |

### 6.3 Migration principles

- Additive only: new tables, new nullable columns (if any), new indexes. No destructive `alter`,
  no column rewrite, no data backfill of authorship.
- No bulk backfill is required. Participants are created lazily on link confirmation. Optional
  backfill is a separate, idempotent, non-destructive job with its own approval.
- Existing `tg:` / `sb:` cooldown rows remain valid. No row is renamed or deleted.
- Feature flag defaults **off**. Deploy schema before code, code before UI.
- Every write path is idempotent and safe to retry; unique constraints are the final authority.
- No grant to `anon` / `authenticated`; no public read of link state.
- No FK cascade from `auth.users` that could delete audit or history. Prefer nullable references
  and explicit lifecycle events.

### 6.4 Reversibility and rollback

| Scenario                         | Action                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Feature causes problems          | Turn the flag off. Identity resolution returns to `tg:` / `sb:`; no data loss.                                     |
| Link endpoint faulty             | Disable route/flag; pending intents expire; active links remain readable but unused.                               |
| Cooldown canonicalisation faulty | Return to legacy keys. Because unlink already copies `max` back and legacy rows are retained, no cooldown is lost. |
| Schema must be removed           | Export audit first; drop new tables only after approval. Existing tables and rows are untouched.                   |
| Data corruption                  | Restore from backup; audit provides the timeline. Never "fix" by merging identities.                               |

### 6.5 Migration-risk assessment

| Risk                                    | Likelihood | Impact   | Mitigation                                                                                                   |
| --------------------------------------- | ---------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| Wrong identity linked (takeover)        | Low        | Critical | Both proofs; no field matching; intent binding; bot confirmation; unique constraints; audit; delayed unlink. |
| Cooldown bypass at link/unlink          | Medium     | High     | Seed from `max`; copy `max` back; atomic locks; concurrency tests; per-IP limit.                             |
| Double spark during transition          | Medium     | Medium   | One canonical key while linked; lock order; shadow-mode validation before enabling.                          |
| CSRF / session fixation                 | Medium     | High     | CSRF token + Origin + SameSite; intent bound to browser cookie; re-auth; rotation.                           |
| `initData` replay                       | Medium     | High     | ≤ 5 min freshness; one-time `query_id`; bot confirmation; no raw storage.                                    |
| Telegram webview cookie assumptions     | High       | Medium   | Two-phase ceremony; do not require the Supabase cookie inside the webview.                                   |
| In-memory rate limiter across instances | High       | Medium   | Shared store before GA; per-key limits; alerting.                                                            |
| Supabase user deletion cascades         | Medium     | High     | No cascade to history/audit; explicit revoke event; Telegram-only path continues.                            |
| Historical Telegram logs unattributable | Certain    | Medium   | Document limitation; no guessing; label pre-link history; future events only.                                |
| Support social engineering              | Medium     | High     | Both proofs; dual control; no email recovery; audit; recovery playbook.                                      |
| PII in audit/logs                       | Medium     | Medium   | No tokens; hashed IP/UA; retention; access control.                                                          |
| Bot token rotation breaks proofs        | Medium     | Medium   | Runbook; monitor failures; existing sessions unaffected until expiry.                                        |
| Owner/operator confusion about "merge"  | Medium     | Medium   | Language: "link", not "merge"; explicit no-history-transfer policy; UI copy review.                          |
| Third provider later                    | Low        | Low      | Option A participant model accommodates it; Option B would need a schema change.                             |

### 6.6 Observability

Track, without PII:

- intent created / expired / confirmed / denied by reason;
- Telegram proof accepted/rejected by reason (`stale`, `invalid_hash`, `replay`, `intent_mismatch`);
- Supabase proof rejected (`no_session`, `owner_mismatch`, `reauth_required`);
- conflicts by type;
- unlink requested/cancelled/confirmed;
- linked claims vs legacy claims;
- cooldown seed values (durations, not identities);
- CSRF/origin rejections;
- rate-limit hits.

Alert on spikes in conflicts, replay rejections, CSRF rejections and link confirmations per user.

---

## 7. Test plan

> This is a **proposed** test plan for the future implementation. No tests are added or run by
> this design-only task.

### 7.1 Unit tests

| Area                | Cases                                                                                                                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Proof of control    | Missing `initData`; malformed; invalid HMAC; stale `auth_date` (> 5 min); future `auth_date`; missing/invalid user id; missing intent token; replayed `query_id`; mismatched intent hash. |
| Intent lifecycle    | TTL expiry; single use; max attempts; token hash comparison; wrong browser binding; wrong Supabase user; consumed intent cannot be reused.                                                |
| CSRF                | Missing header; wrong token; cross-origin `Origin`; protocol-relative `Referer`; GET mutation rejected.                                                                                   |
| Identity resolution | Unlinked Telegram → `tg:`; unlinked Supabase → `sb:`; linked → `pt:`; bearer precedence; stale Telegram cookie; link table absent/flag off → legacy; client-supplied ids ignored.         |
| Conflict logic      | Telegram already linked; Supabase already linked; same pair active; revoked pair; concurrent insert.                                                                                      |
| Cooldown seed       | Only `tg`; only `sb`; both; neither; invalid timestamp; future timestamp; `max` order independence.                                                                                       |
| Unlink/relink       | Copy `max` to both keys; no reset; relink cooldown; retained participant timestamp; no history mutation.                                                                                  |
| Display name        | Name is never used for lookup; changing username does not change the link.                                                                                                                |

### 7.2 Integration tests (route handlers, mocked Supabase)

| Scenario                                           | Expected                                                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Create intent without Supabase session             | `401`; no intent row.                                                                       |
| Create intent with session but without CSRF/Origin | `403`; audit denial.                                                                        |
| Telegram proof with forged HMAC                    | `401`; no link; audit.                                                                      |
| Telegram proof with stale `initData`               | `401 link_proof_stale`.                                                                     |
| Telegram proof replayed `query_id`                 | `409 replay_rejected`.                                                                      |
| Telegram proof for a different intent              | `403 intent_mismatch`.                                                                      |
| Confirm without Telegram proof                     | `409 link_proof_missing`.                                                                   |
| Confirm with expired intent                        | `410 link_intent_expired`.                                                                  |
| Confirm with a different Supabase user             | `403`; no link.                                                                             |
| Successful link                                    | Exactly one active link row; cooldown seed `max`; audit `link_confirmed`; intent consumed.  |
| Repeated successful confirm                        | Idempotent success or `409` per policy; no duplicate row.                                   |
| Telegram already linked                            | `409 identity_conflict`; no row change; audit.                                              |
| Supabase already has another Telegram              | `409`; require unlink.                                                                      |
| Concurrent confirms                                | Exactly one link; one `409`; audit both.                                                    |
| Unlink without re-auth                             | `403`.                                                                                      |
| Unlink with both proofs                            | Immediate revoke; audit; cooldown copied.                                                   |
| Unlink without Telegram proof, link < 7 days       | Pending/delayed or `403` per policy.                                                        |
| Relink before cooldown                             | `409 relink_cooldown`.                                                                      |
| Relink after cooldown with both proofs             | New link row; old row retained; audit.                                                      |
| Provider deletion simulation                       | Link revoked/marked; Telegram-only and Supabase-only paths still work; no history deletion. |
| Supabase outage                                    | Fail closed; no partial link; retry safe.                                                   |

### 7.3 Cooldown continuity tests

1. Link with `tg.last = now - 2h`, `sb.last = now - 20h` → linked remaining ≈ 22h.
2. Link with the values reversed → same ≈ 22h (order independence).
3. Link with only one row → that row's cooldown.
4. Link with no rows → can spark.
5. Claim after link with an active cooldown → denied; exactly one row updated.
6. Two concurrent claims, one via each provider after link → exactly one allowed.
7. Unlink during active cooldown → both `tg:` and `sb:` inherit the later timestamp; no spark.
8. Relink immediately after unlink → still on cooldown.
9. Future/invalid timestamps → clamped consistently; no infinite or negative cooldown.
10. Legacy `tg:` / `sb:` rows are not deleted and are not used while `pt:` is active.

### 7.4 Security and abuse tests

| Test                                                                      | Expected                                                                |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Same email on two accounts, no proofs                                     | Cannot link; `401`/`409`; no lookup by email.                           |
| Same username/display name, no proofs                                     | Cannot link.                                                            |
| Attacker with victim's email but no Telegram `initData`                   | Cannot link.                                                            |
| Attacker with victim's `initData` replay after 5 min                      | Denied.                                                                 |
| Attacker with victim's `initData` but no bot confirmation (strong mode)   | No silent link; pending state visible to the Telegram user and browser. |
| CSRF from `evil.example`                                                  | `403`.                                                                  |
| Attacker-created intent token used with victim's browser                  | `403`; binding mismatch.                                                |
| Attacker with their own Supabase session tries to confirm victim's intent | `403`.                                                                  |
| Enumeration: probe linked vs unlinked Telegram ids                        | Identical status/body/timing.                                           |
| Rate limit per IP/user/Telegram/intent                                    | `429` without revealing state.                                          |
| RLS: `anon` / `authenticated` select/insert on new tables                 | Denied.                                                                 |
| Audit contains no raw `initData`, tokens, cookies, emails                 | Pass.                                                                   |
| Link state cannot be forged via body fields                               | Ignored; server derives from credentials.                               |
| JWT claim tampering (`participant_id`, `link_id`)                         | No effect; not used.                                                    |

### 7.5 End-to-end and regression tests

- **Telegram-only regression:** open Temple, Vigil spark, Cast, trace, Absolution, Tribute without
  any Supabase session. No linking prompt, no registration wall, no change in responses.
- **Browser-only regression:** open the same surfaces with only Supabase. No linking prompt.
- **Opt-in link:** mock Telegram + Supabase, complete the three-step ceremony, see linked state,
  one cooldown, unlink, relink.
- **Dismissal:** dismissing the optional card suppresses it for the configured period.
- **Telegram Mini App without Supabase:** the linking entry is optional; closing it leaves every
  ritual working.
- **History immutability:** a pre-link `temple_log` row's `author`, `user_id` and `created_at` are
  byte-identical after link/unlink.
- **Payment regression:** Tribute remains guest-capable; linking is never required and never
  changes Stripe metadata.
- **Conflict UX:** generic message; no other-account details.
- **Kill switch:** flag off returns legacy behaviour; links remain stored but unused.

### 7.6 Acceptance mapping

| Acceptance criterion                                        | Evidence in this ADR                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------- |
| ADR recommends one option with explicit tradeoffs           | §4.5 recommends Option A; §4.4/§4.5 list tradeoffs.           |
| Linking requires proof of control of both active identities | §5.2 three-step ceremony; §5.3 proof table; I3.               |
| No automatic matching by email/username/displayName         | §3.4 rejected cases; §5.3 forbidden signals; §7.4 tests.      |
| Telegram-only remains fully supported                       | I1; §5.11 UX; §7.5 regression tests.                          |
| Cooldown and historical ownership addressed                 | §5.7 cooldown continuity; §5.8 ownership/history; §7.3 tests. |
| No implementation or DB migrations                          | Header, §1.3, §6.1; no code/migration files changed.          |

---

## 8. Open questions for the owner

These do not block the architectural recommendation; they are product/policy decisions for the
implementation approval.

1. **Unlink delay:** immediate with both proofs + 24-hour delay for single-proof unlink, or always
   delayed? Recommended: both proofs = immediate; otherwise 24 hours with cancel.
2. **Relink cooldown:** 24 hours for all, or 7 days for links younger than 7 days? Recommended:
   24 hours minimum, 7 days for very new links.
3. **Strong mode:** is a Telegram bot confirmation message mandatory at GA, or only for links
   younger than N days / high-risk accounts? Recommended: mandatory at GA.
4. **Ownership display:** should a linked Telegram spark display the Supabase UUID as
   `vigil_hearts.owner_id`, or keep `owner_id` null and use a future `participant_id`? Recommended:
   keep current semantics; use `participant_id` for the read model.
5. **History read model:** is a union of new events by `participant_id` enough, with pre-link
   Telegram history labelled separately? Recommended: yes, until a separate retroactive policy is
   approved.
6. **Participant lifecycle:** do we need `suspended`/`closed` states in v1, or only `active`?
   Recommended: include the states in the schema but do not expose admin actions in v1.
7. **Support recovery:** who can perform it, with what dual control and waiting period? Recommended:
   two-person approval, both proofs, 7-day waiting period, audit.
8. **Retention:** how long to keep link audit and hashed IP/user-agent data? Recommended: audit
   2 years, network metadata 90 days, subject to privacy review.
9. **Third provider:** confirm that Option A's participant model is the intended long-term shape.
10. **Feature flag name and rollout owner:** assign before P2.

---

## 9. Consequences

**Positive**

- The product can offer one cooldown and a continuous future story without merging auth accounts.
- Telegram-only and browser-only remain complete paths.
- No auth-provider or `auth.users` change; low blast radius.
- Conflicts and abuse have explicit, testable behaviour.
- History is preserved and authorship is not rewritten.
- The design is reversible behind a flag.

**Negative / costs**

- New tables, lifecycle states and a dual-read period.
- More complex transaction/lock handling around cooldown.
- A new security-sensitive ceremony requiring CSRF, replay and rate-limit infrastructure (including
  a shared limiter) before GA.
- Historical Telegram logs remain partially unattributable; the "one story" view is honest but
  incomplete for pre-link events.
- Support recovery process and audit retention need operational ownership.

**Neutral**

- `temple_users` stays a Telegram profile; it does not become an account table.
- `vigil_spark_claims` keeps its existing atomic conditional-update design; only the key changes
  for linked participants.

---

## 10. References

- `docs/temple/RITUAL_AUTH_MATRIX.md` — current ritual authorization and cooldown decision.
- `docs/architecture/AUTH_IDENTITY_AND_SESSIONS.md` — Supabase identity, roles, sessions, callbacks.
- `lib/temple/identity.ts` — current credential verification and namespaced identity.
- `lib/vigil/claim.ts` — atomic cooldown claim.
- `lib/vigil/cooldown.ts` — cooldown math and labels.
- `lib/session.ts` — `temple_session` JWT signing and verification.
- `lib/telegram/initData.ts` — HMAC verification, freshness, signed chat context.
- `migrations/2026-11-16_vigil_spark_cooldown.sql` — private cooldown table and key semantics.
- `migrations/2026-10-30_security_hardening_private_data.sql` — private table/RLS precedent.
- `app/api/temple/auth/route.ts` — Telegram initData → `temple_session` exchange.
- `app/api/temple/me/route.ts` — verified identity read path.
- `lib/rateLimit.ts` — current in-memory limiter limitation.
