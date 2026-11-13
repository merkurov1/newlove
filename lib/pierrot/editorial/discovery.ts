import { assertServerOnly } from '@/lib/serverOnly';
import {
  loadChapterText,
  type ManuscriptInventory,
} from '@/lib/knowledge/rag/manuscript';
import type { ManuscriptChapter, ManuscriptChunk } from '@/lib/knowledge/rag/manuscriptStructure';
import type { EpisodeRecord, RejectedStory } from './episodes';
import type { DiscoveryCandidate, EditorialContext } from './types';

assertServerOnly('lib/pierrot/editorial/discovery');

/**
 * Story discovery is deterministic and source-bound.
 *
 * It never asks a model to invent story ideas. It ranks actual chapters and
 * passages from the manuscript, removes used/rejected/restricted material, and
 * returns candidates with exact chunk references. Interpretive fields
 * (editorial question, visual direction) are explicitly editorial proposals.
 */

const RESTRICTED_TOPICS =
  /(?:\b(?:arrest(?:ed|s)?|criminal|prosecut\w*|prison|jail|court|police|raid|weapon\w*|war|kill(?:ed|ing)?|murder\w*|violence|violent)\b|арест|уголовн|тюрьм|суд(?:а|е|ом|ы)?\b|полици|рейд|оружи|войн|убий|насили|силов)/i;

const NARRATIVE_SIGNALS = [
  'i ',
  'we ',
  'my ',
  'first',
  'night',
  'morning',
  'city',
  'friend',
  'money',
  'bought',
  'sold',
  'met',
  'remember',
  'suddenly',
  'never',
  'but ',
  'however',
  'because',
  'father',
  'mother',
  'family',
  'game',
  'computer',
  'internet',
  'london',
  'moscow',
  'bank',
  'market',
  'art',
  'heart',
  'tiger',
  'modem',
  'school',
  'university',
  'visa',
  'airport',
  'hotel',
  'restaurant',
  'car',
  'phone',
  'email',
  'photo',
  'camera',
  'nft',
  'crypto',
];

const STOP = new Set(
  `the a an and or but if then when where while because although however this that these those there their they them he she his her its our your my i we you it what which who whom whose all any some more most other another such same only also just very much many few own
  и в во не на с со по из от до для при о об обо как что чтобы это этот эта эти тот та те так же ли бы уже еще ещё или но а да нет был была было были быть есть будет будут он она оно они его ее её их ему ей нам вас нас мне тебя себя свой своя свои своих весь вся все всё всех только очень можно нужно надо когда где почему чем кто мы вы я ты`
    .split(/\s+/)
    .filter(Boolean)
);

function tokenize(value: string): string[] {
  return (value.toLowerCase().match(/[\p{L}][\p{L}'’-]{2,}/gu) || [])
    .map((token) => token.replace(/['’]s$/u, '').replace(/^[-’']+|[-’']+$/g, ''))
    .filter((token) => token.length >= 3 && !STOP.has(token));
}

function yearsIn(value: string): string[] {
  return Array.from(
    new Set(value.match(/\b(?:19|20)\d{2}s?\b|\b(?:19|20)\d{2}\s*[-–—]\s*(?:19|20)?\d{2,4}\b/g) || [])
  );
}

function properNouns(value: string): string[] {
  const stop = new Set([
    'Having',
    'Our',
    'Most',
    'Two',
    'The',
    'But',
    'And',
    'When',
    'Where',
    'This',
    'That',
    'There',
    'Their',
    'They',
    'Every',
    'After',
    'Before',
    'During',
    'While',
    'Because',
    'Although',
    'However',
    'Instead',
    'Still',
    'Then',
    'Now',
    'Only',
    'Even',
    'Just',
    'Like',
    'With',
    'From',
    'Into',
    'Over',
    'Under',
    'About',
    'What',
    'Which',
    'Who',
    'Why',
    'How',
    'Chapter',
    'Part',
    'Introduction',
    'Prologue',
    'Epilogue',
  ]);
  return Array.from(
    new Set(
      (value.match(/\b(?:[A-Z][a-z]{2,}|[A-Z]{2,})(?:\s+(?:[A-Z][a-z]{2,}|[A-Z]{2,})){0,2}\b/g) || [])
        .filter((item) => !stop.has(item))
        .slice(0, 12)
    )
  );
}

function sentences(value: string): string[] {
  return value
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-ZА-ЯЁ"«“])/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 45);
}

function clip(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

export function isRestrictedCandidate(text: string): boolean {
  return RESTRICTED_TOPICS.test(text);
}

export function scoreChapterStory(input: {
  chapter: ManuscriptChapter;
  content: string;
  usedChapterNumbers: Set<number>;
  usedChunkIds: Set<string>;
  fromYear?: number | null;
  toYear?: number | null;
  excludedTopics?: string[];
}): number {
  if (input.usedChapterNumbers.has(input.chapter.number || -1)) return -1;
  if (isRestrictedCandidate(input.content)) return -1;
  const excluded = (input.excludedTopics || []).map((topic) => topic.toLowerCase());
  if (excluded.some((topic) => topic && input.content.toLowerCase().includes(topic))) {
    return -1;
  }

  const lower = input.content.toLowerCase();
  const signals = NARRATIVE_SIGNALS.reduce(
    (total, signal) => total + (lower.includes(signal) ? 1 : 0),
    0
  );
  const years = yearsIn(input.content).length;
  const proper = properNouns(input.content).length;
  const firstPerson = (input.content.match(/\bI\b/g) || []).length;
  const concreteObjects = (
    input.content.match(
      /\b(?:tiger|modem|computer|phone|car|passport|visa|hotel|restaurant|bank|market|painting|canvas|heart|mask|sculpture|letter|photograph|camera|plane|train|house|apartment|door|key|money|dollar|ruble|wine|vodka)\b/gi
    ) || []
  ).length;
  const dialogue = (input.content.match(/[«"“]/g) || []).length;

  return Number(
    (
      signals * 0.8 +
      Math.min(years, 6) * 1.4 +
      Math.min(proper, 10) * 0.55 +
      Math.min(firstPerson, 20) * 0.12 +
      Math.min(concreteObjects, 12) * 1.1 +
      Math.min(dialogue, 8) * 0.7 +
      Math.min(input.chapter.chunkCount, 8) * 0.4
    ).toFixed(3)
  );
}

function choosePassage(chunks: ManuscriptChunk[]): {
  chunk: ManuscriptChunk;
  text: string;
  score: number;
} {
  const best = chunks
    .map((chunk) => {
      const content = chunk.content;
      const lower = content.toLowerCase();
      const signals = NARRATIVE_SIGNALS.reduce(
        (total, signal) => total + (lower.includes(signal) ? 1 : 0),
        0
      );
      const years = yearsIn(content).length;
      const proper = properNouns(content).length;
      const score = signals + years * 2 + proper * 0.5;
      return { chunk, text: content, score };
    })
    .sort((left, right) => right.score - left.score || left.chunk.chunkIndex - right.chunk.chunkIndex)[0];

  return best || { chunk: chunks[0], text: chunks[0]?.content || '', score: 0 };
}

function editorialQuestion(title: string, passage: string): string {
  const candidateSentences = sentences(passage);
  const tension = candidateSentences.find((sentence) =>
    /(?:but|however|never|not|yet|instead|although|contradiction|impossible|failed|refused)/i.test(
      sentence
    )
  );
  if (tension) {
    return `Какое противоречие раскрывает этот фрагмент: «${clip(tension, 220)}»?`;
  }
  return `Что на самом деле происходит в истории «${title}» и почему она важна для книги?`;
}

function visualDirection(title: string, passage: string): string {
  const proper = properNouns(passage).slice(0, 4);
  const objects = (
    passage.match(
      /\b(?:tiger|modem|computer|phone|car|passport|visa|hotel|restaurant|bank|market|painting|canvas|heart|mask|sculpture|letter|photograph|camera|plane|train|house|apartment|door|key|money|wine|vodka|monitor|screen|keyboard)\b/gi
    ) || []
  )
    .slice(0, 5);
  const anchors = Array.from(new Set([...proper, ...objects])).slice(0, 5);
  return anchors.length > 0
    ? `Editorial proposal: build the visual field around ${anchors.join(', ')}; keep the manuscript's concrete imagery rather than generic cyber-noir decoration.`
    : `Editorial proposal: derive the visual field from the concrete objects in the passage; do not substitute generic series imagery.`;
}

function overlapWithEpisodes(
  chapter: ManuscriptChapter,
  content: string,
  episodes: EpisodeRecord[]
): string | null {
  const candidateTokens = new Set(
    tokenize(`${chapter.title} ${content.slice(0, 2_000)}`).filter((token) => token.length >= 5)
  );
  for (const episode of episodes) {
    if (episode.chapterNumber === chapter.number && chapter.number !== null) {
      return `Episode ${episode.number} already uses chapter ${chapter.number}.`;
    }
    const episodeTokens = new Set(
      tokenize(
        `${episode.title} ${episode.workingTitle} ${episode.thesis} ${episode.centralStory}`
      ).filter((token) => token.length >= 5)
    );
    const overlap = Array.from(candidateTokens).filter((token) => episodeTokens.has(token));
    if (overlap.length >= 5) {
      return `Thematic overlap with Episode ${episode.number} (${overlap.slice(0, 5).join(', ')}).`;
    }
  }
  return null;
}

export async function discoverEpisodeCandidates(input: {
  inventory: ManuscriptInventory;
  episodes: EpisodeRecord[];
  rejected: RejectedStory[];
  context?: EditorialContext | null;
  limit?: number;
  query?: string;
  allChunks?: ManuscriptChunk[];
  fromYear?: number | null;
  toYear?: number | null;
  excludedTopics?: string[];
  store?: Parameters<typeof loadChapterText>[0]['store'];
  env?: Record<string, string | undefined>;
}): Promise<{
  candidates: DiscoveryCandidate[];
  inspectedChapters: number;
  excluded: Array<{ chapter: string; reason: string }>;
  sourceComplete: boolean;
}> {
  const limit = Math.min(Math.max(input.limit ?? 5, 1), 8);
  const usedChapterNumbers = new Set(
    input.episodes
      .filter((episode) => episode.status !== 'ARCHIVED')
      .map((episode) => episode.chapterNumber)
      .filter((value): value is number => typeof value === 'number')
  );
  const usedChunkIds = new Set(input.episodes.flatMap((episode) => episode.chunkIds));
  const rejectedChapters = new Set(
    input.rejected
      .map((story) => story.chapterNumber)
      .filter((value): value is number => typeof value === 'number')
  );
  const rejectedChunks = new Set(input.rejected.flatMap((story) => story.chunkIds));

  const ranked: Array<{
    chapter: ManuscriptChapter;
    chunks: ManuscriptChunk[];
    passage: ReturnType<typeof choosePassage>;
    score: number;
    content: string;
  }> = [];
  const excluded: Array<{ chapter: string; reason: string }> = [];
  const chapters = input.inventory.structure.chapters.filter(
    (chapter) => chapter.kind === 'chapter'
  );

  for (const chapter of chapters) {
    if (usedChapterNumbers.has(chapter.number || -1)) {
      excluded.push({ chapter: chapter.label, reason: 'already used by an episode' });
      continue;
    }
    if (rejectedChapters.has(chapter.number || -1)) {
      excluded.push({ chapter: chapter.label, reason: 'previously rejected story' });
      continue;
    }
    try {
      let chunks: ManuscriptChunk[];
      let loadedMissing: number[];
      if (input.allChunks) {
        chunks = input.allChunks.filter(
          (chunk) =>
            chunk.chunkIndex >= chapter.startChunkIndex &&
            chunk.chunkIndex <= chapter.endChunkIndex
        );
        loadedMissing = [];
      } else {
        const loaded = await loadChapterText({
          inventory: input.inventory,
          chapter,
          store: input.store,
          env: input.env,
        });
        chunks = loaded.chunks;
        loadedMissing = loaded.missing;
      }
      if (loadedMissing.length > 0) {
        excluded.push({ chapter: chapter.label, reason: 'incomplete chapter coverage' });
        continue;
      }
      const usableChunks = chunks.filter(
        (chunk) => !usedChunkIds.has(chunk.chunkId) && !rejectedChunks.has(chunk.chunkId)
      );
      if (usableChunks.length === 0) {
        excluded.push({ chapter: chapter.label, reason: 'all chunks already used' });
        continue;
      }
      const content = usableChunks.map((chunk) => chunk.content).join('\n\n');
      if (isRestrictedCandidate(content)) {
        excluded.push({ chapter: chapter.label, reason: 'authorial restriction: arrest/criminal/force' });
        continue;
      }
      if (input.fromYear || input.toYear) {
        const years = yearsIn(content)
          .map((value) => Number(value.match(/^(19|20)\d{2}/)?.[0]))
          .filter((value) => Number.isFinite(value));
        const from = input.fromYear ?? 0;
        const to = input.toYear ?? 9999;
        if (!years.some((year) => year >= from && year <= to)) {
          excluded.push({ chapter: chapter.label, reason: `outside requested period ${from}–${to}` });
          continue;
        }
      }
      const excludedTopics = (input.excludedTopics || []).map((topic) => topic.toLowerCase());
      if (
        excludedTopics.some(
          (topic) => topic && content.toLowerCase().includes(topic)
        )
      ) {
        excluded.push({ chapter: chapter.label, reason: 'excluded by owner constraint' });
        continue;
      }
      const score = scoreChapterStory({
        chapter,
        content,
        usedChapterNumbers,
        usedChunkIds,
        fromYear: input.fromYear,
        toYear: input.toYear,
        excludedTopics: input.excludedTopics,
      });
      if (score < 0) continue;
      ranked.push({
        chapter,
        chunks: usableChunks,
        passage: choosePassage(usableChunks),
        score,
        content,
      });
    } catch {
      excluded.push({ chapter: chapter.label, reason: 'chapter read failed' });
    }
  }

  const queryTokens = tokenize(input.query || '');
  const candidates = ranked
    .sort((left, right) => {
      if (queryTokens.length > 0) {
        const leftMatches = queryTokens.filter((token) =>
          left.content.toLowerCase().includes(token)
        ).length;
        const rightMatches = queryTokens.filter((token) =>
          right.content.toLowerCase().includes(token)
        ).length;
        if (leftMatches !== rightMatches) return rightMatches - leftMatches;
      }
      return right.score - left.score;
    })
    .slice(0, limit)
    .map((entry, index) => {
      const years = yearsIn(entry.content);
      const question = editorialQuestion(entry.chapter.title, entry.passage.text);
      return {
        number: index + 1,
        chapterNumber: entry.chapter.number,
        chapterLabel: entry.chapter.label,
        title: entry.chapter.title,
        chunkId: entry.passage.chunk.chunkId,
        chunkIndex: entry.passage.chunk.chunkIndex,
        historicalPeriod: years.length > 0 ? years.slice(0, 4).join(', ') : null,
        sourceExcerpt: clip(entry.passage.text, 900),
        editorialQuestion: question,
        visualDirection: visualDirection(entry.chapter.title, entry.passage.text),
        score: entry.score,
      } satisfies DiscoveryCandidate;
    });

  return {
    candidates,
    inspectedChapters: chapters.length,
    excluded,
    sourceComplete: input.inventory.coverage.complete,
  };
}

export function candidateOverlapMap(
  candidates: DiscoveryCandidate[],
  episodes: EpisodeRecord[],
  chunks: Map<string, ManuscriptChunk>
): Map<number, string | null> {
  const result = new Map<number, string | null>();
  for (const candidate of candidates) {
    const chunk = chunks.get(candidate.chunkId);
    result.set(
      candidate.number,
      overlapWithEpisodes(
        {
          key: `chapter:${candidate.chapterNumber}`,
          kind: 'chapter',
          number: candidate.chapterNumber,
          title: candidate.title,
          label: candidate.chapterLabel,
          part: null,
          startChunkIndex: candidate.chunkIndex,
          endChunkIndex: candidate.chunkIndex,
          chunkCount: 1,
          charStart: chunk?.charStart || 0,
          charEnd: chunk?.charEnd || 0,
          indexedChars: chunk?.content.length || 0,
          sectionPaths: chunk?.sectionPath || [],
        },
        chunk?.content || candidate.sourceExcerpt,
        episodes
      )
    );
  }
  return result;
}
