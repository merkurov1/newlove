import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getAnalyticsTimezone } from './config';
import { resolveWebsitePeriod } from './period';
import { buildWebsiteAnalyticsReport, websiteQuestionFromScope } from './report';
import type {
  AnalyticsLanguage,
  AnalyticsReport,
  WebsiteQuestion,
  WebsiteQuestionScope,
} from './types';

assertServerOnly('lib/analytics/website/tools');

/**
 * Named owner tools. They are thin, explicit entry points over the same data
 * layer used by the chat report, so a tool call and a natural-language answer
 * can never disagree about definitions.
 */
export const WEBSITE_ANALYTICS_TOOL_NAMES = [
  'get_website_overview',
  'get_traffic_analytics',
  'get_search_performance',
  'get_page_performance',
  'compare_analytics_periods',
  'get_project_performance',
  'get_conversion_funnel',
  'find_content_opportunities',
  'detect_analytics_anomalies',
  'get_source_health',
  'get_analytics_evidence',
] as const;

export type WebsiteAnalyticsToolName = (typeof WEBSITE_ANALYTICS_TOOL_NAMES)[number];

export function websiteToolForScope(scope: WebsiteQuestionScope): WebsiteAnalyticsToolName {
  const map: Record<WebsiteQuestionScope, WebsiteAnalyticsToolName> = {
    overview: 'get_website_overview',
    traffic: 'get_traffic_analytics',
    search: 'get_search_performance',
    pages: 'get_page_performance',
    compare: 'compare_analytics_periods',
    projects: 'get_project_performance',
    funnel: 'get_conversion_funnel',
    opportunities: 'find_content_opportunities',
    anomalies: 'detect_analytics_anomalies',
    health: 'get_source_health',
    evidence: 'get_analytics_evidence',
  };

  return map[scope];
}

export type WebsiteToolOptions = {
  language?: AnalyticsLanguage;
  store?: SupabaseClient;
  now?: Date;
  periodKey?: WebsiteQuestion['periodKey'];
  customPeriod?: { start: string; end: string };
  days?: 7 | 30 | 90;
  project?: string | null;
};

function periodForOptions(options: WebsiteToolOptions): {
  periodKey: WebsiteQuestion['periodKey'];
  customPeriod?: { start: string; end: string };
} {
  if (options.customPeriod) {
    return { periodKey: 'custom', customPeriod: options.customPeriod };
  }

  if (options.days && options.days !== 7 && options.days !== 30) {
    const timezone = getAnalyticsTimezone();
    const now = options.now ?? new Date();
    const ended = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    const startDate = new Date(`${ended}T00:00:00.000Z`);
    startDate.setUTCDate(startDate.getUTCDate() - (options.days - 1));

    return {
      periodKey: 'custom',
      customPeriod: { start: startDate.toISOString().slice(0, 10), end: ended },
    };
  }

  if (options.days === 30) return { periodKey: 'last_30_days' };
  if (options.days === 7) return { periodKey: 'last_7_days' };

  return { periodKey: options.periodKey ?? 'last_7_days' };
}

function scopeToQuestion(scope: WebsiteQuestionScope, options: WebsiteToolOptions): WebsiteQuestion {
  const period = periodForOptions(options);

  return {
    ...websiteQuestionFromScope(scope, {
      project: options.project ?? null,
      comparison: scope === 'compare',
      periodKey: period.periodKey,
    }),
    ...(period.customPeriod ? { customPeriod: period.customPeriod } : {}),
  };
}

async function run(
  scope: WebsiteQuestionScope,
  options: WebsiteToolOptions
): Promise<AnalyticsReport> {
  return buildWebsiteAnalyticsReport({
    question: scopeToQuestion(scope, options),
    language: options.language ?? 'ru',
    store: options.store,
    now: options.now,
  });
}

export function get_website_overview(options: WebsiteToolOptions = {}) {
  return run('overview', options);
}

export function get_traffic_analytics(options: WebsiteToolOptions = {}) {
  return run('traffic', options);
}

export function get_search_performance(options: WebsiteToolOptions = {}) {
  return run('search', options);
}

export function get_page_performance(options: WebsiteToolOptions = {}) {
  return run('pages', options);
}

export function compare_analytics_periods(options: WebsiteToolOptions = {}) {
  return run('compare', { ...options, periodKey: options.periodKey ?? 'last_30_days' });
}

export function get_project_performance(
  project: string,
  options: WebsiteToolOptions = {}
) {
  return run('projects', { ...options, project });
}

export function get_conversion_funnel(options: WebsiteToolOptions = {}) {
  return run('funnel', options);
}

export function find_content_opportunities(options: WebsiteToolOptions = {}) {
  return run('opportunities', options);
}

export function detect_analytics_anomalies(options: WebsiteToolOptions = {}) {
  return run('anomalies', options);
}

export function get_source_health(options: WebsiteToolOptions = {}) {
  return run('health', options);
}

export function get_analytics_evidence(options: WebsiteToolOptions = {}) {
  return run('evidence', options);
}

export async function runWebsiteAnalyticsTool(
  name: WebsiteAnalyticsToolName,
  options: WebsiteToolOptions = {}
): Promise<AnalyticsReport> {
  switch (name) {
    case 'get_website_overview':
      return get_website_overview(options);
    case 'get_traffic_analytics':
      return get_traffic_analytics(options);
    case 'get_search_performance':
      return get_search_performance(options);
    case 'get_page_performance':
      return get_page_performance(options);
    case 'compare_analytics_periods':
      return compare_analytics_periods(options);
    case 'get_project_performance':
      return get_project_performance(options.project || 'flow', options);
    case 'get_conversion_funnel':
      return get_conversion_funnel(options);
    case 'find_content_opportunities':
      return find_content_opportunities(options);
    case 'detect_analytics_anomalies':
      return detect_analytics_anomalies(options);
    case 'get_source_health':
      return get_source_health(options);
    case 'get_analytics_evidence':
      return get_analytics_evidence(options);
    default:
      return get_website_overview(options);
  }
}

export { resolveWebsitePeriod };
