# YouTube channel management — Pierrot + UNFRAMED

One owner-level YouTube channel is shared by both project contexts. Analytics
and management are two incremental Google grants with separate encrypted
credentials, so choosing the UNFRAMED Google account never replaces the
analytics refresh token.

## What is shared

| Concern          | Storage                                                 | Notes                                                                                            |
| ---------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Channel identity | `analytics_connections` row with `provider = 'youtube'` | `external_id` is the channel id; `project_slugs` contains `pierrot` and `unframed`.              |
| Analytics grant  | `token_ciphertext/iv/tag`                               | Read-only: `youtube.readonly`, `yt-analytics.readonly`, plus GA4/GSC scopes.                     |
| Management grant | `management_token_ciphertext/iv/tag`                    | Separate incremental grant. Analytics columns are never rewritten.                               |
| Operation audit  | `youtube_management_audit`                              | Identifiers and status only; never tokens, descriptions, comment text, captions or upload bytes. |

The same `lib/youtube` services serve both project contexts. Project selection
is routing/presentation metadata, not a second connection.

## OAuth account selection

`buildGoogleConsentUrl` always requests `prompt=consent select_account`.
`login_hint` is only sent when the owner explicitly supplies `?login_hint=...`.
The analytics connect route no longer passes the site-login email implicitly,
so Google shows the account chooser and the owner can pick the UNFRAMED account.

State is HMAC-signed, bound to the authenticated owner, expiring, and checked
against an HttpOnly nonce cookie on the callback. Incremental consent keeps
`include_granted_scopes=true`.

## Scopes and Google Cloud setup

Management consent requests only:

- `openid`, `email` — display the connected Google account;
- `youtube.readonly` — verify the selected channel;
- `youtube.upload` — video upload/update, thumbnail, playlists, playlist items;
- `youtube.force-ssl` — comments and captions.

It deliberately does **not** request `yt-analytics.readonly`, GA4 or Search
Console scopes. Analytics consent stays read-only and unchanged.

Manual Google Cloud Console steps:

1. Enable **YouTube Data API v3** (and keep **YouTube Analytics API** enabled).
2. Register the management callback in the same OAuth 2.0 client:
   `https://<site>/api/auth/youtube-management/callback`
   (override with `YOUTUBE_MANAGEMENT_GOOGLE_REDIRECT_URI`).
3. If the OAuth consent screen is in Testing, add both Google accounts as test
   users.
4. Verify the OAuth client is allowed to request `youtube.force-ssl` and
   `youtube.upload`. Restricted-scope verification may be required for public
   production use; this repository cannot perform that audit.
5. Uploads made by unverified API projects may be locked private by YouTube.
   That is a Google platform policy, not a code bypass.

## Server API

Owner-only routes (`requireAdminFromRequest`):

- `GET /api/admin/youtube/management?project=pierrot|unframed` — channel
  identity, Google account email, permission state, connect URL, action catalog.
- `POST /api/admin/youtube/management` — JSON or multipart action execution.
- `GET /api/admin/youtube/management/connect?project=...` — starts the
  incremental write consent with the account chooser.
- `GET /api/auth/youtube-management/callback` — validates state/nonce, seals the
  management refresh token separately, verifies the channel, records account
  identity.
- `GET /api/admin/pierrot/youtube/status` — diagnostics without secrets.

Supported actions:

- video: `channel.videos.list`, `video.upload`, `video.update`,
  `video.thumbnail`;
- playlists: `playlist.list/create/update/delete/add/remove`;
- comments: `comment.list/reply/moderate/delete`;
- captions: `caption.list/upload/update/delete`.

Video deletion is intentionally not exposed.

## Confirmation and audit

Every write returns HTTP 409 with a short-lived confirmation token until the
owner explicitly confirms. The token is HMAC-signed, bound to owner id, action,
project and a hash of the parameters, and expires after five minutes. Read-only
listings do not require confirmation.

Comments moderation/deletion, playlist deletion/removal and caption deletion
are marked destructive. Publishing, metadata changes, thumbnail changes and
comment replies are marked externally visible. Both require confirmation.

Audit inserts are best-effort and never change the operation result. Apply
`migrations/2026-12-14_youtube_management.sql` (additive) before expecting audit
rows. The migration is prepared only and must not be applied to production by
this repository's automated runner.

## UI

The dedicated project workspace `/admin/pierrot/youtube` is the only YouTube
management surface. It handles Google account connections, channel discovery,
project bindings, channel analytics, the video catalog and the metadata editor.

`/admin/pierrot/analytics` shows read-only YouTube source health and analytics
only. It does not render channel-management forms, OAuth management actions,
uploads, playlists, comments or captions.

`components/youtube/YouTubeChannelManager.tsx` is the legacy shared-channel
manager. It is no longer mounted in analytics; any write UI belongs to the
dedicated workspace. Write controls, when mounted, surface the confirmation
preview before anything is sent.

## Known limitations

- Upload size is capped at 100 MB by this implementation. Larger files need a
  dedicated resumable/chunked uploader and platform body-size configuration.
- `youtube.force-ssl` is the narrowest Google scope that permits comment and
  caption management, but it is broader than `youtube.upload`.
- YouTube Data API quota is shared per Google Cloud project. Uploads are
  expensive; quota exhaustion is reported as `quota_exceeded`, never as zero
  views or a successful publish.
- Build verification requires the normal environment variables. A build without
  Supabase configuration fails during page-data collection in an unrelated
  route (`/api/cast/capture`), before YouTube code is evaluated.
