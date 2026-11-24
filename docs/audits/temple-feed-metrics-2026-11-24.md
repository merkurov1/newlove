# Temple Traces and Chronicles — metric definitions and cache contract

Date: 2026-11-24
Scope: `/temple` Traces panel, `/temple` Chronicles panel, `/api/temple_logs` GET, and the public profile/owner workspace consumers of the same response.

## Why the previous numbers changed

The previous panels read the ten newest raw `temple_log` rows and filtered `enter`/`nav`
in the browser. That had three visible consequences:

- entry/navigation rows could occupy most or all of the ten rows, hiding ritual traces;
- Chronicles counted a different sample than the traces it displayed;
- lower-case and hyphenated legacy event types were repeated as separate labels.

The new server feed selects eligible ritual rows in PostgREST, orders newest first, and
returns at most seven. Chronicles reads the whole rolling thirty-day window instead of
the ten-row sample. Raw rows are not modified.

## Event classification

| Category | Event types | Counted as a completed ritual? |
| --- | --- | --- |
| Ritual | `VIGIL`, `VIGIL_SPARK`, `ASH`, `CAST`, `ABSOLUTION`, `TRIBUTE`, `MEDITATION`, `SILENCE`, `HEARTANDANGEL`, `WHISPER` | Yes |
| Incomplete | `MODAL_OPEN`, `INTENSITY` | No — an opened modal or intensity sample is not proof of completion |
| Infrastructure | `ENTER`, `NAV`, `PAGE_VIEW`, `VISIT`, `VIEW` | No — never allowed to crowd out rituals |
| Unclassified | anything else | No — preserved for audit, not presented as a ritual |

Legacy spellings are canonicalized without rewriting history:

- `vigil`, `Vigil Spark`, `vigil-spark`, `VIGILSPARK` → `VIGIL_SPARK` or `VIGIL`
- `letitgo`, `Let It Go`, `let-go` → `ASH`
- `Heart & Angel`, `heart-and-angel` → `HEARTANDANGEL`
- `calm` → `MEDITATION`

The raw `event_type` remains on every API row as `event_type`; the derived value is
`canonical_type`. The classification is explicit in `lib/temple/feed.ts` and is reversible
by changing the alias/classification tables only.

## Metric definitions

Displayed in the Chronicles dialog and repeated in `TEMPLE_METRIC_DEFINITIONS`:

- **Named Authors** — distinct case-insensitive author display names among eligible rituals
  in the window. Generic placeholders such as `Pilgrim`, `Anonymous`, `Guest` and `Unknown`
  are excluded. These are display names, not verified unique people.
- **Completed Rituals** — all eligible completed ritual events in the window. Incomplete,
  infrastructure and unclassified rows are not included.
- **Vigil Sparks** — `VIGIL` and `VIGIL_SPARK` events in the same window.
- **Sanctuary Hour** — the current local hour on the visitor's device. It is explicitly
  labelled as not a dataset metric.
- **Window** — rolling 30 days ending at the server request time, with inclusive UTC
  boundaries. The panel states “Last 30 days · all eligible ritual events”.
- **Traces** — up to seven most recent eligible completed ritual events. Entry, navigation,
  incomplete and unclassified events are excluded.

The dialog also reports the excluded infrastructure/incomplete counts when the count queries
succeed, so short/incomplete events remain visible as excluded context rather than being
silently presented as rituals.

## Cache and refresh contract

- Server cache: 60 seconds (`TEMPLE_FEED_TTL_SECONDS`).
- Browser cache: one `localStorage` snapshot with the same 60-second TTL.
- A fresh cache is reused across visits without a network request.
- An expired cache is refreshed on mount, when a Sanctuary panel opens after the TTL, when
  the tab/app becomes visible again, or when the visitor presses Refresh.
- There is no interval polling in the Temple page. The previous 15-second interval was
  removed.
- A successful `/api/temple_logs` POST invalidates the server cache. Other write paths are
  bounded by the 60-second TTL.
- If the API/database fails, the server returns the last known good payload marked
  `stale: true`; the browser hook keeps its cached snapshot and marks it stale. A complete
  failure with no previous snapshot returns an explicit error rather than zeros.

## Database audit

Run `sql/audit/temple_log_semantics.sql` against a staging/replica database. It is read-only
and reports:

- event-type/category distribution, first/last seen and author-label counts;
- raw case/spelling variants that map to the same normalized type;
- the full rolling 30-day aggregate used by Chronicles;
- inclusive boundary counts.

This repository change did not run that query against production because no database
credentials were made available and the execution contract forbids reading production
secrets. The fixture-based tests below exercise the same definitions and boundary dates.

## Tests and visual evidence

- `lib/temple/__tests__/feed.test.ts` — normalization, category exclusion, case-variant
  aggregation, boundary dates, seven-trace selection.
- `lib/temple/__tests__/feedServer.test.ts` — PostgREST filtering/ordering/limit, full-window
  paging, cache hit/miss/stale/invalidation.
- `lib/temple/__tests__/feedCache.test.ts` — server TTL and browser cache fresh/expired/corrupt.
- `hooks/__tests__/useTempleFeed.test.tsx` — no polling, fresh-cache reuse, stale fallback.
- `app/temple/__tests__/TempleClient.test.tsx` — seven traces, full-window definitions and
  excluded-event note.
- `artifacts/temple-feed/` — Traces and Chronicles screenshots at desktop, iPhone, iPad and
  emulated Telegram WebView widths.
