-- Add a lightweight audit table to record manual/automatic revalidation events
-- Apply in Supabase SQL editor or via your migration tooling.

CREATE TABLE IF NOT EXISTS revalidation_audit (
  id text PRIMARY KEY,
  user_id text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Optional index to query recent events
CREATE INDEX IF NOT EXISTS idx_revalidation_audit_created_at ON revalidation_audit(created_at DESC);
