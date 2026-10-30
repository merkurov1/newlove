# Task 5 — Pierrot Analytics Data Layer

**Status:** implemented locally. `pierrot_events` is extended in place; it was not replaced. Existing event consumers remain compatible.

## 1. Event taxonomy

Raw event names are preserved for backward compatibility. `pierrot_v_events` exposes a normalized `event_name`:

| Raw event             | Normalized event       |
| --------------------- | ---------------------- |
| `message_sent`        | `message_received`     |
| `assistant_replied`   | `response_generated`   |
| `navigation_proposed` | `navigation_suggested` |
| `commercial_declined` | `offer_rejected`       |
| `brain_retrieval`     | `retrieval_performed`  |
| other existing events | unchanged              |

Additional derived fields:

- `retrieval_failed` — true when `brain_retrieval.outcome` is not `relevant_results` or a `code` is present.
- `intent_uncertain` — true when `intent_classified.payload.uncertain` is true.
- `pierrot_v_intent_changes` — derives intent changes with `LAG()` instead of writing duplicate events.

No duplicate event is written for an action already represented by an existing event.

Added raw quality events:

- `answer_feedback` — client thumbs up/down, payload `{rating, message_id?}`.
- `answer_corrected` — reserved for an owner/admin correction event.

## 2. Event payload normalization

`pierrot_events` already has a safe JSONB payload. No payload columns were duplicated.

`pierrot_v_events` exposes standard fields from payload/conversation context:

- `conversation_id`
- `session_id`
- `event_name`
- `created_at` (UTC `timestamptz`)
- `route`
- `source_page`
- `language`
- `intent`
- `product_id`
- `offer_id`
- `document_id`
- `recommendation_reason`
- `metadata`
- original `payload`

Writers continue to use the existing `pierrot_record_event` RPC and unique `(conversation_id, event_key)` constraint.

## 3. Data integrity

- Event uniqueness remains enforced by `UNIQUE (conversation_id, event_key)`.
- Timestamps remain UTC `timestamptz`.
- Conversation counts and session counts are separate.
- `session_id` is a browser session identifier, **not** a verified unique visitor identifier.
- No IP address or visitor fingerprint is stored by this layer.
- Repeated actions are counted as events; conversation-level views count distinct conversations separately.
- Purchase events are deduplicated by `pierrot_v_purchases`.

## 4. Analytics views

Migration: `migrations/2026-10-30_create_pierrot_analytics_views.sql`.

| Requirement                       | View                                  |
| --------------------------------- | ------------------------------------- |
| A. Conversation overview          | `pierrot_v_conversation_overview`     |
| B. Conversations by page          | `pierrot_v_conversations_by_page`     |
| C. Conversations by language      | `pierrot_v_conversations_by_language` |
| D. Intent distribution            | `pierrot_v_intent_distribution`       |
| E. Navigation destinations        | `pierrot_v_navigation_destinations`   |
| F. Commercial offer funnel        | `pierrot_v_offer_funnel`              |
| G. Product interest               | `pierrot_v_product_interest`          |
| H. Conversation duration          | `pierrot_v_conversation_duration`     |
| I. Message count per conversation | `pierrot_v_message_counts`            |
| J. Retrieval failures             | `pierrot_v_retrieval_failures`        |
| K. Unanswered questions           | `pierrot_v_unanswered_questions`      |
| L. Quality indicators             | `pierrot_v_quality_indicators`        |

Supporting views:

- `pierrot_v_events`
- `pierrot_v_intent_changes`
- `pierrot_v_purchases`

All views use `security_invoker = true` and are revoked from `PUBLIC`, `anon` and `authenticated`; only `service_role` has SELECT.

Added owner-only API:

```text
GET /api/admin/pierrot/analytics
```

It reads the views through `lib/analytics/pierrotViews.ts`.

## 5. Conversion attribution

`pierrot_v_purchases` combines:

- `purchase_completed` from trusted payment handlers;
- legacy `order_paid` postcard events when no matching `purchase_completed` exists;
- legacy `unframed_purchase_confirmed` events when no matching `purchase_completed` exists.

Deduplication uses order id or provider session id. A CTA click or checkout start is never counted as a purchase. Purchases without a conversation attribution remain in order tables but are not assigned to a Pierrot conversation; they should be reported as unknown attribution, not as zero or as a guessed conversion.

## 6. Privacy

- No raw IP storage in events or views.
- No public access to event tables or analytics views.
- Owner-only API requires `requireAdminFromRequest`.
- Existing consent rules remain in the write path: transcript events require `granted` consent; metadata/event writes are blocked for explicit `denied`.
- Views expose `session_id` only to service-role analytics, not to public visitors.
- No unique-visitor claim is made; only conversation and session counts are exposed.

## 7. Feedback and quality

Added a small owner/visitor feedback control under assistant replies:

- `answer_feedback` with `rating: up|down` and optional message id.
- No answer text is stored in the event payload.
- `pierrot_v_quality_indicators` aggregates feedback, correction events, assistant failures, retrieval failures and unanswered questions.

## 8. Migrations

1. `migrations/2026-10-30_add_answer_quality_events.sql`
2. `migrations/2026-10-30_create_pierrot_analytics_views.sql`

The first extends the event constraint/function only. The second adds read-only views and indexes. Neither rewrites or replaces historical events.

## 9. Verification

- Migration SQL validated inside rolled-back transactions against the current database.
- Views queried successfully with current data.
- `npx tsc --noEmit` clean.
- Targeted Jest suites remain green.
