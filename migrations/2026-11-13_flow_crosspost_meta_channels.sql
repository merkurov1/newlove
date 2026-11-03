-- Flow crossposting: allow Facebook Page and Threads distributions.
--
-- Run manually in the Supabase SQL editor. This migration does not modify any
-- existing rows; it only widens the channel check constraint.
--
-- The canonical crosspost state lives in items.metadata.crosspost.channels and
-- is intentionally unchanged. This table is a durable mirror used by other
-- readers and analytics.

begin;

-- PostgreSQL auto-names the original anonymous CHECK constraint
-- `distributions_channel_check` (created in sql/001_items_core.sql). Drop it
-- defensively so this migration is safe to re-run.
alter table if exists public.distributions
  drop constraint if exists distributions_channel_check;

alter table if exists public.distributions
  add constraint distributions_channel_check
  check (
    channel in (
      'telegram',
      'mastodon',
      'bluesky',
      'facebook',
      'threads'
    )
  );

comment on column public.distributions.channel is
  'Flow distribution channel: telegram, mastodon, bluesky, facebook, threads.';

commit;
