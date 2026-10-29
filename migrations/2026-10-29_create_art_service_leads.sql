-- Migration: minimal qualified service-lead model for Advising / Art Engine
-- Date: 2026-10-29
--
-- This table is intentionally separate from `access_requests` (closed Art
-- Engine access) and from newsletter subscribers. Contact details are written
-- only after explicit consent in the existing request form.

CREATE TABLE IF NOT EXISTS public.art_service_leads (
  id TEXT PRIMARY KEY
    CHECK (id ~ '^[A-Za-z0-9_-]{8,64}$'),
  conversation_id TEXT NOT NULL UNIQUE
    CHECK (conversation_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'qualified', 'contact_requested', 'contacted', 'closed')),
  need_type TEXT
    CHECK (need_type IS NULL OR need_type IN ('acquisition', 'analysis', 'consultation', 'other')),
  stage TEXT
    CHECK (stage IS NULL OR stage IN ('exploring', 'comparing', 'ready', 'in_progress', 'unsure')),
  timeline TEXT
    CHECK (timeline IS NULL OR timeline IN ('this_month', 'this_quarter', 'no_fixed_date')),
  questions_asked INTEGER NOT NULL DEFAULT 0
    CHECK (questions_asked BETWEEN 0 AND 3),
  next_question TEXT
    CHECK (next_question IS NULL OR next_question IN ('need', 'stage', 'timeline')),
  last_message_id TEXT,
  summary TEXT,
  contact_name TEXT,
  contact_email TEXT,
  consent_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.art_service_leads
  ADD COLUMN IF NOT EXISTS next_question TEXT
    CHECK (next_question IS NULL OR next_question IN ('need', 'stage', 'timeline'));

ALTER TABLE public.art_service_leads
  ADD COLUMN IF NOT EXISTS last_message_id TEXT;

CREATE INDEX IF NOT EXISTS art_service_leads_status_idx
  ON public.art_service_leads (status, created_at DESC);

ALTER TABLE public.art_service_leads ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.art_service_leads FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.art_service_leads TO service_role;

COMMENT ON TABLE public.art_service_leads IS
  'Qualified Advising / art-market service requests. Separate from Art Engine access requests.';
COMMENT ON COLUMN public.art_service_leads.status IS
  'new -> qualified requires need_type and stage. contact_requested requires explicit form consent.';
