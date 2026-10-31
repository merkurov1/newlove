export type MediaRelationType =
  | 'reprint'
  | 'syndication'
  | 'related'
  | 'same_story'
  | 'shared_quote'
  | 'same_topic'
  | 'story_continuation';

export type MediaRelationCandidate = {
  targetMediaRecordId: string;
  relationType: MediaRelationType;
  confidence: number;
  detectedBy: string;
  reviewStatus: 'unverified' | 'needs_review';
  evidence: Record<string, unknown>;
};

export type RelationMedia = {
  id: string;
  title: string;
  outlet: string;
  kind?: string | null;
  publishedDate: string | null;
  topic: string | null;
  subtopics: string[];
  contentHash: string | null;
  quoteHashes: string[];
};

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'into',
  'about',
  'after',
  'before',
  'over',
  'under',
  'как',
  'что',
  'для',
  'про',
  'или',
  'при',
  'над',
  'под',
  'это',
  'его',
  'она',
  'они',
]);

function tokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 4 && !STOP_WORDS.has(token))
  );
}

function overlap(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;

  let intersection = 0;

  for (const value of left) {
    if (right.has(value)) intersection += 1;
  }

  return intersection / Math.min(left.size, right.size);
}

function dayDistance(left: string | null, right: string | null): number | null {
  if (!left || !right) return null;

  const a = Date.parse(left);
  const b = Date.parse(right);

  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;

  return Math.abs(a - b) / (24 * 60 * 60 * 1000);
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, Number(value.toFixed(3))));
}

/**
 * Deterministic relation hypothesis generation. It never merges records and
 * never deletes anything; the admin confirms or rejects each hypothesis.
 */
export function deriveMediaRelations(
  current: RelationMedia,
  others: RelationMedia[]
): MediaRelationCandidate[] {
  const currentTokens = tokens(current.title);
  const currentQuotes = new Set(current.quoteHashes);
  const currentSubtopics = new Set(
    current.subtopics.map((value) => value.toLowerCase())
  );
  const results: MediaRelationCandidate[] = [];
  const seen = new Set<string>();

  const push = (candidate: MediaRelationCandidate) => {
    const key = `${candidate.targetMediaRecordId}:${candidate.relationType}`;

    if (seen.has(key)) return;

    seen.add(key);
    results.push(candidate);
  };

  for (const other of others) {
    if (other.id === current.id) continue;

    const evidence: Record<string, unknown> = {
      current_title: current.title,
      target_title: other.title,
      current_outlet: current.outlet,
      target_outlet: other.outlet,
    };

    if (current.contentHash && current.contentHash === other.contentHash) {
      const sameOutlet =
        current.outlet.trim().toLowerCase() === other.outlet.trim().toLowerCase();

      push({
        targetMediaRecordId: other.id,
        relationType: sameOutlet ? 'reprint' : 'syndication',
        confidence: 1,
        detectedBy: 'content_hash',
        reviewStatus: 'unverified',
        evidence: { ...evidence, content_hash: current.contentHash },
      });
    }

    const sharedQuotes = other.quoteHashes.filter((hash) => currentQuotes.has(hash));

    if (sharedQuotes.length > 0) {
      push({
        targetMediaRecordId: other.id,
        relationType: 'shared_quote',
        confidence: clamp(0.75 + sharedQuotes.length * 0.05),
        detectedBy: 'quote_hash',
        reviewStatus: 'needs_review',
        evidence: { ...evidence, shared_quote_hashes: sharedQuotes.slice(0, 10) },
      });

      if (sharedQuotes.length >= 2) {
        push({
          targetMediaRecordId: other.id,
          relationType: 'same_story',
          confidence: clamp(0.65 + sharedQuotes.length * 0.05),
          detectedBy: 'shared_quotes',
          reviewStatus: 'needs_review',
          evidence: { ...evidence, shared_quote_count: sharedQuotes.length },
        });
      }
    }

    const samePrimaryTopic =
      Boolean(current.topic) &&
      current.topic?.toLowerCase() === other.topic?.toLowerCase();
    const otherSubtopics = new Set(
      other.subtopics.map((value) => value.toLowerCase())
    );
    const sharedSubtopics = [...currentSubtopics].filter((value) =>
      otherSubtopics.has(value)
    );

    const titleOverlap = overlap(currentTokens, tokens(other.title));

    // A broad topic alone is not evidence of a relationship. Require at least
    // one shared subtopic or meaningful title overlap.
    if (samePrimaryTopic && (sharedSubtopics.length > 0 || titleOverlap >= 0.35)) {
      push({
        targetMediaRecordId: other.id,
        relationType: 'same_topic',
        confidence: clamp(0.45 + sharedSubtopics.length * 0.1),
        detectedBy: sharedSubtopics.length > 0 ? 'subtopic_overlap' : 'title_topic_overlap',
        reviewStatus: 'needs_review',
        evidence: {
          ...evidence,
          primary_topic: current.topic,
          shared_subtopics: sharedSubtopics,
          title_overlap: clamp(titleOverlap),
        },
      });
    }

    if (samePrimaryTopic && titleOverlap >= 0.5) {
      push({
        targetMediaRecordId: other.id,
        relationType: 'same_story',
        confidence: clamp(0.55 + titleOverlap * 0.3),
        detectedBy: 'title_topic_overlap',
        reviewStatus: 'needs_review',
        evidence: { ...evidence, title_overlap: clamp(titleOverlap) },
      });
    }

    const editorialKinds = new Set(['interview', 'column', 'profile']);
    const currentKind = (current.kind || '').toLowerCase();
    const otherKind = (other.kind || '').toLowerCase();

    if (
      samePrimaryTopic &&
      editorialKinds.has(currentKind) &&
      editorialKinds.has(otherKind) &&
      current.outlet.trim().toLowerCase() !== other.outlet.trim().toLowerCase()
    ) {
      push({
        targetMediaRecordId: other.id,
        relationType: 'related',
        confidence: clamp(0.5 + sharedSubtopics.length * 0.1),
        detectedBy: 'editorial_kind_topic',
        reviewStatus: 'needs_review',
        evidence: {
          ...evidence,
          primary_topic: current.topic,
          current_kind: currentKind,
          target_kind: otherKind,
        },
      });
    }

    const distance = dayDistance(current.publishedDate, other.publishedDate);
    const sameOutlet =
      current.outlet.trim().toLowerCase() === other.outlet.trim().toLowerCase();

    if (
      sameOutlet &&
      samePrimaryTopic &&
      distance !== null &&
      distance <= 14 &&
      titleOverlap >= 0.25
    ) {
      push({
        targetMediaRecordId: other.id,
        relationType: 'story_continuation',
        confidence: clamp(0.4 + titleOverlap * 0.3 + (14 - distance) / 70),
        detectedBy: 'outlet_topic_date_title',
        reviewStatus: 'needs_review',
        evidence: {
          ...evidence,
          days_apart: Math.round(distance),
          title_overlap: clamp(titleOverlap),
        },
      });
    }
  }

  return results;
}
