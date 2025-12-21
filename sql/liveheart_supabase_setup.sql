-- liveheart_supabase_setup.sql
-- Run in Supabase SQL editor. Creates table for shares and example storage policies.

-- 1) Create table to store artifacts
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.liveheart_shares (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  title text,
  dna jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_liveheart_shares_slug ON public.liveheart_shares (slug);

-- 2) OPTIONAL: Storage RLS policies for project storage (run in Supabase SQL editor)
-- NOTE: the storage schema is "storage" and objects table is storage.objects
-- These policies illustrate allowing public SELECT for a specific bucket
-- and allowing INSERT only for authenticated users. Adjust to your needs.

-- Enable RLS on storage.objects (if not already enabled)
-- ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Allow public read for objects in the "liveheart-og" bucket
-- CREATE POLICY public_read_liveheart_og
--   ON storage.objects
--   FOR SELECT
--   USING (bucket_id = 'liveheart-og');

-- Allow authenticated users to insert objects into the bucket (optional)
-- CREATE POLICY auth_insert_liveheart_og
--   ON storage.objects
--   FOR INSERT
--   WITH CHECK (bucket_id = 'liveheart-og' AND auth.role() = 'authenticated');

-- If you prefer to make the bucket public via the UI, you can skip the policies above.

-- 3) Notes
-- - Create a Storage bucket named 'liveheart-og' (public) in the Supabase dashboard
-- - Our server code uploads to path: og/<slug>.png (see app/api/liveheart/save/route.ts)
-- - If you prefer signed URLs, change the OG endpoint to generate signed URLs instead of using public access
