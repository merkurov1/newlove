import { createOpenRouterEmbeddingClientFromEnv, type EmbeddingClient } from '@/lib/knowledge/rag/embeddings';
import { createSupabaseKnowledgeSearch } from '@/lib/knowledge/rag/supabaseStore';

import { graphChatJson } from './deepseek';
import { cosineSimilarity, redactQuestion } from './normalize';
import { RawRadarSchema } from './schema';
import type { BrainGraphStore } from './store';
import type { BrainRadarSuggestion } from './types';

type ChatJson = (system: string, user: string) => Promise<unknown>;

type QuestionRow = {
  id: string;
  conversation_id: string;
  content: string;
  created_at: string;
};

type QuestionVector = {
  id: string;
  question: string;
  createdAt: string;
  vector: number[];
  topDocumentId: string | null;
  topDocumentTitle: string | null;
  topSimilarity: number | null;
  relatedDocuments: Array<{ id: string; title: string; similarity: number }>;
};

type QuestionCluster = {
  questions: QuestionVector[];
  centroid: number[];
  representative: QuestionVector;
  avgSimilarity: number | null;
  relatedDocuments: Array<{ id: string; title: string; similarity: number }>;
};

const RADAR_SYSTEM = [
  'You analyse recurring visitor questions for the owner’s private Brain editorial radar.',
  'Return JSON only.',
  'For each cluster: give a short topic, keep a representative question in the visitor’s language, and propose one concrete owner-approved content idea.',
  'Say whether the current knowledge base appears to be missing explanatory content.',
  'Never claim that something was published or that a suggestion is already approved.',
  'Do not invent visitor questions or document titles.',
  'Return: {"topics":[{"cluster_id":"...","topic":"...","representative_question":"...","suggestion":"...","rationale":"...","missing_knowledge":true,"confidence":0.0}]}.',
].join(' ');

function isUsefulQuestion(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim().toLowerCase();

  if (normalized.length < 18 || normalized.length > 1000) return false;

  if (
    /^(hi|hello|hey|привет|здравствуйте|добрый день|добрый вечер|спасибо|thanks|thank you|ok|okay|да|нет)\b/i.test(
      normalized
    )
  ) {
    return false;
  }

  return true;
}

export function clusterQuestionVectors(
  vectors: number[][],
  threshold = 0.82
): number[][] {
  const clusters: Array<{ indices: number[]; centroid: number[] }> = [];

  vectors.forEach((vector, index) => {
    let best: { cluster: (typeof clusters)[number]; similarity: number } | null = null;

    for (const cluster of clusters) {
      const similarity = cosineSimilarity(cluster.centroid, vector);

      if (!best || similarity > best.similarity) {
        best = { cluster, similarity };
      }
    }

    if (best && best.similarity >= threshold) {
      best.cluster.indices.push(index);
      const count = best.cluster.indices.length;
      best.cluster.centroid = best.cluster.centroid.map(
        (value, dimension) => (value * (count - 1) + vector[dimension]) / count
      );
    } else {
      clusters.push({ indices: [index], centroid: [...vector] });
    }
  });

  return clusters.map((cluster) => cluster.indices);
}

function representativeQuestion(questions: QuestionVector[]): QuestionVector {
  return [...questions].sort((left, right) => {
    const leftLength = left.question.length;
    const rightLength = right.question.length;
    return rightLength - leftLength;
  })[0];
}

function clusterSummary(questions: QuestionVector[]): QuestionCluster {
  const representative = representativeQuestion(questions);
  const similarities = questions
    .map((question) => question.topSimilarity)
    .filter((value): value is number => typeof value === 'number');
  const avgSimilarity =
    similarities.length > 0
      ? similarities.reduce((sum, value) => sum + value, 0) / similarities.length
      : null;
  const documentScores = new Map<
    string,
    { id: string; title: string; similarity: number }
  >();

  for (const question of questions) {
    for (const document of question.relatedDocuments) {
      const existing = documentScores.get(document.id);

      if (!existing || document.similarity > existing.similarity) {
        documentScores.set(document.id, document);
      }
    }
  }

  return {
    questions,
    centroid: representative.vector,
    representative,
    avgSimilarity,
    relatedDocuments: Array.from(documentScores.values())
      .sort((left, right) => right.similarity - left.similarity)
      .slice(0, 5),
  };
}

function fallbackSuggestion(cluster: QuestionCluster, index: number) {
  return {
    cluster_id: `c${index + 1}`,
    topic: cluster.representative.question.slice(0, 120),
    representative_question: cluster.representative.question,
    suggestion:
      cluster.avgSimilarity !== null && cluster.avgSimilarity >= 0.5
        ? 'Turn the existing material into a clearer explanatory note or FAQ entry.'
        : 'Write a new explanatory piece that answers this question directly.',
    rationale:
      cluster.relatedDocuments.length > 0
        ? `Related material exists: ${cluster.relatedDocuments
            .slice(0, 3)
            .map((document) => document.title)
            .join('; ')}.`
        : 'No close document was found in the indexed Brain.',
    missing_knowledge:
      cluster.avgSimilarity === null || cluster.avgSimilarity < 0.45,
    confidence: 0.45,
  };
}

export async function runEditorialRadar(input: {
  store: BrainGraphStore;
  periodDays?: number;
  limit?: number;
  chatJson?: ChatJson;
  embeddingClient?: EmbeddingClient;
  search?: ReturnType<typeof createSupabaseKnowledgeSearch>;
}): Promise<{
  runId: string;
  questionCount: number;
  clusterCount: number;
  suggestions: BrainRadarSuggestion[];
}> {
  const periodDays = Math.min(Math.max(input.periodDays ?? 90, 1), 365);
  const limit = Math.min(Math.max(input.limit ?? 200, 10), 500);
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - periodDays * 24 * 60 * 60 * 1000);

  const { data, error } = await input.store.client
    .from('pierrot_messages')
    .select('id,conversation_id,content,created_at')
    .eq('role', 'user')
    .gte('created_at', periodStart.toISOString())
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error('brain_radar_messages_query_failed');

  const rows = (Array.isArray(data) ? data : []) as QuestionRow[];
  const seen = new Set<string>();
  const questions = rows
    .map((row) => ({ ...row, content: row.content.trim() }))
    .filter((row) => isUsefulQuestion(row.content))
    .filter((row) => {
      const key = row.content.toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const run = await input.store.client
    .from('brain_radar_runs')
    .insert({
      status: 'running',
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      question_count: questions.length,
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    })
    .select('id')
    .single();

  if (run.error || !run.data) throw new Error('brain_radar_run_create_failed');

  const runId = String((run.data as { id: string }).id);

  if (questions.length === 0) {
    await input.store.client
      .from('brain_radar_runs')
      .update({
        status: 'completed',
        cluster_count: 0,
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId);

    return { runId, questionCount: 0, clusterCount: 0, suggestions: [] };
  }

  const embeddingClient = input.embeddingClient || createOpenRouterEmbeddingClientFromEnv(process.env);
  const search = input.search ?? createSupabaseKnowledgeSearch(process.env);

  if (!search) throw new Error('brain_radar_search_unavailable');

  const vectors = await embeddingClient.embed(questions.map((question) => question.content));
  const questionVectors: QuestionVector[] = [];

  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index];
    const vector = vectors[index];

    if (!vector) continue;

    let relatedDocuments: Array<{ id: string; title: string; similarity: number }> = [];

    try {
      const rows = await search({
        queryEmbedding: vector,
        modelId: embeddingClient.modelId,
        dimensions: embeddingClient.dimensions,
        accessClass: 'owner',
        documentId: null,
        topK: 3,
        minSimilarity: -1,
      });

      relatedDocuments = rows.map((row) => ({
        id: row.document_id,
        title: row.heading || row.document_id,
        similarity: row.similarity,
      }));
    } catch {
      relatedDocuments = [];
    }

    const top = relatedDocuments[0] || null;

    questionVectors.push({
      id: question.id,
      question: redactQuestion(question.content),
      createdAt: question.created_at,
      vector,
      topDocumentId: top?.id || null,
      topDocumentTitle: top?.title || null,
      topSimilarity: top?.similarity ?? null,
      relatedDocuments,
    });
  }

  const clusterIndices = clusterQuestionVectors(questionVectors.map((question) => question.vector));
  const clusters = clusterIndices
    .map((indices) => clusterSummary(indices.map((index) => questionVectors[index])))
    .sort((left, right) => right.questions.length - left.questions.length)
    .slice(0, 30);

  let llmTopics: Array<{
    cluster_id?: string;
    topic: string;
    representative_question: string;
    suggestion: string;
    rationale?: string;
    missing_knowledge?: boolean;
    confidence?: number;
  }> = [];

  try {
    const raw = await (input.chatJson || graphChatJson)(
      RADAR_SYSTEM,
      JSON.stringify({
        period: { from: periodStart.toISOString(), to: periodEnd.toISOString() },
        clusters: clusters.map((cluster, index) => ({
          cluster_id: `c${index + 1}`,
          representative_question: cluster.representative.question,
          occurrences: cluster.questions.length,
          avg_retrieval_similarity: cluster.avgSimilarity,
          related_documents: cluster.relatedDocuments.map((document) => ({
            document_id: document.id,
            title: document.title,
            similarity: document.similarity,
          })),
        })),
      })
    );
    const parsed = RawRadarSchema.safeParse(raw);
    if (parsed.success) llmTopics = parsed.data.topics;
  } catch {
    llmTopics = [];
  }

  const suggestions: BrainRadarSuggestion[] = [];
  const inserted: Array<Record<string, unknown>> = [];

  clusters.forEach((cluster, index) => {
    const fallback = fallbackSuggestion(cluster, index);
    const llm =
      llmTopics.find((topic) => topic.cluster_id === `c${index + 1}`) ||
      llmTopics[index] ||
      null;
    const missing =
      typeof llm?.missing_knowledge === 'boolean'
        ? llm.missing_knowledge
        : fallback.missing_knowledge;

    const row = {
      radar_run_id: runId,
      topic: (llm?.topic || fallback.topic).slice(0, 300),
      representative_question: (llm?.representative_question || fallback.representative_question).slice(
        0,
        1000
      ),
      occurrences: cluster.questions.length,
      avg_retrieval_similarity:
        cluster.avgSimilarity === null ? null : Number(cluster.avgSimilarity.toFixed(4)),
      missing_knowledge: missing,
      related_document_ids: cluster.relatedDocuments.map((document) => document.id),
      related_document_titles: cluster.relatedDocuments.map((document) => document.title),
      related_entity_ids: [],
      suggestion: (llm?.suggestion || fallback.suggestion).slice(0, 2000),
      rationale: (llm?.rationale || fallback.rationale).slice(0, 2000),
      confidence: Math.min(1, Math.max(0, Number(llm?.confidence ?? fallback.confidence))),
      status: 'pending',
      metadata: {
        cluster_id: `c${index + 1}`,
        question_ids: cluster.questions.map((question) => question.id),
        top_document_id: cluster.representative.topDocumentId,
        top_document_title: cluster.representative.topDocumentTitle,
        extractor: 'brain-radar-v1',
      },
    };

    inserted.push(row);
  });

  if (inserted.length > 0) {
    const result = await input.store.client
      .from('brain_editorial_suggestions')
      .insert(inserted)
      .select('*');

    if (result.error) throw new Error('brain_radar_suggestions_write_failed');

    if (Array.isArray(result.data)) {
      suggestions.push(...(result.data as unknown as BrainRadarSuggestion[]));
    }
  }

  await input.store.client
    .from('brain_radar_runs')
    .update({
      status: 'completed',
      cluster_count: clusters.length,
      completed_at: new Date().toISOString(),
    })
    .eq('id', runId);

  return {
    runId,
    questionCount: questions.length,
    clusterCount: clusters.length,
    suggestions,
  };
}
