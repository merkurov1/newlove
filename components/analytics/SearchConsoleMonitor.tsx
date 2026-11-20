import type {
  AnalyticsDataset,
  MetricComparison,
  SearchAnomaly,
  SearchConsoleSnapshot,
  SearchSegmentSummary,
} from '@/lib/analytics/website/types';

import { getAnalyticsTimezone } from '@/lib/analytics/website/config';

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value);
}

function formatMetric(metric: MetricComparison): string {
  if (!metric.available || metric.value === null) return '—';
  if (metric.unit === 'percent') {
    return `${metric.value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%`;
  }
  if (metric.unit === 'position') {
    return metric.value.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
  }
  return formatNumber(metric.value);
}

function formatPrevious(metric: MetricComparison): string {
  if (metric.previous === null || !Number.isFinite(metric.previous)) return '—';
  if (metric.unit === 'percent') {
    return `${metric.previous.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%`;
  }
  if (metric.unit === 'position') {
    return metric.previous.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
  }
  return formatNumber(metric.previous);
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%`;
}

function formatPosition(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: getAnalyticsTimezone(),
  }).format(date);
}

function stateLabel(gsc: SearchConsoleSnapshot): string {
  switch (gsc.dataState) {
    case 'complete':
      return 'данные полные';
    case 'partial':
      return 'данные частичные';
    case 'stale':
      return 'данные устарели';
    case 'not_configured':
      return 'не настроено';
    default:
      return 'недоступно';
  }
}

function stateTone(gsc: SearchConsoleSnapshot): string {
  if (gsc.dataState === 'complete') return 'growth';
  if (gsc.dataState === 'partial' || gsc.dataState === 'stale') return 'attention';
  return 'missing';
}

function Delta({ value }: { value: number | null }) {
  if (value === null || !Number.isFinite(value)) return <span className="pw-gsc-muted">—</span>;
  const tone = value < 0 ? 'down' : value > 0 ? 'up' : 'flat';
  return (
    <span className={`pw-gsc-delta pw-gsc-delta--${tone}`}>
      {value > 0 ? '+' : ''}
      {value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%
    </span>
  );
}

function MetricCard({ metric }: { metric: MetricComparison }) {
  return (
    <article className="pw-gsc-metric">
      <span className="pw-gsc-metric-label">{metric.label}</span>
      <strong>{formatMetric(metric)}</strong>
      <span className="pw-gsc-metric-previous">
        было {formatPrevious(metric)} · <Delta value={metric.deltaPercent} />
      </span>
      {!metric.available && (
        <span className="pw-gsc-muted">{metric.unavailableReason || 'нет данных'}</span>
      )}
    </article>
  );
}

function SegmentRow({ segment }: { segment: SearchSegmentSummary }) {
  return (
    <tr>
      <td>{segment.label}</td>
      <td>{formatNumber(segment.clicks)}</td>
      <td>{formatNumber(segment.impressions)}</td>
      <td>{formatPercent(segment.ctr)}</td>
      <td>{formatPosition(segment.position)}</td>
      <td>
        <Delta value={segment.impressionsDeltaPercent} />
      </td>
      <td>
        {segment.previousImpressions === null ? '—' : formatNumber(segment.previousImpressions)}
      </td>
    </tr>
  );
}

function TopTable({
  title,
  rows,
  limit = 8,
}: {
  title: string;
  rows: SearchConsoleSnapshot['queries'];
  limit?: number;
}) {
  return (
    <div className="pw-gsc-table-wrap">
      <h4>{title}</h4>
      {rows.length === 0 ? (
        <p className="pw-gsc-muted">Нет строк за выбранный период.</p>
      ) : (
        <table className="pw-gsc-table">
          <thead>
            <tr>
              <th>Срез</th>
              <th>Клики</th>
              <th>Показы</th>
              <th>CTR</th>
              <th>Позиция</th>
              <th>Δ показов</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((row) => (
              <tr key={row.key}>
                <td title={row.label}>{row.label}</td>
                <td>{formatNumber(row.value)}</td>
                <td>{formatNumber(Number(row.extra?.impressions ?? 0))}</td>
                <td>{formatPercent(Number(row.extra?.ctr ?? 0) * 100)}</td>
                <td>{formatPosition(Number(row.extra?.position ?? NaN))}</td>
                <td>
                  <Delta value={row.deltaPercent} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function AnomalyList({ anomalies }: { anomalies: SearchAnomaly[] }) {
  if (anomalies.length === 0) {
    return (
      <p className="pw-gsc-muted">
        Существенных аномалий по заданным порогам нет. Это не доказывает отсутствие изменений:
        пороги отсекают малые выборки.
      </p>
    );
  }

  return (
    <ul className="pw-gsc-anomalies">
      {anomalies.map((anomaly) => (
        <li key={anomaly.key}>
          <strong>{anomaly.label}</strong> <Delta value={anomaly.deltaPercent} /> ·{' '}
          {formatNumber(anomaly.previous)} → {formatNumber(anomaly.current)} · выборка{' '}
          {formatNumber(anomaly.sample)}
          <span className="pw-gsc-anomaly-note">{anomaly.note}</span>
        </li>
      ))}
    </ul>
  );
}

export default function SearchConsoleMonitor({ dataset }: { dataset: AnalyticsDataset }) {
  const gsc = dataset.gsc;
  const period = dataset.period;
  const source = dataset.sources.find((entry) => entry.provider === 'search_console') ?? null;
  const comparisonAvailable = gsc.totals.clicks.previous !== null;
  const gaps = dataset.dataGaps.filter((gap) => /search_console/i.test(gap));

  if (!gsc.available) {
    const reason =
      gsc.dataState === 'not_configured'
        ? 'Google OAuth для Search Console не настроен. Показатели не подставляются нулём.'
        : gsc.dataState === 'stale'
          ? 'Сохранённых строк Search Console за это окно нет. Источник не равен нулю показов.'
          : 'Search Console недоступен или не выдал сохранённых строк за выбранный период. Ноль не подставляется.';

    return (
      <section className="pw-analytics-gsc" aria-labelledby="pw-analytics-gsc-title">
        <div className="pw-analytics-charts-head">
          <div>
            <p className="pw-kicker">GOOGLE SEARCH CONSOLE</p>
            <h2 id="pw-analytics-gsc-title">Поисковая видимость</h2>
          </div>
          <span className="pw-analytics-badge">{stateLabel(gsc)}</span>
        </div>
        <p className="pw-analytics-action">{reason}</p>
        <dl className="pw-gsc-meta">
          <div>
            <dt>Property</dt>
            <dd>{gsc.property || '—'}</dd>
          </div>
          <div>
            <dt>Search type</dt>
            <dd>{gsc.searchType}</dd>
          </div>
          <div>
            <dt>Последняя успешная синхронизация</dt>
            <dd>{formatDate(gsc.lastSuccessfulSyncAt ?? source?.lastSuccessAt ?? null)}</dd>
          </div>
          <div>
            <dt>Период</dt>
            <dd>
              {period.start} — {period.end}
            </dd>
          </div>
        </dl>
        {source?.actionRequired && <p className="pw-analytics-hint">{source.actionRequired}</p>}
        {gaps.map((gap) => (
          <p className="pw-analytics-error" key={gap}>
            {gap}
          </p>
        ))}
      </section>
    );
  }

  return (
    <section className="pw-analytics-gsc" aria-labelledby="pw-analytics-gsc-title">
      <div className="pw-analytics-charts-head">
        <div>
          <p className="pw-kicker">GOOGLE SEARCH CONSOLE · READ-ONLY</p>
          <h2 id="pw-analytics-gsc-title">Поисковая видимость</h2>
          <p className="pw-analytics-hint">
            {period.label} против {period.previousLabel}. Property{' '}
            <code>{gsc.property || '—'}</code> · type <code>{gsc.searchType}</code> · задержка{' '}
            {gsc.reportingDelayDays} дн. · ожидаемые полные данные до{' '}
            <strong>{gsc.expectedDataTo || '—'}</strong>.
          </p>
        </div>
        <span className={`pw-analytics-badge pw-gsc-state--${stateTone(gsc)}`}>
          {stateLabel(gsc)}
        </span>
      </div>

      {gsc.dataState !== 'complete' && (
        <p className="pw-analytics-action">
          Данные неполные или устаревшие. Нижние дни после ожидаемой даты исключены из итогов, а
          сравнение с предыдущим окном может быть скрыто.
        </p>
      )}
      {!comparisonAvailable && (
        <p className="pw-analytics-hint">
          Сравнение с предыдущим окном недоступно: покрытие текущего или предыдущего периода
          неполное. Значения не заменяются нулём и не называются ростом.
        </p>
      )}

      <div className="pw-gsc-metrics">
        <MetricCard metric={gsc.totals.clicks} />
        <MetricCard metric={gsc.totals.impressions} />
        <MetricCard metric={gsc.totals.ctr} />
        <MetricCard metric={gsc.totals.position} />
      </div>

      <div className="pw-gsc-section">
        <h3>Бренд и небренд</h3>
        <table className="pw-gsc-table">
          <thead>
            <tr>
              <th>Сегмент</th>
              <th>Клики</th>
              <th>Показы</th>
              <th>CTR</th>
              <th>Позиция</th>
              <th>Δ показов</th>
              <th>Показы ранее</th>
            </tr>
          </thead>
          <tbody>
            <SegmentRow segment={gsc.brand.brand} />
            <SegmentRow segment={gsc.brand.nonBrand} />
          </tbody>
        </table>
        <p className="pw-analytics-hint">
          {gsc.brand.heuristic} Термины: {gsc.brand.brandTerms.join(', ') || '—'}.
        </p>
      </div>

      <div className="pw-gsc-section">
        <h3>Существенные аномалии</h3>
        <AnomalyList anomalies={gsc.anomalies} />
      </div>

      <div className="pw-gsc-grid">
        <TopTable title="Топ запросов" rows={gsc.queries} />
        <TopTable title="Топ страниц" rows={gsc.pages} />
        <TopTable title="Страны" rows={gsc.countries} />
        <TopTable title="Устройства" rows={gsc.devices} />
      </div>

      <div className="pw-gsc-section">
        <h3>Низкий CTR при заметных показах</h3>
        {gsc.lowCtrPages.length === 0 ? (
          <p className="pw-gsc-muted">
            Нет страниц выше порога выборки (не менее 30 показов и доля от общего объёма). Малые
            показы не считаются доказательством проблемы.
          </p>
        ) : (
          <ul className="pw-gsc-opportunities">
            {gsc.lowCtrPages.slice(0, 6).map((row) => (
              <li key={row.page}>
                <code>{row.page}</code> · {formatNumber(row.impressions)} показов ·{' '}
                {formatNumber(row.clicks)} кликов · CTR {formatPercent(row.ctr * 100)} · позиция{' '}
                {formatPosition(row.position)}
              </li>
            ))}
          </ul>
        )}
      </div>

      <dl className="pw-gsc-meta">
        <div>
          <dt>Property</dt>
          <dd>{gsc.property || '—'}</dd>
        </div>
        <div>
          <dt>Search type</dt>
          <dd>{gsc.searchType}</dd>
        </div>
        <div>
          <dt>Ожидаемые полные данные до</dt>
          <dd>{gsc.expectedDataTo || '—'}</dd>
        </div>
        <div>
          <dt>Свежесть</dt>
          <dd>{gsc.freshness}</dd>
        </div>
        <div>
          <dt>Последняя успешная синхронизация</dt>
          <dd>{formatDate(gsc.lastSuccessfulSyncAt ?? source?.lastSuccessAt ?? null)}</dd>
        </div>
        <div>
          <dt>Последняя попытка</dt>
          <dd>{formatDate(source?.lastSyncAt ?? null)}</dd>
        </div>
      </dl>

      {source?.lastErrorCode && (
        <p className="pw-analytics-error">
          {source.lastErrorCode}: {source.lastErrorMessage || 'ошибка источника'}
        </p>
      )}
      {gaps.map((gap) => (
        <p className="pw-analytics-error" key={gap}>
          {gap}
        </p>
      ))}

      <p className="pw-analytics-hint">
        Показы не равны визитам, CTR не является конверсией, а средняя позиция — не позиция
        конкретной страницы. Search Console скрывает часть запросов и не отдаёт search appearance
        через Search Analytics API.
      </p>
    </section>
  );
}
