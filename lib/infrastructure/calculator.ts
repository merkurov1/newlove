import {
  DEEPSEEK_TARIFF,
  DOMAIN_TARIFF,
  GITHUB_CODESPACES_TARIFF,
  INFOMANIAK_TARIFF,
  OPENAI_TARIFF,
  PLATFORM_MISC_TARIFF,
  RESEND_TARIFF,
  SUPABASE_TARIFF,
  VERCEL_TARIFF,
} from './catalog';
import { fxRateFor, round6 } from './fx';
import type { Scenario } from './scenarios';
import { allocationShareTotal } from './scenarios';
import type {
  BudgetAssessment,
  CategoryCostSummary,
  Confidence,
  CostAllocation,
  CostClass,
  CostKind,
  CostLine,
  CostReport,
  CostSummary,
  FxRate,
  InfraCurrency,
  ProviderCostSummary,
} from './types';

export const ALLOCATIONS: CostAllocation[] = ['production', 'development', 'media'];
const KINDS: CostKind[] = ['actual', 'provider-reported', 'estimate', 'manual', 'unknown'];

export type UsageEvent = {
  id: string;
  provider: string;
  metric: string;
  quantity: number;
  kind?: CostKind;
};

/**
 * Provider usage may be delivered more than once (retries, overlapping
 * webhooks). Deduplicate by stable event id before summing; a retry must not
 * double a bill. Invalid rows are counted, never silently treated as zero.
 */
export function sumUsageEvents(events: UsageEvent[]): {
  total: number;
  duplicates: number;
  invalid: number;
  accepted: number;
} {
  const seen = new Set<string>();
  let total = 0;
  let duplicates = 0;
  let invalid = 0;
  let accepted = 0;
  for (const event of events) {
    if (
      !event ||
      typeof event.id !== 'string' ||
      !event.id.trim() ||
      !Number.isFinite(event.quantity) ||
      event.quantity < 0
    ) {
      invalid += 1;
      continue;
    }
    if (seen.has(event.id)) {
      duplicates += 1;
      continue;
    }
    seen.add(event.id);
    total += event.quantity;
    accepted += 1;
  }
  return { total: round6(total), duplicates, invalid, accepted };
}

function usageOverride(
  events: UsageEvent[] | undefined,
  provider: string,
  metric: string
): number | null {
  if (!events || events.length === 0) return null;
  const matching = events.filter((event) => event.provider === provider && event.metric === metric);
  if (matching.length === 0) return null;
  return sumUsageEvents(matching).total;
}

function finiteNonNegative(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

type LineInput = {
  id: string;
  provider: string;
  providerLabel: string;
  category: string;
  label: string;
  description: string;
  costClass: CostClass;
  allocation: CostAllocation;
  allocationShares?: Partial<Record<CostAllocation, number>> | null;
  currency: InfraCurrency;
  nativeAmount: number | null;
  amountKind: CostKind;
  usageQuantity?: number | null;
  usageUnit?: string | null;
  usageKind?: CostKind | null;
  includedQuantity?: number | null;
  overageQuantity?: number | null;
  billingBasis: string;
  source: string;
  checkedAt: string;
  confidence: Confidence;
  pricingVersion: string;
  assumptions?: string[];
  unknownReason?: string | null;
  requiredPermission?: string | null;
};

function line(input: LineInput, fx: Record<InfraCurrency, FxRate>): CostLine {
  const nativeAmount =
    input.amountKind === 'unknown' ? null : finiteNonNegative(input.nativeAmount);
  const rate = fx[input.currency];
  return {
    id: input.id,
    provider: input.provider,
    providerLabel: input.providerLabel,
    category: input.category,
    label: input.label,
    description: input.description,
    costClass: input.costClass,
    allocation: input.allocation,
    allocationShares: input.allocationShares ?? null,
    currency: input.currency,
    nativeAmount,
    eurAmount: nativeAmount === null ? null : round6(nativeAmount * rate.eurPerUnit),
    amountKind: input.amountKind,
    usageQuantity: input.usageQuantity ?? null,
    usageUnit: input.usageUnit ?? null,
    usageKind: input.usageKind ?? null,
    includedQuantity: input.includedQuantity ?? null,
    overageQuantity: input.overageQuantity ?? null,
    billingBasis: input.billingBasis,
    source: input.source,
    checkedAt: input.checkedAt,
    confidence: input.confidence,
    pricingVersion: input.pricingVersion,
    assumptions: input.assumptions ?? [],
    unknownReason: input.unknownReason ?? null,
    requiredPermission: input.requiredPermission ?? null,
  };
}

/**
 * Split a shared included quota proportionally to usage. This prevents the
 * common double-count where the same 250 GB Supabase egress allowance is
 * subtracted once for production and once for media.
 */
export function allocateIncludedQuota(
  entries: Array<{ id: string; quantity: number }>,
  included: number
): Array<{ id: string; quantity: number; includedShare: number; overage: number }> {
  const safeIncluded = Math.max(0, included);
  const total = entries.reduce(
    (sum, entry) => sum + (Number.isFinite(entry.quantity) ? Math.max(0, entry.quantity) : 0),
    0
  );
  return entries.map((entry) => {
    const quantity = Number.isFinite(entry.quantity) ? Math.max(0, entry.quantity) : 0;
    const includedShare = total <= 0 ? 0 : (quantity / total) * safeIncluded;
    return {
      id: entry.id,
      quantity,
      includedShare,
      overage: Math.max(0, quantity - includedShare),
    };
  });
}

function vercelLines(
  scenario: Scenario,
  fx: Record<InfraCurrency, FxRate>,
  events: UsageEvent[] | undefined
): CostLine[] {
  const t = VERCEL_TARIFF;
  const actualBandwidth = usageOverride(events, 'vercel', 'bandwidth_gb');
  const actualRequests = usageOverride(events, 'vercel', 'edge_requests_m');
  const bandwidthGb = actualBandwidth ?? scenario.vercelBandwidthGb;
  const requestsM = actualRequests ?? scenario.vercelEdgeRequestsM;
  const transferOverage = Math.max(0, bandwidthGb - t.includedTransferGb);
  const requestOverage = Math.max(0, requestsM - t.includedRequestsM);
  const invocationOverage = Math.max(
    0,
    scenario.vercelFunctionInvocationsM - t.includedInvocationsM
  );
  const grossMetered =
    invocationOverage * t.invocationOverageUsdPerM +
    scenario.vercelCpuHours * t.cpuUsdPerHour +
    scenario.vercelImageTransformsK * t.imageTransformUsdPer1K +
    (scenario.analyticsEventsPerMonth / 1_000) * t.analyticsUsdPer1K;
  const netMetered = Math.max(0, grossMetered - t.usageCreditUsd);
  const usageKind: CostKind =
    actualBandwidth !== null || actualRequests !== null ? 'provider-reported' : 'manual';

  return [
    line(
      {
        id: 'vercel-plan',
        provider: 'vercel',
        providerLabel: 'Vercel',
        category: 'hosting-platform',
        label: 'Pro plan',
        description: 'Platform fee for one deploying seat. Additional seats are $20 each.',
        costClass: 'fixed',
        allocation: 'production',
        currency: 'USD',
        nativeAmount: t.planProUsd,
        amountKind: 'manual',
        billingBasis: 'per deploying seat, monthly',
        source: t.source,
        checkedAt: t.checkedAt,
        confidence: 'high',
        pricingVersion: t.version,
        assumptions: [
          'The scenario assumes one deploying Pro seat; the actual account plan is not read by this page.',
        ],
      },
      fx
    ),
    line(
      {
        id: 'vercel-transfer',
        provider: 'vercel',
        providerLabel: 'Vercel',
        category: 'bandwidth',
        label: 'Fast Data Transfer',
        description: `${bandwidthGb.toFixed(1)} GB used, ${t.includedTransferGb} GB included. Overage at the cheapest published regional rate.`,
        costClass: 'variable',
        allocation: 'production',
        currency: 'USD',
        nativeAmount: transferOverage * t.transferOverageUsdPerGb,
        amountKind: 'estimate',
        usageQuantity: bandwidthGb,
        usageUnit: 'GB / month',
        usageKind,
        includedQuantity: t.includedTransferGb,
        overageQuantity: transferOverage,
        billingBasis: 'per GB above the included Flat Rate CDN tier',
        source: t.source,
        checkedAt: t.checkedAt,
        confidence: actualBandwidth !== null ? 'high' : 'medium',
        pricingVersion: t.version,
        assumptions: [
          'Pro includes the lowest Flat Rate CDN tier (1 TB / 1M requests in the audited docs). Region-specific overage can be higher than the $0.15/GB floor used here.',
        ],
      },
      fx
    ),
    line(
      {
        id: 'vercel-requests',
        provider: 'vercel',
        providerLabel: 'Vercel',
        category: 'edge-requests',
        label: 'Edge / CDN requests',
        description: `${requestsM.toFixed(2)}M used, ${t.includedRequestsM}M included.`,
        costClass: 'variable',
        allocation: 'production',
        currency: 'USD',
        nativeAmount: requestOverage * t.requestOverageUsdPerM,
        amountKind: 'estimate',
        usageQuantity: requestsM,
        usageUnit: 'million requests / month',
        usageKind,
        includedQuantity: t.includedRequestsM,
        overageQuantity: requestOverage,
        billingBasis: 'per million requests above the included tier',
        source: t.source,
        checkedAt: t.checkedAt,
        confidence: actualRequests !== null ? 'high' : 'medium',
        pricingVersion: t.version,
      },
      fx
    ),
    line(
      {
        id: 'vercel-metered',
        provider: 'vercel',
        providerLabel: 'Vercel',
        category: 'compute',
        label: 'Functions, CPU, image transforms и analytics',
        description: `Gross $${grossMetered.toFixed(2)}: ${scenario.vercelFunctionInvocationsM}M invocations, ${scenario.vercelCpuHours} CPU-h, ${scenario.vercelImageTransformsK}K image transforms, ${scenario.analyticsEventsPerMonth.toLocaleString('en-GB')} analytics events. The $${t.usageCreditUsd} monthly credit is applied here.`,
        costClass: 'variable',
        allocation: 'production',
        currency: 'USD',
        nativeAmount: netMetered,
        amountKind: 'estimate',
        usageQuantity: scenario.vercelFunctionInvocationsM,
        usageUnit: 'million invocations / month',
        usageKind: 'manual',
        includedQuantity: t.includedInvocationsM,
        overageQuantity: Math.max(0, scenario.vercelFunctionInvocationsM - t.includedInvocationsM),
        billingBasis: 'published on-demand rates minus the $20 Pro usage credit',
        source: t.source,
        checkedAt: t.checkedAt,
        confidence: 'medium',
        pricingVersion: t.version,
        assumptions: [
          'The $20 credit is consumed by functions/CPU/image transforms/Web Analytics; CDN transfer and requests are modelled as a separate Flat Rate CDN allowance.',
          'Web Analytics is metered on Pro ($0.03 per 1,000 events) and draws from the same $20 credit. Speed Insights Plus is not assumed.',
          'Deployment builds are a separate line at the Basic build-machine rate; ISR cache reads/writes and add-ons are not modelled.',
        ],
      },
      fx
    ),
    line(
      {
        id: 'vercel-builds',
        provider: 'vercel',
        providerLabel: 'Vercel',
        category: 'deployments-builds',
        label: 'Deployment build minutes',
        description: `${scenario.vercelBuildMinutesPerMonth} Basic build minutes × $${t.buildUsdPerMinute}/min. Deployments themselves are unlimited.`,
        costClass: 'variable',
        allocation: 'production',
        currency: 'USD',
        nativeAmount: scenario.vercelBuildMinutesPerMonth * t.buildUsdPerMinute,
        amountKind: 'estimate',
        usageQuantity: scenario.vercelBuildMinutesPerMonth,
        usageUnit: 'build minutes / month',
        usageKind: 'manual',
        billingBasis: 'Basic build machine, $0.007 per build minute (2 vCPU)',
        source: t.source,
        checkedAt: t.checkedAt,
        confidence: 'medium',
        pricingVersion: t.version,
        assumptions: [
          'Build duration is rounded up to the next whole minute by Vercel.',
          'Elastic or larger build machines are not assumed.',
        ],
      },
      fx
    ),
  ];
}

function supabaseLines(scenario: Scenario, fx: Record<InfraCurrency, FxRate>): CostLine[] {
  const t = SUPABASE_TARIFF;
  const computePrice = t.computeUsd[scenario.supabaseCompute];
  const computeNet = Math.max(0, computePrice - t.computeCreditUsd);
  const diskOverage = Math.max(0, scenario.dbStorageGb - t.includedDiskGbPerProject);
  const storageQuota = allocateIncludedQuota(
    [
      { id: 'photo', quantity: scenario.photoStorageGb },
      { id: 'video', quantity: scenario.videoStorageGb },
    ],
    t.includedStorageGb
  );
  const egressQuota = allocateIncludedQuota(
    [
      { id: 'production', quantity: scenario.egressGb },
      { id: 'media', quantity: scenario.mediaEgressGb },
    ],
    t.includedEgressGb
  );
  const mauOverage = Math.max(0, scenario.supabaseMau - t.includedMau);
  const edgeOverage = Math.max(0, scenario.supabaseEdgeInvocationsM - t.includedEdgeInvocationsM);

  const photo = storageQuota.find((entry) => entry.id === 'photo');
  const video = storageQuota.find((entry) => entry.id === 'video');
  const productionEgress = egressQuota.find((entry) => entry.id === 'production');
  const mediaEgress = egressQuota.find((entry) => entry.id === 'media');

  return [
    line(
      {
        id: 'supabase-plan',
        provider: 'supabase',
        providerLabel: 'Supabase',
        category: 'database-platform',
        label: 'Pro plan',
        description:
          'Organization plan fee. Compute is billed separately. Pro includes daily backups kept for 7 days.',
        costClass: 'fixed',
        allocation: 'production',
        currency: 'USD',
        nativeAmount: t.planProUsd,
        amountKind: 'manual',
        billingBasis: 'per organization, monthly',
        source: t.source,
        checkedAt: t.checkedAt,
        confidence: 'high',
        pricingVersion: t.version,
        assumptions: [
          'The scenario assumes one Pro organization and one production project; the actual plan is not read by this page.',
          'Point-in-time recovery and longer backup retention are paid add-ons and are not assumed.',
        ],
      },
      fx
    ),
    line(
      {
        id: 'supabase-compute',
        provider: 'supabase',
        providerLabel: 'Supabase',
        category: 'compute',
        label: `Compute (${scenario.supabaseCompute})`,
        description: `$${computePrice}/month compute, $${t.computeCreditUsd} Pro credit applied.`,
        costClass: 'fixed',
        allocation: 'production',
        currency: 'USD',
        nativeAmount: computeNet,
        amountKind: 'manual',
        billingBasis: 'per project, monthly; Pro compute credit subtracted',
        source: t.source,
        checkedAt: t.checkedAt,
        confidence: 'high',
        pricingVersion: t.version,
        includedQuantity: t.computeCreditUsd,
        usageUnit: 'USD credit / month',
        usageKind: 'manual',
        assumptions: [
          'The credit covers a Micro project. Larger compute is billed net of the $10 credit.',
        ],
      },
      fx
    ),
    line(
      {
        id: 'supabase-disk',
        provider: 'supabase',
        providerLabel: 'Supabase',
        category: 'database-disk',
        label: 'Database disk',
        description: `${scenario.dbStorageGb} GB used, ${t.includedDiskGbPerProject} GB included per project.`,
        costClass: 'variable',
        allocation: 'production',
        currency: 'USD',
        nativeAmount: diskOverage * t.diskOverageUsdPerGb,
        amountKind: 'estimate',
        usageQuantity: scenario.dbStorageGb,
        usageUnit: 'GB',
        usageKind: 'manual',
        includedQuantity: t.includedDiskGbPerProject,
        overageQuantity: diskOverage,
        billingBasis: 'provisioned disk above 8 GB per project',
        source: t.source,
        checkedAt: t.checkedAt,
        confidence: 'medium',
        pricingVersion: t.version,
        assumptions: ['Provisioned disk grows automatically at 90% full and does not shrink.'],
      },
      fx
    ),
    line(
      {
        id: 'supabase-photo-storage',
        provider: 'supabase',
        providerLabel: 'Supabase',
        category: 'media-storage',
        label: 'Photo storage',
        description: `${scenario.photoStorageGb} GB originals in file storage; shared 100 GB quota split by usage.`,
        costClass: 'variable',
        allocation: 'media',
        currency: 'USD',
        nativeAmount: (photo?.overage ?? 0) * t.storageOverageUsdPerGb,
        amountKind: 'estimate',
        usageQuantity: scenario.photoStorageGb,
        usageUnit: 'GB',
        usageKind: 'manual',
        includedQuantity: photo?.includedShare ?? 0,
        overageQuantity: photo?.overage ?? 0,
        billingBasis: 'file storage above the shared 100 GB Pro quota',
        source: t.source,
        checkedAt: t.checkedAt,
        confidence: 'medium',
        pricingVersion: t.version,
        assumptions: ['Image transforms are counted separately on Vercel.'],
      },
      fx
    ),
    line(
      {
        id: 'supabase-video-storage',
        provider: 'supabase',
        providerLabel: 'Supabase',
        category: 'media-storage',
        label: 'Video storage',
        description: `${scenario.videoStorageGb} GB video in file storage; shared quota split by usage.`,
        costClass: 'variable',
        allocation: 'media',
        currency: 'USD',
        nativeAmount: (video?.overage ?? 0) * t.storageOverageUsdPerGb,
        amountKind: 'estimate',
        usageQuantity: scenario.videoStorageGb,
        usageUnit: 'GB',
        usageKind: 'manual',
        includedQuantity: video?.includedShare ?? 0,
        overageQuantity: video?.overage ?? 0,
        billingBasis: 'file storage above the shared 100 GB Pro quota',
        source: t.source,
        checkedAt: t.checkedAt,
        confidence: 'medium',
        pricingVersion: t.version,
        assumptions: ['Transcoding happens on the VPS, not a paid per-minute media API.'],
      },
      fx
    ),
    line(
      {
        id: 'supabase-egress',
        provider: 'supabase',
        providerLabel: 'Supabase',
        category: 'egress',
        label: 'Egress (production)',
        description: `${scenario.egressGb} GB production egress; shared 250 GB quota split by usage.`,
        costClass: 'variable',
        allocation: 'production',
        currency: 'USD',
        nativeAmount: (productionEgress?.overage ?? 0) * t.egressOverageUsdPerGb,
        amountKind: 'estimate',
        usageQuantity: scenario.egressGb,
        usageUnit: 'GB',
        usageKind: 'manual',
        includedQuantity: productionEgress?.includedShare ?? 0,
        overageQuantity: productionEgress?.overage ?? 0,
        billingBasis: 'uncached egress above the shared 250 GB Pro quota',
        source: t.source,
        checkedAt: t.checkedAt,
        confidence: 'medium',
        pricingVersion: t.version,
        assumptions: ['Cached egress is cheaper ($0.03/GB) and is not modelled separately.'],
      },
      fx
    ),
    line(
      {
        id: 'supabase-media-egress',
        provider: 'supabase',
        providerLabel: 'Supabase',
        category: 'media-egress',
        label: 'Egress (media)',
        description: `${scenario.mediaEgressGb} GB media egress; shared 250 GB quota split by usage.`,
        costClass: 'variable',
        allocation: 'media',
        currency: 'USD',
        nativeAmount: (mediaEgress?.overage ?? 0) * t.egressOverageUsdPerGb,
        amountKind: 'estimate',
        usageQuantity: scenario.mediaEgressGb,
        usageUnit: 'GB',
        usageKind: 'manual',
        includedQuantity: mediaEgress?.includedShare ?? 0,
        overageQuantity: mediaEgress?.overage ?? 0,
        billingBasis: 'uncached egress above the shared 250 GB Pro quota',
        source: t.source,
        checkedAt: t.checkedAt,
        confidence: 'medium',
        pricingVersion: t.version,
      },
      fx
    ),
    line(
      {
        id: 'supabase-mau',
        provider: 'supabase',
        providerLabel: 'Supabase',
        category: 'auth-mau',
        label: 'Monthly active users',
        description: `${scenario.supabaseMau.toLocaleString('en-GB')} MAU; 100,000 included on Pro.`,
        costClass: 'variable',
        allocation: 'production',
        currency: 'USD',
        nativeAmount: mauOverage * t.mauOverageUsd,
        amountKind: 'estimate',
        usageQuantity: scenario.supabaseMau,
        usageUnit: 'MAU',
        usageKind: 'manual',
        includedQuantity: t.includedMau,
        overageQuantity: mauOverage,
        billingBasis: 'per MAU above 100,000',
        source: t.source,
        checkedAt: t.checkedAt,
        confidence: 'medium',
        pricingVersion: t.version,
      },
      fx
    ),
    line(
      {
        id: 'supabase-edge',
        provider: 'supabase',
        providerLabel: 'Supabase',
        category: 'edge-functions',
        label: 'Edge Function invocations',
        description: `${scenario.supabaseEdgeInvocationsM}M invocations; 2M included on Pro.`,
        costClass: 'variable',
        allocation: 'production',
        currency: 'USD',
        nativeAmount: edgeOverage * t.edgeOverageUsdPerM,
        amountKind: 'estimate',
        usageQuantity: scenario.supabaseEdgeInvocationsM,
        usageUnit: 'million invocations / month',
        usageKind: 'manual',
        includedQuantity: t.includedEdgeInvocationsM,
        overageQuantity: edgeOverage,
        billingBasis: 'per million invocations above 2M',
        source: t.source,
        checkedAt: t.checkedAt,
        confidence: 'medium',
        pricingVersion: t.version,
      },
      fx
    ),
  ];
}

function vpsLines(scenario: Scenario, fx: Record<InfraCurrency, FxRate>): CostLine[] {
  const t = INFOMANIAK_TARIFF;
  const sku = t.skus[scenario.vpsSku];
  const backupAmount = scenario.vpsExtraBackupGb * t.extraBackupChfPerGb;
  return [
    line(
      {
        id: 'vps-sku',
        provider: 'infomaniak',
        providerLabel: 'Infomaniak VPS',
        category: 'vps',
        label: sku.label,
        description: `${sku.vcpu} vCPU · ${sku.ramGb} GB RAM · ${sku.diskGb} GB NVMe · ${sku.traffic}.`,
        costClass: 'fixed',
        allocation: 'production',
        allocationShares: { production: 0.6, media: 0.3, development: 0.1 },
        currency: 'CHF',
        nativeAmount: sku.chfPerMonth,
        amountKind: 'manual',
        billingBasis: 'monthly VPS price excluding VAT',
        source: t.source,
        checkedAt: t.checkedAt,
        confidence: 'high',
        pricingVersion: t.version,
        assumptions: [
          'The single VPS serves production, media processing and the dev bridge; its cost is split 60/30/10 as an explicit allocation, not three separate servers.',
          'The Swiss region and CHF currency match the owner assumption for a small Swiss server.',
          'Infomaniak list prices exclude VAT; VPS Lite pricing can depend on the commitment period.',
        ],
      },
      fx
    ),
    line(
      {
        id: 'vps-backup',
        provider: 'infomaniak',
        providerLabel: 'Infomaniak VPS',
        category: 'backup',
        label: 'Backups / snapshots',
        description: sku.snapshotIncluded
          ? 'One snapshot is included with VPS Cloud.'
          : `VPS Lite does not include snapshots. ${scenario.vpsExtraBackupGb} GB extra backup configured.`,
        costClass: 'variable',
        allocation: 'production',
        currency: 'CHF',
        nativeAmount: backupAmount,
        amountKind: 'manual',
        usageQuantity: scenario.vpsExtraBackupGb,
        usageUnit: 'GB',
        usageKind: 'manual',
        includedQuantity: sku.snapshotIncluded ? null : 0,
        overageQuantity: scenario.vpsExtraBackupGb,
        billingBasis: 'manual per-GB backup assumption when the SKU has no included snapshot',
        source: t.source,
        checkedAt: t.checkedAt,
        confidence: 'low',
        pricingVersion: t.version,
        assumptions: [
          'Infomaniak does not publish a per-GB backup rate. CHF 0.10/GB-month is an explicit owner assumption, not a provider quote.',
          'A VPS Lite without snapshots has a backup risk even when the cost line is zero.',
        ],
      },
      fx
    ),
    line(
      {
        id: 'vps-traffic',
        provider: 'infomaniak',
        providerLabel: 'Infomaniak VPS',
        category: 'traffic',
        label: 'VPS traffic',
        description: 'Traffic is unlimited on the audited SKU; no metered overage is published.',
        costClass: 'variable',
        allocation: 'production',
        currency: 'CHF',
        nativeAmount: 0,
        amountKind: 'manual',
        usageQuantity: null,
        usageUnit: 'unlimited',
        usageKind: 'manual',
        includedQuantity: null,
        overageQuantity: 0,
        billingBasis: 'included in the SKU',
        source: t.source,
        checkedAt: t.checkedAt,
        confidence: 'high',
        pricingVersion: t.version,
      },
      fx
    ),
    line(
      {
        id: 'vps-media-processing',
        provider: 'infomaniak',
        providerLabel: 'Infomaniak VPS',
        category: 'media-processing',
        label: 'Video / photo processing',
        description:
          'Transcoding and thumbnails run on the VPS. The marginal cost is zero because the fixed VPS price already includes the CPU/RAM allocation; no paid media API is used.',
        costClass: 'fixed',
        allocation: 'media',
        currency: 'CHF',
        nativeAmount: 0,
        amountKind: 'manual',
        usageQuantity: null,
        usageUnit: 'included VPS capacity',
        usageKind: 'manual',
        includedQuantity: null,
        overageQuantity: 0,
        billingBasis: 'included in the VPS allocation (30% media share)',
        source: PLATFORM_MISC_TARIFF.source,
        checkedAt: PLATFORM_MISC_TARIFF.checkedAt,
        confidence: 'medium',
        pricingVersion: PLATFORM_MISC_TARIFF.version,
        assumptions: [
          'This line is informational and does not add cost: the VPS fixed line is split 60/30/10 across production/media/development.',
          'A separate GPU/transcoding service is not configured in the repository.',
        ],
      },
      fx
    ),
  ];
}

function codespacesLines(scenario: Scenario, fx: Record<InfraCurrency, FxRate>): CostLine[] {
  const t = GITHUB_CODESPACES_TARIFF;
  const cores = t.machineCores[scenario.codespaceMachine] ?? 2;
  const coreHours = scenario.codespaceHoursPerMonth * cores;
  const includedCoreHours = t.includedCoreHours[scenario.codespacePlan];
  const coreOverage = Math.max(0, coreHours - includedCoreHours);
  const storageIncluded = t.includedStorageGb[scenario.codespacePlan];
  const storageOverage = Math.max(0, scenario.codespaceStorageGb - storageIncluded);
  return [
    line(
      {
        id: 'github-plan',
        provider: 'github',
        providerLabel: 'GitHub',
        category: 'developer-plan',
        label: scenario.codespacePlan === 'pro' ? 'GitHub Pro' : 'GitHub Free',
        description: 'Personal account plan that carries the Codespaces included quota.',
        costClass: 'fixed',
        allocation: 'development',
        currency: 'USD',
        nativeAmount: scenario.codespacePlan === 'pro' ? t.planProUsd : 0,
        amountKind: 'manual',
        billingBasis: 'per personal account, monthly',
        source: t.source,
        checkedAt: t.checkedAt,
        confidence: 'high',
        pricingVersion: t.version,
      },
      fx
    ),
    line(
      {
        id: 'github-codespaces-compute',
        provider: 'github',
        providerLabel: 'GitHub Codespaces',
        category: 'dev-compute',
        label: 'Codespaces compute',
        description: `${scenario.codespaceHoursPerMonth} h × ${cores} cores = ${coreHours} core-hours; ${includedCoreHours} included.`,
        costClass: 'variable',
        allocation: 'development',
        currency: 'USD',
        nativeAmount: coreOverage * t.coreHourUsd,
        amountKind: 'estimate',
        usageQuantity: coreHours,
        usageUnit: 'core-hours / month',
        usageKind: 'manual',
        includedQuantity: includedCoreHours,
        overageQuantity: coreOverage,
        billingBasis: 'per core-hour above the personal included quota',
        source: t.source,
        checkedAt: t.checkedAt,
        confidence: 'medium',
        pricingVersion: t.version,
        assumptions: [
          'Hours are wall-clock Codespace hours and are multiplied by the machine core count, matching GitHub billing.',
          'Task-level execution cost is reported separately by the existing Dev Cost Ledger and is not added again here.',
        ],
      },
      fx
    ),
    line(
      {
        id: 'github-codespaces-storage',
        provider: 'github',
        providerLabel: 'GitHub Codespaces',
        category: 'dev-storage',
        label: 'Codespaces storage',
        description: `${scenario.codespaceStorageGb} GB-month; ${storageIncluded} GB-month included.`,
        costClass: 'variable',
        allocation: 'development',
        currency: 'USD',
        nativeAmount: storageOverage * t.storageGbUsd,
        amountKind: 'estimate',
        usageQuantity: scenario.codespaceStorageGb,
        usageUnit: 'GB-month',
        usageKind: 'manual',
        includedQuantity: storageIncluded,
        overageQuantity: storageOverage,
        billingBasis: 'per GB-month above the personal included quota',
        source: t.source,
        checkedAt: t.checkedAt,
        confidence: 'medium',
        pricingVersion: t.version,
      },
      fx
    ),
  ];
}

function aiLines(
  scenario: Scenario,
  fx: Record<InfraCurrency, FxRate>,
  events: UsageEvent[] | undefined
): CostLine[] {
  const d = DEEPSEEK_TARIFF;
  const inputEvents = usageOverride(events, 'deepseek', 'input_tokens');
  const outputEvents = usageOverride(events, 'deepseek', 'output_tokens');
  const context = Math.max(1, scenario.avgContextTokens);
  const requests =
    inputEvents !== null && context > 0 ? inputEvents / context : scenario.modelRequestsPerMonth;
  const inputTokens = inputEvents ?? requests * context;
  const outputTokens = outputEvents ?? requests * scenario.avgOutputTokens;
  const peak = scenario.peakShare;
  const offPeak = 1 - peak;
  const blendedHit = d.peak.cacheHitUsdPerM * peak + d.offPeak.cacheHitUsdPerM * offPeak;
  const blendedMiss = d.peak.cacheMissUsdPerM * peak + d.offPeak.cacheMissUsdPerM * offPeak;
  const blendedOutput = d.peak.outputUsdPerM * peak + d.offPeak.outputUsdPerM * offPeak;
  const cachedTokens = inputTokens * scenario.cacheHitShare;
  const uncachedTokens = inputTokens - cachedTokens;
  const inputCost = (cachedTokens * blendedHit + uncachedTokens * blendedMiss) / 1_000_000;
  const outputCost = (outputTokens * blendedOutput) / 1_000_000;
  const usageKind: CostKind =
    inputEvents !== null || outputEvents !== null ? 'provider-reported' : 'manual';
  const whisper = OPENAI_TARIFF;

  return [
    line(
      {
        id: 'ai-input',
        provider: 'deepseek',
        providerLabel: 'DeepSeek',
        category: 'ai-input-tokens',
        label: 'Model input tokens',
        description: `${Math.round(inputTokens).toLocaleString('en-GB')} input tokens; ${Math.round(scenario.cacheHitShare * 100)}% cache hits; ${Math.round(peak * 100)}% peak.`,
        costClass: 'variable',
        allocation: 'production',
        currency: 'USD',
        nativeAmount: inputCost,
        amountKind: 'estimate',
        usageQuantity: inputTokens,
        usageUnit: 'tokens / month',
        usageKind,
        includedQuantity: null,
        overageQuantity: null,
        billingBasis: 'DeepSeek Flash cache-hit/cache-miss input rates, blended by peak share',
        source: d.source,
        checkedAt: d.checkedAt,
        confidence: usageKind === 'provider-reported' ? 'high' : 'medium',
        pricingVersion: d.version,
        assumptions: [
          'Peak hours are 01:00–04:00 and 06:00–10:00 UTC on weekdays; the peak share is an explicit scenario assumption.',
          'A cache hit requires an exact prefix match. The cache-hit share is not guaranteed.',
        ],
      },
      fx
    ),
    line(
      {
        id: 'ai-output',
        provider: 'deepseek',
        providerLabel: 'DeepSeek',
        category: 'ai-output-tokens',
        label: 'Model output tokens',
        description: `${Math.round(outputTokens).toLocaleString('en-GB')} output tokens including reasoning tokens.`,
        costClass: 'variable',
        allocation: 'production',
        currency: 'USD',
        nativeAmount: outputCost,
        amountKind: 'estimate',
        usageQuantity: outputTokens,
        usageUnit: 'tokens / month',
        usageKind,
        billingBasis: 'DeepSeek Flash output rate, blended by peak share',
        source: d.source,
        checkedAt: d.checkedAt,
        confidence: usageKind === 'provider-reported' ? 'high' : 'medium',
        pricingVersion: d.version,
        assumptions: ['Reasoning tokens are billed inside output tokens.'],
      },
      fx
    ),
    line(
      {
        id: 'ai-images',
        provider: 'openai',
        providerLabel: 'OpenAI',
        category: 'ai-image-calls',
        label: 'Image generation calls',
        description: `${scenario.imageCallsPerMonth} calls × $${whisper.imageManualUsdPerCall.toFixed(2)} planning assumption.`,
        costClass: 'variable',
        allocation: 'media',
        currency: 'USD',
        nativeAmount: scenario.imageCallsPerMonth * whisper.imageManualUsdPerCall,
        amountKind: 'manual',
        usageQuantity: scenario.imageCallsPerMonth,
        usageUnit: 'calls / month',
        usageKind: 'manual',
        billingBasis: 'manual per-image planning assumption; OpenAI bills image tokens, not images',
        source: whisper.source,
        checkedAt: whisper.checkedAt,
        confidence: 'low',
        pricingVersion: whisper.version,
        assumptions: [
          'OpenAI publishes token rates for image models, not a per-image price. $0.04/image is an explicit planning assumption and is not a provider invoice.',
        ],
      },
      fx
    ),
    line(
      {
        id: 'ai-transcription',
        provider: 'openai',
        providerLabel: 'OpenAI',
        category: 'ai-transcription',
        label: 'Audio transcription',
        description: `${scenario.transcriptionMinutesPerMonth} minutes × $${whisper.whisperUsdPerMinute}/min (whisper-1).`,
        costClass: 'variable',
        allocation: 'media',
        currency: 'USD',
        nativeAmount: scenario.transcriptionMinutesPerMonth * whisper.whisperUsdPerMinute,
        amountKind: 'estimate',
        usageQuantity: scenario.transcriptionMinutesPerMonth,
        usageUnit: 'minutes / month',
        usageKind: 'manual',
        billingBasis: 'per audio minute',
        source: whisper.source,
        checkedAt: whisper.checkedAt,
        confidence: 'medium',
        pricingVersion: whisper.version,
        assumptions: [
          'The repository calls whisper-1. OpenAI marks whisper-1 deprecated and schedules shutdown on 2027-02-26; migrate to gpt-transcribe before then.',
          'gpt-transcribe would cost $0.0045/min, 25% less.',
        ],
      },
      fx
    ),
    line(
      {
        id: 'ai-embeddings',
        provider: 'openai',
        providerLabel: 'OpenAI',
        category: 'ai-embeddings',
        label: 'Embeddings',
        description: `${(scenario.embeddingTokensPerMonth / 1_000_000).toFixed(2)}M tokens × $${whisper.embeddingSmallUsdPerM}/M (text-embedding-3-small).`,
        costClass: 'variable',
        allocation: 'production',
        currency: 'USD',
        nativeAmount:
          (scenario.embeddingTokensPerMonth * whisper.embeddingSmallUsdPerM) / 1_000_000,
        amountKind: 'estimate',
        usageQuantity: scenario.embeddingTokensPerMonth,
        usageUnit: 'tokens / month',
        usageKind: 'manual',
        billingBasis: 'per million embedding tokens',
        source: whisper.source,
        checkedAt: whisper.checkedAt,
        confidence: 'medium',
        pricingVersion: whisper.version,
      },
      fx
    ),
  ];
}

function emailLines(scenario: Scenario, fx: Record<InfraCurrency, FxRate>): CostLine[] {
  const t = RESEND_TARIFF;
  if (scenario.emailPlan === 'free') {
    if (scenario.emailCountPerMonth > t.free.includedEmails) {
      return [
        line(
          {
            id: 'email-overage',
            provider: 'resend',
            providerLabel: 'Resend',
            category: 'email',
            label: 'Email overage',
            description: `${scenario.emailCountPerMonth} emails exceed the Free plan hard cap of ${t.free.includedEmails}.`,
            costClass: 'variable',
            allocation: 'production',
            currency: 'USD',
            nativeAmount: null,
            amountKind: 'unknown',
            usageQuantity: scenario.emailCountPerMonth,
            usageUnit: 'emails / month',
            usageKind: 'manual',
            includedQuantity: t.free.includedEmails,
            overageQuantity: scenario.emailCountPerMonth - t.free.includedEmails,
            billingBasis: 'Free plan has no overage; a Pro plan is required',
            source: t.source,
            checkedAt: t.checkedAt,
            confidence: 'unknown',
            pricingVersion: t.version,
            unknownReason:
              'The Free plan cannot bill overage. The actual plan upgrade decision and price are not configured.',
            requiredPermission: 'Resend billing read access or an explicit plan choice',
          },
          fx
        ),
      ];
    }
    return [
      line(
        {
          id: 'email-plan',
          provider: 'resend',
          providerLabel: 'Resend',
          category: 'email',
          label: 'Free plan',
          description: `${scenario.emailCountPerMonth} of ${t.free.includedEmails} included emails used.`,
          costClass: 'fixed',
          allocation: 'production',
          currency: 'USD',
          nativeAmount: 0,
          amountKind: 'manual',
          usageQuantity: scenario.emailCountPerMonth,
          usageUnit: 'emails / month',
          usageKind: 'manual',
          includedQuantity: t.free.includedEmails,
          overageQuantity: 0,
          billingBasis: 'free tier; no overage available',
          source: t.source,
          checkedAt: t.checkedAt,
          confidence: 'medium',
          pricingVersion: t.version,
          assumptions: ['The Free plan is capped at 100 emails/day as well as 3,000/month.'],
        },
        fx
      ),
    ];
  }

  const overage = Math.max(0, scenario.emailCountPerMonth - t.pro.includedEmails);
  const billableBlocks = Math.ceil(overage / 1_000);
  return [
    line(
      {
        id: 'email-plan',
        provider: 'resend',
        providerLabel: 'Resend',
        category: 'email',
        label: 'Pro plan',
        description: `$${t.pro.usdPerMonth}/month including ${t.pro.includedEmails.toLocaleString('en-GB')} emails.`,
        costClass: 'fixed',
        allocation: 'production',
        currency: 'USD',
        nativeAmount: t.pro.usdPerMonth,
        amountKind: 'manual',
        billingBasis: 'monthly transactional email plan',
        source: t.source,
        checkedAt: t.checkedAt,
        confidence: 'high',
        pricingVersion: t.version,
      },
      fx
    ),
    line(
      {
        id: 'email-overage',
        provider: 'resend',
        providerLabel: 'Resend',
        category: 'email',
        label: 'Email overage',
        description: `${scenario.emailCountPerMonth} emails; ${overage} over the included volume, billed in 1,000-email blocks.`,
        costClass: 'variable',
        allocation: 'production',
        currency: 'USD',
        nativeAmount: billableBlocks * t.pro.overageUsdPer1K,
        amountKind: 'estimate',
        usageQuantity: scenario.emailCountPerMonth,
        usageUnit: 'emails / month',
        usageKind: 'manual',
        includedQuantity: t.pro.includedEmails,
        overageQuantity: overage,
        billingBasis: 'per 1,000 emails above 50,000; overage must be enabled',
        source: t.source,
        checkedAt: t.checkedAt,
        confidence: 'medium',
        pricingVersion: t.version,
        assumptions: ['Overage is opt-in. With it disabled, delivery stops instead of billing.'],
      },
      fx
    ),
  ];
}

function domainAndPlatformLines(fx: Record<InfraCurrency, FxRate>): CostLine[] {
  const d = DOMAIN_TARIFF;
  return [
    line(
      {
        id: 'domain-renewal',
        provider: 'cloudflare',
        providerLabel: 'Cloudflare Registrar',
        category: 'domain',
        label: `${d.domain} renewal`,
        description: `$${d.usdPerYear}/year at registrar cost, shown as a monthly run-rate.`,
        costClass: 'fixed',
        allocation: 'production',
        currency: 'USD',
        nativeAmount: d.usdPerYear / 12,
        amountKind: 'manual',
        billingBasis: 'annual renewal divided by 12',
        source: d.source,
        checkedAt: d.checkedAt,
        confidence: 'medium',
        pricingVersion: d.version,
        assumptions: ['Renewal price is the at-cost Cloudflare .love price checked 2026-11-16.'],
      },
      fx
    ),
    line(
      {
        id: 'monitoring',
        provider: 'sentry',
        providerLabel: 'Sentry',
        category: 'monitoring',
        label: 'Error monitoring',
        description:
          'Sentry instrumentation is disabled in the repository; no paid monitoring line exists.',
        costClass: 'fixed',
        allocation: 'production',
        currency: 'EUR',
        nativeAmount: 0,
        amountKind: 'manual',
        billingBasis: 'verified disabled in code, so known zero',
        source: PLATFORM_MISC_TARIFF.source,
        checkedAt: PLATFORM_MISC_TARIFF.checkedAt,
        confidence: 'high',
        pricingVersion: PLATFORM_MISC_TARIFF.version,
      },
      fx
    ),
  ];
}

function sharesFor(line: CostLine): Record<CostAllocation, number> {
  const result: Record<CostAllocation, number> = {
    production: 0,
    development: 0,
    media: 0,
  };
  if (line.eurAmount === null) return result;
  const shares = line.allocationShares;
  const total = allocationShareTotal(shares);
  if (!shares || total <= 0) {
    result[line.allocation] = line.eurAmount;
    return result;
  }
  for (const allocation of ALLOCATIONS) {
    result[allocation] = (line.eurAmount * (shares[allocation] ?? 0)) / total;
  }
  return result;
}

function emptyKindTotals(): Record<CostKind, number | null> {
  return { actual: null, 'provider-reported': null, estimate: null, manual: null, unknown: null };
}

export function summarizeCosts(lines: CostLine[]): CostSummary {
  const byKindCounts: Record<CostKind, number> = {
    actual: 0,
    'provider-reported': 0,
    estimate: 0,
    manual: 0,
    unknown: 0,
  };
  const byKindSums: Record<CostKind, number> = {
    actual: 0,
    'provider-reported': 0,
    estimate: 0,
    manual: 0,
    unknown: 0,
  };
  const byAllocation: Record<CostAllocation, number> = {
    production: 0,
    development: 0,
    media: 0,
  };
  const providerMap = new Map<string, ProviderCostSummary>();
  const categoryMap = new Map<string, CategoryCostSummary>();
  const unknown: CostSummary['unknown'] = [];
  let fixed = 0;
  let variable = 0;
  let oneOff = 0;
  let overage = 0;
  let knownMonthly = 0;

  for (const line of lines) {
    const kind = line.amountKind;
    byKindCounts[kind] += 1;
    if (line.eurAmount === null) {
      unknown.push({
        lineId: line.id,
        provider: line.provider,
        providerLabel: line.providerLabel,
        label: line.label,
        reason: line.unknownReason || 'Cost unavailable',
        requiredPermission: line.requiredPermission,
      });
    } else {
      knownMonthly += line.eurAmount;
      byKindSums[kind] += line.eurAmount;
      if (line.costClass === 'fixed') fixed += line.eurAmount;
      if (line.costClass === 'variable') variable += line.eurAmount;
      if (line.costClass === 'one-off') oneOff += line.eurAmount;
      if ((line.overageQuantity ?? 0) > 0) overage += line.eurAmount;
      const shares = sharesFor(line);
      for (const allocation of ALLOCATIONS) {
        byAllocation[allocation] += shares[allocation];
      }
    }

    const provider = providerMap.get(line.provider) ?? {
      provider: line.provider,
      providerLabel: line.providerLabel,
      eur: 0,
      sharePct: null,
      fixedEur: 0,
      variableEur: 0,
      productionEur: 0,
      developmentEur: 0,
      mediaEur: 0,
      unknownLines: 0,
      kinds: [],
    };
    if (line.eurAmount === null) {
      provider.unknownLines += 1;
    } else {
      provider.eur += line.eurAmount;
      if (line.costClass === 'fixed') provider.fixedEur += line.eurAmount;
      if (line.costClass === 'variable') provider.variableEur += line.eurAmount;
      const shares = sharesFor(line);
      provider.productionEur += shares.production;
      provider.developmentEur += shares.development;
      provider.mediaEur += shares.media;
    }
    if (!provider.kinds.includes(kind)) provider.kinds.push(kind);
    providerMap.set(line.provider, provider);

    const category = categoryMap.get(line.category) ?? {
      category: line.category,
      eur: 0,
      unknownLines: 0,
    };
    if (line.eurAmount === null) category.unknownLines += 1;
    else category.eur += line.eurAmount;
    categoryMap.set(line.category, category);
  }

  const byProvider = [...providerMap.values()]
    .map((provider) => ({
      ...provider,
      eur: round6(provider.eur),
      fixedEur: round6(provider.fixedEur),
      variableEur: round6(provider.variableEur),
      productionEur: round6(provider.productionEur),
      developmentEur: round6(provider.developmentEur),
      mediaEur: round6(provider.mediaEur),
      sharePct: knownMonthly > 0 ? Math.round((provider.eur / knownMonthly) * 1000) / 10 : null,
      kinds: KINDS.filter((kind) => provider.kinds.includes(kind)),
    }))
    .sort((a, b) => b.eur - a.eur || a.providerLabel.localeCompare(b.providerLabel));

  const byCategory = [...categoryMap.values()]
    .map((category) => ({ ...category, eur: round6(category.eur) }))
    .sort((a, b) => b.eur - a.eur || a.category.localeCompare(b.category));

  const byKind = emptyKindTotals();
  for (const kind of KINDS) {
    byKind[kind] = byKindCounts[kind] > 0 ? round6(byKindSums[kind]) : null;
  }

  const recurringMonthly = fixed + variable;
  const annual = recurringMonthly * 12 + oneOff;

  return {
    currency: 'EUR',
    lineCount: lines.length,
    knownLineCount: lines.length - unknown.length,
    unknownLineCount: unknown.length,
    complete: unknown.length === 0,
    monthlyKnownEur: round6(knownMonthly),
    annualKnownEur: round6(annual),
    actualEur: byKind.actual,
    providerReportedEur: byKind['provider-reported'],
    estimateEur: byKind.estimate,
    manualEur: byKind.manual,
    unknownEur: null,
    fixedEur: round6(fixed),
    variableEur: round6(variable),
    oneOffEur: round6(oneOff),
    recurringMonthlyEur: round6(recurringMonthly),
    overageEur: round6(overage),
    byKind,
    byAllocation: {
      production: round6(byAllocation.production),
      development: round6(byAllocation.development),
      media: round6(byAllocation.media),
    },
    byProvider,
    byCategory,
    unknown,
  };
}

export function assessBudget(
  summary: CostSummary,
  budgetEur: number,
  warnAtPct: number
): BudgetAssessment {
  if (summary.unknownLineCount > 0) {
    return {
      budgetEur,
      warnAtPct,
      usedPct: budgetEur > 0 ? Math.round((summary.monthlyKnownEur / budgetEur) * 1000) / 10 : null,
      status: 'incomplete',
      message: `Проверка бюджета неполная: ${summary.unknownLineCount} компонент(ов) неизвестны. Известная часть — €${summary.monthlyKnownEur.toFixed(2)}.`,
    };
  }
  if (budgetEur <= 0) {
    return {
      budgetEur,
      warnAtPct,
      usedPct: null,
      status: 'incomplete',
      message: 'Бюджетный порог не задан.',
    };
  }
  const usedPct = Math.round((summary.monthlyKnownEur / budgetEur) * 1000) / 10;
  if (summary.monthlyKnownEur >= budgetEur) {
    return {
      budgetEur,
      warnAtPct,
      usedPct,
      status: 'over',
      message: `Превышение бюджета: €${summary.monthlyKnownEur.toFixed(2)} из €${budgetEur.toFixed(2)}.`,
    };
  }
  if (usedPct >= warnAtPct) {
    return {
      budgetEur,
      warnAtPct,
      usedPct,
      status: 'warning',
      message: `Бюджет использован на ${usedPct}%: €${summary.monthlyKnownEur.toFixed(2)} из €${budgetEur.toFixed(2)}.`,
    };
  }
  return {
    budgetEur,
    warnAtPct,
    usedPct,
    status: 'ok',
    message: `В пределах бюджета: €${summary.monthlyKnownEur.toFixed(2)} из €${budgetEur.toFixed(2)}.`,
  };
}

export function buildCostReport(input: {
  scenario: Scenario;
  usageEvents?: UsageEvent[];
  now?: Date;
  /** Reuse the server-audited FX snapshot so client recomputation is identical. */
  rates?: FxRate[];
}): CostReport {
  const now = input.now || new Date();
  const provided = new Map((input.rates || []).map((rate) => [rate.currency, rate]));
  const fx: Record<InfraCurrency, FxRate> = {
    EUR: provided.get('EUR') ?? fxRateFor('EUR', now),
    USD: provided.get('USD') ?? fxRateFor('USD', now),
    CHF: provided.get('CHF') ?? fxRateFor('CHF', now),
    GBP: provided.get('GBP') ?? fxRateFor('GBP', now),
  };
  const lines = [
    ...vercelLines(input.scenario, fx, input.usageEvents),
    ...supabaseLines(input.scenario, fx),
    ...vpsLines(input.scenario, fx),
    ...codespacesLines(input.scenario, fx),
    ...aiLines(input.scenario, fx, input.usageEvents),
    ...emailLines(input.scenario, fx),
    ...domainAndPlatformLines(fx),
  ];
  const summary = summarizeCosts(lines);
  return {
    generatedAt: now.toISOString(),
    scenario: input.scenario,
    fx: Object.values(fx),
    lines,
    summary,
    budget: assessBudget(summary, input.scenario.budgetEur, input.scenario.warnAtPct),
  };
}
