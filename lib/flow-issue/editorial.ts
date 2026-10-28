import { analysisForItem, keywordTokens } from "./analysis";
import type {
  FlowItem,
  IssueAI,
  IssueEntry,
  IssueTemplateSettings,
} from "./types";

/**
 * Editorial selection is deliberately a small, interpretable pipeline:
 *
 *   1. score each candidate from explicit analysis fields
 *   2. modest recency boost (never enough to beat strong older material)
 *   3. greedy selection with near-duplicate rejection
 *   4. topic-diversity penalty and a per-section topic cap
 *
 * The AI's `role` is advice, not command. `omit` is respected because it is
 * an explicit editorial judgement; every other decision is made here.
 */

export type IssueCandidate = {
  entry: IssueEntry;
  analysis: IssueAI;
  /** Final 0–5 editorial score, including confidence and recency. */
  score: number;
  topicKey: string;
};

export const SCORE_WEIGHTS = {
  editorialValue: 0.4,
  originality: 0.2,
  specificity: 0.2,
  readerValue: 0.2,
} as const;

/** Below this an item is not worth printing, even if it is recent. */
export const MIN_SELECTION_SCORE = 1.7;

/** A lead must carry the issue, not merely be the best of a weak set. */
export const MIN_LEAD_SCORE = 2.3;

/**
 * Recency contributes at most 0.3 of a 5-point score and decays with a
 * two-week half-life. A strong month-old piece can therefore outrank a weak
 * item published today.
 */
export const RECENCY_BONUS = 0.3;
export const RECENCY_HALF_LIFE_DAYS = 14;

/** Soft penalty per already-selected item on the same topic. */
export const DIVERSITY_PENALTY = 0.55;

/** At most this many entries from one topic in a selection pass, when acceptable alternatives exist. */
export const MAX_PER_TOPIC = 2;

/** Token-overlap threshold for treating two entries as near duplicates. */
export const NEAR_DUPLICATE_THRESHOLD = 0.72;

const TEXT_TYPES = new Set(["note", "article", "quote"]);

const clean = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

function publishedTime(entry: IssueEntry): number {
  const date = new Date(entry.publishedAt);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function normalizedUrl(value: string | null): string {
  if (!value) return "";

  try {
    const url = new URL(value);
    url.hash = "";
    // Tracking parameters should not make two copies of a link look unique.
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|yclid|ref)/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
}

export function candidateText(candidate: IssueCandidate): string {
  const metadata = candidate.entry.metadata || {};
  return [
    candidate.entry.title,
    candidate.entry.body,
    metadata.title,
    metadata.description,
    metadata.alt,
    metadata.caption,
    metadata.youtube?.title,
    candidate.analysis.topic,
    candidate.analysis.subtopic,
    candidate.analysis.summary,
    candidate.analysis.thesis,
  ]
    .map(clean)
    .filter(Boolean)
    .join("\n");
}

function tokenSet(candidate: IssueCandidate): Set<string> {
  return new Set(keywordTokens(candidateText(candidate)));
}

export function textSimilarity(
  first: IssueCandidate,
  second: IssueCandidate,
): number {
  if (first.entry.id === second.entry.id) return 1;

  const firstUrl = normalizedUrl(first.entry.url);
  const secondUrl = normalizedUrl(second.entry.url);

  const externalType = (type: string) =>
    type === "link" || type === "video";

  if (
    firstUrl &&
    firstUrl === secondUrl &&
    first.entry.type === second.entry.type &&
    externalType(first.entry.type)
  ) {
    return 1;
  }

  const firstTokens = tokenSet(first);
  const secondTokens = tokenSet(second);

  if (!firstTokens.size || !secondTokens.size) return 0;

  let intersection = 0;

  for (const token of firstTokens) {
    if (secondTokens.has(token)) intersection++;
  }

  return intersection / (firstTokens.size + secondTokens.size - intersection);
}

export function areNearDuplicates(
  first: IssueCandidate,
  second: IssueCandidate,
): boolean {
  return textSimilarity(first, second) >= NEAR_DUPLICATE_THRESHOLD;
}

function roleAdjustment(
  candidate: Pick<IssueCandidate, "entry" | "analysis">,
): number {
  const { role } = candidate.analysis;

  if (role === "omit") return -10;

  switch (candidate.entry.type) {
    case "link":
      return role === "link" ? 0.15 : 0;
    case "photo":
      return role === "visual" ? 0.15 : 0;
    case "video":
      return role === "supporting" ? 0.1 : 0;
    default:
      return role === "lead" ? 0.25 : role === "supporting" ? 0.1 : 0;
  }
}

function analysisScores(analysis: IssueAI): {
  editorialValue: number;
  originality: number;
  specificity: number;
  readerValue: number;
  confidence: number;
} {
  return {
    editorialValue: clamp(analysis.editorialValue ?? 2, 0, 5),
    originality: clamp(analysis.originality ?? 2, 0, 5),
    specificity: clamp(analysis.specificity ?? 2, 0, 5),
    readerValue: clamp(analysis.readerValue ?? 2, 0, 5),
    confidence: clamp(analysis.confidence ?? 0.3, 0, 1),
  };
}

/**
 * Score meaning is documented in analysis.ts and in tests:
 * - editorialValue: importance of the item's substance
 * - originality: distinctiveness of thought/selection
 * - specificity: concrete detail, evidence, precision
 * - readerValue: what a thoughtful reader gains
 * - confidence: trust in the analysis, not in the item's importance
 * - recency: small decayed bonus, never a substitute for quality
 */
export function scoreCandidate(
  candidate: Omit<IssueCandidate, "score" | "topicKey">,
  windowEnd: Date,
): number {
  const scores = analysisScores(candidate.analysis);
  const base =
    scores.editorialValue * SCORE_WEIGHTS.editorialValue +
    scores.originality * SCORE_WEIGHTS.originality +
    scores.specificity * SCORE_WEIGHTS.specificity +
    scores.readerValue * SCORE_WEIGHTS.readerValue;

  const confidenceFactor = 0.65 + 0.35 * scores.confidence;
  const ageMs = Math.max(0, windowEnd.getTime() - publishedTime(candidate.entry));
  const ageDays = ageMs / 86_400_000;
  const recency =
    RECENCY_BONUS * Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);

  return clamp(base * confidenceFactor + recency + roleAdjustment(candidate), 0, 5.5);
}

export function buildCandidate(
  entry: IssueEntry,
  analysis: IssueAI,
  windowEnd: Date,
): IssueCandidate {
  const base = { entry, analysis };
  const topic =
    clean(analysis.topic).toLowerCase() ||
    clean(entry.title).toLowerCase().slice(0, 60) ||
    entry.id;

  return {
    ...base,
    topicKey: topic,
    score: scoreCandidate(base, windowEnd),
  };
}

export function candidateFromItem(
  item: FlowItem,
  entry: IssueEntry,
  windowEnd: Date,
): IssueCandidate {
  return buildCandidate(entry, analysisForItem(item), windowEnd);
}

function hasUsableContent(candidate: IssueCandidate): boolean {
  return candidateText(candidate).trim().length > 0;
}

function sortCandidates(candidates: IssueCandidate[]): IssueCandidate[] {
  return [...candidates].sort(
    (first, second) =>
      second.score - first.score ||
      publishedTime(second.entry) - publishedTime(first.entry) ||
      first.entry.id.localeCompare(second.entry.id),
  );
}

function selectSection(
  pool: IssueCandidate[],
  limit: number,
  selected: IssueCandidate[],
  minimumScore: number,
): IssueCandidate[] {
  if (limit <= 0) return [];

  const chosen: IssueCandidate[] = [];
  const topicCounts = new Map<string, number>();

  // Already-selected material (including the lead) contributes to the topic
  // balance, so one subject cannot dominate every section of the issue.
  for (const item of selected) {
    topicCounts.set(
      item.topicKey,
      (topicCounts.get(item.topicKey) || 0) + 1,
    );
  }

  const available = pool.filter(
    (candidate) =>
      hasUsableContent(candidate) &&
      candidate.analysis.role !== "omit" &&
      !selected.some((item) => areNearDuplicates(candidate, item)),
  );

  while (chosen.length < limit) {
    let best: IssueCandidate | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    // Prefer an unused topic when an acceptable alternative exists, but never
    // force a weak item in just to achieve diversity.
    const overCap = (candidate: IssueCandidate) =>
      (topicCounts.get(candidate.topicKey) || 0) >= MAX_PER_TOPIC;
    const alternatives = available.filter(
      (candidate) =>
        !overCap(candidate) &&
        candidate.score -
          DIVERSITY_PENALTY * (topicCounts.get(candidate.topicKey) || 0) >=
          minimumScore,
    );
    const eligible = alternatives.length
      ? available.filter((candidate) => !overCap(candidate))
      : available;

    for (const candidate of eligible) {
      const diversityPenalty =
        DIVERSITY_PENALTY * (topicCounts.get(candidate.topicKey) || 0);
      const adjusted = candidate.score - diversityPenalty;

      if (
        adjusted > bestScore ||
        (adjusted === bestScore &&
          best !== null &&
          publishedTime(candidate.entry) > publishedTime(best.entry))
      ) {
        best = candidate;
        bestScore = adjusted;
      }
    }

    if (!best || bestScore < minimumScore) break;

    chosen.push(best);
    topicCounts.set(
      best.topicKey,
      (topicCounts.get(best.topicKey) || 0) + 1,
    );

    // Remove the chosen item and any near-duplicate that remains, so one
    // idea cannot occupy several slots in the same section.
    for (let index = available.length - 1; index >= 0; index--) {
      if (areNearDuplicates(available[index], best)) {
        available.splice(index, 1);
      }
    }
  }

  return chosen;
}

export type EditorialSelection = {
  lead: IssueEntry | null;
  latest: IssueEntry[];
  links: IssueEntry[];
  videos: IssueEntry[];
  photos: IssueEntry[];
  /** All selected candidates, in editorial order (lead first). */
  selected: IssueCandidate[];
};

function chooseLead(
  candidates: IssueCandidate[],
  selected: IssueCandidate[],
): IssueCandidate | null {
  const leadPool = candidates
    .filter(
      (candidate) =>
        candidate.score >= MIN_LEAD_SCORE &&
        candidate.analysis.role !== "omit" &&
        hasUsableContent(candidate) &&
        (TEXT_TYPES.has(candidate.entry.type) ||
          candidate.entry.type === "photo") &&
        !selected.some((item) => areNearDuplicates(candidate, item)),
    )
    .sort((first, second) => {
      const firstLead = first.analysis.role === "lead" ? 0.25 : 0;
      const secondLead = second.analysis.role === "lead" ? 0.25 : 0;
      return (
        second.score + secondLead - (first.score + firstLead) ||
        publishedTime(second.entry) - publishedTime(first.entry) ||
        first.entry.id.localeCompare(second.entry.id)
      );
    });

  return leadPool[0] || null;
}

/**
 * Select and order a coherent issue. Input order is irrelevant: the result
 * depends only on scores, dates, topics, and IDs, so identical inputs and
 * identical cached analyses always produce the same issue.
 */
export function selectIssueContent(
  candidates: IssueCandidate[],
  limits: IssueTemplateSettings["limits"],
  windowEnd: Date,
  selected: IssueCandidate[] = [],
): EditorialSelection {
  // Recompute scores against the requested window so callers cannot
  // accidentally reuse a stale recency boost.
  const scored = candidates.map((candidate) =>
    buildCandidate(candidate.entry, candidate.analysis, windowEnd),
  );
  const chosen: IssueCandidate[] = [...selected];

  const leadCandidate = chooseLead(sortCandidates(scored), chosen);

  if (leadCandidate) chosen.push(leadCandidate);

  const latest = selectSection(
    sortCandidates(
      scored.filter((candidate) => TEXT_TYPES.has(candidate.entry.type)),
    ),
    limits.latest,
    chosen,
    MIN_SELECTION_SCORE,
  );
  chosen.push(...latest);

  const links = selectSection(
    sortCandidates(
      scored.filter((candidate) => candidate.entry.type === "link"),
    ),
    limits.links,
    chosen,
    MIN_SELECTION_SCORE,
  );
  chosen.push(...links);

  const videos = selectSection(
    sortCandidates(
      scored.filter((candidate) => candidate.entry.type === "video"),
    ),
    limits.videos,
    chosen,
    MIN_SELECTION_SCORE,
  );
  chosen.push(...videos);

  const photos = selectSection(
    sortCandidates(
      scored.filter((candidate) => candidate.entry.type === "photo"),
    ),
    limits.photos,
    chosen,
    MIN_SELECTION_SCORE,
  );
  chosen.push(...photos);

  return {
    lead: leadCandidate?.entry || null,
    latest: latest.map((candidate) => candidate.entry),
    links: links.map((candidate) => candidate.entry),
    videos: videos.map((candidate) => candidate.entry),
    photos: photos.map((candidate) => candidate.entry),
    selected: chosen,
  };
}

/**
 * Used by tests and debugging to explain why an item was or was not used.
 * This is intentionally not persisted in the issue payload.
 */
export function explainCandidate(
  candidate: IssueCandidate,
): {
  score: number;
  scores: ReturnType<typeof analysisScores>;
  role: IssueAI["role"];
  topic: string;
} {
  return {
    score: candidate.score,
    scores: analysisScores(candidate.analysis),
    role: candidate.analysis.role,
    topic: candidate.analysis.topic || "",
  };
}

