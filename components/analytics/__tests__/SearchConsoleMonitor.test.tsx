/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';

import SearchConsoleMonitor from '@/components/analytics/SearchConsoleMonitor';
import type { AnalyticsDataset } from '@/lib/analytics/website/types';
import { normalizeAnalyticsDataset } from '@/lib/analytics/website/dashboardContract';
import {
  fixtureDashboard,
  fixtureSearchConsole,
} from '@/lib/analytics/website/__fixtures__/dashboardFixture';

function datasetFrom(
  mutate?: (dataset: Record<string, unknown>) => void
): AnalyticsDataset {
  const payload = fixtureDashboard();
  const dataset = payload.dataset as Record<string, unknown>;
  mutate?.(dataset);
  const normalized = normalizeAnalyticsDataset(dataset);
  if (!normalized) throw new Error('fixture dataset was rejected');
  return normalized;
}

function render(dataset: AnalyticsDataset): string {
  return renderToStaticMarkup(<SearchConsoleMonitor dataset={dataset} />);
}

describe('SearchConsoleMonitor state contract', () => {
  it('renders a complete payload as loaded with brand and non-brand segments', () => {
    const html = render(datasetFrom());

    expect(html).toContain('данные полные');
    expect(html).toContain('Брендовые запросы');
    expect(html).toContain('Небрендовые запросы');
    expect(html).not.toContain('Разбивка бренд/небренд недоступна');
  });

  it('renders a missing brand split as unavailable without fake zero rows', () => {
    const html = render(
      datasetFrom((dataset) => {
        const gsc = dataset.gsc as Record<string, unknown>;
        delete gsc.brand;
      })
    );

    expect(html).toContain('данные полные');
    expect(html).toContain('Разбивка бренд/небренд отсутствует');
    expect(html).not.toContain('Брендовые запросы');
    expect(html).not.toContain('Небрендовые запросы');
  });

  it('renders a partial GSC outage as partial and loaded, not as zero', () => {
    const html = render(
      datasetFrom((dataset) => {
        dataset.gsc = fixtureSearchConsole({ dataState: 'partial', freshness: 'stale' });
      })
    );

    expect(html).toContain('данные частичные');
    expect(html).toContain('Данные неполные или устаревшие');
    expect(html).not.toContain('Ноль не подставляется.');
  });

  it('distinguishes an empty connected source from an unavailable source', () => {
    const emptyHtml = render(
      datasetFrom((dataset) => {
        dataset.gsc = fixtureSearchConsole({
          available: false,
          dataState: 'stale',
          totals: {},
        });
      })
    );

    expect(emptyHtml).toContain('данных нет');
    expect(emptyHtml).toContain('Это не ноль показов');

    const unavailableHtml = render(
      datasetFrom((dataset) => {
        dataset.gsc = fixtureSearchConsole({
          available: false,
          dataState: 'unavailable',
          totals: {},
        });
        const sources = dataset.sources as Array<Record<string, unknown>>;
        sources[0] = { ...sources[0], status: 'error' };
      })
    );

    expect(unavailableHtml).toContain('недоступно');
    expect(unavailableHtml).toContain('Search Console недоступен');
  });

  it('does not invent values when table extras are missing', () => {
    const html = render(
      datasetFrom((dataset) => {
        dataset.gsc = fixtureSearchConsole({
          queries: [
            {
              key: 'pierrot',
              label: 'pierrot',
              value: 3,
              previous: null,
              deltaPercent: null,
              share: null,
            },
          ],
        });
      })
    );

    expect(html).toContain('pierrot');
    expect(html).toContain('—');
  });
});
