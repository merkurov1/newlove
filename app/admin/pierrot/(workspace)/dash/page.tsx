import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin, getServerSupabaseClient } from '@/lib/serverAuth';
import { loadWorkspaceOverview } from '@/lib/pierrot/workspace/data';
import { METRIC_STATE_COPY, metricDotTone } from '@/lib/pierrot/workspace/status';
import type { WorkspacePeriod } from '@/lib/pierrot/workspace/types';
import {
  commercialVerdict,
  formatCommercialMoney,
  russianCountLabel,
} from '@/lib/pierrot/commercialSummary';
import { loadAdminRagOverview } from '@/lib/analytics/adminRagOverview';
import {
  loadObservatorySnapshot,
  parseObservatoryFilters,
} from '@/lib/analytics/observatory';
import Sparkline from '@/components/pierrot/workspace/Sparkline';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'DASH',
};

function formatNumber(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('ru-RU').format(value);
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${value.toFixed(1)}%`;
}

function formatMs(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${Math.round(value)} мс`;
}

function productMoney(product: { money: Array<{ currency: string; amountMinor: number; count: number }> }) {
  return formatCommercialMoney(product.money) || '—';
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

  const [overview, observatory, rag] = await Promise.all([
    loadWorkspaceOverview(period),
    loadObservatorySnapshot(
      parseObservatoryFilters({ preset: period === 7 ? '7d' : '30d' })
    ).catch(() => null),
    Promise.resolve()
      .then(() => getServerSupabaseClient({ useServiceRole: true }))
      .then((store) => loadAdminRagOverview(store))
      .catch(() => null),
  ]);

  const commercial = overview.commercial;
  const verdict = commercialVerdict(commercial);
  const moneyAvailable =
    commercial.current.purchasesAvailable && commercial.current.donationsAvailable;
  const money = moneyAvailable
    ? formatCommercialMoney(commercial.current.money) || '—'
    : 'недоступно';
  const embeddedPercent =
    rag && rag.documents.chunks > 0
      ? (rag.documents.embeddedChunks / rag.documents.chunks) * 100
      : null;

  const pierrotRows: Array<[string, string]> = observatory
    ? [
        ['Сегодня', formatNumber(observatory.overview.conversationsToday)],
        ['За период', formatNumber(observatory.overview.totalConversations.value)],
        ['Сообщений', formatNumber(observatory.overview.totalMessages.value)],
        [
          'Средняя длина',
          `${formatNumber(observatory.overview.averageMessagesPerConversation.value)} сообщ.`,
        ],
        ['Вернувшиеся', formatNumber(observatory.overview.returningSessions)],
        [
          'Retrieval fail',
          formatPercent(observatory.intelligence.retrievalFailureRate),
        ],
        ['Негативный feedback', formatNumber(observatory.intelligence.negativeFeedback)],
        ['Ответ', formatMs(observatory.intelligence.averageResponseLatencyMs)],
      ]
    : [];

  const brainRows: Array<[string, string]> = rag
    ? [
        ['Документы', formatNumber(rag.documents.total)],
        ['Чанки', formatNumber(rag.documents.chunks)],
        ['Векторы', formatPercent(embeddedPercent)],
        ['Brain queue', formatNumber(rag.queues.brain.queued)],
        ['Graph queue', formatNumber(rag.queues.graph.queued)],
        ['Media queue', formatNumber(rag.queues.mediaAnalysis.queued)],
        ['Поиск · 30 д', formatNumber(rag.retrieval.attempts)],
        ['Найдено', formatPercent(
          rag.retrieval.attempts > 0
            ? (rag.retrieval.relevant / rag.retrieval.attempts) * 100
            : null
        )],
      ]
    : [];

  const mediaRows: Array<[string, string]> = rag
    ? [
        ['Записи', formatNumber(rag.media.records)],
        ['С текстом', formatNumber(rag.media.withDocument)],
        ['Цитаты', formatNumber(rag.media.quotes)],
        ['Темы', formatNumber(rag.media.topics)],
        ['Сущности', formatNumber(rag.media.entities)],
        ['Связи', formatNumber(rag.media.relations)],
      ]
    : [];

  return (
    <div className="pw-page pw-dash">
      <div className="pw-dash-inner">
        <header className="pw-dash-head">
          <div>
            <p className="pw-kicker">DASH · {period} дней</p>
            <h1 className="pw-dash-title">Всё спокойно.</h1>
            <p className="pw-dash-summary">{overview.summary}</p>
          </div>

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
        </header>

        <section className="pw-dash-metrics" aria-label="Пять показателей">
          {overview.metrics.map((metric) => (
            <article key={metric.key} className="pw-dash-metric">
              <div className="pw-dash-metric-label">
                <span
                  className={`pw-dot pw-dot-${metricDotTone(metric.state)}`}
                  aria-hidden="true"
                />
                <span>{metric.label}</span>
              </div>
              <div className="pw-dash-number">
                {metric.available ? formatNumber(metric.current) : '—'}
              </div>
              <div className="pw-dash-state">
                {metric.state ? METRIC_STATE_COPY[metric.state] : 'нет данных'}
              </div>
              <Sparkline series={metric.series} label={metric.label} />
              <p className="pw-dash-metric-sub">
                {metric.series
                  ? `+${formatNumber(metric.periodCount)} · было ${formatNumber(
                      metric.previousCount
                    )}`
                  : 'ряд недоступен'}
              </p>
            </article>
          ))}
        </section>

        <section className="pw-dash-commercial" aria-label="Коммерческий отчёт">
          <div className="pw-dash-commercial-main">
            <p className="pw-kicker">Коммерция · {commercial.periodLabel}</p>
            <p className={`pw-dash-verdict pw-commercial-${verdict.tone}`}>
              {verdict.headline}
            </p>
            <p className="pw-dash-detail">{verdict.detail}</p>
            {observatory && (
              <p className="pw-dash-checkout">
                Checkout начали: {formatNumber(observatory.commercial.checkoutStarts)} ·
                не завершили: {formatPercent(observatory.commercial.abandonmentRate)}
              </p>
            )}
          </div>

          <div className="pw-dash-money">
            <span className="pw-kicker">Сумма</span>
            <strong>{money}</strong>
          </div>

          <div className="pw-dash-products">
            <div>
              <span>Heart &amp; Angel</span>
              <strong>
                {commercial.current.purchasesAvailable
                  ? russianCountLabel(
                      commercial.current.postcards.count,
                      'оплата',
                      'оплаты',
                      'оплат'
                    )
                  : 'недоступно'}
              </strong>
              <em>
                {commercial.current.purchasesAvailable
                  ? productMoney(commercial.current.postcards)
                  : '—'}
              </em>
            </div>
            <div>
              <span>UNFRAMED</span>
              <strong>
                {commercial.current.purchasesAvailable
                  ? russianCountLabel(
                      commercial.current.unframed.count,
                      'покупка',
                      'покупки',
                      'покупок'
                    )
                  : 'недоступно'}
              </strong>
              <em>
                {commercial.current.purchasesAvailable
                  ? productMoney(commercial.current.unframed)
                  : '—'}
              </em>
            </div>
            <div>
              <span>Temple Tributes</span>
              <strong>
                {commercial.current.donationsAvailable
                  ? russianCountLabel(
                      commercial.current.tributes.count,
                      'пожертвование',
                      'пожертвования',
                      'пожертвований'
                    )
                  : 'недоступно'}
              </strong>
              <em>
                {commercial.current.donationsAvailable
                  ? productMoney(commercial.current.tributes)
                  : '—'}
              </em>
            </div>
            <div>
              <span>Flow</span>
              <strong>
                {commercial.current.subscriptionsAvailable
                  ? `+${formatNumber(commercial.current.flowSubscriptions)}`
                  : 'недоступно'}
              </strong>
              <em>{commercial.current.subscriptionsAvailable ? 'подписок' : '—'}</em>
            </div>
          </div>

          {!commercial.complete && (
            <p className="pw-dash-partial">
              Часть источников недоступна: {commercial.errors.join(' · ')}
            </p>
          )}
        </section>

        <div className="pw-dash-panels">
          <section className="pw-dash-panel" aria-labelledby="pw-dash-pierrot">
            <div className="pw-dash-panel-head">
              <h2 id="pw-dash-pierrot">Pierrot</h2>
              <span>{period} дней</span>
            </div>
            {pierrotRows.length > 0 ? (
              <div className="pw-dash-rows">
                {pierrotRows.map(([label, value]) => (
                  <div key={label} className="pw-dash-row">
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="pw-dash-missing">Данные наблюдения недоступны.</p>
            )}
          </section>

          <section className="pw-dash-panel" aria-labelledby="pw-dash-brain">
            <div className="pw-dash-panel-head">
              <h2 id="pw-dash-brain">Brain</h2>
              <span>индекс</span>
            </div>
            {brainRows.length > 0 ? (
              <div className="pw-dash-rows">
                {brainRows.map(([label, value]) => (
                  <div key={label} className="pw-dash-row">
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="pw-dash-missing">Индекс Brain недоступен.</p>
            )}
          </section>

          <section className="pw-dash-panel" aria-labelledby="pw-dash-media">
            <div className="pw-dash-panel-head">
              <h2 id="pw-dash-media">Media</h2>
              <span>архив</span>
            </div>
            {mediaRows.length > 0 ? (
              <div className="pw-dash-rows">
                {mediaRows.map(([label, value]) => (
                  <div key={label} className="pw-dash-row">
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="pw-dash-missing">Media archive недоступен.</p>
            )}
          </section>
        </div>

        <p className="pw-dash-foot">
          Только реальные значения из существующих таблиц и views. Период: {period} дней.
          Отсутствующие данные не заменяются нулём. Коммерция считает только подтверждённые
          оплаты и подписки; checkout и интерес — не выручка.
        </p>
      </div>
    </div>
  );
}
