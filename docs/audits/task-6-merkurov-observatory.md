# Task 6 — MERKUROV OBSERVATORY

**Status:** implemented locally. Owner-only, server-authorized, no public endpoint.

## 1. Design direction

The Observatory follows the existing merkurov.love admin language:

- serif editorial headings, mono uppercase labels;
- warm paper background (`#FAF9F7`), ink (`#211F1F`), burgundy accent (`#990F3D`);
- hairline rules instead of cards where possible;
- data-first tables and thin bar lists;
- responsive grids that collapse to one column on mobile;
- no generic SaaS cards, gradients, or decorative charts.

Files:

- `app/admin/observatory/page.tsx` — dashboard, filters, drill-down rendering.
- `lib/analytics/observatory.ts` — period parsing and aggregate computation.
- `lib/analytics/observatoryDrilldown.ts` — paginated explorer and detail queries.
- `app/admin/AdminNav.tsx` — navigation entry `Observatory`.
- `app/admin/Sidebar.tsx` — legacy sidebar entry.

## 2. Main dashboard

### Overview

| Metric                             | Source                                             |
| ---------------------------------- | -------------------------------------------------- |
| Conversations today / week / month | `pierrot_conversations.started_at`, UTC boundaries |
| Total conversations                | conversations started in the selected period       |
| Total messages                     | `pierrot_messages` created in the period           |
| Average messages per conversation  | messages ÷ conversations in period                 |
| Active conversations               | conversations with `status = 'active'` in period   |
| Returning sessions                 | sessions with more than one conversation in period |
| Returning conversations            | conversations belonging to returning sessions      |
| Total events                       | `pierrot_events` in period                         |

Returning sessions are explicitly labelled as sessions, not unique visitors. There is no verified visitor identifier, so the dashboard never claims unique visitors.

### Interest

| Metric                  | Source                                                   |
| ----------------------- | -------------------------------------------------------- |
| Most discussed topics   | `intent_classified.payload.topic`                        |
| Intent distribution     | `intent_classified.payload.intent`                       |
| Navigation destinations | `navigation_completed` and `action_clicked` `section_id` |
| Popular source pages    | `pierrot_conversations.start_page`                       |
| Language distribution   | `pierrot_conversations.language`                         |

### Commercial

- per-product funnel across `heart_angel_postcard`, `unframed`, `journal_flow`, `art_engine`, `advising`;
- offers shown, selected, checkout starts and confirmed purchases;
- funnel abandonment = checkout-start conversations without a confirmed purchase in the same period;
- abandonment rate = abandonment ÷ checkout starts (not a conversion rate);
- art service inquiries from `art_service_leads`;
- qualified inquiries = leads whose status is no longer `new`.

### Intelligence

- unknown / uncertain intents from `intent_classified`;
- retrieval failures from `brain_retrieval` where `outcome <> 'relevant_results'` or a `code` is present;
- unanswered questions = user messages with no following assistant message after five minutes;
- documents most frequently retrieved from `brain_retrieval.payload.document_ids`;
- negative feedback from `answer_feedback.rating = 'down'`;
- assistant failures from `assistant_failed`;
- average response latency from `assistant_replied.payload.latency_ms`;
- editorial radar clusters unanswered questions into topics.

## 3. Time filters

Supported presets:

- Today
- Last 7 days
- Last 30 days (default)
- Last 90 days
- Custom range (`from` / `to`)

All boundaries are UTC. The custom end date is expanded to `23:59:59.999Z`.

Comparison uses the immediately preceding period of equal duration. A `Compare: on/off` control toggles the deltas. Each compared metric shows the absolute previous value and the percentage change. Metrics without a meaningful prior comparison show no delta rather than a fabricated one.

## 4. Drill-down

Every metric and list item links to a server-rendered detail block:

| Drill-down          | Behaviour                                                                       |
| ------------------- | ------------------------------------------------------------------------------- |
| Conversations       | paginated conversation explorer                                                 |
| Offers / commercial | offer event list, filterable to one offer                                       |
| Retrieval failures  | failing retrieval events with the preceding user question and conversation link |
| Topics              | supporting questions, routes, documents and conversation links                  |

Drill-downs are rendered on the same owner-only page. They never expose transcripts on a public route. Opening a conversation continues to use the existing `/admin/pierrot?conversation=…` transcript view.

## 5. Conversation explorer

Filters:

- date (from the dashboard period);
- language;
- route;
- latest intent;
- product interest;
- conversation status;
- retrieval success / failure / none;
- transcript search (`ILIKE`-style in-memory containment over the selected period).

Columns: started time, route, language, latest intent, products, message count, retrieval status, conversation status.

Pagination is 25 rows per page. The explorer loads only the selected period and returns one page to the browser.

## 6. Editorial radar

Unanswered user questions are normalized and clustered with a token Jaccard threshold of `0.34`. Each topic exposes:

- topic label (top tokens);
- occurrence count;
- relevant routes;
- relevant retrieved document ids;
- supporting conversation ids;
- suggested content opportunity.

The same clustering is used on the dashboard and in the drill-down, so counts match.

## 7. Performance

- All aggregation happens on the server. The browser receives only the rendered page.
- Period queries are bounded and paginated (`fetchAll` stops at 20k rows; explorer returns 25 rows).
- Detail lists are limited to 200 rows unless explicitly paginated.
- `force-dynamic` is used instead of a long cache because analytics must reflect new events promptly. No stale aggregate is shown as current.
- Indexes added in Task 5 cover `offer_id`, `product_id` and `intent` payload lookups.
- The heavier Task 5 SQL views remain available for owner-side reporting, but the Observatory does not require the migration to be applied before it can render.

## 8. Access

- `/admin/observatory` lives inside `app/admin/layout.tsx`, which calls `requireAdmin()` on the server and redirects unauthenticated users to `/403`.
- The page calls `requireAdmin()` again as defence in depth.
- All data reads use the service-role Supabase client after authorization.
- No public API endpoint exposes Observatory data.
- `/api/admin/pierrot/analytics` from Task 5 remains admin-only.
- No IP addresses, fingerprints or raw visitor identifiers are displayed.
- Conversation links use internal ids; session ids are not rendered in the Observatory UI.

## 9. Privacy

- Conversation and session counts are labelled precisely.
- No unique-visitor claim is made.
- Transcript content appears only in owner-only drill-downs.
- Events remain governed by the existing consent write path.

## 10. Verification

- Task 6 files type-check cleanly with a scoped `tsc` project (page, loaders, test, navigation).
- `lib/analytics/__tests__/observatory.test.ts` → 7 tests green.
- `lib/analytics/__tests__/pierrotIntelligence.test.ts` → 8 tests green.
- The snapshot and all four drill-down loaders were executed against the current Supabase database with real data:
  - 73 conversations and 148 messages in the 90-day period;
  - 24 active conversations, 14 returning sessions covering 52 conversations;
  - 7 offers shown, 2 offers selected, 0 checkout starts, 0 confirmed purchases;
  - 17 offer events total, 11 for `unframed`;
  - 0 retrieval failures (no `brain_retrieval` events yet in the current corpus);
  - 0 unanswered questions.
- Repo-wide `tsc` may temporarily report errors in unrelated, concurrently edited modules (`lib/pierrot/humanPresence.ts`, `lib/knowledge/graph/research.ts`, `components/pierrot/PierrotContext.tsx`). The Observatory files themselves have no type errors.

## 11. Known limits

- `brain_retrieval` events only appear after the Task 2 retrieval path is exercised; until then the retrieval panels are honestly zero.
- `intent_classified.payload.topic` is currently `null` in production events, so the topic list is empty until topic classification is populated. Intent distribution still renders.
- Purchase attribution is limited to conversations with a trusted order or payment record. Unattributed orders are not assigned to a conversation.
- The Observatory does not apply the Task 5 analytics-view migration automatically; it works against raw tables and becomes faster as the indexes/views are applied.
