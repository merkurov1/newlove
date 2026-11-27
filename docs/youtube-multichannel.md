# YouTube multi-channel integration

Status: additive migration `20261126140616` (youtube_multichannel_connections_and_bindings)
is already present in production. Code and tests live in this PR; production
OAuth consent still requires the owner to sign in interactively. No production
migration is re-applied and no real metadata write is performed by this change.

## Production schema audit (2026-11-26)

Verified against the production project, without applying or editing a
migration:

- `youtube_oauth_connections`, `youtube_channels` and
  `youtube_project_bindings` exist, have RLS enabled and expose `owner_id` as
  **UUID** in all three tables. The code passes the Supabase `user.id` UUID
  through unchanged and compares it as a string; no cast or schema change is
  required.
- The expected indexes exist. The three tables and
  `youtube_management_audit` contained zero rows at audit time, so there is no
  persisted production OAuth connection yet.
- Production code and tests must therefore never claim a successful live
  connection from the consent redirect alone: only a connection row, channel
  rows and the project binding count as evidence.

### Safe configuration diagnostics

`GET /api/admin/youtube/channels` returns `config.diagnostics`. It contains
only booleans, environment variable **names**, redirect URIs and the token-key
mode. It never returns the Google client secret, a token, an encryption key or
the account email. The owner workspace renders the same block, so an operator
can confirm on production:

- whether `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are present (missing names
  only);
- which callback is used (`/api/auth/youtube-management/callback` by default,
  or the dedicated `/api/auth/youtube-channels/callback`);
- that both redirect URIs have the same origin as `NEXT_PUBLIC_SITE_URL`;
- whether a dedicated token-encryption key, sync secret and service role key
  are configured;
- the callback has failed stage/reason entries in Vercel logs without PII.

## What already existed (audit)

The repository already had a working single-channel YouTube stack:

- Google OAuth consent + signed `state` + nonce cookie in
  `/api/admin/youtube/management/connect` and
  `/api/auth/youtube-management/callback`.
- AES-256-GCM sealing for refresh tokens (`lib/analytics/website/tokenCrypto.ts`).
- One shared row in `analytics_connections` (`provider = 'youtube'`) for the
  Pierrot + UNFRAMED channel, with a separate management refresh token.
- Analytics reports (`lib/youtube/service.ts`, `lib/youtube/api.ts`), quota
  error classification, bounded upload pagination and an in-process TTL cache.
- Write operations for videos, playlists, comments and captions
  (`lib/youtube/management.ts`) with an explicit confirmation token for writes
  and an append-only audit table (`youtube_management_audit`).
- A legacy shared-channel manager, no longer mounted on the analytics page.

Two callback URIs already existed and remain separate:

| Flow                                         | Callback                                       | Default                                  |
| -------------------------------------------- | ---------------------------------------------- | ---------------------------------------- |
| Analytics/Google (GA4, GSC, legacy YouTube)  | `/api/auth/google-analytics/callback`          | `ANALYTICS_GOOGLE_REDIRECT_URI`          |
| Incremental YouTube management               | `/api/auth/youtube-management/callback`        | `YOUTUBE_MANAGEMENT_GOOGLE_REDIRECT_URI` |
| New multi-channel OAuth (default)            | reuses `/api/auth/youtube-management/callback` | same as management                       |
| New multi-channel OAuth (optional dedicated) | `/api/auth/youtube-channels/callback`          | `YOUTUBE_CHANNELS_GOOGLE_REDIRECT_URI`   |

The legacy analytics flow actually uses the first URI unless overridden. The
new multi-channel flow reuses the already-registered management callback by
default, so a live connection does not require registering a new URI. The
dedicated `/api/auth/youtube-channels/callback` route exists as an optional
override and never changes the two existing grants.

## What changed

### Entities

`migrations/2026-12-15_youtube_multichannel.sql` (additive, prepared only):

- `youtube_oauth_connections` — one Google OAuth grant per owner/account.
  Sealed refresh token columns only. RLS on, anon/authenticated revoked.
- `youtube_channels` — every channel visible to a grant. Supports several
  channels on one Google account and Brand Accounts.
- `youtube_project_bindings` — active project → channel binding. One active
  channel per project; the same channel may be active in several projects
  (for example `@unframed-tv` for both UNFRAMED and Pierrot).
- `youtube_management_audit.changed_fields` and `result_summary` — field names
  and a short result only; never descriptions, comment text or tokens.

The existing `analytics_connections` YouTube row is untouched and remains a
read-only fallback for historical analytics. Rollback:
`migrations/rollback/2026-12-15_youtube_multichannel_rollback.sql`.

### OAuth flow

1. Owner opens `/admin/pierrot/youtube?project=<slug>`.
2. `GET /api/admin/youtube/channels/connect` requires an ADMIN session, signs
   `{uid, purpose, project, nonce, exp}` and sets an httpOnly nonce cookie for
   `/api/auth` so the management callback can receive it.
3. Google consent requests only:
   `openid email`, `youtube.readonly`, `yt-analytics.readonly`,
   `youtube.upload`. `youtube.force-ssl` (comments/captions) is not requested.
4. The callback handler verifies signature, uid, expiry and cookie nonce,
   exchanges the code with the redirect URI that was actually used, seals the
   refresh token and calls `channels.list?mine=true` with pagination.
5. All returned channels are stored, including Brand Accounts and every page.
   If discovery reaches its page cap, previously stored channels are kept
   active: a truncated list is not evidence that they lost access. The owner
   explicitly selects one and binds it to a project. Nothing is auto-bound.
6. Failure stages are logged as `[youtube-channels-callback] failed` with only
   `stage`, a bounded `reason` code and the project. Authorization codes,
   signed state, tokens and Google account emails are never logged or put in
   the redirect URL.

Refresh tokens are opened only inside `lib/youtube/channels.ts`. Access tokens
are cached in-process until shortly before expiry. Rotated refresh tokens are
re-sealed and stored. Disconnect revokes the Google grant (best effort), clears
the sealed token, marks channels disconnected and deactivates bindings.

### Analytics

`GET /api/admin/youtube/channels/analytics?project=&start=&end=&fresh=1`

- Resolves the project binding first, then loads that channel's token.
- Channel totals: views, watch minutes, average view duration/percentage,
  subscribers gained/lost, likes, comments, shares.
- Impressions and CTR are queried separately. If the channel/period/API does
  not support them, values stay `null` with an explicit reason — never `0`.
- Top videos (25) and a daily series come from bounded Analytics queries.
- At most four Analytics queries and one Data API title lookup per report.
- In-process cache keyed by owner + project + active binding + channel record
  - connection + period. Rebinding a project therefore cannot serve another
    channel's cached report. Default TTL 300 seconds
    (`YOUTUBE_ANALYTICS_CACHE_TTL_SECONDS`); `fresh=1` bypasses it.
- The response includes period, timezone, fetched-at timestamp, API sources,
  reporting-delay note and limitations.

### Video catalog and metadata editor

- `GET /api/admin/youtube/channels/videos?project=&pageToken=&pageSize=`
  returns one page of the uploads playlist plus full `videos.list` details.
  Page tokens are YouTube's opaque tokens; the UI supports next/previous.
- `GET /api/admin/youtube/channels/videos/<id>?project=` returns full snippet
  and status plus a deterministic analysis. It refuses videos that do not
  belong to the project's bound channel.
- `POST ...?project=` actions:
  - `analyze` — read-only issues/suggestions.
  - `preview` — returns a «было / станет» diff, no write.
  - `update` without `confirmationToken` — returns HTTP 409 with a signed
    confirmation token, expiry and diff. No write.
  - `update` with `confirmationToken` — verifies owner/action/project/params,
    refuses stale metadata (fingerprint mismatch), fetches the current video,
    re-sends every untouched writable snippet field, then calls
    `videos.update?part=snippet`.
- Only `title`, `description` and `tags` can be changed. `categoryId`,
  `defaultLanguage`, `defaultAudioLanguage` and existing tags are preserved.
  `snippet.localized` is read-only and is not sent. `status` is never sent, so
  privacy/visibility is untouched.
- Suggestions are deterministic and grounded in existing metadata. If the
  description is too thin, the analysis asks for a transcript/summary instead
  of inventing facts. No links or promises are fabricated.
- Audit writes record actor, project, channel id, video id, action, status,
  changed field names and a short result. Values are not stored.

### UI

`/admin/pierrot/youtube?project=art-engine|unframed|pierrot|heart-and-angel`
now shows, per project:

- connected Google accounts and all discovered channels;
- bind / unbind / reselect channel, refresh channels, disconnect;
- shared-channel usage across projects;
- analytics panel with period selection, metrics, impressions/CTR, top videos,
  daily series, cache/provenance/limitations;
- paginated video catalog;
- metadata analysis, diff, explicit confirmation and apply.

`/admin/pierrot/analytics` keeps read-only YouTube source health and analytics
only. The old shared-channel manager is not mounted there; all channel
connections, discovery and project bindings stay in the dedicated workspace.

## Google Cloud checklist

1. Same OAuth client used by `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
2. Enable YouTube Data API v3 and YouTube Analytics API.
3. No new redirect URI is required by default: the existing
   `/api/auth/youtube-management/callback` is reused. If you explicitly set
   `YOUTUBE_CHANNELS_GOOGLE_REDIRECT_URI`, register that URI as well.
4. Consent screen scopes: `openid`, `email`, `youtube.readonly`,
   `yt-analytics.readonly`, `youtube.upload`.
5. Add the owner Google account as a test user while the app is unverified.
6. Production already has the additive migration and UUID `owner_id` columns;
   do not re-apply it. For a fresh non-production environment apply
   `2026-12-15_youtube_multichannel.sql` first.

Optional environment overrides:

```text
YOUTUBE_CHANNELS_GOOGLE_REDIRECT_URI=
YOUTUBE_ANALYTICS_CACHE_TTL_SECONDS=300
YOUTUBE_ANALYTICS_TIMEZONE=Europe/London
```

## Manual acceptance sequence

1. Production migration is already applied; apply the additive migration only
   in a fresh non-production environment.
2. Sign in as the owner, open Art Engine, click «Подключить Google-аккаунт».
3. Choose `Merkurov@gmail.com`, grant the scopes, confirm `@merkurov-art` is
   listed and bind it to Art Engine.
4. Compare analytics with YouTube Studio, allowing the 2-day API delay; check
   period, timezone, fetched-at and source are visible.
5. Page through the full video catalog.
6. Open one test video, run the analysis, generate the diff. Verify nothing
   was written to YouTube.
7. Press «Запросить подтверждение», review the diff, then «Записать на YouTube».
8. In YouTube Studio verify title/description/tags changed and category,
   language, privacy and localization did not.
9. Check `youtube_management_audit` contains one completed row with changed
   field names only.
10. Connect the second Google account, bind `@unframed-tv` to UNFRAMED and
    Pierrot, and `@heartandangel` to Heart & Angel.

## Automated tests added

- `lib/youtube/__tests__/multichannelAccounts.test.ts` — stateful two-account
  integration in both connection orders, all channels, three required project
  bindings, shared channel across two projects, refresh-token retention,
  owner isolation and disconnect isolation.
- `lib/youtube/__tests__/multichannelApi.test.ts` — several channels on one
  Google account across pages, including Brand Accounts.
- `lib/youtube/__tests__/multichannelChannels.test.ts` — owner isolation,
  refresh rotation, retry after transient error, zero-channel connection
  refresh, refresh-token retention, reauthorization and revoke failure.
- `app/api/admin/youtube/channels/connect/__tests__/route.test.ts` — owner-only
  connect, signed state cookie, least-privilege scopes, migration gate.
- `app/api/admin/youtube/channels/__tests__/route.test.ts` — owner-only API,
  no token leakage, binding one channel to two projects, discovery retry from
  an empty connection, disconnect.
- `lib/youtube/__tests__/channelAnalytics.test.ts` — real metrics, unavailable
  impressions without zeros, cache/fresh behaviour, rebound-channel cache
  isolation, unbound project.
- `lib/youtube/__tests__/channelsCallback.test.ts` — signed state/nonce,
  scope validation (including broader-scope aliases), identity failure and
  discovery failure diagnostics without token leakage.
- `lib/analytics/website/__tests__/tokenCrypto.test.ts` — key rotation and
  legacy token compatibility without exposing plaintext.
- `lib/youtube/__tests__/videoCatalog.test.ts` — page tokens and snippet
  preservation for `videos.update`.
- `lib/youtube/__tests__/metadata.test.ts` — analysis, no invented facts,
  diff and allow-list sanitisation.
- `app/api/admin/youtube/channels/videos/[videoId]/__tests__/route.test.ts` —
  diff preview writes nothing; real update requires explicit confirmation.
- `lib/youtube/__tests__/managementAudit.test.ts` — audit field names only and
  failure isolation.

## Out of scope (unchanged)

Video upload/publication, Shorts upload, scheduling, comments and live streams
are not part of this task. The legacy management component still contains older
upload/comment/caption forms; it is not mounted in analytics, is not used by the
new project workspace and no new upload flow was added.
