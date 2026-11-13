/**
 * @jest-environment node
 */
import {
  buildManuscriptStructure,
  type ManuscriptChunk,
} from '@/lib/knowledge/rag/manuscriptStructure';
import { discoverEpisodeCandidates, candidateOverlapMap } from '../discovery';
import type { EpisodeRecord, RejectedStory } from '../episodes';
import { detectEditorialIntent } from '../intent';
import { emptyEditorialContext, type EditorialContext } from '../types';

function makeChapter(
  number: number,
  title: string,
  content: string,
  start: number
): ManuscriptChunk[] {
  const heading = `CHAPTER ${String(number).padStart(2, '0')}: ${title}`;
  const half = Math.ceil(content.length / 2);
  return [
    {
      chunkId: `chk_${String(number).padStart(2, '0')}a`,
      chunkIndex: start,
      sectionIndex: number,
      heading,
      sectionPath: ['PART I', heading],
      charStart: 0,
      charEnd: half,
      lineStart: start * 10 + 1,
      lineEnd: start * 10 + 9,
      content: `${heading}\n${content.slice(0, half)}`,
    },
    {
      chunkId: `chk_${String(number).padStart(2, '0')}b`,
      chunkIndex: start + 1,
      sectionIndex: number,
      heading,
      sectionPath: ['PART I', heading],
      charStart: half,
      charEnd: content.length,
      lineStart: start * 10 + 10,
      lineEnd: start * 10 + 19,
      content: content.slice(half),
    },
  ];
}

const chapters = [
  makeChapter(
    1,
    'THE GRANITE AND THE GLITCH',
    'In 1997 I bought my first computer. The beige box sat in my room and the modem screamed at night. I remember the sound of freedom and the first network.',
    0
  ),
  makeChapter(
    2,
    'THE LIBRARY AND THE LIE',
    'The library was a fortress of encyclopedias. My father told me that knowledge would open every door; I believed him until the doors began to close.',
    2
  ),
  makeChapter(
    3,
    'THE ARREST',
    'Police arrested me near the courthouse. The criminal case and prison changed everything. This is a story about force and the state.',
    4
  ),
  makeChapter(
    4,
    'THE SMELL OF ABROAD',
    'I arrived in London with two suitcases and a visa. The hotel smelled of old carpets; the bank refused my card; the city was a machine I did not understand.',
    6
  ),
  makeChapter(
    5,
    'THE DIGITAL AWAKENING',
    'FidoNet was my first network. The modem connected at night and the BBS opened a world of text. I became a Node and met lifelong friends.',
    8
  ),
  makeChapter(
    6,
    'THE SPECTRAL TIGER',
    'In 2008 I bought the Spectral Tiger for five hundred dollars. I parked it in Ironforge and watched other players stop to look at the useless digital cat.',
    10
  ),
  makeChapter(
    7,
    'THE GOAT AND THE EXPERT',
    'A goat on a mountain in Armenia taught me more about status than any boardroom. The camera captured the animal; the expert explained nothing.',
    12
  ),
  makeChapter(
    8,
    'THE RADIO AND THE CAROUSEL',
    'At Radio Liberty I learned how a legacy machine speaks to a new medium. The microphone, the carousel of guests, the afternoon light in the studio.',
    14
  ),
];

let globalOffset = 0;
const chunks: ManuscriptChunk[] = chapters.flat().map((chunk) => {
  const length = chunk.content.length;
  const next = { ...chunk, charStart: globalOffset, charEnd: globalOffset + length };
  globalOffset += length;
  return next;
});
const sourceCharCount = globalOffset;
const structure = buildManuscriptStructure({
  chunks: chunks.map(({ content: _content, ...meta }) => meta),
  sourceCharCount,
  expectedChunkCount: chunks.length,
});
const inventory = {
  document: {
    id: 'doc_unframed_manuscript',
    title: 'UNFRAMED',
    sourcePath: 'app/unframed/Unframed.markdown',
    sourceSha256: 'a'.repeat(64),
    parserVersion: 'unframed-parser-v1',
    chunkerVersion: 'unframed-chunker-v1',
    embeddingModel: 'baai/bge-m3',
    accessClass: 'owner' as const,
    chunkCount: chunks.length,
    sourceCharCount,
    sourceType: 'manuscript',
    ingestionStatus: 'completed',
    extractionStatus: 'complete',
    updatedAt: '2026-11-13T00:00:00.000Z',
    metadata: {},
  },
  chunks: chunks.map(({ content: _content, ...meta }) => meta),
  structure,
  coverage: structure.coverage,
  loadedAt: '2026-11-13T00:00:00.000Z',
};

const usedEpisode: EpisodeRecord = {
  id: 'episode-5',
  number: 43,
  title: 'The Digital Awakening',
  workingTitle: 'The Digital Awakening',
  status: 'PUBLISHED',
  manuscriptDocumentId: 'doc_unframed_manuscript',
  chapterNumber: 5,
  chapterLabel: 'CHAPTER 05: THE DIGITAL AWAKENING',
  chunkIds: ['chk_05a', 'chk_05b'],
  sourcePassages: [],
  centralStory: '',
  thesis: '',
  narrativeAngle: '',
  historicalPeriod: '1990s',
  keyCharacters: [],
  keyEvents: [],
  visualConcept: '',
  scriptId: null,
  approvedScriptId: null,
  voiceover: '',
  visualPrompts: [],
  music: '',
  videoUrl: '',
  publicationDate: null,
  publicPageUrl: '',
  description: '',
  relatedEpisodes: [],
  editorialNotes: '',
  createdAt: '',
  updatedAt: '',
  history: [],
};

const rejectedStory: RejectedStory = {
  id: 'rejected-1',
  number: null,
  title: 'The Spectral Tiger',
  chapterNumber: 6,
  chunkIds: ['chk_06a'],
  reason: 'not interesting',
  createdAt: '',
};

function context(patch: Partial<EditorialContext> = {}): EditorialContext {
  return {
    ...emptyEditorialContext(),
    projectId: 'project-1',
    projectSlug: 'unframed',
    projectName: 'Unframed',
    documentId: 'doc_unframed_manuscript',
    documentTitle: 'UNFRAMED',
    ...patch,
  };
}

describe('episode discovery', () => {
  it('A/I/J. returns five verified, non-restricted, non-duplicate candidates', async () => {
    const result = await discoverEpisodeCandidates({
      inventory,
      episodes: [usedEpisode],
      rejected: [rejectedStory],
      allChunks: chunks,
      limit: 5,
    });

    expect(result.candidates).toHaveLength(5);
    expect(result.sourceComplete).toBe(true);
    const chapterNumbers = result.candidates.map((candidate) => candidate.chapterNumber);
    expect(chapterNumbers).not.toContain(3); // restricted
    expect(chapterNumbers).not.toContain(5); // used
    expect(chapterNumbers).not.toContain(6); // rejected
    expect(new Set(chapterNumbers).size).toBe(5);

    for (const candidate of result.candidates) {
      const chunk = chunks.find((item) => item.chunkId === candidate.chunkId);
      expect(chunk).toBeTruthy();
      expect(candidate.sourceExcerpt.replace(/\s+/g, ' ')).toContain(
        chunk!.content.slice(0, 40).replace(/\s+/g, ' ')
      );
      expect(candidate.chapterLabel).toContain(`CHAPTER ${String(candidate.chapterNumber).padStart(2, '0')}`);
      expect(candidate.score).toBeGreaterThan(0);
    }
  });

  it('D. does not return a rejected story unchanged', async () => {
    const result = await discoverEpisodeCandidates({
      inventory,
      episodes: [usedEpisode],
      rejected: [rejectedStory],
      allChunks: chunks,
      limit: 8,
    });
    expect(result.candidates.some((candidate) => candidate.chapterNumber === 6)).toBe(false);
  });

  it('J. identifies overlap with an existing episode', () => {
    const overlap = candidateOverlapMap(
      [
        {
          number: 1,
          chapterNumber: 5,
          chapterLabel: 'CHAPTER 05: THE DIGITAL AWAKENING',
          title: 'The Digital Awakening',
          chunkId: 'chk_05a',
          chunkIndex: 8,
          historicalPeriod: '1990s',
          sourceExcerpt: '',
          editorialQuestion: '',
          visualDirection: '',
          score: 1,
        },
      ],
      [usedEpisode],
      new Map(chunks.map((chunk) => [chunk.chunkId, chunk]))
    );
    expect(overlap.get(1)).toContain('already uses chapter 5');
  });
});

describe('episode conversation intent', () => {
  it('A. detects discovery from a natural request', () => {
    const intent = detectEditorialIntent({
      message: 'Find five interesting stories for the next UNFRAMED episode.',
    });
    expect(intent?.operation).toBe('episode.discover');
  });

  it('E. restores an explicit episode number', () => {
    const intent = detectEditorialIntent({
      message: 'Go back to episode 42.',
      activeContext: context({ activeTask: 'episode.discover' }),
    });
    expect(intent?.operation).toBe('episode.open');
    expect(intent?.episodeNumber).toBe(42);
  });

  it('F. moves from ready video to publication preparation', () => {
    const intent = detectEditorialIntent({
      message: 'The video is ready; let’s prepare the page.',
      activeContext: context({
        activeEpisodeNumber: 43,
        activeStage: 'PRODUCTION',
        activeTask: 'episode.script',
      }),
    });
    expect(intent?.operation).toBe('episode.publish_prepare');
  });

  it('C. carries the active manuscript into a period follow-up', () => {
    const intent = detectEditorialIntent({
      message: 'What else is there from 2010–2015?',
      activeContext: context({
        activeTask: 'episode.discover',
        discoveryCandidates: [
          {
            number: 1,
            chapterNumber: 39,
            chapterLabel: 'CHAPTER 39: THE ALPHABET AND THE TOKEN',
            title: 'The Alphabet and the Token',
            chunkId: 'chk_39a',
            chunkIndex: 142,
            historicalPeriod: '2010s',
            sourceExcerpt: '',
            editorialQuestion: '',
            visualDirection: '',
            score: 1,
          },
        ],
      }),
    });
    expect(intent?.operation).toBe('episode.discover');
    expect(intent?.followUp).toBe(true);
    expect(intent?.constraints.fromYear).toBe(2010);
    expect(intent?.constraints.toYear).toBe(2015);
  });

  it('D. remembers rejection of the active discovery candidate', () => {
    const intent = detectEditorialIntent({
      message: 'I don’t like this story. Reject it.',
      activeContext: context({
        activeTask: 'episode.discover',
        discoveryCandidates: [
          {
            number: 1,
            chapterNumber: 39,
            chapterLabel: 'CHAPTER 39: THE ALPHABET AND THE TOKEN',
            title: 'The Alphabet and the Token',
            chunkId: 'chk_39a',
            chunkIndex: 142,
            historicalPeriod: '2010s',
            sourceExcerpt: '',
            editorialQuestion: '',
            visualDirection: '',
            score: 1,
          },
        ],
      }),
    });
    expect(intent?.operation).toBe('episode.reject');
  });

  it('selects the second discovery candidate', () => {
    const intent = detectEditorialIntent({
      message: 'Select the second option.',
      activeContext: context({
        activeTask: 'episode.discover',
        discoveryCandidates: [
          {
            number: 1,
            chapterNumber: 39,
            chapterLabel: 'A',
            title: 'A',
            chunkId: 'chk_a',
            chunkIndex: 1,
            historicalPeriod: null,
            sourceExcerpt: '',
            editorialQuestion: '',
            visualDirection: '',
            score: 1,
          },
          {
            number: 2,
            chapterNumber: 22,
            chapterLabel: 'B',
            title: 'B',
            chunkId: 'chk_b',
            chunkIndex: 2,
            historicalPeriod: null,
            sourceExcerpt: '',
            editorialQuestion: '',
            visualDirection: '',
            score: 1,
          },
        ],
      }),
    });
    expect(intent?.operation).toBe('episode.select');
    expect(intent?.candidateNumber).toBe(2);
  });

  it('L. does not contaminate an unrelated conversation with UNFRAMED state', () => {
    const intent = detectEditorialIntent({
      message: 'Покажи статистику сайта за неделю.',
      activeContext: context({
        activeEpisodeNumber: 43,
        activeStage: 'SCRIPT',
        activeTask: 'episode.script',
      }),
    });
    expect(intent).toBeNull();
  });

  it('G. resumes unfinished work from a new conversation when the project chat is restored', () => {
    const intent = detectEditorialIntent({
      message: 'Let’s continue UNFRAMED.',
      activeContext: context({
        activeEpisodeNumber: 43,
        activeStage: 'SCRIPT',
        activeTask: 'episode.script',
      }),
    });
    expect(intent?.operation).toBe('episode.open');
  });
});
