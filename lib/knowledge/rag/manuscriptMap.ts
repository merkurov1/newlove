import type { ManuscriptChunk, ManuscriptStructure } from './manuscriptStructure';

/**
 * Deterministic manuscript map.
 *
 * Everything in this module is derived metadata with explicit source
 * references. It is intentionally labelled as rule-based extraction, not as
 * verified literary analysis. The original chunk text remains the only source
 * of truth, and summaries never replace it.
 */

export type MapReference = {
  value: string;
  count: number;
  chunkIds: string[];
  chapters: string[];
};

export type ChapterDigest = {
  key: string;
  label: string;
  title: string;
  kind: string;
  number: number | null;
  part: string | null;
  chunkRange: { first: number; last: number; count: number };
  charRange: { start: number; end: number; chars: number };
  sectionPaths: string[];
  opening: string;
  closing: string;
  dates: string[];
};

export type ManuscriptMap = {
  documentId: string;
  title: string;
  generatedAt: string;
  method: 'deterministic_extraction_v1';
  chapterCount: number;
  partCount: number;
  chunksAccountedFor: number;
  chapters: ChapterDigest[];
  dates: MapReference[];
  recurringMotifs: MapReference[];
  entityMentions: MapReference[];
  keyPassages: Array<{
    chunkId: string;
    chunkIndex: number;
    heading: string;
    chapter: string | null;
    reason: string;
    excerpt: string;
  }>;
  notes: string[];
};

const STOP_WORDS = new Set(
  `a about above after again against all am an and any are aren't as at be because been before being below between both but by can't cannot could couldn't did didn't do does doesn't doing don't down during each few for from further had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself him himself his how how's i i'd i'll i'm i've if in into is isn't it it's its itself let's me more most mustn't my myself no nor not of off on once only or other ought our ours ourselves out over own same shan't she she'd she'll she's should shouldn't so some such than that that's the their theirs them themselves then there there's these they they'd they'll they're they've this those through to too under until up very was wasn't we we'd we'll we're we've were weren't what what's when when's where where's which while who who's whom why why's with won't would wouldn't you you'd you'll you're you've your yours yourself yourselves
  absolute access across actually ago already always another answer anyone anything apartment around arrived asked asset away back bad became become before began behind being believe best better big book both business called came can care carry case certain change city clear come could course day days did different does done down each early else end enough even ever every everything fact far feel felt few find first five found four friend get give go going good got great group had half hand happened hard has have head her here high him himself his home how however huge hundred idea important into just keep kind knew know known large last later least left less let life like likely little live long look lot made make man many may maybe mean might money month more most move much must name need never new next night no not now number off often old once one only open other others out over own part people place point put quite rather really right said same saw say says second see seem seen several she should show side since small so some something sometimes still such take taken tell than that the their them then there these they thing think this those though thought three through time today together took toward two under until up upon used very want was way week well went were what when where which while who why will with within without word work world would year years yet you young your
  и в во не на с со по из от до для при о об обо как что чтобы это этот эта эти тот та те так же ли бы уже еще ещё или но а да нет был была было были быть есть будет будут он она оно они его ее её их ему ей нам вас нас мне тебя себя свой своя свои своих весь вся все всё всех только очень можно нужно надо когда где почему чем кто мы вы я ты
  `
    .split(/\s+/)
    .filter(Boolean)
);

const ENTITY_STOP_WORDS = new Set(
  `the a an and but or if then when where while because although however this that these those there their they them he she his her its our your my i we you it what which who whom whose all any some more most other another such same only also just very much many few own same
  january february march april may june july august september october november december monday tuesday wednesday thursday friday saturday sunday
  chapter part introduction prologue epilogue unframed`
    .split(/\s+/)
    .filter(Boolean)
);

function sentences(value: string): string[] {
  return value
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-ZА-ЯЁ"«“])/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 40);
}

function clip(value: string, max = 520): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function chapterLabelForChunk(chunk: ManuscriptChunk, structure: ManuscriptStructure): string | null {
  const chapter = structure.chapters.find(
    (item) =>
      chunk.chunkIndex >= item.startChunkIndex && chunk.chunkIndex <= item.endChunkIndex
  );
  return chapter?.label || null;
}

function extractYears(value: string): string[] {
  const matches =
    value.match(/\b(?:19|20)\d{2}s?\b|\b(?:19|20)\d{2}\s*[-–—]\s*(?:19|20)?\d{2,4}\b/g) || [];
  return Array.from(new Set(matches.map((match) => match.replace(/\s+/g, ' '))));
}

function tokenize(value: string): string[] {
  return (value.toLowerCase().match(/[\p{L}][\p{L}'’-]{2,}/gu) || [])
    .map((token) => token.replace(/['’]s$/u, '').replace(/^[-’']+|[-’']+$/g, ''))
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token));
}

function addReference(
  map: Map<string, { value: string; count: number; chunkIds: Set<string>; chapters: Set<string> }>,
  value: string,
  chunkId: string,
  chapter: string | null
): void {
  const normalized = value.trim();
  if (!normalized) return;
  const key = normalized.toLowerCase();
  const existing = map.get(key) || {
    value: normalized,
    count: 0,
    chunkIds: new Set<string>(),
    chapters: new Set<string>(),
  };
  existing.count += 1;
  existing.chunkIds.add(chunkId);
  if (chapter) existing.chapters.add(chapter);
  map.set(key, existing);
}

function finalizeReferences(
  map: Map<string, { value: string; count: number; chunkIds: Set<string>; chapters: Set<string> }>,
  limit: number
): MapReference[] {
  return Array.from(map.values())
    .map((entry) => ({
      value: entry.value,
      count: entry.count,
      chunkIds: Array.from(entry.chunkIds).slice(0, 12),
      chapters: Array.from(entry.chapters).slice(0, 8),
    }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value))
    .slice(0, limit);
}

function entityCandidates(value: string): string[] {
  const candidates =
    value.match(/\b(?:[A-Z][a-z]{2,}|[A-Z]{2,})(?:\s+(?:[A-Z][a-z]{2,}|[A-Z]{2,})){0,3}\b/g) || [];
  return candidates
    .map((candidate) => candidate.replace(/\s+/g, ' ').trim())
    .filter((candidate) => {
      const lower = candidate.toLowerCase();
      if (ENTITY_STOP_WORDS.has(lower)) return false;
      if (/^(?:the|a|an)\b/i.test(candidate)) return false;
      if (/^[A-Z]{2,}$/.test(candidate) && candidate.length < 3) return false;
      return true;
    });
}

export function buildManuscriptMap(input: {
  documentId: string;
  title: string;
  chunks: ManuscriptChunk[];
  structure: ManuscriptStructure;
}): ManuscriptMap {
  const sorted = [...input.chunks].sort((left, right) => left.chunkIndex - right.chunkIndex);
  const dates = new Map<string, { value: string; count: number; chunkIds: Set<string>; chapters: Set<string> }>();
  const motifs = new Map<string, { value: string; count: number; chunkIds: Set<string>; chapters: Set<string> }>();
  const entities = new Map<string, { value: string; count: number; chunkIds: Set<string>; chapters: Set<string> }>();
  const globalTerms = new Map<string, number>();
  const chunkTermsById = new Map<string, Set<string>>();

  for (const chunk of sorted) {
    const chapter = chapterLabelForChunk(chunk, input.structure);
    for (const year of extractYears(chunk.content)) {
      addReference(dates, year, chunk.chunkId, chapter);
    }

    for (const entity of entityCandidates(chunk.content)) {
      addReference(entities, entity, chunk.chunkId, chapter);
    }

    const chunkTerms = new Set(tokenize(chunk.content));
    chunkTermsById.set(chunk.chunkId, chunkTerms);
    for (const term of chunkTerms) {
      globalTerms.set(term, (globalTerms.get(term) || 0) + 1);
    }
  }

  // A motif must occur in at least three chunks. It stays a lexical recurrence
  // signal, not a claim about the author's intention.
  for (const [term, count] of globalTerms) {
    if (count < 3) continue;
    const containing = sorted.filter((chunk) => chunkTermsById.get(chunk.chunkId)?.has(term));
    if (containing.length < 3) continue;
    for (const chunk of containing.slice(0, 12)) {
      addReference(
        motifs,
        term,
        chunk.chunkId,
        chapterLabelForChunk(chunk, input.structure)
      );
    }
  }

  const chapters: ChapterDigest[] = input.structure.chapters.map((chapter) => {
    const chapterChunks = sorted.filter(
      (chunk) =>
        chunk.chunkIndex >= chapter.startChunkIndex && chunk.chunkIndex <= chapter.endChunkIndex
    );
    const content = chapterChunks.map((chunk) => chunk.content).join('\n\n');
    const chapterSentences = sentences(content);
    const yearSet = new Set(chapterChunks.flatMap((chunk) => extractYears(chunk.content)));

    return {
      key: chapter.key,
      label: chapter.label,
      title: chapter.title,
      kind: chapter.kind,
      number: chapter.number,
      part: chapter.part,
      chunkRange: {
        first: chapter.startChunkIndex,
        last: chapter.endChunkIndex,
        count: chapter.chunkCount,
      },
      charRange: {
        start: chapter.charStart,
        end: chapter.charEnd,
        chars: chapter.charEnd - chapter.charStart,
      },
      sectionPaths: chapter.sectionPaths.slice(0, 4),
      opening: clip(chapterSentences[0] || content.slice(0, 520), 520),
      closing: clip(
        chapterSentences[chapterSentences.length - 1] ||
          content.slice(Math.max(0, content.length - 520)),
        520
      ),
      dates: Array.from(yearSet).slice(0, 12),
    };
  });

  const keyPassages = sorted
    .map((chunk) => {
      const chunkTerms = tokenize(chunk.content);
      const uniqueTerms = new Set(chunkTerms);
      const density = uniqueTerms.size / Math.max(1, chunk.content.split(/\s+/).length);
      const years = extractYears(chunk.content);
      const reason =
        years.length > 0
          ? `date-bearing passage (${years.slice(0, 3).join(', ')})`
          : density > 0.22
            ? 'terminologically dense passage'
            : 'structurally central passage';
      return {
        chunkId: chunk.chunkId,
        chunkIndex: chunk.chunkIndex,
        heading: chunk.heading,
        chapter: chapterLabelForChunk(chunk, input.structure),
        reason,
        excerpt: clip(chunk.content, 420),
        score: density + (years.length > 0 ? 0.3 : 0),
      };
    })
    .sort((left, right) => right.score - left.score || left.chunkIndex - right.chunkIndex)
    .slice(0, 24)
    .map(({ score: _score, ...passage }) => passage);

  const notes = [
    'This map is deterministic extraction from indexed chunks, not a model-written summary.',
    'Entity mentions are rule-based capitalised-word candidates and may include false positives.',
    'Recurring motifs are lexical recurrence signals, not claims about authorial intent.',
    'Every chapter entry retains its chunk range; the original text remains authoritative.',
  ];

  if (input.structure.coverage.missingChunkIndices.length > 0) {
    notes.push(
      `Missing chunk indices: ${input.structure.coverage.missingChunkIndices.slice(0, 20).join(', ')}.`
    );
  }

  return {
    documentId: input.documentId,
    title: input.title,
    generatedAt: new Date().toISOString(),
    method: 'deterministic_extraction_v1',
    chapterCount: chapters.length,
    partCount: input.structure.parts.filter((part) => /^PART\b/i.test(part.label)).length,
    chunksAccountedFor: sorted.length,
    chapters,
    dates: finalizeReferences(dates, 24),
    recurringMotifs: finalizeReferences(motifs, 30),
    entityMentions: finalizeReferences(entities, 30),
    keyPassages,
    notes,
  };
}
