import { assertServerOnly } from '@/lib/serverOnly';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getAnalyticsTimezone } from './config';
import { loadAnalyticsDataset } from './dataset';
import {
  WEBSITE_DASHBOARD_SCHEMA_VERSION,
  normalizeWebsiteDashboard,
  type WebsiteDashboardPayload,
} from './dashboardContract';
import { periodForPreset } from './period';

assertServerOnly('lib/analytics/website/dashboard');

export type WebsiteDashboard = WebsiteDashboardPayload;

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

  const dashboard = normalizeWebsiteDashboard({
    schemaVersion: WEBSITE_DASHBOARD_SCHEMA_VERSION,
    period,
    dataset,
    sessionsSeries: dataset.ga4.series.map((point) => point.sessions),
    clicksSeries: dataset.gsc.series.map((point) => point.clicks),
    hasExternalData: dataset.ga4.available || dataset.gsc.available || dataset.umami.available,
  });

  if (!dashboard) {
    throw new Error('Website analytics dataset did not match the dashboard schema.');
  }

  return dashboard;
}

export {
  WEBSITE_DASHBOARD_CACHE_KEY,
  WEBSITE_DASHBOARD_SCHEMA_VERSION,
  normalizeAnalyticsDataset,
  normalizeNewsletterSignals,
  normalizeSearchBrandSplit,
  normalizeSearchConsoleSnapshot,
  normalizeWebsiteDashboard,
} from './dashboardContract';
export type { WebsiteDashboardPayload } from './dashboardContract';
