# Shared YouTube channel · Pierrot + UNFRAMED

One owner-level YouTube channel is connected once and read from both project
chats. Pierrot and UNFRAMED do not own separate OAuth grants, refresh tokens or
analytics copies.

## What is shared

- **One channel id.** `analytics_connections.provider = 'youtube'` is the only
  channel row. `external_id` is the channel id; `external_meta.channel_title`,
  `uploads_playlist_id` and `project_slugs = ['pierrot','unframed']` describe
  the shared resource.
- **One Google grant.** The existing incremental Google OAuth flow requests the
  identity scopes `openid email` plus four read-only API scopes:

  ```text
  https://www.googleapis.com/auth/analytics.readonly
  https://www.googleapis.com/auth/webmasters.readonly
  https://www.googleapis.com/auth/youtube.readonly
  https://www.googleapis.com/auth/yt-analytics.readonly
  ```

  Identity scopes are used only to show which Google account granted the
  credential in the admin UI. Monetary YouTube Analytics scopes are not
  requested.

- **One analytics result.** The same `lib/youtube` tools run in either project
  chat. The current project is context, not a filter; reports always cover the
  whole channel unless the owner names a video.

## Connection and refresh

1. Owner connects the read-only Google analytics grant from
   `/admin/pierrot/analytics` (GA4, Search Console and YouTube analytics).
   Channel connections and project bindings live in `/admin/pierrot/youtube`.
2. The callback runs the existing GA4/Search Console discovery and then
   `runYouTubeDiscovery`, which verifies both YouTube scopes and that the
   channel is visible.
3. The encrypted refresh token is stored under provider `youtube`; plaintext
   tokens never reach the client, logs, Brain, project briefs or snapshots.
4. Reports refresh the access token on demand. There is no cron and no
   permanent worker. Rotated refresh tokens are persisted without changing
   `connected_at`.
5. If Google rejects the grant, the connection is marked
   `needs_reauthorization`; a report never substitutes zero for missing data.

The discovery step can use `YOUTUBE_CHANNEL_ID` /
`YOUTUBE_ANALYTICS_CHANNEL_ID` for an explicit channel id, or `mine=true` when
the owner does not configure one. A public `YOUTUBE_API_KEY` is optional; when
absent, Data API calls use the OAuth token.

## Reports and owner tools

`lib/youtube/tools.ts` exposes:

| Tool                           | Purpose                                             |
| ------------------------------ | --------------------------------------------------- |
| `get_youtube_channel_overview` | public channel counters + private period totals     |
| `get_youtube_video_overview`   | one video: public counters + private period metrics |
| `get_youtube_time_series`      | daily views/watch time/subscriber movement          |
| `compare_youtube_videos`       | two or more videos side by side                     |
| `compare_youtube_periods`      | current vs previous period with deltas              |
| `get_youtube_traffic_sources`  | views/watch time by traffic-source type             |
| `get_youtube_engagement`       | retention, likes, comments, shares, subscribers     |

Natural questions are detected in both project chats. Examples:

```text
Статистика YouTube-канала за 30 дней
Сравни ролики The Spectral Tiger и Step Out of the Physical Container
Что с трафиком YouTube за неделю?
Динамика просмотров YouTube по дням за 7 дней
Статистика видео https://youtu.be/TmC6Lr5K4R8 за месяц
```

A bare YouTube URL still goes to publication intake. `/youtube` is an optional
explicit command.

## Source distinction

- **YouTube Data API v3** supplies channel/video metadata and cumulative public
  counters (`viewCount`, `likeCount`, `commentCount`, subscriber count).
- **YouTube Analytics API v2** supplies private period metrics (`views`,
  `estimatedMinutesWatched`, `averageViewDuration`, `averageViewPercentage`,
  `subscribersGained/Lost`, `likes`, `comments`, `shares`) and traffic-source
  breakdowns.

The report labels each row `Data API · публично` or `Analytics · приватно`.
A missing metric is rendered as `—` with a reason. A real zero is rendered as
`0`.

## Dates, freshness and provenance

Every report contains:

- the requested period and timezone (`Europe/London` by default);
- the comparison period when requested;
- `fetchedAt` and whether the in-process cache was used;
- the called APIs and the YouTube Analytics reporting delay (2 days);
- limitations, including permission/quota failures.

Reports are cached in-process for `YOUTUBE_ANALYTICS_CACHE_TTL_SECONDS`
(default 300). `fresh: true` bypasses the cache. Successful reports are also
written to `analytics_snapshots` with a checksum for audit when the additive
migration is applied. The snapshot contains report data only, never tokens.

## Diagnostics

`GET /api/admin/pierrot/youtube/status` is owner-only and returns connection
state, channel id/title, granted and missing scopes, last report snapshot and
the public Data API key presence. It never returns a token or ciphertext.

## Database

`migrations/2026-12-13_youtube_shared_channel.sql` is additive:

- adds `youtube` to the `analytics_connections` and `analytics_snapshots`
  provider checks;
- adds a YouTube snapshot-period index;
- does not create per-project token tables or duplicate OAuth connections.

Rollback: `migrations/rollback/2026-12-13_youtube_shared_channel_rollback.sql`.
It preserves YouTube rows, so it is safe only after those rows are removed.

## Relationship to task 8289098f

Task `8289098f-993a-4e75-abe4-81e23caee6d0` covers YouTube parsing, analytics
ambiguity and OAuth reauthorization. This work reuses the same
`analytics_connections` grant, encrypted token storage, refresh/revoke functions
and discovery callback. It does not create a second authorization. Parsing
regression tests for `lib/flow/youtube.ts`, Shorts and `urlIntake` remain in
place and are run with this change.

## Known limitations

- Production Google credentials, refresh token validity and granted scopes are
  not proven by code. The status endpoint reports the real stored state.
- Private metrics depend on channel ownership, API enablement and Google
  account permissions.
- YouTube Analytics finalises data with a delay; the newest days may be
  incomplete.
- The tool is read-only. It never publishes, edits or deletes videos.
