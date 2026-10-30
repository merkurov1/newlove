import type { BrainSourceClass } from '../../rag/types';

export type BrainEvaluationCategory =
  | 'novaya'
  | 'unframed'
  | 'heart_angel'
  | 'biography'
  | 'personal_writing'
  | 'multi_source'
  | 'no_answer';

export type BrainEvaluationQuestion = {
  id: string;
  question: string;
  language: 'ru' | 'en';
  category: BrainEvaluationCategory;
  /** Source classes the router should select. */
  expectedSourceClasses: BrainSourceClass[];
  /** Real document ids from the Brain corpus at the audit snapshot. */
  expectedDocumentIds: string[];
  /** True when the corpus contains a defensible answer. */
  answerable: boolean;
  note?: string;
};

const NOVAYA_AI_IDS = [
  'doc_article_9df4a6f96205b46ce5b9a3f277c7340e',
  'doc_article_3ce7842bc5c2716e1df17deefafaef6b',
  'doc_article_15913cba97ddbb77116f6c53e9a5e78f',
  'doc_article_f88662ef4b21e1be6db41aac751a4a86',
  'doc_article_e17200d435c08def876c7f3c3249a1c4',
  'doc_article_13d50cd2f7fd82788ebcb610279bebdf',
  'doc_article_8b3a43210b974d344a9cd2bbe5bc16e8',
  'doc_article_031b952d513f4fac4f98563e78fc8f66',
];

const PERSONAL_PAST_IDS = [
  'doc_article_0a9652098718d34509c2d15ab528c34d',
  'doc_article_fedc55ba1b6f2259c804d80497659513',
  'doc_article_74bdc123bb6e6a89422fb66afde7b8f1',
  'doc_article_7ab1afb5ccd18ba6fff101b3457446c7',
  'doc_article_e9908c33960fa8ce5fae6550c612e8ba',
];

const MANUSCRIPT_ID = 'doc_unframed_manuscript';

export const BRAIN_EVALUATION_QUESTIONS: BrainEvaluationQuestion[] = [
  {
    id: 'novaya-ai-overview',
    question: 'What have I written in Novaya Gazeta about AI?',
    language: 'en',
    category: 'novaya',
    expectedSourceClasses: ['article'],
    expectedDocumentIds: NOVAYA_AI_IDS,
    answerable: true,
    note: 'Broad thematic overview over real Novaya AI articles.',
  },
  {
    id: 'novaya-ai-censorship',
    question: 'Which Novaya Gazeta article discusses censorship in Russian AI?',
    language: 'en',
    category: 'novaya',
    expectedSourceClasses: ['article'],
    expectedDocumentIds: ['doc_article_3ce7842bc5c2716e1df17deefafaef6b'],
    answerable: true,
  },
  {
    id: 'novaya-ai-telegram',
    question: 'What did I write in Novaya Gazeta about Telegram and xAI?',
    language: 'en',
    category: 'novaya',
    expectedSourceClasses: ['article'],
    expectedDocumentIds: ['doc_article_e17200d435c08def876c7f3c3249a1c4'],
    answerable: true,
  },
  {
    id: 'novaya-ai-military',
    question: 'Which Novaya Gazeta article connects artificial intelligence with military use?',
    language: 'en',
    category: 'novaya',
    expectedSourceClasses: ['article'],
    expectedDocumentIds: ['doc_article_0039d8f4a0080e216c39ec90ede52a1a'],
    answerable: true,
  },
  {
    id: 'novaya-ai-russian',
    question: 'Что я писал в Новой газете про искусственный интеллект?',
    language: 'ru',
    category: 'novaya',
    expectedSourceClasses: ['article'],
    expectedDocumentIds: NOVAYA_AI_IDS,
    answerable: true,
  },
  {
    id: 'novaya-2025-date',
    question: 'What did I publish in Novaya Gazeta in 2025 about AI?',
    language: 'en',
    category: 'novaya',
    expectedSourceClasses: ['article'],
    expectedDocumentIds: NOVAYA_AI_IDS,
    answerable: true,
    note: 'Recency/year filter should not switch the source to the manuscript.',
  },
  {
    id: 'unframed-autonomy',
    question: 'What does UNFRAMED say about autonomy?',
    language: 'en',
    category: 'unframed',
    expectedSourceClasses: ['manuscript'],
    expectedDocumentIds: [MANUSCRIPT_ID],
    answerable: true,
  },
  {
    id: 'unframed-freedom',
    question: 'What does UNFRAMED say about freedom?',
    language: 'en',
    category: 'unframed',
    expectedSourceClasses: ['manuscript'],
    expectedDocumentIds: [MANUSCRIPT_ID],
    answerable: true,
  },
  {
    id: 'unframed-digital-awakening',
    question: 'Which chapter of UNFRAMED discusses the digital awakening?',
    language: 'en',
    category: 'unframed',
    expectedSourceClasses: ['manuscript'],
    expectedDocumentIds: [MANUSCRIPT_ID],
    answerable: true,
    note: 'The answer is in CHAPTER 06; the document id is enough for document-level recall.',
  },
  {
    id: 'unframed-russian',
    question: 'Что UNFRAMED говорит о свободе?',
    language: 'ru',
    category: 'unframed',
    expectedSourceClasses: ['manuscript'],
    expectedDocumentIds: [MANUSCRIPT_ID],
    answerable: true,
  },
  {
    id: 'heart-angel-explain',
    question: 'Explain Heart & Angel.',
    language: 'en',
    category: 'heart_angel',
    expectedSourceClasses: ['art_project'],
    expectedDocumentIds: [],
    answerable: false,
    note: 'No Heart & Angel document is in the current corpus; the router must not fall back to the manuscript.',
  },
  {
    id: 'heart-angel-postcard',
    question: 'What is the Heart & Angel postcard?',
    language: 'en',
    category: 'heart_angel',
    expectedSourceClasses: ['art_project'],
    expectedDocumentIds: [],
    answerable: false,
  },
  {
    id: 'heart-angel-russian',
    question: 'Что такое Heart & Angel?',
    language: 'ru',
    category: 'heart_angel',
    expectedSourceClasses: ['art_project'],
    expectedDocumentIds: [],
    answerable: false,
  },
  {
    id: 'biography-childhood',
    question: 'What does my biography say about my childhood?',
    language: 'en',
    category: 'biography',
    expectedSourceClasses: ['biography', 'manuscript'],
    expectedDocumentIds: [MANUSCRIPT_ID],
    answerable: true,
  },
  {
    id: 'biography-soviet-past',
    question: 'Which personal essays describe my Soviet past?',
    language: 'en',
    category: 'biography',
    expectedSourceClasses: ['personal_writing', 'biography'],
    expectedDocumentIds: PERSONAL_PAST_IDS,
    answerable: true,
  },
  {
    id: 'personal-identity',
    question: 'What have I written about narrative identity?',
    language: 'en',
    category: 'personal_writing',
    expectedSourceClasses: ['personal_writing'],
    expectedDocumentIds: ['doc_article_e9908c33960fa8ce5fae6550c612e8ba'],
    answerable: true,
  },
  {
    id: 'personal-ai',
    question: 'What did I write on Substack about artificial intelligence?',
    language: 'en',
    category: 'personal_writing',
    expectedSourceClasses: ['personal_writing'],
    expectedDocumentIds: [
      'doc_article_45b882f399d546b9e81f207d7675c771',
      'doc_article_5ef256cb787ef6f824256117ac9ba6d9',
      'doc_article_18ffef01866de6eaf544afa05db52f0c',
    ],
    answerable: true,
  },
  {
    id: 'multi-source-technology',
    question:
      'Compare what I wrote in Novaya Gazeta about AI with what UNFRAMED says about technology.',
    language: 'en',
    category: 'multi_source',
    expectedSourceClasses: ['article', 'manuscript'],
    expectedDocumentIds: [...NOVAYA_AI_IDS, MANUSCRIPT_ID],
    answerable: true,
  },
  {
    id: 'no-answer-quantum',
    question: 'What do I say about quantum chromodynamics?',
    language: 'en',
    category: 'no_answer',
    expectedSourceClasses: [],
    expectedDocumentIds: [],
    answerable: false,
  },
  {
    id: 'no-answer-alpacas',
    question: 'What is my opinion on breeding alpacas?',
    language: 'en',
    category: 'no_answer',
    expectedSourceClasses: [],
    expectedDocumentIds: [],
    answerable: false,
  },
  {
    id: 'no-answer-fictional',
    question: 'What did I write about the 1648 Treaty of Westphalia in Heart & Angel?',
    language: 'en',
    category: 'no_answer',
    expectedSourceClasses: ['art_project'],
    expectedDocumentIds: [],
    answerable: false,
  },
];

export const BRAIN_EVALUATION_CATEGORIES: BrainEvaluationCategory[] = [
  'novaya',
  'unframed',
  'heart_angel',
  'biography',
  'personal_writing',
  'multi_source',
  'no_answer',
];
