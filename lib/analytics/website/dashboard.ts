import { assertServerOnly } from '@/lib/serverOnly';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getAnalyticsTimezone } from './config';
import { loadAnalyticsDataset } from './dataset';
import { periodForPreset } from './period';
import type { AnalyticsDataset, AnalyticsPeriod } from './types';

assertServerOnly('lib/analytics/website/dashboard');

export type WebsiteDashboard = {
  period: AnalyticsPeriod;
  dataset: AnalyticsDataset;
  sessionsSeries: number[];
  clicksSeries: number[];
  hasExternalData: boolean;
};

/**
 * The DASH screen uses the same normalized data layer as Pierrot's chat
 * answers. It does not call provider APIs on page render.
 */
export async function loadWebsiteDashboard(input: {
  days?: 7 | 30 | 90;
  store?: SupabaseClient;
  now?: Date;
} = {}): Promise<WebsiteDashboard> {
  const store = input.store ?? getServerSupabaseClient({ useServiceRole: true });
  const period = periodForPreset(input.days ?? 7, getAnalyticsTimezone(), input.now);
  const dataset = await loadAnalyticsDataset({ period, store });

  return {
    period,
    dataset,
    sessionsSeries: dataset.ga4.series.map((point) => point.sessions),
    clicksSeries: dataset.gsc.series.map((point) => point.clicks),
    hasExternalData: dataset.ga4.available || dataset.gsc.available || dataset.umami.available,
  };
}
