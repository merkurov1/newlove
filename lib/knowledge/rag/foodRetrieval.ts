import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { BrainSourceClass, RetrievedChunk } from './types';

const FOOD_TERMS = [
  'рецепт',
  'блюд',
  'кулинар',
  'ингредиент',
  'обжарива',
  'приготов',
  'нареза',
  'туш',
  'варить',
  'бульон',
  'кастрюл',
  'сковород',
  'фарш',
  'тесто',
  'food',
  'recipe',
  'cooking',
];

const COOKING_PATTERN =
  /обжар(?:ива|ь|енн|им|иваем|ить|енный)|туш(?:ить|им|ится|ение|еный|еная|еные|ён)|вар(?:ить|им|ится|ка|еный|еная|еные|ёный)|нарез(?:а|ыва|ь|анн)|приготов(?:ить|ил|им|ление|ленный|лена|лено|ьте|ь)|запек(?:а|у|ли|ённ)|жар(?:ить|им|ка|еный)|смеш(?:а|ива)|залив(?:а|аем)|поперч|специ(?:и|й|ями|ях|ю)|соус|бульон|тесто|фарш|кастрюл|сковород|духовк/gi;

const RECIPE_STRONG_PATTERN =
  /(?<![a-zа-яё0-9])(?:рецепт|блюд|кулинар|ингредиент|food|recipe|recipes)/gi;

const FOOD_GENERIC_PATTERN = /(?<![a-zа-яё0-9])(?:еда|еды|еде|cooking|cook|meal|dish|dishes)/gi;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    },
  });
}

function sourceClassFor(sourceType: string): BrainSourceClass {
  if (sourceType === 'manuscript') return 'manuscript';
  if (sourceType === 'article' || sourceType === 'media_coverage') return 'article';
  if (sourceType === 'txt' || sourceType === 'text') return 'other';
  return 'other';
}

function scoreChunk(input: {
  content: string;
  title: string;
  strongFood: number;
  cookingSignals: number;
}): number {
  const lengthScore = Math.min(1, input.content.length / 700);
  let score =
    0.5 +
    Math.min(0.2, input.strongFood * 0.05) +
    Math.min(0.25, input.cookingSignals * 0.04) +
    lengthScore * 0.1;

  if (input.content.length < 80) score -= 0.3;
  if (/контекстный профиль/i.test(input.title)) score -= 0.3;

  return Math.max(0.05, Math.min(0.9, Number(score.toFixed(6))));
}

/**
 * Deterministic food/recipe fallback.
 *
 * The diary archive stores recipe instructions in short adjacent chunks that
 * can lose a pure vector-similarity race to one-line headings such as
 * "Рецепт недели:". This fallback retrieves food chunks directly, ranks by
 * cooking signals and content length, and keeps several chunks from the same
 * archive document so a recipe list is not reduced to a single marker.
 */
export async function retrieveFoodChunks(input: {
  query: string;
  scope: 'owner' | 'public';
  topK?: number;
  maxPerDocument?: number;
  client?: SupabaseClient | null;
}): Promise<RetrievedChunk[]> {
  if (input.scope !== 'owner') return [];

  const client = input.client === undefined ? createServiceClient() : input.client;
  if (!client) return [];

  const terms = FOOD_TERMS;
  const orFilter = terms.map((term) => `content.ilike.%${term}%`).join(',');

  try {
    const { data, error } = await client
      .from('knowledge_chunks')
      .select(
        'id,document_id,content,heading,section_path,section_index,line_start,line_end,access_class,knowledge_documents!inner(id,title,source_type,access_class,public_retrieval_allowed,language,published_at,ingestion_status)'
      )
      .eq('access_class', 'owner')
      .or(orFilter)
      .limit(500);

    if (error || !Array.isArray(data)) return [];

    const chunks = data
      .map((raw) => {
        const row = raw as Record<string, unknown>;
        const documentValue = row.knowledge_documents;
        const document = (Array.isArray(documentValue) ? documentValue[0] : documentValue) as
          Record<string, unknown> | null | undefined;

        if (!document) return null;
        if (String(document.access_class || '') !== 'owner') return null;
        if (String(document.ingestion_status || '') !== 'completed') return null;

        const title = String(document.title || '');
        if (/контекстный профиль/i.test(title)) return null;

        const content = String(row.content || '');
        if (!content.trim()) return null;

        const cooked = (content.match(COOKING_PATTERN) || []).length;
        const recipeStrong = (content.match(RECIPE_STRONG_PATTERN) || []).length;
        const foodGeneric = (content.match(FOOD_GENERIC_PATTERN) || []).length;
        const sourceType = String(document.source_type || 'other');
        const minCookingSignals = sourceType === 'txt' || sourceType === 'text' ? 2 : 3;

        if (cooked < minCookingSignals) return null;
        if (content.length < 80 && cooked < 2) return null;

        const strongFood = recipeStrong + foodGeneric;
        const score = scoreChunk({ content, title, strongFood, cookingSignals: cooked });

        const chunk: RetrievedChunk = {
          chunkId: String(row.id),
          documentId: String(row.document_id),
          content,
          heading: String(row.heading || ''),
          sectionPath: Array.isArray(row.section_path)
            ? row.section_path.filter((part): part is string => typeof part === 'string')
            : [],
          sectionIndex: Number(row.section_index) || 0,
          lineStart: Number(row.line_start) || 0,
          lineEnd: Number(row.line_end) || 0,
          similarity: score,
          documentTitle: title,
          sourceType,
          sourceClass: sourceClassFor(sourceType),
          sourceDomain: null,
          author: null,
          language: typeof document.language === 'string' ? document.language : null,
          publishedAt: typeof document.published_at === 'string' ? document.published_at : null,
          lexicalScore: strongFood + cooked,
          combinedScore: score,
        };

        return chunk;
      })
      .filter((chunk): chunk is RetrievedChunk => Boolean(chunk))
      .sort(
        (left, right) =>
          (right.combinedScore || 0) - (left.combinedScore || 0) ||
          (right.content.length || 0) - (left.content.length || 0)
      );

    const topK = Math.min(Math.max(input.topK ?? 8, 1), 12);
    const maxPerDocument = Math.min(Math.max(input.maxPerDocument ?? 6, 1), 8);
    const perDocument = new Map<string, number>();
    const selected: RetrievedChunk[] = [];
    const seen = new Set<string>();

    for (const chunk of chunks) {
      if (seen.has(chunk.chunkId)) continue;

      const count = perDocument.get(chunk.documentId) || 0;
      if (count >= maxPerDocument) continue;

      selected.push(chunk);
      seen.add(chunk.chunkId);
      perDocument.set(chunk.documentId, count + 1);

      if (selected.length >= topK) break;
    }

    return selected;
  } catch {
    return [];
  }
}
