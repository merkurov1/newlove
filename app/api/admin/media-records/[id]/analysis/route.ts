import { NextResponse } from 'next/server';

import { authorizeKnowledgeAdmin } from '@/lib/knowledge/adminAuth';
import {
  createMediaAnalysisStore,
  type MediaAnalysisRun,
} from '@/lib/knowledge/media/analysisStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeKnowledgeAdmin(request);

  if (!auth.ok) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;

  if (!UUID_PATTERN.test(id)) return json({ error: 'Invalid media record id.' }, 400);

  const store = createMediaAnalysisStore();

  if (!store) return json({ error: 'Media analysis database is not configured.' }, 503);

  try {
    const [input, analysis, runs] = await Promise.all([
      store.loadInput(id),
      store.getCurrentAnalysis(id),
      store.listRuns(id),
    ]);

    if (!input) return json({ error: 'Media record not found.' }, 404);

    const quoteRows = Array.isArray(analysis?.quotes)
      ? (analysis.quotes as Array<Record<string, unknown>>)
      : [];
    const relationRows = Array.isArray(analysis?.relations)
      ? (analysis.relations as Array<Record<string, unknown>>)
      : [];
    const chunkById = new Map(input.chunks.map((chunk) => [chunk.id, chunk]));
    const targetIds = Array.from(
      new Set(
        relationRows
          .map((relation) =>
            String(
              relation.source_media_record_id === id
                ? relation.target_media_record_id
                : relation.source_media_record_id
            )
          )
          .filter(Boolean)
      )
    );
    const targetRecords =
      targetIds.length > 0
        ? await store.client
            .from('media_archive_records')
            .select('id,title,outlet,canonical_url')
            .in('id', targetIds)
            .limit(200)
        : { data: [] };
    const targetById = new Map(
      (targetRecords.data || []).map((row) => {
        const value = row as {
          id: string;
          title?: string;
          outlet?: string;
          canonical_url?: string;
        };
        return [String(value.id), value];
      })
    );

    return json({
      status: 'ok',
      mediaRecord: input.mediaRecord,
      document: input.document,
      analysis: analysis
        ? {
            run: analysis.run,
            quotes: quoteRows.map((quote) => ({
              ...quote,
              chunk_excerpt:
                typeof quote.chunk_id === 'string'
                  ? chunkById.get(quote.chunk_id)?.content || null
                  : null,
            })),
            topics: analysis.topics,
            editorialRole: analysis.editorialRole,
            relations: relationRows.map((relation) => {
              const targetId = String(
                relation.source_media_record_id === id
                  ? relation.target_media_record_id
                  : relation.source_media_record_id
              );
              const target = targetById.get(targetId);

              return {
                ...relation,
                target_title: target?.title || null,
                target_outlet: target?.outlet || null,
                target_canonical_url: target?.canonical_url || null,
                target_media_record_id: targetId,
              };
            }),
          }
        : null,
      runs: runs as MediaAnalysisRun[],
      source: {
        title: input.mediaRecord.title,
        outlet: input.mediaRecord.outlet,
        canonicalUrl: input.mediaRecord.canonical_url,
        publishedDate: input.mediaRecord.published_date,
        language: input.document.language || input.mediaRecord.lang,
        textQuality: input.document.media_text_quality,
        chunkCount: input.chunks.length,
        sourceCharCount: input.document.source_char_count,
      },
    });
  } catch {
    return json({ error: 'Could not read media analysis.' }, 503);
  }
}
