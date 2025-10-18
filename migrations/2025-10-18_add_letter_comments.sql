-- Migration: Add letter_comments table
-- Run this in Supabase SQL editor (or via your migration tooling)

-- Ensure the UUID generator function is available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "letter_comments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "letter_id" UUID NOT NULL,
  "user_id" UUID,
  "content" TEXT NOT NULL,
  "author_display" TEXT,
  "is_public" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "letter_comments_pkey" PRIMARY KEY ("id")
);

-- Foreign key to letters (if the letters table exists in your schema)
DO $$
BEGIN
  -- Add FK only if `letters` table exists. This will succeed if letters.id is UUID.
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'letters') THEN
    BEGIN
      ALTER TABLE "letter_comments"
        ADD CONSTRAINT "letter_comments_letter_fkey"
        FOREIGN KEY ("letter_id") REFERENCES "letters" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN
      -- constraint already exists, ignore
    END;
  END IF;
END $$;

-- Optional: index for fast lookup by letter
CREATE INDEX IF NOT EXISTS "letter_comments_letter_id_idx" ON "letter_comments" ("letter_id");
CREATE INDEX IF NOT EXISTS "letter_comments_created_at_idx" ON "letter_comments" ("created_at");

-- Optional: small helper to keep created_at up-to-date (not strictly necessary)
CREATE OR REPLACE FUNCTION update_letter_comments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.created_at = COALESCE(NEW.created_at, CURRENT_TIMESTAMP);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_letter_comments_created_at_trigger ON "letter_comments";
CREATE TRIGGER update_letter_comments_created_at_trigger
  BEFORE INSERT OR UPDATE ON "letter_comments"
  FOR EACH ROW
  EXECUTE FUNCTION update_letter_comments_updated_at();

-- Example: grant select/insert to anon if you want public read and authenticated write via RLS
-- GRANT SELECT ON "letter_comments" TO anon;
-- GRANT INSERT, UPDATE, DELETE ON "letter_comments" TO authenticated;

-- After running this migration, consider adding RLS policies (if using Row Level Security) to allow only
-- authenticated users to insert comments and to allow comment owners or admins to delete/edit them.

-- End of migration
