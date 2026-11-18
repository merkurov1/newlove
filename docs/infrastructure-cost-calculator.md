# Infrastructure cost calculator

Owner-facing page: `/admin/pierrot/infrastructure` (linked from DASH).

This is a recurring production-infrastructure calculator, not a development cost
ledger and not an invoice. It deliberately separates five value types:

| Type                | Meaning                                                                           |
| ------------------- | --------------------------------------------------------------------------------- |
| `actual`            | Confirmed fact from a source of record (for example confirmed revenue).           |
| `provider-reported` | Provider-reported usage. The amount may still be derived from a published tariff. |
| `estimate`          | Reproducible calculation from a versioned public price and scenario usage.        |
| `manual`            | Owner-configured plan/SKU/assumption.                                             |
| `unknown`           | No data. Never rendered or summed as zero.                                        |

## What is calculated

- Vercel Pro: plan, transfer, edge requests, functions/CPU/image transforms/Web
  Analytics, deployment build minutes and the $20 usage credit.
- Supabase Pro: plan, compute credit, database disk, file storage, egress, MAU and
  Edge Function invocations. Shared quotas are split between production and media
  proportionally to usage, so the same 100 GB / 250 GB allowance is not subtracted
  twice.
- Infomaniak VPS in Switzerland: one of three audited SKUs, backups/snapshot and
  unlimited traffic. The single host is allocated 60% production / 30% media /
  10% development.
- GitHub Codespaces: personal plan, included core-hours, machine cores and storage.
  Task execution cost from the existing Dev Cost Ledger is displayed separately
  and is **not** added to the run rate.
- DeepSeek Flash: peak/off-peak input cache-hit, cache-miss and output rates.
- OpenAI: whisper-1 transcription, text-embedding-3-small and an explicitly manual
  per-image planning assumption.
- Resend, `.love` domain renewal, disabled Sentry. Vercel Web Analytics is metered
  inside the Vercel line, not assumed free.

Fixed, variable and one-off costs are kept apart. Monthly run rate and annual
projection use only known values; unknown components are listed and make the
budget assessment `incomplete`.

## Scenarios

Lean / Comfortable / Intensive are deterministic presets. Every field is editable
and encoded in the URL, so a scenario is reproducible without a database write.
The initial planning hypothesis of €150–200/month is checked against the
Comfortable preset rather than hard-coded as a target. On the 2026-11-18 price
audit the Comfortable preset computes to **≈€178/month** (all components known,
before tax); Lean is ≈€53 and Intensive ≈€833 with the default high-usage
assumptions.

## Prices and FX

Prices were checked on **2026-11-18** from official/public pages:

- https://vercel.com/pricing and https://vercel.com/docs/pricing
- https://supabase.com/pricing and the Supabase usage docs
- https://www.infomaniak.com/en/hosting/vps-cloud/prices
- https://docs.github.com/en/billing/concepts/product-billing/github-codespaces
- https://api-docs.deepseek.com/quick_start/pricing/
- https://developers.openai.com/api/docs/pricing
- https://resend.com/pricing
- Cloudflare Registrar `.love` at-cost price (checked 2026-11-16)

EUR conversion uses the ECB reference rates published **2026-11-17**
(USD 1.0989, CHF 0.9233, GBP 0.83305 per EUR). Optional non-secret overrides
`PIERROT_INFRA_FX_EUR_PER_USD`, `..._CHF`, `..._GBP` are marked as manual.

## Billing APIs

Only the existing GitHub billing integration is reused (`getCodespacesBillingSnapshot`).
GitHub reports minutes, not an invoice amount, so Codespaces cost remains an
estimate. Vercel, Supabase, DeepSeek and OpenAI billing are not configured; the
page documents the required read-only access instead of inventing charges.
No token, key or invoice PII is rendered or logged.

## Self-Funding

Revenue comes from the existing `CommercialSummary`: confirmed purchases and
donations only. Flow subscription counts are shown, but their amount is not
invented. Checkout starts, shown offers and internal transfers are not revenue.
Coverage is `known revenue / known infrastructure cost`; production-only coverage
is shown separately. Reinvestment is only calculated when revenue and cost are
both complete, and it is explicitly **before tax, acquiring fees and other costs**
(revenue is not profit).

## Tests

- `lib/infrastructure/__tests__/calculator.test.ts` — calculations, FX, unknown
  values, shared included quotas, Pro credits, retry/duplicate usage, budget and
  fixed/variable/allocation consistency.
- `lib/infrastructure/__tests__/selfFunding.test.ts` — revenue conversion,
  coverage, milestones, partial sources, subscriptions, shortfall, Dev Cost
  Ledger bridge.
- `lib/infrastructure/__tests__/scenarios.test.ts` — presets, clamping and URL
  round-trip.
- `components/pierrot/workspace/__tests__/InfrastructureCostDashboard.test.tsx` —
  renders the page with an unavailable billing API without false zeros.

## Known limitations

- No Vercel/Supabase/AI billing token exists in the repository, so those provider
  invoices are unknown.
- Vercel region-specific overage can be higher than the cheapest published rate.
- Supabase cached egress is not modelled separately. Vercel builds use the Basic
  machine rate; Elastic/Turbo machines are not assumed.
- No paid video-generation AI provider is used; video processing is VPS CPU/RAM
  (already allocated to media), not a per-call API.
- Infomaniak does not publish per-GB backup pricing; the extra-backup rate is a
  manual assumption.
- OpenAI bills images in tokens; the per-image value is a manual planning
  assumption.
- whisper-1 is deprecated and scheduled to shut down on 2027-02-26.
