-- Migration: index the common analytics read path
-- Date: 2026-11-13
--
-- readMetricRows filters by provider and a date range and orders by
-- metric_date. The existing lookup index starts with report_type, so PostgreSQL
-- still sorts the result and writes temp blocks for larger ranges. This index
-- serves provider + date range + order directly.

CREATE INDEX IF NOT EXISTS analytics_metrics_daily_provider_date_idx
  ON public.analytics_metrics_daily (provider, metric_date);
