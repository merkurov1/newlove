-- SQL: create table for whispers feature
-- Run this in Supabase SQL editor or via psql

CREATE TABLE IF NOT EXISTS public.whispers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL,
  telegram_user_id bigint NULL,
  telegram_file_id text NULL,
  telegram_file_unique_id text NULL,
  storage_path text NULL,
  created_at timestamptz DEFAULT now(),
  transcribed_text text NULL,
  my_response text NULL,
  status text DEFAULT 'new' -- enum: 'new' | 'transcribed' | 'answered'
);

CREATE INDEX IF NOT EXISTS whispers_created_at_idx ON public.whispers(created_at);
