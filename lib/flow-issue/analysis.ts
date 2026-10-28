import { z } from "zod";
import { getLinkPreviews } from "./metadata";
import type {
  FlowItem,
  IssueAI,
  IssueAIRole,
  IssueKind,
  IssueLang,
} from "./types";

/**
 * Bump this when the prompt, fields, or score semantics change. Cached
 * analyses with a different version are recomputed, never silently reused.
 */
export const ANALYSIS_VERSION = 2;

export const HEURISTIC_MODEL = "heuristic-fallback";

const Score = z.number().min(0).max(5);
const Confidence = z.number().min(0).max(1);

/**
 * Strict shape for a fresh model response. Missing score fields are rejected
 * rather than defaulted: a partial analysis must not look authoritative.
 * Descriptive fields have safe defaults because they are not used for scoring.
 */
export const AnalysisResponseSchema = z.object({
  lang: z.enum(["ru", "en", "other"]),
  kind: z.enum(["about_flow", "world", "other"]),
  topic: z.string().trim().min(1).max(100),
  subtopic: z.string().trim().max(120).default(""),
  summary: z.string().trim().min(1).max(600),
  thesis: z.string().trim().max(600).default(""),
  editorialValue: Score,
  originality: Score,
  specificity: Score,
  readerValue: Score,
  contextRequired: z.string().trim().max(300).default(""),
  confidence: Confidence,
  role: z.enum(["lead", "supporting", "link", "visual", "omit"]),
  rationale: z.string().trim().max(600).default(""),
});

export type AnalysisResponse = z.infer<typeof AnalysisResponseSchema>;

const CachedAnalysisSchema = AnalysisResponseSchema.extend({
  schemaVersion: z.literal(ANALYSIS_VERSION),
  contentHash: z.string().min(1),
  model: z.string().min(1),
  at: z.string().min(1),
});

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "have", "has",
  "are", "was", "were", "but", "not", "you", "your", "about", "into",
  "its", "it's", "they", "their", "there", "what", "when", "where",
  "which", "who", "why", "how", "will", "would", "can", "could",
  "should", "just", "more", "most", "some", "than", "then", "them",
  "these", "those", "been", "being", "because", "while", "after",
  "before", "over", "under", "very", "also", "only", "like", "than",
  "что", "как", "для", "это", "этот", "эта", "эти", "или", "но",
  "если", "еще", "ещё", "уже", "был", "была", "были", "быть", "есть",
  "при", "про", "над", "под", "без", "для", "из", "от", "до", "по",
  "на", "в", "во", "не", "ни", "же", "ли", "бы", "то", "так", "там",
  "тут", "мы", "вы", "он", "она", "они", "оно", "я", "ты", "его",
  "ее", "её", "их", "мой", "моя", "мои", "наш", "наши", "ваш", "ваши",
  "который", "которая", "которые", "когда", "где", "чем", "чего",
]);

const clean = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const roundScore = (value: number): number =>
  clamp(Math.round(value), 0, 5);

/**
 * FNV-1a. Deliberately small and dependency-free: the hash only needs to
 * notice that the source material changed between generation runs.
 */
export function contentHash(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `${(hash >>> 0).toString(16).padStart(8, "0")}:${value.length}`;
}

/**
 * Canonical text used both for hashing and for the model prompt.
 *
 * Only metadata that is part of the item's published presentation is
 * included. We never fetch or infer the contents of a link/video/photo.
 */
export function buildAnalysisInput(item: FlowItem): string {
  const metadata = item.metadata || {};
  const linkPreviewFields = getLinkPreviews(metadata)
    .slice(0, 2)
    .flatMap((preview) => [
      clean(preview.title),
      clean(preview.description),
      clean(preview.site_name),
      clean(preview.domain),
    ]);

  const parts = [
    `type: ${clean(item.type)}`,
    clean(item.title),
    clean(item.body_md),
    clean(metadata.title),
    clean(metadata.description),
    clean(metadata.site_name),
    clean(metadata.domain),
    clean(metadata.author),
    clean(metadata.public_url),
    clean(metadata.alt),
    clean(metadata.caption),
    ...linkPreviewFields,
    clean(metadata.youtube?.title),
    clean(metadata.youtube?.author_name),
    clean(metadata.youtube?.provider_name),
  ].filter(Boolean);

  // Preserve order while removing accidental duplicates (e.g. title stored
  // both in items.title and metadata.title).
  return [...new Set(parts)].join("\n\n").slice(0, 7_000);
}

export function plainAnalysisText(item: FlowItem): string {
  const metadata = item.metadata || {};
  const linkPreviewFields = getLinkPreviews(metadata)
    .slice(0, 2)
    .flatMap((preview) => [
      clean(preview.title),
      clean(preview.description),
      clean(preview.site_name),
    ]);

  return [
    clean(item.title),
    clean(item.body_md),
    clean(metadata.title),
    clean(metadata.description),
    clean(metadata.alt),
    clean(metadata.caption),
    ...linkPreviewFields,
    clean(metadata.youtube?.title),
  ]
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index)
    .join("\n\n")
    .slice(0, 7_000);
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .match(/[\p{L}\p{N}]+/gu) ?? [];
}

export function keywordTokens(text: string): string[] {
  return words(text).filter(
    (token) =>
      token.length >= 3 &&
      !STOP_WORDS.has(token) &&
      !/^\d+$/.test(token),
  );
}

function topKeywords(text: string, limit = 3): string[] {
  const counts = new Map<string, number>();
  const firstSeen = new Map<string, number>();
  const tokens = keywordTokens(text);

  tokens.forEach((token, index) => {
    counts.set(token, (counts.get(token) || 0) + 1);
    if (!firstSeen.has(token)) firstSeen.set(token, index);
  });

  return [...counts.entries()]
    .sort(
      ([tokenA, countA], [tokenB, countB]) =>
        countB - countA ||
        (firstSeen.get(tokenA) || 0) - (firstSeen.get(tokenB) || 0) ||
        tokenA.localeCompare(tokenB),
    )
    .slice(0, limit)
    .map(([token]) => token);
}

function heuristicTopic(item: FlowItem, text: string): string {
  const metadata = item.metadata || {};
  const preview = getLinkPreviews(metadata)[0] || {};
  const title =
    clean(item.title) ||
    clean(metadata.title) ||
    clean(metadata.youtube?.title) ||
    clean(preview.title) ||
    clean(metadata.alt) ||
    clean(metadata.caption);
  const keywords = topKeywords(title || text, 3);

  return keywords.join(", ") || "unclassified";
}

/**
 * Deterministic local analysis used when AI is disabled, unavailable, or
 * returns unusable output. It is intentionally conservative: confidence is
 * low, originality cannot be judged from length alone, and scores are
 * derived from visible structure/specificity rather than guesses about
 * meaning.
 */
export function heuristicAnalysis(item: FlowItem): IssueAI {
  const text = plainAnalysisText(item);
  const tokenList = words(text);
  const wordCount = tokenList.length;
  const sentenceCount = text
    .split(/[.!?…]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean).length;
  const hasNumbers = /\d/.test(text);
  const hasQuote = /[«»"“”]/.test(text);
  const hasLink = /https?:\/\//i.test(text);
  const substance = clamp(wordCount / 120, 0, 1);
  const concrete =
    (hasNumbers ? 0.7 : 0) + (hasQuote ? 0.3 : 0) + (hasLink ? 0.2 : 0);

  const editorialValue = roundScore(
    0.6 + substance * 2.1 + Math.min(0.5, sentenceCount * 0.1) + concrete * 0.4,
  );
  const specificity = roundScore(0.8 + substance * 2.2 + concrete);
  const originality = roundScore(
    0.8 + Math.min(0.8, sentenceCount * 0.08) + (wordCount >= 60 ? 0.5 : 0),
  );
  const readerValue = roundScore(
    0.7 + substance * 1.9 + (item.type === "link" ? 0.3 : 0),
  );

  const baseConfidence =
    wordCount < 8 ? 0.08 : wordCount < 25 ? 0.15 : 0.3;

  let role: IssueAIRole;
  if (item.type === "link") role = "link";
  else if (item.type === "photo") role = "visual";
  else if (item.type === "video") role = "supporting";
  else if (wordCount >= 70 && editorialValue >= 3) role = "lead";
  else if (wordCount >= 20) role = "supporting";
  else role = "omit";

  return {
    lang: heuristicLanguage(text),
    kind: heuristicKind(text),
    model: HEURISTIC_MODEL,
    // Deterministic timestamp: heuristic analysis is not cached, so `at`
    // must not introduce run-to-run differences.
    at: clean(item.updated_at) || clean(item.created_at) || "1970-01-01T00:00:00.000Z",
    schemaVersion: ANALYSIS_VERSION,
    contentHash: contentHash(buildAnalysisInput(item)),
    topic: heuristicTopic(item, text),
    subtopic: "",
    summary: text.replace(/\s+/g, " ").slice(0, 240),
    thesis: text.split(/(?<=[.!?…])\s+/)[0]?.slice(0, 240) || "",
    editorialValue,
    originality,
    specificity,
    readerValue,
    contextRequired: "",
    confidence: baseConfidence,
    role,
    rationale: "Heuristic analysis: model analysis was not available.",
  };
}

export function heuristicLanguage(text: string): IssueLang | "other" {
  const sample = (text || "").slice(0, 5_000);
  let cyrillic = 0;
  let latin = 0;

  for (const char of sample) {
    if (/[А-Яа-яЁё]/.test(char)) cyrillic++;
    else if (/[A-Za-z]/.test(char)) latin++;
  }

  if (cyrillic >= 12 && cyrillic > latin * 1.15) return "ru";
  if (latin >= 12 && latin > cyrillic * 1.15) return "en";
  return "other";
}

export function heuristicKind(_text: string): IssueKind {
  return "other";
}

export function normalizeAnalysis(
  response: AnalysisResponse,
): Omit<IssueAI, "schemaVersion" | "contentHash" | "model" | "at"> {
  return {
    lang: response.lang,
    kind: response.kind,
    topic: response.topic.trim().slice(0, 100),
    subtopic: response.subtopic.trim().slice(0, 120),
    summary: response.summary.trim().slice(0, 600),
    thesis: response.thesis.trim().slice(0, 600),
    editorialValue: roundScore(response.editorialValue),
    originality: roundScore(response.originality),
    specificity: roundScore(response.specificity),
    readerValue: roundScore(response.readerValue),
    contextRequired: response.contextRequired.trim().slice(0, 300),
    confidence: clamp(response.confidence, 0, 1),
    role: response.role,
    rationale: response.rationale.trim().slice(0, 600),
  };
}

/**
 * Returns a cached model analysis only when it was produced by the current
 * schema for exactly the same source material. Fallback analyses are never
 * accepted as a cache hit, so a later run can retry a temporary AI failure.
 */
export function cachedAnalysis(item: FlowItem): IssueAI | null {
  if (item.ai_allowed !== true) return null;

  const raw = item.metadata?.issue_ai;

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const parsed = CachedAnalysisSchema.safeParse(raw);

  if (!parsed.success) return null;
  if (parsed.data.model === HEURISTIC_MODEL) return null;
  if (parsed.data.contentHash !== contentHash(buildAnalysisInput(item))) {
    return null;
  }

  return parsed.data;
}

/**
 * Analysis used by editorial selection. Explicitly disallowed AI items never
 * reuse cached model output even if one exists from before the flag changed.
 */
export function analysisForItem(item: FlowItem): IssueAI {
  if (item.ai_allowed !== true) return heuristicAnalysis(item);
  return cachedAnalysis(item) || heuristicAnalysis(item);
}

export function isAnalyzable(item: FlowItem): boolean {
  return (
    item.ai_allowed === true &&
    typeof item.id === "string" &&
    item.id.trim().length > 0 &&
    plainAnalysisText(item).trim().length > 0
  );
}

