/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { FlowAIResult } from '../ai';
import { ensurePublishedFlowContext, type PublishedFlowItem } from '../publishedContext';

const item: PublishedFlowItem = {
  id: 'item-1',
  type: 'article',
  title: 'Published item',
  body_md: 'A published essay about networks and memory.',
  source_url: null,
  metadata: {},
  lang: 'en',
  ai_allowed: true,
  rag_allowed: true,
  status: 'published',
  visibility: 'public',
};

function result(): FlowAIResult {
  return {
    content: '[EN] Context.\n---\n[RU] Контекст.',
    model: 'gemini-3.5-flash',
    provider: 'gemini',
    ragEnabled: false,
    retrievalStatus: 'disabled',
    retrievalMethod: null,
    sourceRefs: [],
    sourceDocumentIds: [],
    sourceTitles: [],
    generationVersion: 'flow-ai-v1',
    retrievalLatencyMs: null,
    retrievalDiagnostics: {},
    generationLatencyMs: 10,
    fallbackUsed: false,
  };
}

function fakeSupabase(existing: boolean) {
  const writes: Array<Record<string, unknown>> = [];

  const client = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: existing ? { item_id: 'item-1' } : null,
            error: null,
          }),
        }),
      }),
      upsert: (payload: Record<string, unknown>) => {
        writes.push(payload);
        return {
          select: () => ({
            single: async () => ({ data: payload, error: null }),
          }),
        };
      },
      delete: () => ({
        eq: async () => ({ error: null }),
      }),
    }),
  };

  return { client: client as never, writes };
}

describe('published Flow AI context', () => {
  beforeEach(() => {
    process.env.FLOW_AI_RAG_ENABLED = 'false';
  });

  it('does not generate for a draft, photo or AI-disabled item', async () => {
    const generate = jest.fn();
    const supabase = fakeSupabase(false);

    await expect(
      ensurePublishedFlowContext(supabase.client, { ...item, status: 'draft' }, { generate })
    ).resolves.toEqual({ status: 'skipped' });
    await expect(
      ensurePublishedFlowContext(supabase.client, { ...item, type: 'photo' }, { generate })
    ).resolves.toEqual({ status: 'skipped' });
    await expect(
      ensurePublishedFlowContext(supabase.client, { ...item, ai_allowed: false }, { generate })
    ).resolves.toEqual({ status: 'skipped' });
    expect(generate).not.toHaveBeenCalled();
  });

  it('does not regenerate an item that already has a context row', async () => {
    const generate = jest.fn();
    const supabase = fakeSupabase(true);

    await expect(
      ensurePublishedFlowContext(supabase.client, item, { generate })
    ).resolves.toEqual({ status: 'existing' });
    expect(generate).not.toHaveBeenCalled();
  });

  it('generates once after publication and persists the ready row', async () => {
    const generate = jest.fn(async () => result());
    const supabase = fakeSupabase(false);

    const outcome = await ensurePublishedFlowContext(supabase.client, item, { generate });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(outcome.status).toBe('ready');
    expect(supabase.writes.map((write) => write.status)).toEqual(['generating', 'ready']);
  });

  it('persists an error row without throwing out of the publish action', async () => {
    const generate = jest.fn(async () => {
      throw new Error('provider down');
    });
    const supabase = fakeSupabase(false);

    const outcome = await ensurePublishedFlowContext(supabase.client, item, { generate });

    expect(outcome).toMatchObject({ status: 'error', error: 'provider down' });
    expect(supabase.writes.map((write) => write.status)).toEqual(['generating', 'error']);
  });
});
