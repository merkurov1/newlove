import type { SupabaseClient } from '@supabase/supabase-js';

import { generateFlowContext } from './ai';
import {
  flowAiContextErrorPayload,
  flowAiContextGeneratingPayload,
  flowAiContextReadyPayload,
} from './aiContext';
import { isFlowAiRagEnabled } from '@/lib/knowledge/rag/flowRetrieval';

export type PublishedFlowItem = {
  id: string;
  type: string;
  title: string | null;
  body_md: string | null;
  source_url: string | null;
  metadata: Record<string, unknown> | null;
  lang: string;
  ai_allowed?: boolean | null;
  rag_allowed?: boolean | null;
  status: string;
  visibility: string;
};

export type PublishedContextResult =
  | { status: 'skipped' }
  | { status: 'existing' }
  | { status: 'ready'; context: Record<string, unknown> }
  | { status: 'error'; error: string };

/**
 * Generate Flow AI context exactly once after an item becomes published.
 *
 * This is deliberately not a public-page trigger. It runs only inside an
 * authenticated admin publish action, so traffic cannot create unbounded AI
 * calls. Existing ready/error rows are left alone; regeneration remains the
 * explicit admin button.
 */
export async function ensurePublishedFlowContext(
  supabase: SupabaseClient,
  item: PublishedFlowItem,
  deps: { generate?: typeof generateFlowContext } = {}
): Promise<PublishedContextResult> {
  if (
    item.status !== 'published' ||
    item.visibility !== 'public' ||
    item.ai_allowed === false ||
    item.type === 'photo'
  ) {
    return { status: 'skipped' };
  }

  const { data: existing, error: lookupError } = await supabase
    .from('flow_ai_context')
    .select('item_id')
    .eq('item_id', item.id)
    .maybeSingle();

  if (lookupError) {
    console.warn('[flow/publish] context lookup failed:', item.id);
    return { status: 'error', error: 'context_lookup_failed' };
  }

  if (existing) return { status: 'existing' };

  const ragEnabled = item.rag_allowed !== false && isFlowAiRagEnabled();

  const { error: generatingError } = await supabase
    .from('flow_ai_context')
    .upsert(flowAiContextGeneratingPayload(item.id, ragEnabled), {
      onConflict: 'item_id',
    });

  if (generatingError) {
    console.warn('[flow/publish] could not mark context as generating:', item.id);
    return { status: 'error', error: 'context_write_failed' };
  }

  try {
    const generated = await (deps.generate ?? generateFlowContext)({
      id: item.id,
      type: item.type,
      title: item.title,
      body_md: item.body_md,
      source_url: item.source_url,
      metadata: item.metadata,
      lang: item.lang,
      rag_allowed: item.rag_allowed,
    });

    if (!generated) {
      await supabase.from('flow_ai_context').delete().eq('item_id', item.id);
      return { status: 'skipped' };
    }

    const { data, error } = await supabase
      .from('flow_ai_context')
      .upsert(flowAiContextReadyPayload(item.id, generated), {
        onConflict: 'item_id',
      })
      .select('*')
      .single();

    if (error) throw error;

    return { status: 'ready', context: data as Record<string, unknown> };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'flow_ai_generation_failed';

    await supabase
      .from('flow_ai_context')
      .upsert(flowAiContextErrorPayload(item.id, message, ragEnabled), {
        onConflict: 'item_id',
      });

    console.warn('[flow/publish] AI context generation failed:', item.id);
    return { status: 'error', error: message };
  }
}
