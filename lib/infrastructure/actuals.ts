import { assertServerOnly } from '@/lib/serverOnly';
import { getCodespacesBillingSnapshot } from '@/lib/pierrot/dev/workbench/billing';
import { getDevCostLedger } from '@/lib/pierrot/dev/workbench/ledgerData';
import type { DevCostLedger } from '@/lib/pierrot/dev/workbench/types';
import type { ActualStatus } from './types';

assertServerOnly('lib/infrastructure/actuals');

function nowIso(): string {
  return new Date().toISOString();
}

const REQUIRED_VERCEL =
  'Read-only access to the team billing/invoices API. The app currently has no Vercel billing token, so it must not guess an invoice amount.';
const REQUIRED_SUPABASE =
  'Read-only organization billing/usage access (Management API). No billing token is configured; usage and invoices remain unknown.';
const REQUIRED_AI =
  'Read-only provider billing/usage access (DeepSeek and OpenAI). Token balances are not invoice totals and are not used as actuals.';

/**
 * Build the actual/provider-reported panel separately from the estimate lines.
 * A missing integration produces an explicit unavailable status, never a zero.
 */
export async function loadActualStatuses(): Promise<ActualStatus[]> {
  const checkedAt = nowIso();
  let github: ActualStatus;
  try {
    const snapshot = await getCodespacesBillingSnapshot();
    github =
      snapshot.status === 'confirmed'
        ? {
            provider: 'github',
            providerLabel: 'GitHub Codespaces',
            status: 'provider-reported',
            source: 'github-billing-api',
            checkedAt: snapshot.checkedAt,
            actualChargeEur: null,
            usageSummary:
              snapshot.totalMinutesUsed === null
                ? 'Минуты не переданы.'
                : `Использовано ${snapshot.totalMinutesUsed} минут, из них платных ${snapshot.totalPaidMinutesUsed ?? '—'}; включено ${snapshot.includedMinutes ?? '—'}.`,
            reason:
              'GitHub сообщает минуты, но не сумму счёта. Стоимость в таблице рассчитана по тарифу и помечена как estimate.',
            requiredPermission: null,
          }
        : {
            provider: 'github',
            providerLabel: 'GitHub Codespaces',
            status: 'unavailable',
            source: snapshot.source,
            checkedAt: snapshot.checkedAt,
            actualChargeEur: null,
            usageSummary: null,
            reason: snapshot.reason || 'GitHub billing API недоступен.',
            requiredPermission:
              'Fine-grained token with Codespaces/billing read access for the owner account.',
          };
  } catch {
    github = {
      provider: 'github',
      providerLabel: 'GitHub Codespaces',
      status: 'unavailable',
      source: 'github-billing-api',
      checkedAt,
      actualChargeEur: null,
      usageSummary: null,
      reason: 'GitHub billing API недоступен; Codespaces стоимость остаётся estimate.',
      requiredPermission:
        'Fine-grained token with Codespaces/billing read access for the owner account.',
    };
  }

  return [
    {
      provider: 'vercel',
      providerLabel: 'Vercel',
      status: 'not-configured',
      source: 'vercel-billing-api',
      checkedAt,
      actualChargeEur: null,
      usageSummary: null,
      reason:
        'Billing API не подключён. В обзоре показаны воспроизводимые оценки из публичных тарифов, а не факт счёта.',
      requiredPermission: REQUIRED_VERCEL,
    },
    {
      provider: 'supabase',
      providerLabel: 'Supabase',
      status: 'not-configured',
      source: 'supabase-management-billing-api',
      checkedAt,
      actualChargeEur: null,
      usageSummary: null,
      reason:
        'Billing API не подключён. Compute/storage/egress показаны как оцениваемая конфигурация.',
      requiredPermission: REQUIRED_SUPABASE,
    },
    github,
    {
      provider: 'deepseek',
      providerLabel: 'DeepSeek',
      status: 'not-configured',
      source: 'deepseek-billing-api',
      checkedAt,
      actualChargeEur: null,
      usageSummary: null,
      reason:
        'Фактический usage моделей не записывается в приложении. Токены в сценарии — допущение.',
      requiredPermission: REQUIRED_AI,
    },
    {
      provider: 'openai',
      providerLabel: 'OpenAI',
      status: 'not-configured',
      source: 'openai-billing-api',
      checkedAt,
      actualChargeEur: null,
      usageSummary: null,
      reason:
        'Биллинг изображений/транскрипции не подключён. Стоимость — оценка по опубликованным ставкам.',
      requiredPermission: REQUIRED_AI,
    },
    {
      provider: 'infomaniak',
      providerLabel: 'Infomaniak VPS',
      status: 'manual',
      source: 'public-list-price',
      checkedAt,
      actualChargeEur: null,
      usageSummary: null,
      reason:
        'VPS выбран как SKU из публичного прайса. Счёт и VAT не читаются; цена помечена как manual.',
      requiredPermission:
        'Infomaniak billing read access (optional) to replace the list price with the paid invoice.',
    },
    {
      provider: 'cloudflare',
      providerLabel: 'Cloudflare Registrar',
      status: 'manual',
      source: 'public-list-price',
      checkedAt,
      actualChargeEur: null,
      usageSummary: null,
      reason: 'Домен рассчитан из годового at-cost тарифа, делённого на 12.',
      requiredPermission: null,
    },
    {
      provider: 'resend',
      providerLabel: 'Resend',
      status: 'manual',
      source: 'public-list-price',
      checkedAt,
      actualChargeEur: null,
      usageSummary: null,
      reason: 'План и объём писем заданы вручную; фактический usage API не подключён.',
      requiredPermission: 'Resend read-only usage/billing access (optional).',
    },
  ];
}

/** Best-effort bridge to the existing ledger. Never blocks the cost page. */
export async function loadDevLedgerSafe(userId: string): Promise<DevCostLedger | null> {
  try {
    return await getDevCostLedger(userId, { days: 30 });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'DEV_COST_LEDGER_FAILED';
    console.error('[Infrastructure] dev cost ledger unavailable', { code });
    return null;
  }
}
