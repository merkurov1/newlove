// lib/tags.ts
// Helper utilities for upserting tags and linking them to entities using Supabase.
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
// Lazy-import server auth to obtain a service-role client when needed
async function getServiceRoleClient(): Promise<SupabaseClient | null> {
  try {
    // dynamic import to avoid bundling server-only code in some runtimes
    const mod = await import('@/lib/serverAuth');
    const getServerSupabaseClient = (mod && mod.getServerSupabaseClient) || mod.default;
    if (!getServerSupabaseClient) return null;
    return getServerSupabaseClient({ useServiceRole: true });
  } catch (e) {
    console.warn('Could not obtain service-role client from serverAuth', (e as any)?.message || e);
    return null;
  }
}

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

  // Normalize and dedupe tag names
  const names = Array.from(new Set((tagNames || []).map(n => (n || '').toString().trim()).filter(Boolean)));
  if (names.length === 0) return;

  // Helper slugify
  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '').replace(/--+/g, '-');
  // Centralized table name for tags: prefer canonical "Tag" but allow overriding via
  // environment variable TAGS_TABLE_NAME if the database uses a different name.
  const TAGS_TABLE = (typeof process !== 'undefined' && process.env && process.env.TAGS_TABLE_NAME) || 'Tag';

  // 1) fetch existing tags by name
  // Use the configured TAGS_TABLE. If fetch fails because the relation doesn't
  // exist or another DB error occurs, log and return early so the caller sees a
  // predictable behavior.
  let existingTags: any[] = [];
  try {
    const r = await supabase.from(TAGS_TABLE).select('id,name,slug').in('name', names) as any;
    if (r.error) throw r.error;
    existingTags = r.data || [];
  } catch (e) {
    console.error('fetch tags error (table: ' + TAGS_TABLE + ')', e);
    return;
  }
  const tagIdByName: Record<string, string> = {};
  for (const r of existingTags || []) tagIdByName[r.name] = r.id;

  // 2) determine missing names and insert them with generated ids/slugs
  const missing = names.filter(n => !tagIdByName[n]);
  if (missing.length > 0) {
    const now = new Date().toISOString();
    const toInsert = missing.map(n => ({ id: (typeof randomUUID === 'function' ? randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`), name: n, slug: slugify(n), createdAt: now, updatedAt: now }));
    try {
      const r = await supabase.from(TAGS_TABLE).insert(toInsert).select('id,name,slug') as any;
      if (r.error) throw r.error;
      for (const rr of r.data || []) tagIdByName[rr.name] = rr.id;
    } catch (e) {
      console.error('insert missing tags error (table: ' + TAGS_TABLE + ')', e);
      // continue and rely on later select
    }
  }

  // 3) ensure we have mapping for all names by querying again for any missing
  const missingAfterInsert = names.filter(n => !tagIdByName[n]);
  if (missingAfterInsert.length > 0) {
    try {
      const r = await supabase.from(TAGS_TABLE).select('id,name,slug').in('name', missingAfterInsert) as any;
      if (r.error) throw r.error;
      for (const rr of r.data || []) tagIdByName[rr.name] = rr.id;
    } catch (e) {
      console.error('fetch tags after insert error (table: ' + TAGS_TABLE + ')', e);
      return;
    }
  }

  // Prepare junction inserts depending on entity type
  const junctionTable = {
    article: '_ArticleToTag',
    project: '_ProjectToTag',
    letter: '_LetterToTag',
  }[entity];

  if (!junctionTable) return;

  const inserts = Object.keys(tagIdByName).map(name => ({ A: entityId, B: tagIdByName[name] }));

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
  try {
    const { error: insertErr } = await supabase.from(junctionTable).upsert(inserts, { onConflict: 'A,B' });
    if (insertErr) {
      console.error('insert junction error', insertErr);
      // If this appears to be a permission/RLS error, optionally retry with service-role client
      const msg = (insertErr && (insertErr.message || insertErr.toString())) || '';
      if (/permission|permission denied|42501|forbidden|not authorized/i.test(msg)) {
        try {
          const svc = await getServiceRoleClient();
          if (svc) {
            const { error: svcErr } = await svc.from(junctionTable).upsert(inserts, { onConflict: 'A,B' });
            if (svcErr) {
              console.error('insert junction retry with service-role failed', svcErr);
            } else {
              console.debug('insert junction retry with service-role succeeded');
            }
          } else {
            console.warn('Service-role client not available for junction retry');
          }
        } catch (retryE) {
          console.error('Exception while retrying junction insert with service-role', retryE);
        }
      }
    }
  } catch (e) {
    console.error('insert junction unexpected error', e);
    // Try service-role fallback once more in case this was a permission-related exception
    try {
      const svc = await getServiceRoleClient();
      if (svc) {
        const { error: svcErr } = await svc.from(junctionTable).upsert(inserts, { onConflict: 'A,B' });
        if (svcErr) console.error('insert junction fallback with service-role failed', svcErr);
        else console.debug('insert junction fallback with service-role succeeded');
      }
    } catch (fallbackE) {
      console.error('Service-role junction fallback exception', fallbackE);
    }
  }
}
