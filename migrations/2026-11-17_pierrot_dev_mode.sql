-- Pierrot Dev mode
--
-- Additive migration. Existing rows keep mode = 'site'.
-- Dev threads use the same private tables as owner chat but are isolated by
-- mode, so they never appear in the normal owner chat list and are never
-- ingested into Brain / RAG.

ALTER TABLE public.pierrot_conversations
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'site';

ALTER TABLE public.pierrot_messages
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'site';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.pierrot_conversations'::regclass
      AND conname = 'pierrot_conversations_mode_check'
  ) THEN
    ALTER TABLE public.pierrot_conversations
      ADD CONSTRAINT pierrot_conversations_mode_check
      CHECK (mode IN ('site', 'dev'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.pierrot_messages'::regclass
      AND conname = 'pierrot_messages_mode_check'
  ) THEN
    ALTER TABLE public.pierrot_messages
      ADD CONSTRAINT pierrot_messages_mode_check
      CHECK (mode IN ('site', 'dev'));
  END IF;
END $$;

-- Dev answers include code blocks and can exceed the old 4000-character cap.
-- This only expands the allowed maximum; existing rows are unchanged.
DO $$
DECLARE
  item RECORD;
BEGIN
  FOR item IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.pierrot_messages'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%char_length(content)%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.pierrot_messages DROP CONSTRAINT %I',
      item.conname
    );
  END LOOP;

  ALTER TABLE public.pierrot_messages
    ADD CONSTRAINT pierrot_messages_content_length_check
    CHECK (char_length(content) BETWEEN 1 AND 16000);
END $$;

CREATE INDEX IF NOT EXISTS pierrot_conversations_mode_idx
  ON public.pierrot_conversations (mode, updated_at DESC);

CREATE INDEX IF NOT EXISTS pierrot_messages_mode_idx
  ON public.pierrot_messages (conversation_id, mode, message_index);

COMMENT ON COLUMN public.pierrot_conversations.mode IS
  'site = normal Pierrot chat, dev = isolated developer assistant thread.';

COMMENT ON COLUMN public.pierrot_messages.mode IS
  'Copied from the conversation mode. Dev messages are never used for RAG.';
