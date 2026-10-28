import OpenAI from "openai";
import { z } from "zod";
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
} from "./analysis";
import type { FlowItem, IssueAI } from "./types";

const TranslationSchema = z.object({
  title: z.string(),
  body: z.string(),
  description: z.string(),
  alt: z.string(),
  caption: z.string(),
});

const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
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
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

const client = () => {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not configured");

  return new OpenAI({
    apiKey,
    baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
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

  throw lastError instanceof Error
    ? lastError
    : new Error("DeepSeek request failed");
}

async function analyzeOnce(item: FlowItem) {
  const material = buildAnalysisInput(item);

  const response = await client().chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    temperature: 0,
    messages: [
      {
        role: "system",
        content: [
          "You are an exacting editor analyzing one item from a personal intellectual stream.",
          "Return JSON only. Do not rewrite the item, do not summarize it as marketing copy, and do not invent facts.",
          "Scores are integers from 0 to 5. 0 means the quality is absent; 5 means exceptional. Do not reward length, recency, fame, or provocative wording by themselves.",
          "editorialValue: overall substantive importance of the item.",
          "originality: how distinctive the observation, argument, or selection is.",
          "specificity: concrete detail, evidence, examples, names, numbers, or precision.",
          "readerValue: what a thoughtful reader actually gains from spending time with it.",
          "confidence: 0–1 confidence in this analysis given only the supplied material.",
          "topic: a short reusable subject label (not a headline). subtopic: optional narrower label.",
          "summary: one factual sentence about what the item contains. thesis: the central claim or observation, if one exists.",
          "contextRequired: what a reader needs to know that the item itself does not explain. Empty string if none.",
          "role: lead for substantial original work that could carry an issue; supporting for a worthwhile item that cannot carry it; link for an external link whose title/metadata make it worth reading; visual for a photo/caption worth showing; omit for weak, repetitive, low-value, or unintelligible material.",
          "Distinguish the author's own observation from an external source.",
          "about_flow is only for items specifically about the Flow project itself.",
          "For links and videos, judge only the supplied title and metadata. You have not read or watched the source; never claim its contents.",
          "For photos, assess only the supplied caption and metadata. You cannot see the image; never infer unseen visual details.",
          "Return exactly these keys: lang, kind, topic, subtopic, summary, thesis, editorialValue, originality, specificity, readerValue, contextRequired, confidence, role, rationale.",
          "rationale: one concise sentence explaining the scores, grounded only in the supplied material.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          type: item.type,
          material,
        }),
      },
    ],
  });

  const raw = response.choices[0]?.message?.content;

  if (!raw) throw new Error("DeepSeek returned an empty analysis");

  return AnalysisResponseSchema.parse(JSON.parse(raw));
}

async function persistAnalysis(
  supabase: any,
  item: FlowItem,
  analysis: IssueAI,
): Promise<void> {
  const nextMetadata = {
    ...(item.metadata || {}),
    issue_ai: analysis,
  };

  const { error } = await supabase
    .from("items")
    .update({ metadata: nextMetadata })
    .eq("id", item.id);

  if (error) {
    console.error(
      "[flow-issue] failed to cache analysis",
      item.id,
      error.message,
    );
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
  items: FlowItem[],
): Promise<Map<string, IssueAI>> {
  const result = new Map<string, IssueAI>();
  const unique = new Map<string, FlowItem>();

  for (const item of items) {
    if (typeof item.id === "string" && item.id.trim()) {
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

    if (
      !aiAvailable ||
      Date.now() - analysisStartedAt > ANALYSIS_BUDGET_MS
    ) {
      if (!budgetExhausted && aiAvailable) {
        console.warn(
          "[flow-issue] AI analysis budget exhausted; using heuristic analysis for the rest of this run",
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
          const response = await withRetry(() => analyzeOnce(item));
          const material = buildAnalysisInput(item);
          const analysis: IssueAI = {
            schemaVersion: ANALYSIS_VERSION,
            ...normalizeAnalysis(response),
            contentHash: contentHash(material),
            model: MODEL,
            at: new Date().toISOString(),
          };

          result.set(item.id, analysis);

          // A cache-write failure must not discard a valid analysis; the
          // per-run map still carries it into this issue.
          try {
            await persistAnalysis(supabase, item, analysis);
          } catch (error) {
            console.error(
              "[flow-issue] failed to persist analysis",
              item.id,
              error,
            );
          }

          return { ok: true as const };
        } catch (error) {
          return { ok: false as const, error };
        }
      }),
    );

    const failed = outcomes.filter((outcome) => !outcome.ok);

    for (const [batchIndex, outcome] of outcomes.entries()) {
      if (outcome.ok) continue;

      const item = batch[batchIndex];
      result.set(item.id, heuristicAnalysis(item));
      console.warn(
        "[flow-issue] DeepSeek analysis fallback",
        item.id,
        outcome.error,
      );
    }

    if (failed.length === batch.length) {
      console.warn(
        "[flow-issue] DeepSeek unavailable; using heuristic analysis for the rest of this run",
      );
      aiAvailable = false;
    }
  }

  return result;
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
  fields: z.infer<typeof TranslationSchema>,
): Promise<z.infer<typeof TranslationSchema>> {
  const response = await client().chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content:
          "Translate the supplied Flow issue fields into natural, concise English. " +
          "Return JSON only with exactly these string keys: title, body, description, alt, caption. " +
          "Preserve meaning, tone, names, quotations and factual details. " +
          "Do not summarize or add information. " +
          "Keep URLs, usernames, product names and proper nouns unchanged. " +
          "Empty input fields must remain empty. " +
          "Do not translate a field that is already natural English.",
      },
      { role: "user", content: JSON.stringify(fields) },
    ],
  });

  const raw = response.choices[0]?.message?.content;

  if (!raw) throw new Error("DeepSeek returned an empty translation");

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
  entries: T[],
): Promise<T[]> {
  const result: T[] = [...entries];

  if (!hasAIConfiguration()) return result;

  let cursor = 0;
  const startedAt = Date.now();

  async function worker() {
    while (cursor < entries.length) {
      if (Date.now() - startedAt > TRANSLATION_BUDGET_MS) {
        console.warn(
          "[flow-issue] translation budget exhausted; keeping original copy",
        );
        return;
      }

      const index = cursor++;
      const entry = entries[index];
      const fields = {
        title: typeof entry.title === "string" ? entry.title : "",
        body: typeof entry.body === "string" ? entry.body : "",
        description:
          typeof entry.description === "string" ? entry.description : "",
        alt: typeof entry.alt === "string" ? entry.alt : "",
        caption: typeof entry.caption === "string" ? entry.caption : "",
      };
      const text = Object.values(fields).filter(Boolean).join("\n");

      if (
        entry.aiAllowed !== true ||
        !text.trim() ||
        heuristicLanguage(text) === "en"
      ) {
        continue;
      }

      try {
        const translated = await withRetry(() => translateOnce(fields));

        result[index] = {
          ...entry,
          title: fields.title ? translated.title : entry.title,
          body: fields.body ? translated.body : entry.body,
          description: fields.description
            ? translated.description
            : entry.description,
          alt: fields.alt ? translated.alt : entry.alt,
          caption: fields.caption ? translated.caption : entry.caption,
        };
      } catch (error) {
        console.warn("[flow-issue] translation fallback", entry.title, error);
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(TRANSLATION_CONCURRENCY, entries.length) },
    () => worker(),
  );

  await Promise.all(workers);

  return result;
}

export { HEURISTIC_MODEL };
