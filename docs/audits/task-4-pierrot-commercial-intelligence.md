# Task 4 — Pierrot Commercial Intelligence

**Status:** implemented locally. Existing products, prices, checkout sessions, Stripe handlers and the `art_service_leads` flow are preserved.

## 1. Product-specific recommendation rules

The existing catalogue remains `lib/pierrot/offers.ts`. No product, price, route or payment mechanism was invented.

Recommendation policy is now explicit in `lib/pierrot/offerPolicy.ts`, with optional owner overrides in `pierrot_offer_policies`.

Defaults:

| Offer                       | Priority | Max shows / conversation | Cooldown turns | Cooldown seconds | Min interest |        Proactive         |
| --------------------------- | -------: | -----------------------: | -------------: | ---------------: | -----------: | :----------------------: |
| Heart & Angel postcard      |       30 |                        3 |              2 |               45 |          1.5 |           yes            |
| UNFRAMED                    |       20 |                        3 |              2 |               60 |          1.5 |           yes            |
| Journal / Flow subscription |       10 |                        2 |              4 |              120 |          2.5 | yes, repeated engagement |
| Art Engine                  |        5 |                        1 |              8 |              300 |           99 |      explicit only       |
| Advising                    |        5 |                        1 |              8 |              300 |           99 |      explicit only       |

### Heart & Angel

- Added meaning/history/artwork terms to the postcard interest scorer.
- The planner recommends the postcard when the conversation is about love, distance, a recipient, a gift, the card, its meaning, history or artwork.
- A first page-aware “what is this?” can introduce it.
- After the first introduction, a fresh message signal is required.
- Maximum three shows per conversation, with turn and time cooldowns.
- A refusal permanently suppresses that offer in the conversation.

### UNFRAMED

- Existing personal-history, memoir, identity, family, Soviet past, freedom and writing signals remain.
- The book is recommended when the visitor’s interest is directly relevant.
- The recommendation reason is passed to the model prompt and analytics.
- The private reader link remains `/unframed/book`; the consumer catalogue page remains `/unframed`.
- Publisher interest continues to route to `/unframed/proposal` without a consumer checkout CTA.

### Subscription

- Requires repeated engagement for proactive recommendations (`requiresRepeatedEngagement`).
- A single page-aware “what is this?” may still introduce the subscription, but an unrelated factual question does not.
- An explicit subscription question continues through the direct offer path.
- Verified active subscribers are not pitched again.
- The existing `/api/subscribe` form and `/journal#subscribe` destination are unchanged.

### Art services and commissions

- No proactive pitch for Art Engine or Advising.
- Explicit service, artwork, commission, acquisition, valuation or advisory language enters the existing `service_inquiry` path.
- The existing `art_service_leads` qualification flow remains the only lead mechanism.
- Art Engine access remains an access request, not a purchasable subscription.

## 2. Funnel

Added event stages:

```text
interest_detected
→ offer_eligible
→ offer_selected
→ offer_shown
→ offer_viewed
→ cta_shown
→ offer_action_clicked
→ checkout_started
→ purchase_completed
```

Semantics:

| Event                  | Writer                  | Meaning                                                    |
| ---------------------- | ----------------------- | ---------------------------------------------------------- |
| `interest_detected`    | server                  | Planner saw a commercial signal or commercial intent.      |
| `offer_eligible`       | server                  | Policy allowed the offer for this turn.                    |
| `offer_selected`       | server                  | Planner chose the offer.                                   |
| `offer_shown`          | server                  | Non-error response actually contains the offer.            |
| `offer_viewed`         | client                  | Offer message entered the viewport (IntersectionObserver). |
| `cta_shown`            | server                  | Verified CTA was included in the response.                 |
| `offer_action_clicked` | client                  | Visitor clicked the CTA.                                   |
| `checkout_started`     | server                  | Existing checkout endpoint created a Stripe session.       |
| `purchase_completed`   | trusted payment handler | Stripe confirmed payment.                                  |

`order_paid` and `unframed_purchase_confirmed` remain for backward compatibility and are still written by the existing trusted handlers. A click or checkout start is never treated as a sale.

Rejection uses `commercial_declined`. Abandonment is observable as `checkout_started` without `purchase_completed`; no fake abandonment event is written.

## 3. Frequency control

Implemented in strategy/policy:

- per-conversation show limit;
- turn cooldown;
- time cooldown using trusted event timestamps;
- duplicate-offer prevention;
- product eligibility (`allowProactive`, `enabled`, `requiresRepeatedEngagement`);
- minimum interest score;
- explicit refusal suppression;
- purchased and subscribed suppression;
- page-context restrictions (`/unframed/proposal`, `/flow/join` never receive proactive consumer pitches).

`loadPierrotCommercialSignals()` now reads `created_at`, so trusted event timing participates in cooldowns. Display, view and selection are counted separately to avoid double-counting one offer turn.

## 4. Attribution

Commercial plan events include:

- `product_id`
- `offer_id`
- `recommendation_reason`
- `source_page`
- `conversation_id`
- `triggering_intent`
- `recommendation_at`

`offer_shown`, `offer_eligible`, `offer_selected`, `cta_shown`, `commercial_declined` and `purchase_completed` carry the relevant fields.

The existing opaque attribution path remains:

- `pcard_<conversationId>` for postcards;
- `psub_<conversationId>` for subscriptions;
- `punf_<conversationId>` for UNFRAMED.

Checkout and Stripe metadata continue to link back to the conversation. `purchase_completed` is written only by the trusted payment handlers.

## 5. Tone

The commercial prompt and direct replies retain the existing Pierrot voice:

- hospitable;
- intelligent;
- slightly ironic;
- confident;
- occasionally persistent;
- never desperate or generic.

The prompt explicitly forbids manufactured urgency, scarcity, discounts, social proof, guilt or pressure. Commercial copy remains grounded in the verified offer catalogue.

## 6. Admin controls

Added owner-only policy table and UI:

- `/admin/pierrot/offers`
- `GET/PATCH /api/admin/pierrot/offers`

Owner can configure:

- enabled/disabled;
- priority;
- max shows per conversation;
- cooldown turns and seconds;
- minimum interest score;
- repeated-engagement requirement;
- proactive allowance;
- recommendation copy.

Product availability continues to come from the existing `postcards` table and subscription state from `subscribers`. Prices and checkout remain in the existing product/payment sources.

CTA destinations are intentionally **not** editable through this policy table: they remain verified in `lib/pierrot/offers.ts` so the owner cannot accidentally point a CTA at an unverified route or checkout URL. Existing product management (for example `/admin/postcards`) remains the source for product availability.

## 7. Acceptance scenarios

| Scenario                           | Expected behavior                                                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Repeated Heart & Angel exploration | First relevant turn may introduce; later turns can use a fresh reason up to 3 shows with cooldowns; refusal stops it. |
| Visitor reads about UNFRAMED       | Proactive book recommendation with a reason and private-reader link; publisher intent goes to the proposal.           |
| Visitor asks about subscribing     | Direct subscription offer with the existing form; active subscribers are not re-pitched.                              |
| Visitor explicitly asks to buy     | Direct offer path, verified CTA, no model choice of price/route.                                                      |
| Visitor refuses                    | `commercial_declined`, CTA removed, offer suppressed for the conversation.                                            |
| Unrelated question                 | Model answer, no offer selected/shown.                                                                                |
| Service/commission request         | Existing service-inquiry qualification; no proactive consumer pitch.                                                  |
| CTA click / checkout / payment     | Separate events; only trusted payment confirmation writes `purchase_completed`.                                       |

## 8. Migrations

Apply after the existing Task 2 migrations:

1. `migrations/2026-10-30_add_commercial_funnel_events.sql`
2. `migrations/2026-10-30_create_pierrot_offer_policies.sql`

The first only expands the event constraint and replaces the event writer. It does not delete historical events. The second creates the owner-only policy table and seeds defaults without overriding existing rows.

## 9. Tests

Added/updated:

- `lib/pierrot/__tests__/offerPolicy.test.ts` — defaults, env overrides, clamping.
- `lib/pierrot/__tests__/strategy.test.ts` — product-specific limits/cooldowns.
- `lib/pierrot/__tests__/commercialAnalytics.test.ts` — funnel ordering, attribution payloads, no `offer_viewed` before display, trusted purchase helper.
- `lib/pierrot/__tests__/commercial.test.ts` — existing offer/copy/refusal behavior remains green.
- `app/api/pierrot-web/__tests__/route.test.ts` — updated event order and offer response behavior.
- `lib/pierrot/__tests__/conversation.test.ts` — client `offer_viewed` payload validation.
- `lib/analytics/__tests__/*` — funnel aggregation remains green.
- `lib/pierrot/__tests__/migration.test.ts` — funnel event and policy migrations.

## 10. Known limitations

- Offer priority is a ranking tie-breaker, not a hard override of relevance.
- CTA destinations remain code-verified; the admin policy editor intentionally cannot change them.
- Full checkout abandonment is inferred from event absence, not from a provider abandonment webhook.
- Existing historical `offer_viewed` rows were server-side display artifacts; the new client event is a true visible impression. Analytics treats both as views for backward compatibility.
- The offer policy table is read on the chat request path; if it is unavailable, the verified defaults are used.
