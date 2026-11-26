# YouTube multi-channel integration

Status: code and additive migration prepared. No production migration or real
metadata write is performed by this change. See
`docs/youtube-multichannel-audit.md` for the continuation audit (source of
truth, schema compatibility, production trace checklist and the fixes made on
2026-11-26).

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

| Flow | Callback | Default |
| --- | --- | --- |
| Analytics/Google (GA4, GSC, legacy YouTube) | `/api/auth/google-analytics/callback` | `ANALYTICS_GOOGLE_REDIRECT_URI` |
| Incremental YouTube management | `/api/auth/youtube-management/callback` | `YOUTUBE_MANAGEMENT_GOOGLE_REDIRECT_URI` |
| New multi-channel OAuth (default) | reuses `/api/auth/youtube-management/callback` | same as management |
| New multi-channel OAuth (optional dedicated) | `/api/auth/youtube-channels/callback` | `YOUTUBE_CHANNELS_GOOGLE_REDIRECT_URI` |

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
5. All returned channels are stored. The owner explicitly selects one and
   binds it to a project. Nothing is auto-bound.

Refresh tokens are opened only inside `lib/youtube/channels.ts`. Access tokens
are cached in-process until shortly before expiry. Rotated refresh tokens are
re-sealed and stored; when Google omits a new token the existing sealed token is
kept. Decryption honours the stored key version and supports
`ANALYTICS_TOKEN_ENCRYPTION_KEY_PREVIOUS` during key rotation. A connection with
zero discovered channels can retry discovery from the connection id without a
second consent. Disconnect revokes the Google grant (best effort), clears the
sealed token, marks only that connection's channels disconnected and
deactivates only bindings to those channels.

### Analytics

`GET /api/admin/youtube/channels/analytics?project=&start=&end=&fresh=1`

- Resolves the project binding first, then loads that channel's token.
- Channel totals: views, watch minutes, average view duration/percentage,
  subscribers gained/lost, likes, comments, shares.
- Impressions and CTR are queried separately. If the channel/period/API does
  not support them, values stay `null` with an explicit reason — never `0`.
- Top videos (25) and a daily series come from bounded Analytics queries.
- At most four Analytics queries and one Data API title lookup per report.
- In-process cache keyed by project + period. Default TTL 300 seconds
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
6. Apply `2026-12-15_youtube_multichannel.sql` in the target environment.

Optional environment overrides:

```text
YOUTUBE_CHANNELS_GOOGLE_REDIRECT_URI=
YOUTUBE_ANALYTICS_CACHE_TTL_SECONDS=300
YOUTUBE_ANALYTICS_TIMEZONE=Europe/London
```

## Manual acceptance sequence

1. Apply the additive migration in a non-production environment first.
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

- `lib/youtube/__tests__/multichannelApi.test.ts` — several channels on one
  Google account across pages.
- `lib/youtube/__tests__/multichannelChannels.test.ts` — owner isolation,
  refresh rotation, reauthorization, revoke + token clearing.
- `app/api/admin/youtube/channels/connect/__tests__/route.test.ts` — owner-only
  connect, signed state cookie, least-privilege scopes, migration gate.
- `app/api/admin/youtube/channels/__tests__/route.test.ts` — owner-only API,
  no token leakage, binding one channel to two projects, disconnect.
- `lib/youtube/__tests__/channelAnalytics.test.ts` — real metrics, unavailable
  impressions without zeros, cache/fresh behaviour, unbound project.
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
