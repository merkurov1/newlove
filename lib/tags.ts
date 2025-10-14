// lib/tags.ts
// Helper utilities for upserting tags and linking them to entities using Supabase.
import type { SupabaseClient } from '@supabase/supabase-js';

export type LinkEntity = 'article' | 'project' | 'letter';

export function parseTagNames(tagsString: string | null | undefined): string[] {
  if (!tagsString) return [];
  try {
    const parsed = JSON.parse(tagsString);
    if (Array.isArray(parsed)) return parsed.map(String).map(t => t.trim()).filter(Boolean);
  } catch (e) {
    // fallback: comma-separated
    return tagsString.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

// Upsert tag rows and create junction rows linking to the entity
export async function upsertTagsAndLink(
  supabase: SupabaseClient,
  entity: LinkEntity,
  entityId: string,
  tagNames: string[]
) {
  if (!supabase) throw new Error('Supabase client required');
  if (!tagNames || tagNames.length === 0) return;

  // Normalize tag objects
  const normalized = tagNames.map(name => ({ name: name.trim() })).filter(t => t.name.length > 0);

  // Upsert tags by name
  const { data: upserted, error: upsertErr } = await supabase
    .from('Tag')
    .upsert(normalized, { onConflict: 'name' })
    .select('*');
  if (upsertErr) {
    console.error('upsertTags error', upsertErr);
    // continue, best-effort
  }

  // Map tag names to ids
  const names = normalized.map(t => t.name);
  const { data: tagsRows, error: fetchErr } = await supabase.from('Tag').select('id,name').in('name', names);
  if (fetchErr) {
    console.error('fetch tags error', fetchErr);
    return;
  }
  const tagIdByName: Record<string, string> = {};
  for (const r of tagsRows || []) tagIdByName[r.name] = r.id;

  // Prepare junction inserts depending on entity type
  const junctionTable = {
    article: '_ArticleToTag',
    project: '_ProjectToTag',
    letter: '_LetterToTag',
  }[entity];

  if (!junctionTable) return;

  const inserts = Object.keys(tagIdByName).map(name => {
    const tagId = tagIdByName[name];
    // Columns in the junction are A (left) and B (right) in original SQL/Prisma naming
    // We'll try to insert as { A: entityId, B: tagId } which matches past migrations
    return { A: entityId, B: tagId };
  });

  if (inserts.length === 0) return;

  // Global emergency flag to disable junction writes if needed for testing
  try {
    if (typeof process !== 'undefined' && process.env && process.env.DISABLE_ARTICLE_TO_TAGS === 'true') {
      console.warn('upsertTagsAndLink: DISABLE_ARTICLE_TO_TAGS=true -> skipping junction upserts');
      return;
    }
  } catch (e) {
    // ignore
  }

  // Avoid duplicates using upsert on (A,B) if Postgres constraint exists
  // Supabase client's onConflict expects a comma-separated string in types
  const { error: insertErr } = await supabase.from(junctionTable).upsert(inserts, { onConflict: 'A,B' });
  if (insertErr) console.error('insert junction error', insertErr);
}
