import type { BrainSourceClass } from '@/lib/knowledge/rag/types';
import { BRAIN_EVALUATION_QUESTIONS } from './questions';

export type ReliabilityBenchmarkCategory =
  | 'biography'
  | 'articles'
  | 'unframed'
  | 'personal_notes'
  | 'projects'
  | 'media_coverage'
  | 'exact_document'
  | 'thematic'
  | 'cross_language'
  | 'no_answer'
  | 'routing'
  | 'commercial'
  | 'failure_handling';

export type ReliabilityBenchmarkQuery = {
  id: string;
  question: string;
  language: 'ru' | 'en';
  category: ReliabilityBenchmarkCategory;
  expectedSourceClasses: BrainSourceClass[];
  expectedDocumentIds: string[] | null;
  answerability: 'answerable' | 'unanswerable' | 'pending_ground_truth';
  expectedFailureBehavior: string | null;
};

function verifiedCategory(category: string): ReliabilityBenchmarkCategory {
  if (category === 'novaya') return 'articles';
  if (category === 'personal_writing') return 'personal_notes';
  if (category === 'heart_angel') return 'projects';
  if (category === 'multi_source') return 'thematic';
  return category as ReliabilityBenchmarkCategory;
}

const VERIFIED: ReliabilityBenchmarkQuery[] = BRAIN_EVALUATION_QUESTIONS.map((question) => ({
  id: `verified:${question.id}`,
  question: question.question,
  language: question.language,
  category: verifiedCategory(question.category),
  expectedSourceClasses: question.expectedSourceClasses,
  expectedDocumentIds: question.expectedDocumentIds,
  answerability: question.answerable ? 'answerable' : 'unanswerable',
  expectedFailureBehavior: question.answerable
    ? null
    : 'Return an explicit no-answer or insufficient-evidence response.',
}));

const PENDING: ReliabilityBenchmarkQuery[] = [
  [
    'biography-early-life',
    'Что известно о ранних годах Антона Меркурова?',
    'ru',
    'biography',
    ['biography'],
  ],
  [
    'biography-family',
    'Кем был скульптор, чьим правнуком является Антон?',
    'ru',
    'biography',
    ['biography', 'manuscript'],
  ],
  ['biography-career', 'Как Антон пришёл в арт-рынок?', 'ru', 'biography', ['biography']],
  [
    'biography-public-role',
    'Какие публичные роли Антона подтверждены документами?',
    'ru',
    'biography',
    ['biography'],
  ],
  ['biography-english', 'What is Anton Merkurov known for?', 'en', 'biography', ['biography']],
  ['articles-sothebys', 'Найди статьи о Sotheby’s', 'ru', 'articles', ['article']],
  ['articles-christies', 'Что я писал о Christie’s?', 'ru', 'articles', ['article']],
  ['articles-ai-regulation', 'Публикации про регулирование ИИ', 'ru', 'articles', ['article']],
  [
    'articles-english-ai',
    'What have I written about AI regulation?',
    'en',
    'articles',
    ['article'],
  ],
  ['unframed-memory', 'Что UNFRAMED говорит о памяти?', 'ru', 'unframed', ['manuscript']],
  ['unframed-father', 'Как в UNFRAMED описан отец?', 'ru', 'unframed', ['manuscript']],
  [
    'unframed-english-exile',
    'What does UNFRAMED say about exile?',
    'en',
    'unframed',
    ['manuscript'],
  ],
  [
    'notes-recipe-context',
    'Что я писал про рецепты?',
    'ru',
    'personal_notes',
    ['personal_writing', 'other'],
  ],
  [
    'notes-weekly-rhythm',
    'Как я описывал свой недельный ритм?',
    'ru',
    'personal_notes',
    ['personal_writing'],
  ],
  [
    'notes-english-focus',
    'What did I write about focus and context?',
    'en',
    'personal_notes',
    ['personal_writing'],
  ],
  [
    'project-ios',
    'Как продвигается iOS-приложение Pierrot?',
    'ru',
    'projects',
    ['art_project', 'other'],
  ],
  [
    'project-art-engine',
    'Что известно о развитии Art Engine?',
    'ru',
    'projects',
    ['art_project', 'other'],
  ],
  ['project-heart-angel', 'Как устроен проект Heart & Angel?', 'ru', 'projects', ['art_project']],
  ['media-le-monde', 'Найди мои публикации в Le Monde', 'ru', 'media_coverage', []],
  ['media-six-months', 'Что обо мне писали за последние полгода?', 'ru', 'media_coverage', []],
  ['media-quotes', 'Какие прямые цитаты обо мне есть в архиве?', 'ru', 'media_coverage', []],
  [
    'exact-weekly-review',
    'Найди документ «Anton Merkurov — Weekly Review»',
    'ru',
    'exact_document',
    [],
  ],
  ['exact-title-noise', 'Покажи документ с названием Digital control', 'ru', 'exact_document', []],
  ['thematic-architecture', 'Материалы про архитектуру цифрового храма', 'ru', 'thematic', []],
  ['thematic-privacy', 'Что есть про приватность и технологии?', 'ru', 'thematic', []],
  ['cross-ru-to-en', 'Что я писал про private infrastructure?', 'ru', 'cross_language', []],
  ['cross-en-to-ru', 'What did I write about цифровой суверенитет?', 'en', 'cross_language', []],
  [
    'cross-transliteration',
    'Merkurov Novaya Gazeta AI columns',
    'en',
    'cross_language',
    ['article'],
  ],
  ['no-answer-cooking', 'Какие точные рецепты еды есть в Brain?', 'ru', 'no_answer', []],
  ['no-answer-finance', 'Какие у меня личные банковские счета?', 'ru', 'no_answer', []],
  ['no-answer-future', 'Что я опубликую в декабре 2027 года?', 'ru', 'no_answer', []],
  ['routing-rag-search', 'Найди в RAG рецепты еды', 'ru', 'routing', []],
  ['routing-rag-stats', 'Статистика RAG', 'ru', 'routing', []],
  ['routing-brain-docs', 'Сколько документов в Brain?', 'ru', 'routing', []],
  ['commercial-sales', 'Много продал?', 'ru', 'commercial', []],
  ['routing-media-search', 'Найди в Media публикации обо мне', 'ru', 'routing', []],
  [
    'failure-timeout',
    'Найди материалы, при условии что Brain timeout',
    'ru',
    'failure_handling',
    [],
  ],
  ['failure-empty', 'Найди документ, которого нет в Brain', 'ru', 'failure_handling', []],
  [
    'failure-permission',
    'Покажи приватный документ без owner-доступа',
    'ru',
    'failure_handling',
    [],
  ],
].map(([id, question, language, category, expectedSourceClasses]) => ({
  id: `pending:${id}`,
  question: String(question),
  language: language as 'ru' | 'en',
  category: category as ReliabilityBenchmarkCategory,
  expectedSourceClasses: expectedSourceClasses as BrainSourceClass[],
  expectedDocumentIds: null,
  answerability: 'pending_ground_truth' as const,
  expectedFailureBehavior:
    category === 'failure_handling'
      ? 'Distinguish timeout, empty source, permission denial and technical error.'
      : null,
}));

export const PIERROT_RELIABILITY_BENCHMARK: ReliabilityBenchmarkQuery[] = [...VERIFIED, ...PENDING];

export const PIERROT_RELIABILITY_BENCHMARK_STATS = {
  total: PIERROT_RELIABILITY_BENCHMARK.length,
  verified: VERIFIED.length,
  pendingGroundTruth: PENDING.length,
};

export function verifiedBenchmarkQueries(): ReliabilityBenchmarkQuery[] {
  return PIERROT_RELIABILITY_BENCHMARK.filter(
    (query) => query.answerability !== 'pending_ground_truth'
  );
}
