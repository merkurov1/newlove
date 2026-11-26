# Vigil daily ritual — implementation audit and analytics

Task: turn the existing ordinary Vigil into the Temple's daily ritual without
inventing a second Vigil, a second notification channel, or mandatory login.

## What already worked

- **One identity policy.** `lib/temple/identity.ts` verifies a signed
  `temple_session` cookie/bearer token (Telegram) or a Supabase access token.
  Cooldown keys are namespaced `tg:<id>` / `sb:<uuid>`; a display name can
  never become an identity key.
- **Atomic 24h cooldown.** `lib/vigil/claim.ts` upserts one private
  `vigil_spark_claims` row per identity and then performs a conditional
  `UPDATE ... WHERE last_spark_at <= now - 24h`. PostgreSQL serialises
  concurrent writers on that row; only the first update consumes the window.
- **One shared flame clock.** `vigil_hearts.last_lit_at` drives the shared
  flame; a visitor's personal cooldown lives separately in
  `vigil_spark_claims`. The home page and `/vigil` both read
  `/api/vigil/state` through `useVigilSupporters` and render the same
  `resolveVigilFlame` calculation.
- **Guest route preserved.** An anonymous tap follows the existing `/vigil`
  anchor. The ritual then uses the existing sign-in / Telegram Mini App
  identity flow; no new guest identity or mandatory registration was added.
- **Telegram announcement preserved.** A successful claim calls the existing
  `publishVigilChannelPost` once. A cooldown, auth failure, validation error or
  thrown request never reaches that call. The post is deliberately anonymous
  and best-effort so a Telegram outage cannot undo a spark.
- **Shared Vigil is separate.** `components/temple/SharedVigil.tsx` uses
  `/api/telegram/group-vigil` and private group tables. It is not used by the
  ordinary Vigil claim, cooldown or heart. It was left untouched.

## Defects fixed

1. **Home-page spark required a long press.** A verified visitor now lights
   the heart with a single click/tap (and with a short Enter/Space), staying on
   `/temple`. The long-press path remains as an alternative, and a guest click
   still opens `/vigil`.
2. **No home-page cooldown state.** The home heart now reads the same
   `/api/vigil/claim` GET status as `/vigil`, mirrors the remaining window and
   blocks a second same-session POST. The server remains authoritative.
3. **No lifetime counter or participant analytics.** `/api/vigil/state` now
   exposes aggregate `lifetimeTotal`, `uniqueParticipants`,
   `returningParticipants`, `repeatRate`, namespace counts and
   `analyticsSince`. The home and ritual both show the lifetime total next to
   the rolling 24h supporter count.
4. **Weak success feedback in the ritual scene.** A confirmed server response
   now renders “Spark received · added to the shared heart”; the animation
   remains only after confirmation.
5. **Duplicated/silent double-click risk on the home heart.** `sendingRef` plus
   the mirrored cooldown prevent a second same-session request; the server
   conditional update remains the final guard for concurrent requests.

## Metrics and honest limitations

- **lifetimeTotal** — a private counter seeded once from all-time canonical
  `VIGIL` / `VIGIL_SPARK` rows, then advanced in the same transaction as each
  successful claim. It never resets with the 24h window. Historical rows that
  predate the signed claim route may exist; the seed is log-based and is not a
  cryptographic proof of the source of every legacy row.
- **uniqueParticipants** — distinct stable identity keys with
  `spark_count > 0` in `vigil_spark_claims`. This is a count of identities, not
  verified people. One person with two accounts is two identities.
- **returningParticipants** — identity keys with `spark_count > 1`. Because
  the server enforces 24h between successful sparks, a second spark is
  necessarily in a different 24h window. Historical identities were
  backfilled with one known spark, so repeated sparks before this migration
  are undercounted rather than guessed.
- **repeatRate** — `returningParticipants / uniqueParticipants`, or `null`
  when there are no participants. It is a rate over identities, not people.
- **telegramParticipants / supabaseParticipants** — stable namespaces kept
  separate; they are never merged by name or email.
- **analyticsSince** — earliest tracked identity row. Identity analytics begin
  when `vigil_spark_claims` exists (2026-11-16 migration); older anonymous
  history has no stable identity and is not reconstructed.

`analyticsAvailable` is `false` and the lifetime row is hidden if the additive
view has not been applied yet. The shared flame keeps working during deploy
ordering.

## Migration

`migrations/2026-11-26_vigil_lifetime_metrics.sql` is additive and is **not
applied to production by this task**:

- adds `spark_count` / `first_spark_at` to the existing private claim table;
- backfills existing rows with one known spark (no invented history);
- adds a private singleton `vigil_spark_stats` counter seeded from the
  historical VIGIL/VIGIL_SPARK log;
- adds a trigger that advances both the identity counter and the lifetime
  counter only when the claim update advances `last_spark_at` through the 24h
  window, in the same transaction as the spark;
- adds the service-role-only aggregate view `vigil_spark_metrics`, granted to
  no anon/authenticated role.

No table or historical row is deleted, and `temple_log` is not rewritten.

## Telegram channel check

`app/api/vigil/claim/route.ts` awaits `publishVigilChannelPost()` only after
`claimVigilSpark` returns `allowed: true`. The existing unit tests cover:

- one call on a successful claim;
- no call for an unauthenticated claim;
- no call for a 429 cooldown;
- a thrown Telegram error still returns a successful Vigil.

The existing channel id and anonymous message format were preserved.

## Verification

Local results for this change:

```bash
pnpm typecheck                 # passed
pnpm lint                      # passed (0 errors; pre-existing warnings)
pnpm test --runInBand          # 577 suites / 4181 tests passed
```

Focused Playwright checks (Chromium against the local dev server and Supabase
stub):

```bash
npx playwright test --config=tests/pierrot.playwright.config.ts \
  temple-sanctuary.spec.ts -g "anonymous heart tap|authenticated single tap|authenticated hold"
# 3 passed

npx playwright test --config=tests/pierrot.playwright.config.ts \
  temple-sanctuary.spec.ts -g "renders without clipping|Telegram WebView stays light|heart keeps the 5s heartbeat"
# 5 passed
```

`tests/temple-sanctuary.spec.ts` covers the authenticated single tap, the
held spark, the anonymous route, desktop/tablet/mobile overflow and the
Telegram WebView shell. One unrelated
`telegram-navigation.spec.ts` sheet-safe-area assertion still times out after
the sheet has already been shown; it does not touch the Vigil claim, heart or
analytics code and is noted as a remaining test risk.
