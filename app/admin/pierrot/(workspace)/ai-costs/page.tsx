import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin, getServerSupabaseClient } from '@/lib/serverAuth';
import { loadLlmTelemetryReport } from '@/lib/ai/telemetryReport';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'AI COSTS',
};

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function formatNumber(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-GB').format(value);
}

function formatUsd(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'unknown';
  return `$${value.toFixed(4)}`;
}

export default async function AiCostsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  await requireAdmin();

  const raw = Array.isArray(searchParams?.period) ? searchParams?.period[0] : searchParams?.period;
  const period = raw === '30' ? 30 : 7;

  const store = getServerSupabaseClient({ useServiceRole: true });
  const report = await loadLlmTelemetryReport(store, {
    from: isoDaysAgo(period),
    to: new Date().toISOString(),
  });

  const totals = report.totals;

  return (
    <div className="pw-page pw-dash">
      <div className="pw-dash-inner">
        <header className="pw-dash-head">
          <div>
            <p className="pw-kicker">AI TELEMETRY · {period} дней</p>
            <h1 className="pw-dash-title">Вызовы, а не догадки.</h1>
            <p className="pw-dash-summary">
              Одна строка на попытку провайдера. Fallback и retry считаются отдельно. Пустые токены
              и цены остаются unknown и не превращаются в ноль.
            </p>
          </div>

          <div className="pw-dash-head-actions">
            <nav className="pw-segmented" aria-label="Период наблюдения">
              <Link
                href="/admin/pierrot/ai-costs?period=7"
                aria-current={period === 7 ? 'page' : undefined}
              >
                7 дней
              </Link>
              <Link
                href="/admin/pierrot/ai-costs?period=30"
                aria-current={period === 30 ? 'page' : undefined}
              >
                30 дней
              </Link>
            </nav>
            <Link className="pw-dash-infra-link" href="/admin/pierrot/dash">
              ← DASH
            </Link>
          </div>
        </header>

        {!report.available ? (
          <section className="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Telemetry is not available.</p>
            <p className="mt-1 font-mono text-xs">{report.unavailableReason}</p>
            <p className="mt-2">
              Apply <code>migrations/2026-11-18_pierrot_llm_call_telemetry.sql</code> manually.
              Until then, failed calls are emitted only as redacted server logs.
            </p>
          </section>
        ) : null}

        <section className="pw-dash-metrics" aria-label="AI telemetry totals">
          <article className="pw-dash-metric">
            <p className="pw-dash-metric-label">Messages</p>
            <p className="pw-dash-number">{formatNumber(totals.messages)}</p>
            <p className="pw-dash-metric-sub">assistant_replied events</p>
          </article>
          <article className="pw-dash-metric">
            <p className="pw-dash-metric-label">Provider calls</p>
            <p className="pw-dash-number">{formatNumber(totals.calls)}</p>
            <p className="pw-dash-metric-sub">
              {formatNumber(totals.successfulCalls)} ok · {formatNumber(totals.failedCalls)} failed
            </p>
          </article>
          <article className="pw-dash-metric">
            <p className="pw-dash-metric-label">Retries / fallbacks</p>
            <p className="pw-dash-number">{formatNumber(totals.retries)}</p>
            <p className="pw-dash-metric-sub">attempt &gt; 1</p>
          </article>
          <article className="pw-dash-metric">
            <p className="pw-dash-metric-label">Tokens</p>
            <p className="pw-dash-number">{formatNumber(totals.totalTokens)}</p>
            <p className="pw-dash-metric-sub">
              in {formatNumber(totals.inputTokens)} · out {formatNumber(totals.outputTokens)} ·{' '}
              {formatNumber(totals.unknownUsageCalls)} unknown
            </p>
          </article>
          <article className="pw-dash-metric">
            <p className="pw-dash-metric-label">Estimated cost</p>
            <p className="pw-dash-number">{formatUsd(totals.estimatedCostUsd)}</p>
            <p className="pw-dash-metric-sub">
              {formatNumber(totals.estimatedCostCalls)} calls priced ·{' '}
              {formatNumber(totals.unknownCostCalls)} unknown
            </p>
          </article>
          <article className="pw-dash-metric">
            <p className="pw-dash-metric-label">Provider-reported cost</p>
            <p className="pw-dash-number">{formatUsd(totals.providerReportedCostUsd)}</p>
            <p className="pw-dash-metric-sub">
              {formatNumber(totals.providerReportedCalls)} calls reported by the provider
            </p>
          </article>
        </section>

        <section className="mt-8 overflow-x-auto">
          <h2 className="font-serif text-2xl">By provider and model</h2>
          <table className="mt-4 w-full min-w-[860px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[#D9D3CD] font-mono text-[10px] uppercase tracking-[0.14em] text-[#746D66]">
                <th className="py-2 pr-4">Provider / model</th>
                <th className="py-2 pr-4">Surface</th>
                <th className="py-2 pr-4">Calls</th>
                <th className="py-2 pr-4">Ok / failed</th>
                <th className="py-2 pr-4">Retries</th>
                <th className="py-2 pr-4">Tokens in / out</th>
                <th className="py-2 pr-4">Unknown usage</th>
                <th className="py-2 pr-4">Estimated</th>
                <th className="py-2">Provider reported</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.length === 0 ? (
                <tr>
                  <td className="py-6 text-[#746D66]" colSpan={9}>
                    No provider attempts recorded in this period.
                  </td>
                </tr>
              ) : (
                report.rows.map((row) => (
                  <tr
                    key={`${row.provider}:${row.model}:${row.surface}`}
                    className="border-b border-[#EDE9E4] align-top"
                  >
                    <td className="py-3 pr-4">
                      <span className="font-medium">{row.provider}</span>
                      <br />
                      <span className="font-mono text-[11px] text-[#746D66]">{row.model}</span>
                    </td>
                    <td className="py-3 pr-4 font-mono text-[11px]">{row.surface}</td>
                    <td className="py-3 pr-4">{formatNumber(row.calls)}</td>
                    <td className="py-3 pr-4">
                      {formatNumber(row.successfulCalls)} / {formatNumber(row.failedCalls)}
                    </td>
                    <td className="py-3 pr-4">{formatNumber(row.retries)}</td>
                    <td className="py-3 pr-4">
                      {formatNumber(row.inputTokens)} / {formatNumber(row.outputTokens)}
                    </td>
                    <td className="py-3 pr-4">{formatNumber(row.unknownUsageCalls)}</td>
                    <td className="py-3 pr-4">{formatUsd(row.estimatedCostUsd)}</td>
                    <td className="py-3">{formatUsd(row.providerReportedCostUsd)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section className="mt-8 border-t border-[#D9D3CD] pt-4 text-xs leading-relaxed text-[#746D66]">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.18em]">Limitations</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {report.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
