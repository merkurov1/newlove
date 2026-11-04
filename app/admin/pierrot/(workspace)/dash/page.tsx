import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '@/lib/serverAuth';
import { loadWorkspaceOverview } from '@/lib/pierrot/workspace/data';
import { METRIC_STATE_COPY, metricDotTone } from '@/lib/pierrot/workspace/status';
import type { WorkspacePeriod } from '@/lib/pierrot/workspace/types';
import Sparkline from '@/components/pierrot/workspace/Sparkline';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'DASH',
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value);
}

export default async function DashPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  await requireAdmin();

  const raw = Array.isArray(searchParams?.period)
    ? searchParams?.period[0]
    : searchParams?.period;
  const period: WorkspacePeriod = raw === '30' ? 30 : 7;
  const overview = await loadWorkspaceOverview(period);

  return (
    <div className="pw-page">
      <div className="pw-page-inner">
        <p className="pw-kicker">DASH · {period} дней</p>
        <h1 className="pw-page-title">Всё спокойно.</h1>
        <p className="pw-page-lede">{overview.summary}</p>

        <nav className="pw-segmented" aria-label="Период наблюдения">
          <Link
            href="/admin/pierrot/dash?period=7"
            aria-current={period === 7 ? 'page' : undefined}
          >
            7 дней
          </Link>
          <Link
            href="/admin/pierrot/dash?period=30"
            aria-current={period === 30 ? 'page' : undefined}
          >
            30 дней
          </Link>
        </nav>

        <div className="pw-metrics">
          {overview.metrics.map((metric) => (
            <div key={metric.key} className="pw-metric-row">
              <div>
                <div className="pw-metric-label">
                  <span
                    className={`pw-dot pw-dot-${metricDotTone(metric.state)}`}
                    aria-hidden="true"
                  />
                  {metric.label}
                </div>
                <div className="pw-metric-state">
                  {metric.state ? METRIC_STATE_COPY[metric.state] : 'нет данных'}
                </div>
              </div>

              <div>
                <div className="pw-metric-number">
                  {metric.available ? formatNumber(metric.current) : '—'}
                </div>
                <p className="pw-metric-sub">
                  {metric.series
                    ? `+${formatNumber(metric.periodCount)} за период · было ${formatNumber(
                        metric.previousCount
                      )}`
                    : 'исторический ряд недоступен'}
                </p>
              </div>

              <Sparkline series={metric.series} label={metric.label} />
            </div>
          ))}
        </div>

        <p className="pw-kicker" style={{ marginTop: 24 }}>
          Сравнение с предыдущими {period} днями. Данные читаются из существующих таблиц;
          отсутствующий ряд не заменяется нулём.
        </p>
      </div>
    </div>
  );
}
