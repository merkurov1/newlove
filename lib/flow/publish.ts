/**
 * Shared Flow publication service.
 *
 * Both the admin HTTP API and the Telegram direct-publish flow use this
 * module. It keeps validation, slug/title preparation, crossposting and AI
 * context generation in one place instead of duplicating publication logic in
 * an endpoint.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { normalizeFlowItem } from './content';
import { crosspostFlowItem, type CrosspostResult } from './crosspost';
import {
  ensurePublishedFlowContext,
  type PublishedFlowItem,
} from './publishedContext';

const ALLOWED_TYPES = ['note', 'article', 'link', 'photo', 'video', 'quote'];
const ALLOWED_STATUSES = ['draft', 'published', 'archived'];
const ALLOWED_VISIBILITIES = ['public', 'private'];

export type FlowPublicationInput = {
  title?: unknown;
  body_md?: unknown;
  source_url?: unknown;
  type?: unknown;
  lang?: unknown;
  status?: unknown;
  visibility?: unknown;
  metadata?: unknown;
  slug?: string | null;
  published_at?: string | null;
  /** Deterministic slug supplied by an idempotent caller such as Telegram. */
  idempotencyKey?: string | null;
};

export type FlowPublicationSuccess = {
  ok: true;
  item: Record<string, unknown>;
  crosspost: CrosspostResult | null;
  aiContext: unknown;
  duplicate: boolean;
};

export type FlowPublicationFailure = {
  ok: false;
  status: number;
  error: string;
  details?: string;
};

export type FlowPublicationResult = FlowPublicationSuccess | FlowPublicationFailure;

export function generateFlowSlug(title?: string | null, bodyMd?: string | null): string {
  const source = (title?.trim() || bodyMd?.split(/\r?\n/)[0]?.trim() || 'post').slice(0, 50);

  const base = source
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u0400-\u04ff]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const idSuffix = Math.random().toString(36).substring(2, 7);

  return base ? `${base}-${idSuffix}` : `flow-${Date.now().toString(36)}`;
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

export async function createFlowItem(
  supabase: SupabaseClient,
  input: FlowPublicationInput
): Promise<FlowPublicationResult> {
  const now = new Date().toISOString();
  const itemType =
    typeof input.type === 'string' && ALLOWED_TYPES.includes(input.type) ? input.type : 'article';
  const status =
    typeof input.status === 'string' && ALLOWED_STATUSES.includes(input.status)
      ? input.status
      : 'published';
  const visibility =
    typeof input.visibility === 'string' && ALLOWED_VISIBILITIES.includes(input.visibility)
      ? input.visibility
      : 'public';
  const lang = typeof input.lang === 'string' && input.lang.trim() ? input.lang.trim() : 'ru';
  const bodyMd = typeof input.body_md === 'string' ? input.body_md : '';
  const sourceUrl = typeof input.source_url === 'string' ? input.source_url : null;
  const inputMetadata =
    input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
      ? (input.metadata as Record<string, unknown>)
      : {};
  const content = normalizeFlowItem({
    title: typeof input.title === 'string' ? input.title : null,
    body_md: bodyMd,
    source_url: sourceUrl,
    type: itemType,
    lang,
    metadata: inputMetadata,
  });
  const providedSlug =
    typeof input.slug === 'string' && input.slug.trim()
      ? input.slug.trim()
      : typeof input.idempotencyKey === 'string' && input.idempotencyKey.trim()
        ? input.idempotencyKey.trim()
        : null;
  const slug = providedSlug ?? generateFlowSlug(content.title, bodyMd);
  const metadata = {
    ...inputMetadata,
    title_source: content.titleSource,
    ...(content.titleSource === 'manual'
      ? { generated_title: undefined }
      : { generated_title: content.title }),
  };

  const { data: item, error } = await supabase
    .from('items')
    .insert({
      title: content.title,
      slug,
      lang,
      type: itemType,
      status,
      visibility,
      body_md: bodyMd || null,
      source_url: sourceUrl || content.sourceUrl || null,
      metadata,
      published_at:
        status === 'published'
          ? typeof input.published_at === 'string' && input.published_at
            ? input.published_at
            : now
          : null,
    })
    .select()
    .single();

  if (error || !item) {
    if (providedSlug && isUniqueViolation(error)) {
      const { data: existing, error: existingError } = await supabase
        .from('items')
        .select('*')
        .eq('lang', lang)
        .eq('slug', slug)
        .maybeSingle();

      if (!existingError && existing) {
        return {
          ok: true,
          item: existing as Record<string, unknown>,
          crosspost: null,
          aiContext: null,
          duplicate: true,
        };
      }
    }

    return {
      ok: false,
      status: 500,
      error: 'Failed to create item.',
      details: error?.message,
    };
  }

  const row = item as Record<string, unknown>;
  let crosspostResult: CrosspostResult | null = null;

  if (row.status === 'published' && row.visibility === 'public') {
    try {
      // Lazy import keeps sharp and other publishing dependencies out of
      // callers that only create drafts.
      crosspostResult = await crosspostFlowItem(row);
    } catch (crosspostError) {
      console.error(
        '[flow/publish] crosspost error:',
        crosspostError instanceof Error ? crosspostError.message : 'unknown'
      );
    }
  }

  const aiContext = await ensurePublishedFlowContext(
    supabase,
    row as unknown as PublishedFlowItem
  );

  return {
    ok: true,
    item: row,
    crosspost: crosspostResult,
    aiContext,
    duplicate: false,
  };
}
