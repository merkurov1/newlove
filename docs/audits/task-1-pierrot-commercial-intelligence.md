# Task 1 — Pierrot Commercial Intelligence

**Date:** 2026-11-02  
**Branch:** `main` at `2e555945` before implementation  
**Scope:** audit, donation attribution, financial data layer, owner chat analyst and weekly review.  
**UI:** no new page, dashboard, navigation section, chat or assistant was created. Everything is available through the existing Pierrot chat.

---

## 1. Audit before changes

### Already working

- The four existing commercial paths were present: postcard checkout, UNFRAMED checkout, Flow subscription/confirmation, and Tribute checkout.
- Opaque attribution conventions existed for postcards (`pcard_`), Flow (`psub_`) and UNFRAMED (`punf_`), including Stripe metadata and trusted confirmation handlers.
- Task 4 commercial funnel events and owner-configurable recommendation policies were committed and applied to production.
- Owner authentication was real: owner mode required a verified `ADMIN` user, Telegram initData or Bearer JWT. `x-admin-secret` / `system-admin` did not unlock owner scope.
- Deterministic owner tools already ran inside the existing chat before the model/RAG path.

### Missing in production

- **No `pierrot_v_*` views existed.** The Task 5 SQL file was committed but had not been applied, so `/api/admin/pierrot/analytics` could not read its views.
- `donation_completed` was absent from the `pierrot_events` constraint and `pierrot_record_event`.
- Tribute checkout accepted no Pierrot reference, wrote none to Stripe metadata, and the webhook recorded only the `tributes` row.
- No owner-facing financial analysis existed. The existing `/analytics` owner tool reported conversation quality, not revenue.
- Historical purchase confirmation had a retry gap: an already-PAID postcard order returned before attribution could be backfilled.

### Production snapshot at audit time

- 114 Pierrot conversations.
- 1 `interest_detected`, 1 `offer_shown`, 0 `checkout_started`, 0 confirmed purchases and 0 confirmed donations.
- 0 postcard orders and 0 Tribute rows.
- 22 historical active subscribers, but only failed `subscription_events`; no reliable historical attribution.

These figures are limited by the data above; they are not presented as proof of demand or of causation.

---

## 2. Changes implemented

### Tribute path

- Added opaque `ptri_<conversationId>` attribution.
- The Tribute page reads the validated `pierrot` query parameter and sends it to the existing checkout.
- The existing Tribute checkout stores it in Stripe metadata and records only `checkout_started`.
- A new trusted helper confirms Tributes from the verified Stripe webhook:
  - requires `type=tribute_v1`;
  - requires `payment_status=paid`;
  - inserts at most one `tributes` row using the existing unique `stripe_session_id`;
  - records one idempotent `donation_completed` event;
  - retries attribution on duplicate webhooks so a transient analytics failure can be repaired;
  - never stores donor name, email or message in Pierrot analytics.
- A donation is never written as `purchase_completed` and never appears in `pierrot_v_purchases`.

### Offer catalogue

- Added `temple_tribute` with kind `donation`.
- Recommendation is limited to the Temple/Tribute surface or an explicit tribute/donation signal.
- Maximum one introduction per conversation, with cooldown and refusal handling.
- No proactive fundraising on other surfaces.

### Financial data layer

New read-only views:

- `pierrot_v_donations`
- `pierrot_v_postcard_sales`
- `pierrot_v_tribute_donations`
- `pierrot_v_subscription_conversions`
- `pierrot_v_commercial_events`

The existing `pierrot_v_offer_funnel` gained a `donation_completed` column at the end; existing columns were preserved. All `pierrot_v_*` views were made SELECT-only for `service_role` and remain inaccessible to `anon` and `authenticated`.

### Owner chat analyst

Added a deterministic `commercial` owner tool:

- Russian and English commercial questions;
- last 7 days, previous 7 days, last 30 days, current month, previous month and custom date ranges;
- timezone-aware boundaries (`PIERROT_OWNER_TIMEZONE`, default `Europe/London`);
- attributed versus site-wide results;
- explicit unknown attribution;
- separate GBP/USD reporting with no conversion or combined total;
- confirmations only, not checkout attempts;
- funnel diagnosis and up to three evidence-based recommendations;
- weekly review with 90-day goal progress and an explicit improving/declining/insufficient-data assessment.

No scheduled worker, cron task or recurring AI process was added.

---

## 3. Migrations

### Applied to production during this task

1. `migrations/2026-10-30_create_pierrot_analytics_views.sql` (previously committed but not deployed)
2. `migrations/2026-11-02_pierrot_commercial_intelligence.sql` (new)
3. `migrations/2026-11-02_pierrot_commercial_views_readonly.sql` (new)

The new migrations are additive. They do not delete, rename or rewrite historical events, orders or Tributes.

The connected database was verified after application:

- 21 `pierrot_v_*` views exist;
- `donation_completed` is accepted by both the constraint and the RPC;
- `temple_tribute` policy exists;
- `anon`/`authenticated` cannot read analytics views;
- `service_role` has SELECT only;
- a rolled-back transaction test confirmed one donation event, zero purchase events and idempotent duplicate rejection.

The repository does not use the Supabase CLI migration history for these files (production had only one old `supabase_migrations` row), so application was performed directly after schema inspection and a rolled-back validation run.

---

## 4. Tests

Passed:

- 48 targeted suites / 361 tests covering Pierrot, analytics, postcards, UNFRAMED, subscription, newsletter confirmation, Tribute checkout and admin analytics authorization.
- New tests cover: Tribute attribution, paid/unpaid/duplicate webhooks, donation event privacy, returning-subscriber exclusion, timezone periods, question recognition, no-fabrication reporting, missing attribution and owner-only access.
- `npx tsc --noEmit` has no errors in the changed production files. The repository retains pre-existing type errors in unrelated test files.
- Production view reads succeeded with the service-role client (`pierrot_v_*` returned data).
- Production owner-tool invocation returned an evidence-based Russian answer.

---

## 5. Remaining production checks

1. Deploy the code to the production branch.
2. Confirm the Stripe webhook endpoint uses the deployed `/api/stripe/webhook` and the existing `STRIPE_WEBHOOK_SECRET`.
3. Make one small live Tribute with a known conversation link and verify one `tributes` row plus one `donation_completed` event.
4. Repeat the same Stripe webhook delivery and verify no duplicate Tribute or event.
5. Confirm `PIERROT_OWNER_TIMEZONE` and, if needed, `PIERROT_EXPERIMENT_START_DATE` in production.
6. Confirm the mobile client continues to use the existing `/api/pierrot-web`; no mobile change is required.
7. Review the Stripe dashboard for historical postcard/UNFRAMED refunds, because no authoritative refund source is wired into reporting.

---

## 6. Historical limitations

- Postcard orders have no stored payment timestamp. The view uses order creation time with a paid status; this is a proxy, not a Stripe `paid_at`.
- There is no authoritative site-wide UNFRAMED sales ledger. Only Pierrot-attributed Stripe events are known.
- No refund source and no actual Stripe fee source are available, so reporting is gross and does not claim net revenue.
- Tribute and postcard tables do not store the Pierrot conversation reference themselves; matching uses the opaque attributed event/session/order identifiers.
- Subscription confirmation is counted only when a subscriber row was created inside the reporting period and this is its first confirmation event. This prevents returning subscribers from being counted, but can exclude a subscriber who submitted earlier and confirmed later.
- Historical subscription attribution is incomplete because most historical records predate event tracking.
- Conversation counts can include owner sessions; historical data has no owner-session flag. The report states this explicitly.
- `checkout_started` without confirmation cannot distinguish abandonment from Stripe failure or lost attribution.

---

## 7. Questions Anton can now ask in the existing chat

- «Сколько мы заработали?»
- «Сколько заработали за последнюю неделю?»
- «Сколько продаж пришло благодаря Пьеро?»
- «Почему так мало?»
- «Что продаётся лучше?»
- «Почему люди не покупают?»
- «Сколько человек заинтересовались книгой?»
- «Сколько начали оформление, но не закончили?»
- «Сколько новых подписчиков Flow?»
- «Сколько пожертвований получил Temple?»
- «Что мне делать на следующей неделе?»
- «Сравни последние две недели.»
- «Покажи динамику за месяц.»
- «Что изменилось после прошлой недели?»
- «Пьеро, как у нас дела?»
- `How much did we earn last week?`
- `Why are sales so low, and what should I do?`

The last query is the acceptance path: the answer is built from the connected database, states its period and limitations, and does not invent revenue.
