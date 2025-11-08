-- Migration: Create newsletter_jobs table for background processing
-- Date: 2025-11-08
-- Purpose: Enable scalable newsletter sending for >100 subscribers

-- Create newsletter_jobs table
CREATE TABLE IF NOT EXISTS public.newsletter_jobs (
  id TEXT PRIMARY KEY,
  letter_id TEXT NOT NULL REFERENCES public.letters(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  total_count INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS newsletter_jobs_status_idx ON public.newsletter_jobs (status);
CREATE INDEX IF NOT EXISTS newsletter_jobs_letter_id_idx ON public.newsletter_jobs (letter_id);
CREATE INDEX IF NOT EXISTS newsletter_jobs_created_at_idx ON public.newsletter_jobs (created_at DESC);

-- Create newsletter_logs table for detailed send tracking
CREATE TABLE IF NOT EXISTS public.newsletter_logs (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES public.newsletter_jobs(id) ON DELETE CASCADE,
  subscriber_id TEXT NOT NULL REFERENCES public.subscribers(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'bounced', 'skipped')),
  error_message TEXT,
  provider_id TEXT,          -- Resend email ID
  provider_response JSONB,   -- Full provider response for debugging
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for newsletter_logs
CREATE INDEX IF NOT EXISTS newsletter_logs_job_id_idx ON public.newsletter_logs (job_id);
CREATE INDEX IF NOT EXISTS newsletter_logs_subscriber_id_idx ON public.newsletter_logs (subscriber_id);
CREATE INDEX IF NOT EXISTS newsletter_logs_status_idx ON public.newsletter_logs (status);
CREATE INDEX IF NOT EXISTS newsletter_logs_sent_at_idx ON public.newsletter_logs (sent_at DESC);

-- Enable RLS
ALTER TABLE public.newsletter_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for newsletter_jobs
DROP POLICY IF EXISTS "Admin can view all jobs" ON public.newsletter_jobs;
CREATE POLICY "Admin can view all jobs"
  ON public.newsletter_jobs FOR SELECT
  TO authenticated
  USING (true);  -- In production, add admin role check

DROP POLICY IF EXISTS "Service role can manage jobs" ON public.newsletter_jobs;
CREATE POLICY "Service role can manage jobs"
  ON public.newsletter_jobs FOR ALL
  TO service_role
  USING (true);

-- RLS Policies for newsletter_logs
DROP POLICY IF EXISTS "Admin can view all logs" ON public.newsletter_logs;
CREATE POLICY "Admin can view all logs"
  ON public.newsletter_logs FOR SELECT
  TO authenticated
  USING (true);  -- In production, add admin role check

DROP POLICY IF EXISTS "Service role can manage logs" ON public.newsletter_logs;
CREATE POLICY "Service role can manage logs"
  ON public.newsletter_logs FOR ALL
  TO service_role
  USING (true);

-- Grant permissions
GRANT SELECT ON public.newsletter_jobs TO authenticated;
GRANT ALL ON public.newsletter_jobs TO service_role;
GRANT SELECT ON public.newsletter_logs TO authenticated;
GRANT ALL ON public.newsletter_logs TO service_role;

-- Comments
COMMENT ON TABLE public.newsletter_jobs IS 'Background jobs for newsletter sending';
COMMENT ON COLUMN public.newsletter_jobs.status IS 'pending: waiting to process, processing: currently sending, completed: all sent, failed: error occurred';
COMMENT ON COLUMN public.newsletter_jobs.total_count IS 'Total number of subscribers to send to';
COMMENT ON COLUMN public.newsletter_jobs.sent_count IS 'Number of successfully sent emails';
COMMENT ON COLUMN public.newsletter_jobs.failed_count IS 'Number of failed sends';

COMMENT ON TABLE public.newsletter_logs IS 'Detailed log of each email sent in a newsletter job';
COMMENT ON COLUMN public.newsletter_logs.status IS 'sent: successfully sent, failed: send error, bounced: email bounced, skipped: subscriber inactive';
COMMENT ON COLUMN public.newsletter_logs.provider_id IS 'Email ID from Resend for tracking';
COMMENT ON COLUMN public.newsletter_logs.provider_response IS 'Full JSON response from Resend API';

-- Helper function to get job statistics
CREATE OR REPLACE FUNCTION get_newsletter_job_stats(job_id_param TEXT)
RETURNS TABLE (
  total_count BIGINT,
  sent_count BIGINT,
  failed_count BIGINT,
  bounced_count BIGINT,
  skipped_count BIGINT,
  success_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT as total_count,
    COUNT(*) FILTER (WHERE status = 'sent')::BIGINT as sent_count,
    COUNT(*) FILTER (WHERE status = 'failed')::BIGINT as failed_count,
    COUNT(*) FILTER (WHERE status = 'bounced')::BIGINT as bounced_count,
    COUNT(*) FILTER (WHERE status = 'skipped')::BIGINT as skipped_count,
    CASE 
      WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE status = 'sent')::NUMERIC / COUNT(*)::NUMERIC) * 100, 2)
      ELSE 0
    END as success_rate
  FROM public.newsletter_logs
  WHERE job_id = job_id_param;
END;
$$ LANGUAGE plpgsql;

-- Example query to get job progress
-- SELECT 
--   j.*,
--   (SELECT * FROM get_newsletter_job_stats(j.id)) as stats
-- FROM public.newsletter_jobs j
-- WHERE j.status IN ('processing', 'completed')
-- ORDER BY j.created_at DESC
-- LIMIT 10;

-- Cleanup function to delete old completed jobs (optional, run manually or via cron)
CREATE OR REPLACE FUNCTION cleanup_old_newsletter_jobs(days_old INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM public.newsletter_jobs
    WHERE status IN ('completed', 'failed')
      AND completed_at < NOW() - (days_old || ' days')::INTERVAL
    RETURNING id
  )
  SELECT COUNT(*)::INTEGER INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Example: DELETE FROM public.newsletter_jobs WHERE status = 'completed' AND completed_at < NOW() - INTERVAL '30 days';
-- Or call: SELECT cleanup_old_newsletter_jobs(30);
