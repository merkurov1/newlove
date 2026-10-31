import { createMediaAnalysisStore } from '@/lib/knowledge/media/analysisStore';
import { deriveMediaRelations, type RelationMedia } from '@/lib/knowledge/media/relations';

export type RebuildMediaRelationsResult = {
  records: number;
  recordsWithRelations: number;
  relations: number;
  byType: Record<string, number>;
};

/**
 * Recomputes deterministic relation hypotheses from current topics and quotes
 * without calling the language model. Analysis history remains untouched; only
 * outgoing current relations for each analyzed record are superseded.
 */
export async function rebuildMediaRelations(input: {
  limit?: number;
  dryRun?: boolean;
} = {}): Promise<RebuildMediaRelationsResult> {
  const store = createMediaAnalysisStore();

  if (!store) throw new Error('media_analysis_database_unavailable');

  const limit = Math.min(Math.max(input.limit || 1000, 1), 2000);

  const { data: mediaRows, error: mediaError } = await store.client
    .from('media_archive_records')
    .select('id,title,outlet,kind,published_date,topic')
    .order('published_date', { ascending: false })
    .limit(limit);

  if (mediaError) throw new Error('media_relations_media_query_failed');

  const media = (mediaRows || []) as Array<{
    id: string;
    title: string;
    outlet: string;
    kind: string | null;
    published_date: string | null;
    topic: string | null;
  }>;

  if (media.length === 0) {
    return { records: 0, recordsWithRelations: 0, relations: 0, byType: {} };
  }

  const ids = media.map((row) => row.id);

  const [documents, topics, quotes, runs] = await Promise.all([
    store.client.from('knowledge_documents').select('media_record_id,content_hash').in('media_record_id', ids),
    store.client
      .from('media_analysis_topics')
      .select('media_record_id,primary_topic,subtopics')
      .in('media_record_id', ids)
      .eq('is_current', true),
    store.client
      .from('media_quotes')
      .select('media_record_id,quote_hash')
      .in('media_record_id', ids)
      .eq('is_current', true),
    store.client
      .from('media_analysis_runs')
      .select('id,media_record_id,created_at')
      .in('media_record_id', ids)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(Math.min(5000, ids.length * 5)),
  ]);

  if (documents.error || topics.error || quotes.error || runs.error) {
    throw new Error('media_relations_context_query_failed');
  }

  const hashByRecord = new Map(
    (documents.data || []).map((row) => {
      const value = row as { media_record_id: string; content_hash: string | null };
      return [String(value.media_record_id), value.content_hash];
    })
  );
  const topicByRecord = new Map(
    (topics.data || []).map((row) => {
      const value = row as {
        media_record_id: string;
        primary_topic: string;
        subtopics: string[] | null;
      };
      return [String(value.media_record_id), value];
    })
  );
  const quotesByRecord = new Map<string, string[]>();

  for (const row of quotes.data || []) {
    const value = row as { media_record_id: string; quote_hash: string };
    const list = quotesByRecord.get(String(value.media_record_id)) || [];
    list.push(String(value.quote_hash));
    quotesByRecord.set(String(value.media_record_id), list);
  }

  const runByRecord = new Map<string, string>();

  for (const row of (runs.data || []) as Array<{
    id: string;
    media_record_id: string;
    created_at: string;
  }>) {
    if (!runByRecord.has(row.media_record_id)) runByRecord.set(row.media_record_id, row.id);
  }

  const relationMedia: RelationMedia[] = media.map((row) => {
    const topic = topicByRecord.get(row.id);

    return {
      id: row.id,
      title: row.title || '',
      outlet: row.outlet || '',
      kind: row.kind,
      publishedDate: row.published_date,
      topic: topic?.primary_topic || row.topic || null,
      subtopics: Array.isArray(topic?.subtopics) ? topic.subtopics : [],
      contentHash: hashByRecord.get(row.id) || null,
      quoteHashes: quotesByRecord.get(row.id) || [],
    };
  });

  const result: RebuildMediaRelationsResult = {
    records: relationMedia.filter((record) => runByRecord.has(record.id)).length,
    recordsWithRelations: 0,
    relations: 0,
    byType: {},
  };

  for (const current of relationMedia) {
    const runId = runByRecord.get(current.id);
    if (!runId) continue;

    const candidates = deriveMediaRelations(
      current,
      relationMedia.filter((item) => item.id !== current.id)
    );

    result.relations += candidates.length;

    if (candidates.length > 0) result.recordsWithRelations += 1;

    for (const candidate of candidates) {
      result.byType[candidate.relationType] =
        (result.byType[candidate.relationType] || 0) + 1;
    }

    if (input.dryRun) continue;

    await store.supersedeRelations(current.id);

    if (candidates.length > 0) {
      await store.saveRelations({
        runId,
        mediaRecordId: current.id,
        candidates,
      });
    }
  }

  return result;
}
