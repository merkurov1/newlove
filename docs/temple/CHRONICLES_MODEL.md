# Temple Chronicles: private log vs public projection

Date: 2026-11-27
Scope: `public.temple_log`, `public.temple_chronicle_signals`, `/api/temple_logs`,
`/api/temple_logs/chronicles` and the Temple UI.

## Two different things

| Layer                   | Table / route                                     | Audience                        | Contents                                                                                                                                                       |
| ----------------------- | ------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Private operational log | `public.temple_log`                               | service role only               | raw event rows: `id`, `user_id` (Supabase UUID when verified), `author` label, `event_type`, stored `message`, `audio_url`, `created_at`, `is_public_identity` |
| Public projection       | `/api/temple_logs`, `/api/temple_logs/chronicles` | public HTTP                     | allowlisted fields only: id, canonical ritual, label, fixed description, UTC timestamp, opt-in visitor name                                                    |
| Public Realtime hint    | `public.temple_chronicle_signals`                 | `anon` / `authenticated` SELECT | `log_id`, `event_type`, optional opted-in `public_name`, `occurred_at`                                                                                         |

The browser never reads `temple_log`. RLS is enabled, the stale
`public_select_on_temple_log` policy is dropped, and all `anon`/`authenticated`
grants are revoked. The feed routes use the service role and project
allowlisted columns; the raw `message` column is not selected at all.

## What a public row may contain

`projectPublicTempleEvent` in `lib/temple/feed.ts` is the only projection. It
returns:

- `id` — row id or a timestamp fallback;
- `ritual` — canonical type from the allowlist;
- `ritualLabel` / `description` — fixed server copy, never stored text;
- `occurredAt` — normalized UTC ISO timestamp;
- `visitor` — only when `is_public_identity = true`, the event is not
  `ABSOLUTION`, and the author is not a generic label.

It never returns `user_id`, Telegram id, email, `identity_key`, raw confession,
Cast answer, stored message, audio URL or any private metadata.

## Realtime signal

`record_temple_chronicle_signal()` is a trigger-only SECURITY DEFINER function:

- `search_path = ''` and every relation is schema-qualified;
- EXECUTE is revoked from `public`, `anon` and `authenticated`; `service_role`
  keeps it for operational use;
- it inserts only `log_id`, `event_type`, opt-in `public_name` and
  `occurred_at`;
- it is idempotent per `log_id` with `where not exists` plus a non-unique
  lookup index. Existing duplicate rows are preserved and reported by
  `sql/audit/temple_vigil_schema.sql`; no historical row is deleted.

Failure paths are deliberately non-fatal for the ritual: the trigger runs in
the same transaction as the `temple_log` insert, so a signal failure rolls back
only that insert (the route reports an error), while feed reads and analytics
are independent. The public stream is a hint to re-read the allowlisted API;
clients never trust the signal payload as event data.

## Omissions and duplicates

- Infrastructure (`ENTER`, `NAV`, `PAGE_VIEW`, `VISIT`, `VIEW`), incomplete
  (`MODAL_OPEN`, `INTENSITY`) and unclassified rows are omitted from the public
  ritual feed by design.
- Legacy rows with a missing/invalid `created_at` are omitted rather than
  invented.
- Duplicate feed rows are de-duplicated by `id` (or a stable composite key when
  no id exists).
- Historical signal duplicates are not rewritten; the new trigger prevents new
  duplicates for the same `log_id`.

## Metrics boundary

Chronicle counts are event counts in a rolling UTC window. They are not unique
visitors, sessions or retention. Unique/returning measurement lives in the
private analytics contract (`docs/temple/ANALYTICS_EVENT_CONTRACT.md`) and
never uses author/display names as identity. Historical anonymous rows remain
unknown.
