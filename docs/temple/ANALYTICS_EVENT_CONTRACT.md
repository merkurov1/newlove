# Temple analytics event contract

Date: 2026-11-27
Scope: `/temple`, `/vigil`, their APIs, private analytics tables and the owner-only report.

## Why the old totals are not people

`public.temple_log` is an operational event log. Its 926 rows include entry,
navigation, incomplete and ritual rows. Recent `enter` rows are written by the
server with `author = 'Pilgrim'` and `user_id = NULL`. Display names are labels,
not identity, and one person can produce many rows. Those totals must never be
presented as unique visitors.

Historical anonymous rows are therefore **unknown**, not zero and not one. They
are not backfilled into visitor, session or D1/D7 metrics.

## Event names

| Event             | Emitted by                                           | Meaning                                                                           |
| ----------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| `session_start`   | server, automatically                                | First event in a new 30-minute visit session.                                     |
| `page_view`       | browser beacon / server                              | One mounted `/temple` or `/vigil` page. Refresh is a new page view, same session. |
| `ritual_open`     | server, from `MODAL_OPEN` in `POST /api/temple_logs` | A ritual surface was opened.                                                      |
| `ritual_nav`      | browser menu action                                  | The visitor selected a ritual from the Temple menu.                               |
| `ritual_complete` | trusted server routes only                           | A ritual or spark completed successfully. Clients cannot emit it.                 |

Server-derived completion keys are deterministic (`temple:ritual_complete:<log id>`,
`vigil_spark:<heart id>:<spark timestamp>`, `cast:<record id>`), so a retried
request cannot double count. Client events carry a random `eventKey`; the
table's unique `event_key` ignores duplicates.

## Identity model

- **Guest**: a random UUID `temple_analytics_visitor` cookie (HttpOnly, 1 year)
  is HMAC-SHA256 hashed on the server. The raw cookie is never stored.
- **Supabase**: HMAC of `supabase:<uuid>`.
- **Telegram**: HMAC of `telegram:<telegram id>`.
- **Session**: a random UUID `temple_analytics_session` cookie with a 30-minute
  sliding `Max-Age`. Refreshing reuses the cookie; a session is only created
  when the cookie is absent or expired.
- Guest and signed-in keys are **never merged by name or email**. When a guest
  signs in, later events use the verified identity key; earlier guest events
  are not retroactively attributed. A person with two accounts is two keys.

Stored fields are only: event key, event name, timestamps, HMAC visitor key,
opaque session key, identity kind (`guest` / `supabase` / `telegram`), channel
(`web` / `telegram`), coarse source, allowlisted path and canonical ritual.
No user id, Telegram id, email, display name, confession, Cast answer or raw
message is stored.

## Channel and source

- `channel` is `telegram` when a verified Telegram identity or signed initData
  is present, otherwise `web`.
- `source` is `direct`, `internal`, a sanitized external hostname or a short
  `utm_source`/`source` token. Query strings and paths are discarded.
- `path` is allowlisted to `/temple`, `/vigil`, `/absolution`, `/cast` and
  `/heartandangel` prefixes; query strings, fragments and unknown paths are
  dropped.

## Metric definitions

- **Unique visitors** — distinct HMAC visitor keys in the window. Identities,
  not verified people.
- **Sessions** — distinct opaque session keys in the window.
- **Page views** — `page_view` events. A refresh is a page view.
- **Ritual starts** — `ritual_open` events.
- **Ritual completions** — `ritual_complete` events.
- **Conversion** — completions / starts, bounded 0..1; null when no starts.
- **Returning visitor** — active on at least two distinct UTC days.
- **D1 return** — active again exactly on the next UTC day after first seen.
- **D7 return** — active again on or after the seventh UTC day after first seen.
- All timestamps are UTC ISO-8601.

The report is served by `GET /api/temple/analytics?days=30`. It requires
`requireAdminFromRequest` (admin secret, allowlisted Telegram Mini App admin,
Supabase admin JWT or admin cookie session). It returns aggregates only, never
rows.

## Retention and privacy

Both `temple_analytics_events` and `temple_analytics_sessions` have RLS enabled,
no policies and no `anon`/`authenticated` grants. Only the service role used by
the route can read them. Analytics failures are swallowed by the caller: a
missing table or database error must never break a ritual or page render.

Set a dedicated server-side `TEMPLE_ANALYTICS_SECRET` in production. Without
it the HMAC falls back to `NEXTAUTH_SECRET`, then the service-role key, then a
local development constant. Rotating that secret changes pseudonymous keys and
breaks visitor continuity across the rotation; it does not expose raw ids.

## Known limits

- Historical anonymous events stay unknown; no retroactive attribution.
- A guest who later signs in is counted as two identities by design.
- D1/D7 cohorts near the end of the window cannot have returned yet; the report
  does not project or fabricate them.
- `session_start` is derived from the cookie, not from a client-supplied id.
