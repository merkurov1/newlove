import OpenAI from 'openai';
import { z } from 'zod';
import { generateGeminiText, isGeminiConfigured } from '@/lib/ai/gemini';
import { extractTextFragments, extractTextParts } from '@/lib/flow/text';
import {
  ANALYSIS_VERSION,
  AnalysisResponseSchema,
  HEURISTIC_MODEL,
  buildAnalysisInput,
  cachedAnalysis,
  contentHash,
  heuristicAnalysis,
  heuristicLanguage,
  isAnalyzable,
  normalizeAnalysis,
} from './analysis';
import { normalizeNarrative, type IssueNarrative } from './narrative';
import type {
  EditorialComposition,
  FlowItem,
  IssueAI,
  IssueEntry,
  IssueLang,
} from './types';

const TranslationSchema = z.object({
  title: z.string(),
  body: z.string(),
  description: z.string(),
  alt: z.string(),
  caption: z.string(),
});

const clean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const TIMEOUT_MS = 12_000;
const MAX_RETRIES = 1;
const BATCH_SIZE = 6;
const TRANSLATION_CONCURRENCY = 4;
/**
 * Leave room inside the route's 60s budget for issue assembly and
 * translation. Remaining items fall back to deterministic heuristics.
 */
const ANALYSIS_BUDGET_MS = 40_000;
/** Untranslated copy is always preferable to losing the original. */
const TRANSLATION_BUDGET_MS = 20_000;

export { heuristicLanguage };

export function hasAIConfiguration(): boolean {
  return Boolean(process.env.GEMINI_API_KEY || process.env.DEEPSEEK_API_KEY);
}

function hasDeepSeekConfiguration(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

const client = () => {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) throw new Error('DEEPSEEK_API_KEY is not configured');

  return new OpenAI({
    apiKey,
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    timeout: TIMEOUT_MS,
    maxRetries: 0,
  });
};

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < MAX_RETRIES) {
        const delay = 350 * (attempt + 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('DeepSeek request failed');
}

const ANALYSIS_SYSTEM_PROMPT = [
  'You are an exacting editor analyzing one item from a personal intellectual stream.',
  'Return JSON only. Do not rewrite the item, do not summarize it as marketing copy, and do not invent facts.',
  'Scores are integers from 0 to 5. 0 means the quality is absent; 5 means exceptional. Do not reward length, recency, fame, or provocative wording by themselves.',
  'editorialValue: overall substantive importance of the item.',
  'originality: how distinctive the observation, argument, or selection is.',
  'specificity: concrete detail, evidence, examples, names, numbers, or precision.',
  'readerValue: what a thoughtful reader actually gains from spending time with it.',
  'confidence: 0–1 confidence in this analysis given only the supplied material.',
  'topic: a short reusable subject label (not a headline). subtopic: optional narrower label.',
  'summary: one factual sentence about what the item contains. thesis: the central claim or observation, if one exists.',
  'contextRequired: what a reader needs to know that the item itself does not explain. Empty string if none.',
  'role: lead for substantial original work that could carry an issue; supporting for a worthwhile item that cannot carry it; link for an external link whose title/metadata make it worth reading; visual for a photo/caption worth showing; omit for weak, repetitive, low-value, or unintelligible material.',
  "Distinguish the author's own observation from an external source.",
  'about_flow is only for items specifically about the Flow project itself.',
  'For links and videos, judge only the supplied title and metadata. You have not read or watched the source; never claim its contents.',
  'For photos, assess only the supplied caption and metadata. You cannot see the image; never infer unseen visual details.',
  'Return exactly these keys: lang, kind, topic, subtopic, summary, thesis, editorialValue, originality, specificity, readerValue, contextRequired, confidence, role, rationale.',
  'lang must be exactly one of: ru, en, other. kind must be exactly one of: about_flow, world, other.',
  'role must be exactly one of: lead, supporting, link, visual, omit.',
  'Never return null for a string field; use an empty string when a descriptive value is absent.',
  'rationale: one concise sentence explaining the scores, grounded only in the supplied material.',
].join(' ');

function analysisUserPrompt(item: FlowItem): string {
  return JSON.stringify({
    type: item.type,
    material: buildAnalysisInput(item),
  });
}

type AnalyzedItem = {
  response: z.infer<typeof AnalysisResponseSchema>;
  model: string;
  provider: 'gemini' | 'deepseek';
  latencyMs: number;
  fallbackUsed: boolean;
};

async function analyzeWithDeepSeek(
  item: FlowItem
): Promise<z.infer<typeof AnalysisResponseSchema>> {
  const response = await client().chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    temperature: 0,
    messages: [
      { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
      { role: 'user', content: analysisUserPrompt(item) },
    ],
  });

  const raw = response.choices[0]?.message?.content;

  if (!raw) throw new Error('DeepSeek returned an empty analysis');

  return AnalysisResponseSchema.parse(JSON.parse(raw));
}

async function analyzeOnce(item: FlowItem): Promise<AnalyzedItem> {
  const userPrompt = analysisUserPrompt(item);
  let geminiError: unknown = null;

  if (isGeminiConfigured()) {
    try {
      const gemini = await generateGeminiText({
        system: ANALYSIS_SYSTEM_PROMPT,
        prompt: userPrompt,
        temperature: 0,
        maxOutputTokens: 900,
        timeoutMs: TIMEOUT_MS,
        responseMimeType: 'application/json',
      });

      const response = AnalysisResponseSchema.parse(JSON.parse(gemini.content));

      return {
        response,
        model: gemini.model,
        provider: 'gemini',
        latencyMs: gemini.latencyMs,
        fallbackUsed: false,
      };
    } catch (error) {
      geminiError = error;
      console.warn(
        '[flow-issue] Gemini analysis unavailable; trying DeepSeek:',
        error instanceof Error ? error.message : 'gemini_request_failed'
      );
    }
  }

  const startedAt = Date.now();
  const response = await withRetry(() => analyzeWithDeepSeek(item));

  return {
    response,
    model: MODEL,
    provider: 'deepseek',
    latencyMs: Date.now() - startedAt,
    fallbackUsed: Boolean(geminiError),
  };
}

async function persistAnalysis(supabase: any, item: FlowItem, analysis: IssueAI): Promise<void> {
  const nextMetadata = {
    ...(item.metadata || {}),
    issue_ai: analysis,
  };

  const { error } = await supabase
    .from('items')
    .update({ metadata: nextMetadata })
    .eq('id', item.id);

  if (error) {
    console.error('[flow-issue] failed to cache analysis', item.id, error.message);
  }
}

/**
 * Analyze new or changed items and return the analysis for every input item.
 *
 * Privacy: only records with `ai_allowed === true` are ever sent. Items with
 * `ai_allowed === false` get local heuristic analysis, which never leaves the
 * server. Cached model analyses are reused only when the schema version and
 * the source hash both match. Fallback analyses are not persisted, so a later
 * run can recover from a temporary outage.
 *
 * Economy: one request per item, at most BATCH_SIZE concurrent. If every item
 * in a batch fails, the run stops calling DeepSeek and uses heuristics for the
 * rest instead of hammering an unavailable service.
 */
export async function classifyNewItems(
  supabase: any,
  items: FlowItem[]
): Promise<Map<string, IssueAI>> {
  const result = new Map<string, IssueAI>();
  const unique = new Map<string, FlowItem>();

  for (const item of items) {
    if (typeof item.id === 'string' && item.id.trim()) {
      unique.set(item.id, item);
    }
  }

  const pending: FlowItem[] = [];

  for (const item of unique.values()) {
    if (!isAnalyzable(item)) {
      if (item.id) result.set(item.id, heuristicAnalysis(item));
      continue;
    }

    const cached = cachedAnalysis(item);

    if (cached) {
      result.set(item.id, cached);
      continue;
    }

    pending.push(item);
  }

  if (!pending.length) return result;

  if (!hasAIConfiguration()) {
    console.warn(
      '[flow-issue] No AI provider is configured; using local heuristic analysis for this issue'
    );

    for (const item of pending) {
      result.set(item.id, heuristicAnalysis(item));
    }

    return result;
  }

  let aiAvailable = true;
  const analysisStartedAt = Date.now();
  let budgetExhausted = false;

  for (let index = 0; index < pending.length; index += BATCH_SIZE) {
    const batch = pending.slice(index, index + BATCH_SIZE);

    if (!aiAvailable || Date.now() - analysisStartedAt > ANALYSIS_BUDGET_MS) {
      if (!budgetExhausted && aiAvailable) {
        console.warn(
          '[flow-issue] AI analysis budget exhausted; using heuristic analysis for the rest of this run'
        );
        budgetExhausted = true;
      }

      for (const item of batch) {
        result.set(item.id, heuristicAnalysis(item));
      }

      continue;
    }

    const outcomes = await Promise.all(
      batch.map(async (item) => {
        try {
          const analyzed = await analyzeOnce(item);
          const material = buildAnalysisInput(item);
          const analysis: IssueAI = {
            schemaVersion: ANALYSIS_VERSION,
            ...normalizeAnalysis(analyzed.response),
            contentHash: contentHash(material),
            model: analyzed.model,
            provider: analyzed.provider,
            latencyMs: analyzed.latencyMs,
            fallbackUsed: analyzed.fallbackUsed,
            at: new Date().toISOString(),
          };

          result.set(item.id, analysis);

          // A cache-write failure must not discard a valid analysis; the
          // per-run map still carries it into this issue.
          try {
            await persistAnalysis(supabase, item, analysis);
          } catch (error) {
            console.error('[flow-issue] failed to persist analysis', item.id, error);
          }

          return { ok: true as const };
        } catch (error) {
          return { ok: false as const, error };
        }
      })
    );

    const failed = outcomes.filter((outcome) => !outcome.ok);

    for (const [batchIndex, outcome] of outcomes.entries()) {
      if (outcome.ok) continue;

      const item = batch[batchIndex];
      result.set(item.id, heuristicAnalysis(item));
      console.warn(
        '[flow-issue] AI analysis fallback',
        item.id,
        outcome.error instanceof Error ? outcome.error.message : 'analysis_failed'
      );
    }

    if (failed.length === batch.length) {
      console.warn(
        '[flow-issue] No AI provider available; using heuristic analysis for the rest of this run'
      );
      aiAvailable = false;
    }
  }

  return result;
}

const NarrativeSchema = z.object({
  summary: z.string().trim().min(1).max(90),
  paragraphs: z.array(z.string().trim().min(1).max(700)).min(2).max(3),
});

const NARRATIVE_SYSTEM_PROMPT = [
  'You are Pierrot, the AI editor of Flow, a personal stream of notes, links, images and signals by Anton Merkurov.',
  'Write a short author column that opens an issue assembled from the supplied materials.',
  'Your editorial autonomy is limited to this column and to the selection/order of already published material. Do not rewrite, impersonate or attribute new positions to Anton Merkurov, external authors or video makers.',
  'Tone: laconic, precise, philosophical and technological. No marketing language, no grandiosity, no invented facts, no invented disagreements.',
  'Use only the supplied titles, excerpts and analysis labels. Do not claim to have read links or watched videos.',
  'Return JSON only with exactly two keys: summary and paragraphs.',
  "summary: a short phrase of two to six words that answers 'what is this issue about?'. It must fit on one line.",
  'paragraphs: exactly two or three short paragraphs, each 25–55 words, that name the key meaning and context of the issue.',
  'Do not repeat the issue title as a sentence. Write in the requested language only.',
].join(' ');

function narrativeMaterial(
  items: IssueEntry[],
  analyses: Map<string, IssueAI>
): Record<string, unknown>[] {
  return items
    .filter((item) => item.aiAllowed === true)
    .filter((item) => extractTextFragments(item).length > 0)
    .map((item) => {
      const analysis = analyses.get(item.id);
      // Every text field of the entry feeds the narrative, not only the first
      // non-empty one. The title is removed from the excerpt to avoid
      // spending context on the same words twice.
      const parts = extractTextParts(item, item.title, 12_000);

      return {
        type: item.type,
        title: parts.title.slice(0, 220),
        excerpt: parts.body.replace(/\s+/g, ' ').slice(0, 12_000),
        publishedAt: item.publishedAt,
        topic: clean(analysis?.topic),
        summary: clean(analysis?.summary),
        thesis: clean(analysis?.thesis),
      };
    });
}

function parseNarrative(raw: string | null | undefined, lang: IssueLang): IssueNarrative | null {
  if (!raw) return null;

  try {
    const parsed = NarrativeSchema.parse(JSON.parse(raw));
    return normalizeNarrative(parsed, lang);
  } catch (error) {
    console.warn(
      '[flow-issue] narrative parse failed',
      error instanceof Error ? error.message : 'invalid_narrative'
    );
    return null;
  }
}

/**
 * Generate the bilingual author-column opening and the short header summary
 * from the issue materials and their per-item analyses.
 *
 * Privacy: only entries explicitly marked `aiAllowed === true` are sent.
 * The caller always has a deterministic local fallback, so a missing model
 * configuration never blocks issue assembly.
 */
export async function generateIssueNarrative(input: {
  items: IssueEntry[];
  analyses: Map<string, IssueAI>;
  lang: IssueLang;
  period: { start: string; end: string };
}): Promise<IssueNarrative | null> {
  const materials = narrativeMaterial(input.items, input.analyses);

  if (materials.length === 0 || !hasAIConfiguration()) {
    return null;
  }

  const prompt = JSON.stringify({
    language: input.lang === 'ru' ? 'Russian' : 'English',
    period: input.period,
    itemCount: input.items.length,
    materials,
  }).slice(0, 14_000);

  if (isGeminiConfigured()) {
    try {
      const gemini = await generateGeminiText({
        system: NARRATIVE_SYSTEM_PROMPT,
        prompt,
        temperature: 0.35,
        maxOutputTokens: 900,
        timeoutMs: TIMEOUT_MS,
        responseMimeType: 'application/json',
      });

      const parsed = parseNarrative(gemini.content, input.lang);
      if (parsed) return parsed;
    } catch (error) {
      console.warn(
        '[flow-issue] Gemini narrative unavailable; trying DeepSeek:',
        error instanceof Error ? error.message : 'gemini_request_failed'
      );
    }
  }

  if (!hasDeepSeekConfiguration()) return null;

  try {
    const promptWithLanguage = JSON.stringify({
      language: input.lang === 'ru' ? 'Russian' : 'English',
      period: input.period,
      itemCount: input.items.length,
      materials,
    }).slice(0, 14_000);

    const raw = await withRetry(async () => {
      const response = await client().chat.completions.create({
        model: MODEL,
        response_format: { type: 'json_object' },
        temperature: 0.35,
        messages: [
          { role: 'system', content: NARRATIVE_SYSTEM_PROMPT },
          { role: 'user', content: promptWithLanguage },
        ],
      });

      return response.choices[0]?.message?.content;
    });

    return parseNarrative(raw, input.lang);
  } catch (error) {
    console.warn(
      '[flow-issue] AI narrative fallback',
      error instanceof Error ? error.message : 'narrative_failed'
    );
    return null;
  }
}

/* ---------- editorial column over the whole composition ---------- */

const ColumnSchema = z.object({
  summary: z.string().trim().min(1).max(90),
  paragraphs: z.array(z.string().trim().min(1).max(900)).min(2).max(5),
});

const COLUMN_SYSTEM_PROMPT = [
  'You are Pierrot, the AI editor of Flow, a personal stream of notes, links, images and signals by Anton Merkurov.',
  'Write the author column for an issue whose whole editorial composition is supplied below as a sequence of thematic chunks.',
  'The column must interpret the issue as a whole: the central line, the thematic threads, the standalone episodes, the visual pauses and the complete overview.',
  'Explain the connections and the significance of neighbouring materials. Do not list headlines, do not retell each item, and do not write a formal introduction.',
  'Your editorial autonomy is limited to this column. Do not rewrite, impersonate or attribute new positions to Anton Merkurov, external authors or video makers.',
  'Use only the supplied summaries, titles and analysis labels. Do not claim to have read links or watched videos.',
  'Tone: laconic, precise, philosophical and technological. No marketing language, no grandiosity, no invented facts, no invented disagreements.',
  'Return JSON only with exactly two keys: summary and paragraphs.',
  "summary: a short phrase of two to six words that answers 'what is this issue about?'. It must fit on one line.",
  'paragraphs: two or three substantial paragraphs, each 50–110 words. Write in the requested language only.',
].join(' ');

type ColumnMaterial = {
  type: string;
  title: string;
  excerpt: string;
  topic: string;
  summary: string;
  thesis: string;
  partIndex: number;
};

function columnMaterials(
  composition: EditorialComposition,
  entries: Map<string, IssueEntry>,
  analyses: Map<string, IssueAI>
): ColumnMaterial[] {
  const partByEntry = new Map<string, number>();
  const orderedIds: string[] = [];
  const seenIds = new Set<string>();

  composition.parts.forEach((part, index) => {
    for (const id of part.entryIds) {
      partByEntry.set(id, index);
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      orderedIds.push(id);
    }
  });

  const ledgerById = new Map(composition.ledger.map((entry) => [entry.id, entry]));

  for (const ledger of composition.ledger) {
    if (seenIds.has(ledger.id)) continue;
    seenIds.add(ledger.id);
    orderedIds.push(ledger.id);
  }

  const seen = new Set<string>();
  const materials: ColumnMaterial[] = [];

  for (const id of orderedIds) {
    const ledger = ledgerById.get(id);
    if (!ledger || ledger.role === 'other_edition') continue;
    if (seen.has(id)) continue;
    seen.add(id);

    const entry = entries.get(id);
    if (!entry || entry.aiAllowed !== true) continue;

    const analysis = analyses.get(id);
    // Read all textual fragments of the material regardless of type. The
    // title is excluded from the excerpt so the same words are not sent twice.
    const parts = extractTextParts(entry, entry.title, 12_000);
    const excerpt = parts.body.replace(/\s+/g, ' ').slice(0, 12_000);

    // A material with no visible text still exists, but there is nothing to
    // send. It is counted in the prompt without exposing its content.
    if (!parts.title.trim() && !excerpt) continue;

    materials.push({
      type: entry.type,
      title: parts.title.slice(0, 220),
      excerpt,
      topic: clean(analysis?.topic).slice(0, 120),
      summary: clean(analysis?.summary).slice(0, 400),
      thesis: clean(analysis?.thesis).slice(0, 400),
      partIndex: partByEntry.get(id) ?? -1,
    });
  }

  return materials;
}

function chunkMaterials(materials: ColumnMaterial[]): ColumnMaterial[][] {
  if (!materials.length) return [];

  const total = materials.reduce(
    (size, material) => size + JSON.stringify(material).length,
    0
  );
  // Bounded number of provider calls (at most ~12) while still passing every
  // allowed material through a chunk. Large weeks get larger chunks instead
  // of losing the tail of the corpus.
  const target = Math.max(2_500, Math.ceil(total / 12));
  const chunks: ColumnMaterial[][] = [];
  let current: ColumnMaterial[] = [];
  let size = 0;

  for (const material of materials) {
    const nextSize = JSON.stringify(material).length;

    if (current.length && size + nextSize > target) {
      chunks.push(current);
      current = [];
      size = 0;
    }

    current.push(material);
    size += nextSize;
  }

  if (current.length) chunks.push(current);
  return chunks;
}

async function requestJsonText(
  system: string,
  prompt: string,
  temperature: number
): Promise<string | null> {
  if (isGeminiConfigured()) {
    try {
      const gemini = await generateGeminiText({
        system,
        prompt,
        temperature,
        maxOutputTokens: 900,
        timeoutMs: TIMEOUT_MS,
        responseMimeType: 'application/json',
      });

      return gemini.content;
    } catch (error) {
      console.warn(
        '[flow-issue] Gemini column step unavailable; trying DeepSeek:',
        error instanceof Error ? error.message : 'gemini_request_failed'
      );
    }
  }

  if (!hasDeepSeekConfiguration()) return null;

  const raw = await withRetry(async () => {
    const response = await client().chat.completions.create({
      model: MODEL,
      response_format: { type: 'json_object' },
      temperature,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    });

    return response.choices[0]?.message?.content;
  });

  return raw || null;
}

const ChunkSummarySchema = z.object({
  summary: z.string().trim().min(1).max(1_500),
});

/**
 * Synthesize the whole issue in chunks, then write Pierrot's column from all
 * chunk summaries. This is deliberately not a "first 18 materials" sample:
 * every AI-allowed record of the composition contributes to a chunk, and the
 * final call sees the sequence of the whole issue.
 *
 * Privacy: materials with `aiAllowed !== true` are never included, not even
 * as titles. They are only counted as inaccessible in the final prompt.
 */
export async function generateEditorialColumn(input: {
  composition: EditorialComposition;
  entries: Map<string, IssueEntry>;
  analyses: Map<string, IssueAI>;
  lang: IssueLang;
  period: { start: string; end: string };
}): Promise<{ summary: string; paragraphs: string[] } | null> {
  if (!hasAIConfiguration()) return null;

  const materials = columnMaterials(input.composition, input.entries, input.analyses);
  if (!materials.length) return null;

  const allowedCount = input.composition.ledger.filter(
    (entry) => entry.role !== 'other_edition' && entry.aiAllowed === true
  ).length;
  const nonAllowedCount = input.composition.ledger.filter(
    (entry) => entry.role !== 'other_edition' && !entry.aiAllowed
  ).length;
  const inaccessibleCount = Math.max(0, allowedCount - materials.length);
  const chunks = chunkMaterials(materials);

  const summaries: string[] = [];
  let cursor = 0;
  const concurrency = Math.min(4, chunks.length);

  async function worker() {
    while (cursor < chunks.length) {
      const index = cursor++;
      const chunk = chunks[index];

      try {
        const raw = await requestJsonText(
          [
            'You are a careful research assistant for a personal intellectual weekly.',
            'Summarize the supplied materials as one sequence: name the themes, the recurring motifs, the development of thought, the contrasts and any standalone story.',
            'Do not invent content for links or videos. Use only the supplied titles, excerpts and analysis labels.',
            'Return JSON only with exactly one key: summary. The summary must be one paragraph of at most 900 characters.',
          ].join(' '),
          JSON.stringify({
            language: input.lang === 'ru' ? 'Russian' : 'English',
            partIndex: chunk[0]?.partIndex ?? 0,
            materials: chunk.map((material) => ({
              type: material.type,
              title: material.title,
              excerpt: material.excerpt,
              topic: material.topic,
              summary: material.summary,
              thesis: material.thesis,
            })),
          }),
          0.2
        );

        if (!raw) continue;

        const parsed = ChunkSummarySchema.safeParse(JSON.parse(raw));
        if (parsed.success) summaries[index] = parsed.data.summary;
      } catch (error) {
        console.warn(
          '[flow-issue] column chunk failed',
          error instanceof Error ? error.message : 'chunk_failed'
        );
      }
    }
  }

  await Promise.all(
    Array.from({ length: concurrency }, () => worker())
  );

  const availableSummaries = summaries.filter(
    (value): value is string => Boolean(value)
  );

  if (!availableSummaries.length) return null;

  const partCounts = input.composition.parts.map((part) => ({
    kind: part.kind,
    count: part.entryIds.length,
  }));

  let raw: string | null = null;

  try {
    raw = await requestJsonText(
      COLUMN_SYSTEM_PROMPT,
      JSON.stringify({
        language: input.lang === 'ru' ? 'Russian' : 'English',
        period: input.period,
        totalMaterials: input.composition.diagnostics.source_count,
        accessibleMaterials: materials.length,
        inaccessibleMaterials: inaccessibleCount,
        privacyExcludedMaterials: nonAllowedCount,
        partCounts,
        compositionSummaries: availableSummaries,
      }),
      0.35
    );
  } catch (error) {
    console.warn(
      '[flow-issue] editorial column provider failed; using local column',
      error instanceof Error ? error.message : 'column_failed'
    );
    return null;
  }

  if (!raw) return null;

  try {
    const parsed = ColumnSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;

    return {
      summary: parsed.data.summary.slice(0, 70),
      paragraphs: parsed.data.paragraphs.slice(0, 3).map((paragraph) => paragraph.slice(0, 900)),
    };
  } catch (error) {
    console.warn(
      '[flow-issue] column parse failed',
      error instanceof Error ? error.message : 'invalid_column'
    );
    return null;
  }
}

export type TranslatableIssueEntry = {
  title?: string;
  body?: string;
  description?: string;
  alt?: string;
  caption?: string;
  /**
   * Must be exactly true for the content to be sent to an AI service.
   * Missing/false values leave the original text untouched.
   */
  aiAllowed?: boolean;
  [key: string]: any;
};

async function translateOnce(
  fields: z.infer<typeof TranslationSchema>
): Promise<z.infer<typeof TranslationSchema>> {
  const response = await client().chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    temperature: 0.1,
    messages: [
      {
        role: 'system',
        content:
          'Translate the supplied Flow issue fields into natural, concise English. ' +
          'Return JSON only with exactly these string keys: title, body, description, alt, caption. ' +
          'Preserve meaning, tone, names, quotations and factual details. ' +
          'Do not summarize or add information. ' +
          'Keep URLs, usernames, product names and proper nouns unchanged. ' +
          'Empty input fields must remain empty. ' +
          'Do not translate a field that is already natural English.',
      },
      { role: 'user', content: JSON.stringify(fields) },
    ],
  });

  const raw = response.choices[0]?.message?.content;

  if (!raw) throw new Error('DeepSeek returned an empty translation');

  return TranslationSchema.parse(JSON.parse(raw));
}

/**
 * Translate only issue copy. This never updates Flow records.
 *
 * Translation is also an AI call, so the same privacy boundary applies:
 * entries without `aiAllowed === true` are returned untouched. When a
 * translation fails, the original text is retained.
 */
export async function translateIssueEntries<T extends TranslatableIssueEntry>(
  entries: T[]
): Promise<T[]> {
  const result: T[] = [...entries];

  // Translation remains on DeepSeek, independently of the analysis provider.
  if (!hasDeepSeekConfiguration()) return result;

  let cursor = 0;
  const startedAt = Date.now();

  async function worker() {
    while (cursor < entries.length) {
      if (Date.now() - startedAt > TRANSLATION_BUDGET_MS) {
        console.warn('[flow-issue] translation budget exhausted; keeping original copy');
        return;
      }

      const index = cursor++;
      const entry = entries[index];
      const fields = {
        title: typeof entry.title === 'string' ? entry.title : '',
        body: typeof entry.body === 'string' ? entry.body : '',
        description: typeof entry.description === 'string' ? entry.description : '',
        alt: typeof entry.alt === 'string' ? entry.alt : '',
        caption: typeof entry.caption === 'string' ? entry.caption : '',
      };
      const text = Object.values(fields).filter(Boolean).join('\n');

      if (entry.aiAllowed !== true || !text.trim() || heuristicLanguage(text) === 'en') {
        continue;
      }

      try {
        const translated = await withRetry(() => translateOnce(fields));

        result[index] = {
          ...entry,
          title: fields.title ? translated.title : entry.title,
          body: fields.body ? translated.body : entry.body,
          description: fields.description ? translated.description : entry.description,
          alt: fields.alt ? translated.alt : entry.alt,
          caption: fields.caption ? translated.caption : entry.caption,
        };
      } catch (error) {
        console.warn('[flow-issue] translation fallback', entry.title, error);
      }
    }
  }

  const workers = Array.from({ length: Math.min(TRANSLATION_CONCURRENCY, entries.length) }, () =>
    worker()
  );

  await Promise.all(workers);

  return result;
}

export { HEURISTIC_MODEL };
