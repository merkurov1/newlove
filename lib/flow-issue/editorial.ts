
import { analysisForItem, keywordTokens } from "./analysis";
import type {
  FlowItem,
  IssueAI,
  IssueEntry,
  IssueTemplateSettings,
} from "./types";

/**
 * Editorial selection for Flow Issues.
 *
 * Pipeline:
 * 1. Build an editorial score.
 * 2. Apply a small recency bonus.
 * 3. Select a lead when a sufficiently strong candidate exists.
 * 4. Fill the remaining sections with eligible material.
 * 5. Avoid near-duplicates and excessive topic concentration.
 *
 * Important compatibility rule:
 * Older records may have cached AI metadata without the newer scoring
 * fields. Missing scores must not be interpreted as evidence of poor
 * editorial quality. Such records receive neutral fallback scores.
 */

export type IssueCandidate = {
  entry: IssueEntry;
  analysis: IssueAI;
  /** Final editorial score, including confidence, recency and role. */
  score: number;
  topicKey: string;
};

export const SCORE_WEIGHTS = {
  editorialValue: 0.4,
  originality: 0.2,
  specificity: 0.2,
  readerValue: 0.2,
} as const;

/**
 * The neutral fallback is intentionally above MIN_SELECTION_SCORE after
 * the confidence adjustment. Legacy records without extended AI scores
 * can therefore appear in an issue instead of silently disappearing.
 */
export const LEGACY_NEUTRAL_SCORE = 2.5;
export const LEGACY_CONFIDENCE = 0.3;

/** Minimum adjusted score for an item to appear in a regular section. */
export const MIN_SELECTION_SCORE = 1.7;

/** A lead must carry the issue, not merely be its best available item. */
export const MIN_LEAD_SCORE = 2.3;

/** Recency is deliberately small: quality should dominate freshness. */
export const RECENCY_BONUS = 0.3;
export const RECENCY_HALF_LIFE_DAYS = 14;

/** Soft penalty for each already-selected item on the same topic. */
export const DIVERSITY_PENALTY = 0.55;

/** Preferred maximum number of entries from the same topic. */
export const MAX_PER_TOPIC = 2;

/** Token-overlap threshold for near-duplicate rejection. */
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

    // Tracking parameters must not make the same source look unique.
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

  const isExternalType = (type: string) =>
    type === "link" || type === "video";

  if (
    firstUrl &&
    firstUrl === secondUrl &&
    first.entry.type === second.entry.type &&
    isExternalType(first.entry.type)
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

  const union =
    firstTokens.size + secondTokens.size - intersection;

  return union > 0 ? intersection / union : 0;
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
  const role = candidate.analysis.role;

  // An explicit exclusion remains authoritative.
  if (role === "omit") return -10;

  switch (candidate.entry.type) {
    case "link":
      return role === "link" ? 0.15 : 0;

    case "photo":
      return role === "visual" ? 0.15 : 0;

    case "video":
      return role === "supporting" ? 0.1 : 0;

    default:
      return role === "lead"
        ? 0.25
        : role === "supporting"
          ? 0.1
          : 0;
  }
}

function analysisScores(analysis: IssueAI): {
  editorialValue: number;
  originality: number;
  specificity: number;
  readerValue: number;
  confidence: number;
} {
  /**
   * Critical fix:
   *
   * Previous fallback values of 2 produced a score around 1.51 when
   * confidence was missing or low. That was below the 1.7 selection
   * threshold, so records with legacy AI metadata were silently removed
   * from every regular section.
   *
   * A neutral score of 2.5 means "not evaluated with the newer rubric",
   * not "poor quality". New AI scores continue to take precedence.
   */
  const fallback = LEGACY_NEUTRAL_SCORE;

  return {
    editorialValue: clamp(
      analysis.editorialValue ?? fallback,
      0,
      5,
    ),
    originality: clamp(
      analysis.originality ?? fallback,
      0,
      5,
    ),
    specificity: clamp(
      analysis.specificity ?? fallback,
      0,
      5,
    ),
    readerValue: clamp(
      analysis.readerValue ?? fallback,
      0,
      5,
    ),
    confidence: clamp(
      analysis.confidence ?? LEGACY_CONFIDENCE,
      0,
      1,
    ),
  };
}

/**
 * Score meaning:
 * - editorialValue: importance of the material
 * - originality: distinctiveness of its thought or selection
 * - specificity: concrete detail, evidence and precision
 * - readerValue: what a thoughtful reader gains
 * - confidence: confidence in the analysis, not in the item's importance
 * - recency: small bonus that decays over time
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

  const ageMs = Math.max(
    0,
    windowEnd.getTime() - publishedTime(candidate.entry),
  );

  const ageDays = ageMs / 86_400_000;

  const recency =
    RECENCY_BONUS *
    Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);

  return clamp(
    base * confidenceFactor +
      recency +
      roleAdjustment(candidate),
    0,
    5.5,
  );
}

export function buildCandidate(
  entry: IssueEntry,
  analysis: IssueAI,
  windowEnd: Date,
): IssueCandidate {
  const topic =
    clean(analysis.topic).toLowerCase() ||
    clean(entry.title).toLowerCase().slice(0, 60) ||
    entry.id;

  const base = { entry, analysis };

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
  return buildCandidate(
    entry,
    analysisForItem(item),
    windowEnd,
  );
}

function hasUsableContent(candidate: IssueCandidate): boolean {
  const entry = candidate.entry;

  // A media item may be usable even if its body is empty.
  if (
    entry.type === "photo" &&
    (
      clean(entry.metadata?.public_url) ||
      clean(entry.metadata?.alt) ||
      clean(entry.metadata?.caption)
    )
  ) {
    return true;
  }

  if (
    entry.type === "video" &&
    (
      clean(entry.metadata?.youtube?.video_id) ||
      clean(entry.metadata?.youtube?.title)
    )
  ) {
    return true;
  }

  return candidateText(candidate).trim().length > 0;
}

function sortCandidates(
  candidates: IssueCandidate[],
): IssueCandidate[] {
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
      !selected.some((item) =>
        areNearDuplicates(candidate, item),
      ),
  );

  while (chosen.length < limit && available.length > 0) {
    const overCap = (candidate: IssueCandidate) =>
      (topicCounts.get(candidate.topicKey) || 0) >=
      MAX_PER_TOPIC;

    // Prefer topic diversity when alternatives meet the threshold.
    const alternatives = available.filter((candidate) => {
      if (overCap(candidate)) return false;

      const penalty =
        DIVERSITY_PENALTY *
        (topicCounts.get(candidate.topicKey) || 0);

      return candidate.score - penalty >= minimumScore;
    });

    const eligible = alternatives.length
      ? available.filter((candidate) => !overCap(candidate))
      : available;

    let best: IssueCandidate | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const candidate of eligible) {
      const diversityPenalty =
        DIVERSITY_PENALTY *
        (topicCounts.get(candidate.topicKey) || 0);

      const adjusted = candidate.score - diversityPenalty;

      if (
        adjusted > bestScore ||
        (
          adjusted === bestScore &&
          best !== null &&
          publishedTime(candidate.entry) >
            publishedTime(best.entry)
        )
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

    // Remove the selected item and its near-duplicates.
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
  /** All selected candidates in editorial order, lead first. */
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
        (
          TEXT_TYPES.has(candidate.entry.type) ||
          candidate.entry.type === "photo"
        ) &&
        !selected.some((item) =>
          areNearDuplicates(candidate, item),
        ),
    )
    .sort((first, second) => {
      const firstLead =
        first.analysis.role === "lead" ? 0.25 : 0;

      const secondLead =
        second.analysis.role === "lead" ? 0.25 : 0;

      return (
        second.score +
          secondLead -
          (first.score + firstLead) ||
        publishedTime(second.entry) -
          publishedTime(first.entry) ||
        first.entry.id.localeCompare(second.entry.id)
      );
    });

  return leadPool[0] || null;
}

/**
 * Select an issue from the full candidate set.
 *
 * The lead is optional. If no candidate reaches the lead threshold,
 * the builder still fills the regular sections with suitable records.
 * This prevents the absence of a strong lead from producing an empty issue.
 */
export function selectIssueContent(
  candidates: IssueCandidate[],
  limits: IssueTemplateSettings["limits"],
  windowEnd: Date,
  selected: IssueCandidate[] = [],
): EditorialSelection {
  // Recompute recency against this issue's actual period end.
  const scored = candidates.map((candidate) =>
    buildCandidate(
      candidate.entry,
      candidate.analysis,
      windowEnd,
    ),
  );

  const chosen: IssueCandidate[] = [...selected];

  const leadCandidate = chooseLead(
    sortCandidates(scored),
    chosen,
  );

  if (leadCandidate) chosen.push(leadCandidate);

  const latest = selectSection(
    sortCandidates(
      scored.filter((candidate) =>
        TEXT_TYPES.has(candidate.entry.type),
      ),
    ),
    limits.latest,
    chosen,
    MIN_SELECTION_SCORE,
  );

  chosen.push(...latest);

  const links = selectSection(
    sortCandidates(
      scored.filter(
        (candidate) => candidate.entry.type === "link",
      ),
    ),
    limits.links,
    chosen,
    MIN_SELECTION_SCORE,
  );

  chosen.push(...links);

  const videos = selectSection(
    sortCandidates(
      scored.filter(
        (candidate) => candidate.entry.type === "video",
      ),
    ),
    limits.videos,
    chosen,
    MIN_SELECTION_SCORE,
  );

  chosen.push(...videos);

  const photos = selectSection(
    sortCandidates(
      scored.filter(
        (candidate) => candidate.entry.type === "photo",
      ),
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
