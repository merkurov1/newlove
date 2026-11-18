/**
 * Versioned public tariffs used by the infrastructure calculator.
 *
 * Rules:
 *   - Every record carries its public source, version and checkedAt.
 *   - A price is never inferred from a neighbouring tier. Tiers that are not
 *     published (for example larger Infomaniak VPS Cloud sizes) stay out of the
 *     catalog instead of being invented.
 *   - The audit date is 2026-11-18. Public prices can change; a new audit must
 *     create new version strings.
 */

export const PRICE_AUDIT_DATE = '2026-11-18T00:00:00.000Z';

export type Tariff = {
  version: string;
  source: string;
  checkedAt: string;
};

export const VERCEL_TARIFF: Tariff & {
  planProUsd: number;
  usageCreditUsd: number;
  includedTransferGb: number;
  transferOverageUsdPerGb: number;
  includedRequestsM: number;
  requestOverageUsdPerM: number;
  includedInvocationsM: number;
  invocationOverageUsdPerM: number;
  cpuUsdPerHour: number;
  imageTransformUsdPer1K: number;
  analyticsUsdPer1K: number;
  buildUsdPerMinute: number;
} = {
  version: 'vercel-pro-2026-11-18',
  source:
    'https://vercel.com/pricing, https://vercel.com/docs/pricing and https://vercel.com/docs/analytics/limits-and-pricing',
  checkedAt: PRICE_AUDIT_DATE,
  planProUsd: 20,
  usageCreditUsd: 20,
  includedTransferGb: 1_000,
  transferOverageUsdPerGb: 0.15,
  includedRequestsM: 1,
  requestOverageUsdPerM: 2,
  includedInvocationsM: 1,
  invocationOverageUsdPerM: 0.6,
  cpuUsdPerHour: 0.128,
  imageTransformUsdPer1K: 0.05,
  analyticsUsdPer1K: 0.03,
  buildUsdPerMinute: 0.007,
};

export const SUPABASE_TARIFF: Tariff & {
  planProUsd: number;
  computeCreditUsd: number;
  computeUsd: Record<'micro' | 'small' | 'medium', number>;
  includedDiskGbPerProject: number;
  diskOverageUsdPerGb: number;
  includedStorageGb: number;
  storageOverageUsdPerGb: number;
  includedEgressGb: number;
  egressOverageUsdPerGb: number;
  includedMau: number;
  mauOverageUsd: number;
  includedEdgeInvocationsM: number;
  edgeOverageUsdPerM: number;
} = {
  version: 'supabase-pro-2026-11-18',
  source:
    'https://supabase.com/pricing and https://supabase.com/docs/guides/platform/manage-your-usage',
  checkedAt: PRICE_AUDIT_DATE,
  planProUsd: 25,
  computeCreditUsd: 10,
  computeUsd: { micro: 10, small: 15, medium: 60 },
  includedDiskGbPerProject: 8,
  diskOverageUsdPerGb: 0.125,
  includedStorageGb: 100,
  storageOverageUsdPerGb: 0.0213,
  includedEgressGb: 250,
  egressOverageUsdPerGb: 0.09,
  includedMau: 100_000,
  mauOverageUsd: 0.00325,
  includedEdgeInvocationsM: 2,
  edgeOverageUsdPerM: 2,
};

export const INFOMANIAK_TARIFF: Tariff & {
  skus: Record<
    'vpsLite1' | 'vpsLite3' | 'vpsCloudEntry',
    {
      label: string;
      chfPerMonth: number;
      vcpu: number;
      ramGb: number;
      diskGb: number;
      snapshotIncluded: boolean;
      traffic: string;
    }
  >;
  /** Infomaniak does not publish this per-GB rate; it is an explicit owner assumption. */
  extraBackupChfPerGb: number;
} = {
  version: 'infomaniak-vps-2026-11-18',
  source:
    'https://www.infomaniak.com/en/hosting/vps-cloud/prices and https://www.infomaniak.com/en/hosting/vps-cloud',
  checkedAt: PRICE_AUDIT_DATE,
  skus: {
    vpsLite1: {
      label: 'VPS Lite 1',
      chfPerMonth: 2.7,
      vcpu: 1,
      ramGb: 2,
      diskGb: 20,
      snapshotIncluded: false,
      traffic: 'unlimited at 500 Mbit/s',
    },
    vpsLite3: {
      label: 'VPS Lite 3',
      chfPerMonth: 7.2,
      vcpu: 2,
      ramGb: 4,
      diskGb: 60,
      snapshotIncluded: false,
      traffic: 'unlimited at 500 Mbit/s',
    },
    vpsCloudEntry: {
      label: 'VPS Cloud (entry)',
      chfPerMonth: 38.41,
      vcpu: 4,
      ramGb: 12,
      diskGb: 250,
      snapshotIncluded: true,
      traffic: 'unlimited, 350 Gbit/s network',
    },
  },
  extraBackupChfPerGb: 0.1,
};

export const GITHUB_CODESPACES_TARIFF: Tariff & {
  planProUsd: number;
  includedCoreHours: Record<'free' | 'pro', number>;
  includedStorageGb: Record<'free' | 'pro', number>;
  coreHourUsd: number;
  storageGbUsd: number;
  machineCores: Record<string, number>;
  machineLabel: Record<string, string>;
} = {
  version: 'github-codespaces-2026-11-18',
  source:
    'https://docs.github.com/en/billing/concepts/product-billing/github-codespaces and https://docs.github.com/en/billing/reference/product-usage-included',
  checkedAt: PRICE_AUDIT_DATE,
  planProUsd: 4,
  includedCoreHours: { free: 120, pro: 180 },
  includedStorageGb: { free: 15, pro: 20 },
  coreHourUsd: 0.09,
  storageGbUsd: 0.07,
  machineCores: {
    basicLinux32gb: 2,
    standardLinux32gb: 4,
    premiumLinux: 8,
    largePremiumLinux: 16,
  },
  machineLabel: {
    basicLinux32gb: '2-core · 8 GB',
    standardLinux32gb: '4-core · 16 GB',
    premiumLinux: '8-core · 32 GB',
    largePremiumLinux: '16-core · 64 GB',
  },
};

export const DEEPSEEK_TARIFF: Tariff & {
  peak: { cacheHitUsdPerM: number; cacheMissUsdPerM: number; outputUsdPerM: number };
  offPeak: { cacheHitUsdPerM: number; cacheMissUsdPerM: number; outputUsdPerM: number };
} = {
  version: 'deepseek-flash-2026-11-18',
  source: 'https://api-docs.deepseek.com/quick_start/pricing/',
  checkedAt: PRICE_AUDIT_DATE,
  peak: { cacheHitUsdPerM: 0.006, cacheMissUsdPerM: 0.3, outputUsdPerM: 1.2 },
  offPeak: { cacheHitUsdPerM: 0.003, cacheMissUsdPerM: 0.15, outputUsdPerM: 0.6 },
};

export const OPENAI_TARIFF: Tariff & {
  whisperUsdPerMinute: number;
  gptTranscribeUsdPerMinute: number;
  embeddingSmallUsdPerM: number;
  imageManualUsdPerCall: number;
} = {
  version: 'openai-api-2026-11-18',
  source: 'https://developers.openai.com/api/docs/pricing',
  checkedAt: PRICE_AUDIT_DATE,
  whisperUsdPerMinute: 0.006,
  gptTranscribeUsdPerMinute: 0.0045,
  embeddingSmallUsdPerM: 0.02,
  // OpenAI bills images in tokens, not per image. This is an explicit planning
  // assumption for a small 1024px generation, not a published unit price.
  imageManualUsdPerCall: 0.04,
};

export const RESEND_TARIFF: Tariff & {
  free: { usdPerMonth: number; includedEmails: number; overageAllowed: boolean };
  pro: { usdPerMonth: number; includedEmails: number; overageUsdPer1K: number };
} = {
  version: 'resend-2026-11-18',
  source: 'https://resend.com/pricing',
  checkedAt: PRICE_AUDIT_DATE,
  free: { usdPerMonth: 0, includedEmails: 3_000, overageAllowed: false },
  pro: { usdPerMonth: 20, includedEmails: 50_000, overageUsdPer1K: 0.9 },
};

export const DOMAIN_TARIFF: Tariff & {
  domain: string;
  usdPerYear: number;
  registrar: string;
} = {
  version: 'cloudflare-love-2026-11-16',
  source: 'https://cfdomainpricing.com/ (Cloudflare Registrar .love at-cost price)',
  checkedAt: '2026-11-16T00:00:00.000Z',
  domain: 'merkurov.love',
  usdPerYear: 20.2,
  registrar: 'Cloudflare Registrar',
};

export const PLATFORM_MISC_TARIFF: Tariff = {
  version: 'pierrot-code-audit-2026-11-18',
  source: 'Repository audit: Sentry instrumentation is disabled (instrumentation.ts is a no-op).',
  checkedAt: PRICE_AUDIT_DATE,
};
