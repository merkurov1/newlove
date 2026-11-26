# YouTube multi-account / multi-channel audit

Date: 2026-11-26
Scope: `app/api/admin/youtube/**`, `app/api/auth/**`, `lib/youtube/**`,
`lib/analytics/website/**`, `components/youtube/**`, the additive YouTube
migrations and their tests.

> Production OAuth was **not** executed from this environment: no production
> credentials, Supabase service key, Vercel access or Google Cloud access are
> available here. Everything marked “production” below is a verification plan,
> not a claimed observation. No secret value is read or printed by this audit.

## 1. Source of truth

| Concern | Authoritative store | Notes |
| --- | --- | --- |
| One Google OAuth grant | `youtube_oauth_connections` | Sealed refresh token only. Unique `(owner_id, google_account_email)`. |
| Channels visible to a grant | `youtube_channels` | Every `channels.list?mine=true` result, including Brand Accounts. Unique `(owner_id, channel_id)` keeps one entity when a channel moves between grants. |
| Project → channel routing | `youtube_project_bindings` | Partial unique index allows one active channel per project and the same channel in many projects. |
| Legacy single-channel YouTube analytics | `analytics_connections` (`provider = 'youtube'`) | **Read-only fallback** for the historical `/admin/pierrot/analytics` source health and old snapshots. It is never the token source for project analytics, video catalog or metadata. |
| GA4 / Search Console | own `analytics_connections` rows | Untouched by this flow. |

### Legacy import policy

There is **no automatic import** of the legacy YouTube row into the new tables.
An old grant may belong to a different owner or Google account, and its channel
may not be one of the channels returned by a new consent. Copying it without an
owner + channel check would create a false binding.

Safe path:

1. Keep `analytics_connections(provider = 'youtube')`, its snapshots and its
   sealed token in place; do not revoke it.
2. The new workspace shows no project binding until the owner connects a Google
   account and explicitly selects a channel.
3. If the legacy row points at the intended channel, the owner re-consents once
   through `/api/admin/youtube/channels/connect`. Discovery reuses the same
   `channel_id`, so no duplicate channel entity is created.
4. Only an explicitly requested, owner-verified and idempotent import script
   could copy the legacy row later. No such write happens in this change.

## 2. Schema and migration compatibility

The additive migration is `migrations/2026-12-15_youtube_multichannel.sql`.
Rollback is `migrations/rollback/2026-12-15_youtube_multichannel_rollback.sql`.
No destructive `ALTER` and no data deletion is part of the forward migration.

### `owner_id` text vs uuid

The SQL declares `owner_id text` for the three new tables. Some production
tables in this repository use `uuid` for the same Supabase auth user id. The
runtime passes the canonical string id (for example `user.id`):

- a live `text` column stores it verbatim;
- a live `uuid` column accepts the same string through PostgREST and casts it.

Therefore the application code is compatible with either live type for the
normal Supabase auth owner id. **Do not** convert the column with
`ALTER COLUMN ... TYPE` in place: that would be a destructive schema change.
One caveat: if the live column is `uuid`, a non-UUID service identity (for
example the legacy `system-admin`/Telegram admin id) cannot be written by
PostgREST. Owner-facing connect/disconnect must use the Supabase auth user id in
that environment; do not silently stringify or rewrite the column. If the live tables were created by an earlier draft
with `uuid`, `CREATE TABLE IF NOT EXISTS` leaves them untouched and the helpers
continue to work. Before applying the migration in a new environment, confirm
the actual column types and existing unique indexes with a read-only query. The
exact production column type was not observable from this environment.

### Practical precondition checks (read-only, no values printed)

```sql
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'youtube_oauth_connections',
    'youtube_channels',
    'youtube_project_bindings'
  )
order by table_name, ordinal_position;

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'youtube_oauth_connections',
    'youtube_channels',
    'youtube_project_bindings'
  );
```

## 3. OAuth entrypoints and state

| Entrypoint | Purpose | Callback |
| --- | --- | --- |
| `/api/admin/youtube/channels/connect` | Multi-account / multi-channel consent | `/api/auth/youtube-management/callback` by default, or the optional `YOUTUBE_CHANNELS_GOOGLE_REDIRECT_URI` |
| `/api/auth/youtube-channels/callback` | Optional dedicated multi-channel callback | same handler |
| `/api/admin/youtube/management/connect` | Incremental write-only management grant | `/api/auth/youtube-management/callback` |
| `/api/auth/google-analytics/callback` | GA4 / Search Console / legacy analytics grant | existing analytics callback |

Checks performed:

- HMAC-signed state includes `uid`, `purpose`, `project`, `nonce`, `exp`.
- The nonce is stored in an httpOnly cookie, `sameSite=lax`,
  `secure` in production, path `/api/auth`; callback verifies signature, user,
  purpose, expiry and the cookie nonce.
- The callback dispatches on signed `purpose`, so the reused management
  callback cannot mix the multi-channel grant with the legacy management grant.
- Consent requests `access_type=offline`, `prompt=consent select_account`,
  `include_granted_scopes=true`; `login_hint` is optional.
- Token exchange uses the same redirect URI as the consent request.
- A repeated consent may omit `refresh_token`; the stored token is retained and
  only replaced when Google actually returns a new one.

## 4. Scopes by operation

| Operation | Scope |
| --- | --- |
| Account identity | `openid`, `email` |
| Channel discovery (`channels.list?mine=true`) | `youtube.readonly` |
| Analytics reports | `yt-analytics.readonly` |
| `videos.update` for title/description/tags | `youtube.upload` |
| Comments / captions (legacy management flow only) | `youtube.force-ssl` |

The multi-channel connection deliberately does **not** request
`youtube.force-ssl`, GA4 or Search Console. The callback rejects a partial grant
that omits read, analytics or upload scope instead of silently creating a
half-working connection. Because Google may return the broadest granted alias
instead of every narrower one, an existing `youtube` or `youtube.force-ssl`
grant is accepted as satisfying read and upload; the stored scope list remains
exactly what Google returned.

## 5. Discovery and failure modes

- `channels.list?mine=true` with `maxResults=50` and bounded pagination
  (default 10 pages, hard cap 20). Duplicate channel ids are de-duplicated.
- Brand Accounts and several channels on one Google account are stored as
  separate `youtube_channels` rows.
- Empty result is an explicit empty list, not an error.
- A later-page failure fails the whole discovery atomically: the existing
  channel rows are not replaced with a partial list.
- `quota_exceeded`, `rate_limited`, `needs_reauthorization`, `401`, `403`,
  `404`, timeout and network errors are classified before they reach the UI.
- A connection whose first discovery failed is still saved. The owner can retry
  discovery without a new consent because refresh now works from the connection
  id even when there are zero channel rows.
- A transient `error` connection is retryable; `invalid_grant` marks
  `needs_reauthorization` and the UI offers a re-consent for that account only.

## 6. Token handling

- AES-256-GCM, random 12-byte IV, auth tag, key version stored with the token.
- Dedicated `ANALYTICS_TOKEN_ENCRYPTION_KEY` is preferred; the domain-separated
  service-role derived key remains supported for existing rows.
- Opening a token honours its `key_version` and can use
  `ANALYTICS_TOKEN_ENCRYPTION_KEY_PREVIOUS` during rotation. This prevents a key
  rotation from forcing every owner to re-consent at once.
- Plaintext tokens are opened only inside server-only modules. No API response,
  UI payload or log contains `token_ciphertext`, `token_iv`, `token_tag`,
  `refresh_token` or `access_token`.
- Disconnect clears the sealed token locally and reports whether Google
  actually accepted the revocation. Local cleanup happens even if Google is
  unavailable.
- Disconnecting one connection marks only that connection's channels
  disconnected and deactivates only bindings to those channels.

## 7. Project isolation and routing

- Analytics, video catalog, video detail and metadata update resolve the
  project binding **before** using any token.
- The analytics cache key includes owner, project, binding id, channel record
  id, YouTube channel id, connection id and period. Rebinding a project can
  never serve the previous channel's cached report.
- Metadata reads/updates also require the video's `channelId` to match the
  bound channel.
- Binding refuses a channel that is not `active` or whose Google connection is
  `needs_reauthorization`/`revoked`.
- One channel may be active in several projects; re-binding the same project
  updates the existing active row instead of creating a second one.

## 8. Fixes made in this attempt

1. Connection-level access-token refresh so a zero-channel connection can
   retry discovery without re-consent.
2. Transient `error` connections retry and clear their error state instead of
   forcing a new grant.
3. Accurate revocation reporting from `revokeGoogleToken`.
4. Binding rejects disconnected channels and disconnected/reauth connections.
5. Analytics cache is keyed by the resolved binding/channel, preventing stale
   cross-channel reports after a rebind.
6. Key-version-aware decryption with previous-key rotation support.
7. UI: per-account reconnect link with `login_hint`/account chooser, safe error
   message display and a working status retry.
8. New tests for two accounts in both orders, shared channels, disconnect
   isolation, zero-channel retry, refresh-token retention, callback state/cookie
   failures, pagination/brand/empty/partial/quota, cache rebinding and
   multi-account UI states.

## 9. Production trace status (not executed here)

The required trace is:

`connect → Google consent → callback → token exchange → identity → DB save →
channel discovery → DB persistence → UI reload`.

It cannot be honestly marked verified from this environment. To complete it on
the deployed app, collect the following **without printing secrets**:

1. Correlation id or timestamp for each step, plus the admin user id.
2. HTTP status and `Location` host/path of the consent redirect and callback
   (strip query parameters before sharing).
3. Confirmation that `youtube_oauth_connections` has one row per Google account
   with the expected `google_account_email` and `status = 'connected'`.
4. Confirmation that `youtube_channels` contains every channel returned by
   Google for that grant, including `@merkurov-art`, `@unframed-tv` and
   `@heartandangel` when those accounts are connected.
5. Confirmation that `youtube_project_bindings` has active rows:
   `art-engine → @merkurov-art`, `unframed → @unframed-tv`,
   `pierrot → @unframed-tv`, `heart-and-angel → @heartandangel`.
6. A reload of `/admin/pierrot/youtube?project=...` showing the same bindings.
7. A refresh and a disconnect of one account, confirming the other account's
   connection/channels/bindings remain connected.
8. Analytics/video/metadata requests include the bound channel id and no token.

Exact settings that would only be touched after proving a real failure (names
only, never values): Google Cloud OAuth client redirect URIs, consent-screen
scope list, YouTube Data API v3 / YouTube Analytics API enablement, Vercel
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ANALYTICS_GOOGLE_REDIRECT_URI`,
`YOUTUBE_MANAGEMENT_GOOGLE_REDIRECT_URI`,
`YOUTUBE_CHANNELS_GOOGLE_REDIRECT_URI`, `ANALYTICS_SYNC_SECRET`,
`ANALYTICS_TOKEN_ENCRYPTION_KEY` and optional
`ANALYTICS_TOKEN_ENCRYPTION_KEY_PREVIOUS`.

## 10. Automated verification

Targeted suites:

```text
pnpm jest lib/youtube lib/analytics/website/__tests__/tokenCrypto.test.ts \
  app/api/admin/youtube components/youtube --runInBand
pnpm typecheck
pnpm eslint <changed files>
```
