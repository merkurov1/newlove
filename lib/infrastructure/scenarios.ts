import type { CostAllocation } from './types';

export const SCENARIO_IDS = ['lean', 'comfortable', 'intensive', 'custom'] as const;
export type ScenarioId = (typeof SCENARIO_IDS)[number];

export type VpsSku = 'vpsLite1' | 'vpsLite3' | 'vpsCloudEntry';
export type SupabaseCompute = 'micro' | 'small' | 'medium';
export type CodespaceMachine =
  | 'basicLinux32gb'
  | 'standardLinux32gb'
  | 'premiumLinux'
  | 'largePremiumLinux';
export type EmailPlan = 'free' | 'pro';
export type GithubPlan = 'free' | 'pro';

export type Scenario = {
  id: ScenarioId;
  label: string;
  activeUsers: number;
  modelRequestsPerMonth: number;
  avgContextTokens: number;
  avgOutputTokens: number;
  cacheHitShare: number;
  peakShare: number;
  imageCallsPerMonth: number;
  transcriptionMinutesPerMonth: number;
  embeddingTokensPerMonth: number;
  dbStorageGb: number;
  photoStorageGb: number;
  videoStorageGb: number;
  egressGb: number;
  mediaEgressGb: number;
  vercelBandwidthGb: number;
  vercelEdgeRequestsM: number;
  vercelFunctionInvocationsM: number;
  vercelCpuHours: number;
  vercelImageTransformsK: number;
  analyticsEventsPerMonth: number;
  vercelBuildMinutesPerMonth: number;
  codespaceMachine: CodespaceMachine;
  codespaceHoursPerMonth: number;
  codespaceStorageGb: number;
  codespacePlan: GithubPlan;
  vpsSku: VpsSku;
  vpsExtraBackupGb: number;
  supabaseCompute: SupabaseCompute;
  supabaseMau: number;
  supabaseEdgeInvocationsM: number;
  emailPlan: EmailPlan;
  emailCountPerMonth: number;
  budgetEur: number;
  warnAtPct: number;
};

export type ScenarioPreset = Omit<Scenario, 'id' | 'label'>;

/**
 * Public prices were audited on 2026-11-18. These presets are assumptions about
 * usage, not account facts. Every value is overridable and encoded in the URL.
 */
const LEAN: ScenarioPreset = {
  activeUsers: 3,
  modelRequestsPerMonth: 1_500,
  avgContextTokens: 8_000,
  avgOutputTokens: 700,
  cacheHitShare: 0.4,
  peakShare: 0.3,
  imageCallsPerMonth: 0,
  transcriptionMinutesPerMonth: 30,
  embeddingTokensPerMonth: 500_000,
  dbStorageGb: 1,
  photoStorageGb: 2,
  videoStorageGb: 5,
  egressGb: 20,
  mediaEgressGb: 15,
  vercelBandwidthGb: 50,
  vercelEdgeRequestsM: 0.5,
  vercelFunctionInvocationsM: 0.3,
  vercelCpuHours: 2,
  vercelImageTransformsK: 0.5,
  analyticsEventsPerMonth: 5_000,
  vercelBuildMinutesPerMonth: 30,
  codespaceMachine: 'standardLinux32gb',
  codespaceHoursPerMonth: 30,
  codespaceStorageGb: 10,
  codespacePlan: 'free',
  vpsSku: 'vpsLite3',
  vpsExtraBackupGb: 0,
  supabaseCompute: 'micro',
  supabaseMau: 2_000,
  supabaseEdgeInvocationsM: 0.2,
  emailPlan: 'free',
  emailCountPerMonth: 1_000,
  budgetEur: 100,
  warnAtPct: 80,
};

const COMFORTABLE: ScenarioPreset = {
  activeUsers: 25,
  modelRequestsPerMonth: 15_000,
  avgContextTokens: 20_000,
  avgOutputTokens: 1_200,
  cacheHitShare: 0.55,
  peakShare: 0.4,
  imageCallsPerMonth: 200,
  transcriptionMinutesPerMonth: 300,
  embeddingTokensPerMonth: 5_000_000,
  dbStorageGb: 4,
  photoStorageGb: 15,
  videoStorageGb: 40,
  egressGb: 100,
  mediaEgressGb: 120,
  vercelBandwidthGb: 250,
  vercelEdgeRequestsM: 3,
  vercelFunctionInvocationsM: 2,
  vercelCpuHours: 15,
  vercelImageTransformsK: 5,
  analyticsEventsPerMonth: 50_000,
  vercelBuildMinutesPerMonth: 240,
  codespaceMachine: 'standardLinux32gb',
  codespaceHoursPerMonth: 80,
  codespaceStorageGb: 20,
  codespacePlan: 'pro',
  vpsSku: 'vpsCloudEntry',
  vpsExtraBackupGb: 20,
  supabaseCompute: 'small',
  supabaseMau: 20_000,
  supabaseEdgeInvocationsM: 1,
  emailPlan: 'pro',
  emailCountPerMonth: 10_000,
  budgetEur: 200,
  warnAtPct: 80,
};

const INTENSIVE: ScenarioPreset = {
  activeUsers: 100,
  modelRequestsPerMonth: 60_000,
  avgContextTokens: 40_000,
  avgOutputTokens: 1_800,
  cacheHitShare: 0.6,
  peakShare: 0.5,
  imageCallsPerMonth: 1_000,
  transcriptionMinutesPerMonth: 1_200,
  embeddingTokensPerMonth: 20_000_000,
  dbStorageGb: 20,
  photoStorageGb: 80,
  videoStorageGb: 300,
  egressGb: 500,
  mediaEgressGb: 900,
  vercelBandwidthGb: 1_500,
  vercelEdgeRequestsM: 15,
  vercelFunctionInvocationsM: 10,
  vercelCpuHours: 60,
  vercelImageTransformsK: 30,
  analyticsEventsPerMonth: 200_000,
  vercelBuildMinutesPerMonth: 600,
  codespaceMachine: 'premiumLinux',
  codespaceHoursPerMonth: 160,
  codespaceStorageGb: 35,
  codespacePlan: 'pro',
  vpsSku: 'vpsCloudEntry',
  vpsExtraBackupGb: 100,
  supabaseCompute: 'medium',
  supabaseMau: 100_000,
  supabaseEdgeInvocationsM: 5,
  emailPlan: 'pro',
  emailCountPerMonth: 100_000,
  budgetEur: 800,
  warnAtPct: 80,
};

const PRESETS: Record<Exclude<ScenarioId, 'custom'>, ScenarioPreset> = {
  lean: LEAN,
  comfortable: COMFORTABLE,
  intensive: INTENSIVE,
};

const LABELS: Record<ScenarioId, string> = {
  lean: 'Lean',
  comfortable: 'Comfortable',
  intensive: 'Intensive',
  custom: 'Custom',
};

export function scenarioPreset(id: ScenarioId): Scenario {
  if (id === 'custom') {
    return { ...COMFORTABLE, id: 'custom', label: LABELS.custom };
  }
  return { ...PRESETS[id], id, label: LABELS[id] };
}

export const SCENARIO_LIST = (['lean', 'comfortable', 'intensive'] as const).map((id) =>
  scenarioPreset(id)
);

export const SCENARIO_DEFAULTS: Record<Exclude<ScenarioId, 'custom'>, Scenario> = {
  lean: scenarioPreset('lean'),
  comfortable: scenarioPreset('comfortable'),
  intensive: scenarioPreset('intensive'),
};

const NUMERIC_FIELDS: Array<{
  key: keyof ScenarioPreset;
  min: number;
  max: number;
  integer?: boolean;
}> = [
  { key: 'activeUsers', min: 0, max: 1_000_000, integer: true },
  { key: 'modelRequestsPerMonth', min: 0, max: 100_000_000 },
  { key: 'avgContextTokens', min: 0, max: 2_000_000 },
  { key: 'avgOutputTokens', min: 0, max: 400_000 },
  { key: 'cacheHitShare', min: 0, max: 1 },
  { key: 'peakShare', min: 0, max: 1 },
  { key: 'imageCallsPerMonth', min: 0, max: 10_000_000 },
  { key: 'transcriptionMinutesPerMonth', min: 0, max: 10_000_000 },
  { key: 'embeddingTokensPerMonth', min: 0, max: 1_000_000_000 },
  { key: 'dbStorageGb', min: 0, max: 10_000_000 },
  { key: 'photoStorageGb', min: 0, max: 10_000_000 },
  { key: 'videoStorageGb', min: 0, max: 10_000_000 },
  { key: 'egressGb', min: 0, max: 100_000_000 },
  { key: 'mediaEgressGb', min: 0, max: 100_000_000 },
  { key: 'vercelBandwidthGb', min: 0, max: 100_000_000 },
  { key: 'vercelEdgeRequestsM', min: 0, max: 1_000_000 },
  { key: 'vercelFunctionInvocationsM', min: 0, max: 1_000_000 },
  { key: 'vercelCpuHours', min: 0, max: 1_000_000 },
  { key: 'vercelImageTransformsK', min: 0, max: 1_000_000 },
  { key: 'analyticsEventsPerMonth', min: 0, max: 1_000_000_000 },
  { key: 'vercelBuildMinutesPerMonth', min: 0, max: 10_000_000 },
  { key: 'codespaceHoursPerMonth', min: 0, max: 744 },
  { key: 'codespaceStorageGb', min: 0, max: 10_000 },
  { key: 'vpsExtraBackupGb', min: 0, max: 1_000_000 },
  { key: 'supabaseMau', min: 0, max: 100_000_000, integer: true },
  { key: 'supabaseEdgeInvocationsM', min: 0, max: 1_000_000 },
  { key: 'emailCountPerMonth', min: 0, max: 100_000_000, integer: true },
  { key: 'budgetEur', min: 0, max: 10_000_000 },
  { key: 'warnAtPct', min: 1, max: 100 },
];

const ENUMS: Array<{
  key: 'vpsSku' | 'supabaseCompute' | 'codespaceMachine' | 'emailPlan' | 'codespacePlan';
  values: readonly string[];
}> = [
  { key: 'vpsSku', values: ['vpsLite1', 'vpsLite3', 'vpsCloudEntry'] },
  { key: 'supabaseCompute', values: ['micro', 'small', 'medium'] },
  {
    key: 'codespaceMachine',
    values: ['basicLinux32gb', 'standardLinux32gb', 'premiumLinux', 'largePremiumLinux'],
  },
  { key: 'emailPlan', values: ['free', 'pro'] },
  { key: 'codespacePlan', values: ['free', 'pro'] },
];

export function parseScenarioId(value: unknown): ScenarioId {
  return typeof value === 'string' && (SCENARIO_IDS as readonly string[]).includes(value)
    ? (value as ScenarioId)
    : 'comfortable';
}

function numberFromParam(
  raw: string | undefined,
  field: (typeof NUMERIC_FIELDS)[number]
): number | null {
  if (raw === undefined || raw.trim() === '') return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  const clamped = Math.min(Math.max(parsed, field.min), field.max);
  return field.integer ? Math.round(clamped) : clamped;
}

/**
 * URL parameters are the reproducible scenario format. Only overrides are
 * encoded, so a link stays short and a preset can evolve without rewriting
 * historical links.
 */
export function scenarioFromSearchParams(
  params: Record<string, string | string[] | undefined>
): Scenario {
  const one = (key: string): string | undefined => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const id = parseScenarioId(one('scenario'));
  const base = scenarioPreset(id);
  const result: Scenario = {
    ...base,
    id: one('scenario') ? id : 'comfortable',
    label: id === 'custom' ? LABELS.custom : LABELS[id],
  };

  for (const field of NUMERIC_FIELDS) {
    const value = numberFromParam(one(field.key), field);
    if (value !== null) {
      // The field keys and ScenarioPreset keys are the same.
      (result as unknown as Record<string, number>)[field.key] = value;
    }
  }
  for (const field of ENUMS) {
    const value = one(field.key);
    if (value && field.values.includes(value)) {
      (result as unknown as Record<string, string>)[field.key] = value;
    }
  }
  return result;
}

/** Encode only values that differ from the selected preset. */
export function scenarioToQuery(scenario: Scenario, applyTo: 'url' | 'link' = 'link'): string {
  const base = scenarioPreset(scenario.id === 'custom' ? 'comfortable' : scenario.id);
  const params = new URLSearchParams();
  if (scenario.id !== 'comfortable' || applyTo === 'url') {
    params.set('scenario', scenario.id);
  }
  for (const field of NUMERIC_FIELDS) {
    const value = scenario[field.key];
    const baseValue = base[field.key];
    if (value !== baseValue) params.set(field.key, String(value));
  }
  for (const field of ENUMS) {
    if (scenario[field.key] !== base[field.key]) params.set(field.key, scenario[field.key]);
  }
  return params.toString();
}

export function scenarioAllocationHint(id: ScenarioId): string {
  switch (id) {
    case 'lean':
      return 'Минимальная конфигурация: один небольшой VPS, квоты Supabase Pro, Codespaces Free.';
    case 'intensive':
      return 'Высокая нагрузка: больше токенов, медиа и egress; бюджет проверяется отдельно.';
    case 'comfortable':
    default:
      return 'Рабочая конфигурация для одного production-сайта с запасом по квотам.';
  }
}

export function allocationShareTotal(
  shares: Partial<Record<CostAllocation, number>> | null | undefined
): number {
  if (!shares) return 1;
  return Object.values(shares).reduce((sum, value) => sum + (value ?? 0), 0);
}
