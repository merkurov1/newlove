/**
 * Journal fixtures for local Playwright verification.
 *
 * The production Journal reads published Flow issues from Supabase. This
 * fixture mirrors the current production issue pair (EN #18 / RU #26, same
 * period) so the bilingual front page can be exercised without production
 * credentials. It is test support only and is never imported by the app.
 */

const EN_TITLE = 'UNFRAMED // Episode 0: The Spectral Tiger | Anton Merkurov';
const EN_SUMMARY = 'Pierrot, archives, and scarce attention.';
const EN_LEAD =
  'As the finale of this week, which due to circumstances ends on Shabbat, the book UNFRAMED has gained a new visual quality, and I have gained a new project and a reason to explore new tools.';
const RU_SUMMARY = 'Архив, Пьеро и границы авторства';
const RU_LEAD =
  'В качестве финала этой недели, которая в силу обстоятельств заканчивается в шаббат, книга UNFRAMED обрела новое визуальное качество, а я — новый проект и повод осваивать новые инструменты.';

const PERIOD = {
  start: '2026-11-13T00:00:00.000Z',
  end: '2026-11-20T00:00:00.000Z',
};

function fixtureImage(label, width, height, background, ink) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${background}"/><circle cx="${width * 0.62}" cy="${height * 0.42}" r="${Math.min(width, height) * 0.22}" fill="${ink}" opacity="0.9"/><path d="M0 ${height * 0.78} L${width} ${height * 0.52} L${width} ${height} L0 ${height} Z" fill="${ink}" opacity="0.16"/><text x="${width * 0.06}" y="${height * 0.9}" font-family="Georgia, serif" font-size="${Math.round(Math.min(width, height) * 0.09)}" fill="${ink}">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const LANDSCAPE_IMAGE = fixtureImage('Journal', 1600, 900, '#E7DED0', '#7A2233');
const PORTRAIT_IMAGE = fixtureImage('Pierrot', 900, 1200, '#DED6C8', '#1D1B18');
const SQUARE_IMAGE = fixtureImage('Flow', 1000, 1000, '#E2D9CB', '#6F6A60');

function material(overrides) {
  return {
    id: overrides.id,
    type: overrides.type || 'article',
    title: overrides.title || '',
    body: overrides.body || '',
    description: overrides.description || '',
    url: overrides.url || null,
    publishedAt: overrides.publishedAt || '2026-11-18T10:00:00.000Z',
    createdAt: overrides.createdAt || overrides.publishedAt || '2026-11-18T10:00:00.000Z',
    metadata: overrides.metadata || {},
    lang: overrides.lang || 'ru',
    kind: overrides.kind || 'other',
    own: overrides.own !== undefined ? overrides.own : true,
    image: overrides.image,
    alt: overrides.alt,
    caption: overrides.caption,
    siteName: overrides.siteName,
  };
}

function issueItems(lang) {
  const leadBody = lang === 'ru' ? RU_LEAD : EN_LEAD;

  return [
    material({
      id: 'lead-1',
      type: 'article',
      title: EN_TITLE,
      body: leadBody,
      description:
        lang === 'ru'
          ? 'Кинематографический тизер UNFRAMED и полная глава «Spectral Tiger».'
          : 'A cinematic teaser for UNFRAMED and the complete Spectral Tiger chapter.',
      url: 'https://www.merkurov.love/unframed/spectral-tiger',
      image: LANDSCAPE_IMAGE,
      alt: EN_TITLE,
      lang,
      kind: 'article',
      publishedAt: '2026-11-13T11:34:00.000Z',
    }),
    material({
      id: 'article-1',
      type: 'article',
      title: 'Merkurov x Pierrot',
      body: 'Пока окружающие спорят об использовании искусственного интеллекта, я этот факт не только не скрываю, но и демонстрирую в серии видео, где описывается работа моего виртуального помощника Пьеро.',
      url: 'https://www.merkurov.love/flow/merkurov-x-pierrot-c1dlr',
      image: SQUARE_IMAGE,
      alt: 'Merkurov x Pierrot',
      publishedAt: '2026-11-17T08:46:00.000Z',
      kind: 'article',
    }),
    material({
      id: 'article-2',
      type: 'article',
      title: 'Регистрация.',
      body: 'Пока все обсуждают роман, вот о чем думаю: какую роль авторизация играет в будущей архитектуре проекта и как я до этого додумался.',
      url: 'https://www.merkurov.love/flow/registration',
      publishedAt: '2026-11-16T07:37:00.000Z',
      kind: 'article',
    }),
    material({
      id: 'article-3',
      type: 'article',
      title: 'Опыт сын ошибок трудных.',
      body: 'Если бы я начинал сегодня, а не чуть больше года назад, первое что бы я «навайбкодил» — это прозрачную и красивую авторизацию и работу с пользователями.',
      url: 'https://www.merkurov.love/flow/experience',
      image: PORTRAIT_IMAGE,
      alt: 'Опыт сын ошибок трудных.',
      publishedAt: '2026-11-16T07:10:00.000Z',
      kind: 'article',
    }),
    material({
      id: 'article-4',
      type: 'article',
      title: 'На какие темы интересно поговорить Пьеро:',
      body: 'О контексте как материале, о границах ИИ, о цифровом наследии и об этике интерфейсов — десять вопросов, которые стоит задать виртуальному помощнику.',
      url: 'https://www.merkurov.love/flow/topics',
      publishedAt: '2026-11-15T19:30:00.000Z',
      kind: 'article',
    }),
    material({
      id: 'link-1',
      type: 'link',
      title:
        'A Wassily Kandinsky Sold by the Nahmads Fetches $85.8 M. at Christie’s, Notching a New Auction High',
      description:
        'A painting by Wassily Kandinsky set a record for the Russian-born pioneer of abstraction at Christie’s on Tuesday, when it fetched $85.8 million with fees.',
      url: 'https://www.artnews.com/art-news/market/wassily-kandinsky-nahmads-christies-new-auction-high-1234806466/',
      image: LANDSCAPE_IMAGE,
      alt: 'Kandinsky painting',
      siteName: 'ARTnews.com',
      lang: 'en',
      kind: 'link',
      publishedAt: '2026-11-18T12:00:00.000Z',
    }),
    material({
      id: 'link-2',
      type: 'link',
      title: 'Виртуальный Меркуров',
      description:
        'Use the power of AI for quick summarization and note taking, Gemini Notebook is a powerful virtual research assistant.',
      url: 'https://notebook.google.com/notebook/example',
      image: SQUARE_IMAGE,
      alt: 'Виртуальный Меркуров',
      siteName: 'notebook.google.com',
      kind: 'link',
      publishedAt: '2026-11-17T12:00:00.000Z',
    }),
    material({
      id: 'link-3',
      type: 'link',
      title: 'Что вы стали бы делать, если бы могли комфортно ничего не делать?',
      description:
        'Человеческие ответы на Question и синтез Пьеро. Добавьте свой ответ — от 25 слов.',
      url: 'https://www.merkurov.love/question?q=a51c3dea',
      image: PORTRAIT_IMAGE,
      alt: 'Question',
      siteName: 'Anton Merkurov',
      kind: 'link',
      publishedAt: '2026-11-15T12:00:00.000Z',
    }),
    material({
      id: 'video-1',
      type: 'video',
      title: 'Night Shift | Merkurov x Pierrot',
      url: 'https://www.youtube.com/watch?v=PRLJwXV3lsA',
      image: PORTRAIT_IMAGE,
      alt: 'Night Shift',
      siteName: 'YouTube',
      kind: 'video',
      publishedAt: '2026-11-20T10:00:00.000Z',
    }),
    material({
      id: 'video-2',
      type: 'video',
      title: 'Zero Views: Editing Pierrot | Merkurov x Pierrot',
      url: 'https://www.youtube.com/watch?v=dCmOar4LazE',
      image: SQUARE_IMAGE,
      alt: 'Zero Views',
      siteName: 'YouTube',
      kind: 'video',
      publishedAt: '2026-11-19T10:00:00.000Z',
    }),
    material({
      id: 'photo-1',
      type: 'photo',
      title: 'Пьеро шутит',
      description: 'Пьеро в мастерской, ноябрь.',
      url: 'https://www.merkurov.love/flow/piero-joke',
      image: PORTRAIT_IMAGE,
      alt: 'Пьеро шутит',
      kind: 'photo',
      publishedAt: '2026-11-16T12:00:00.000Z',
    }),
  ];
}

function buildPayload(lang) {
  const items = issueItems(lang);
  const lead = items[0];

  return {
    schemaVersion: 2,
    lang,
    period: PERIOD,
    stats: {
      total: 11,
      published: 11,
      drafts: 0,
      days: 7,
      medianDelaySeconds: null,
      byType: { article: 5, link: 3, video: 2, photo: 1 },
      byKind: { about_flow: 0, world: 0, other: 11 },
      own: 8,
      external: 3,
      byUtcHour: [],
      perDay: [],
      delays: [],
      quality: {
        langFieldMismatch: 0,
        photoAltEqualsFilename: 0,
        emptyDrafts: 0,
      },
      flowStartedAt: '2026-10-06T00:00:00.000Z',
      flowActiveDays: 45,
    },
    items,
    summary: lang === 'ru' ? RU_SUMMARY : EN_SUMMARY,
    pierrotIntro: [],
    lead,
    latest: [],
    links: [],
    videos: [],
    photos: [],
    sourceIndex: [],
    modelAnnotation: null,
    templateVersion: 1,
    template: {
      theme: {
        accent: '#7A2233',
        paper: '#F5F2EB',
        ink: '#1D1B18',
        muted: '#6F6A60',
        rule: '#D8D2C4',
        maxWidth: 1200,
        serifFont: 'serif',
        sansFont: 'sans-serif',
      },
      limits: { latest: 3, links: 3, videos: 2, photos: 1 },
      sections: {
        order: ['lead', 'latest', 'links', 'videos', 'photos', 'sources'],
        enabled: {
          lead: true,
          latest: true,
          links: true,
          videos: true,
          photos: true,
          metrics: true,
          sources: true,
          subscribe: true,
        },
      },
      labels: {
        ru: {
          masthead: 'Поток',
          lead: 'Главное',
          latest: 'Последнее',
          links: 'Ссылки',
          videos: 'Видео',
          photos: 'Фото',
          metrics: 'Цифры',
          sources: 'Источники',
          subscribe: 'Подписка',
          subscribeCopy: '',
        },
        en: {
          masthead: 'Flow',
          lead: 'Lead',
          latest: 'Latest',
          links: 'Links',
          videos: 'Video',
          photos: 'Photos',
          metrics: 'Numbers',
          sources: 'Sources',
          subscribe: 'Subscribe',
          subscribeCopy: '',
        },
      },
    },
    design: {
      template: 'classic',
      tokens: { accent: '#7A2233', paper: '#F5F2EB', ink: '#1D1B18' },
    },
  };
}

function issueRow({ id, slug, lang, number, publishedAt }) {
  const payload = buildPayload(lang);
  const lead = payload.lead;

  return {
    id,
    title: EN_TITLE,
    slug,
    publishedAt,
    sentAt: publishedAt,
    createdAt: publishedAt,
    lang,
    number,
    leadTitle: lead.title,
    leadBody: lead.body,
    itemCount: payload.stats.published,
    byType: payload.stats.byType,
    periodStart: PERIOD.start,
    periodEnd: PERIOD.end,
    payload,
  };
}

const LETTERS = [
  issueRow({
    id: 'ru-26',
    slug: 'ru-issue-26-2026-11-20',
    lang: 'ru',
    number: 26,
    publishedAt: '2026-11-20T19:00:00.000Z',
  }),
  issueRow({
    id: 'en-18',
    slug: 'en-issue-18-2026-11-20',
    lang: 'en',
    number: 18,
    publishedAt: '2026-11-20T18:00:00.000Z',
  }),
  issueRow({
    id: 'en-17',
    slug: 'en-issue-17-2026-11-13',
    lang: 'en',
    number: 17,
    publishedAt: '2026-11-13T18:00:00.000Z',
  }),
  issueRow({
    id: 'ru-25',
    slug: 'ru-issue-25-2026-11-13',
    lang: 'ru',
    number: 25,
    publishedAt: '2026-11-13T19:00:00.000Z',
  }),
  issueRow({
    id: 'en-16',
    slug: 'en-issue-16-2026-11-06',
    lang: 'en',
    number: 16,
    publishedAt: '2026-11-06T18:00:00.000Z',
  }),
  issueRow({
    id: 'ru-24',
    slug: 'ru-issue-24-2026-11-06',
    lang: 'ru',
    number: 24,
    publishedAt: '2026-11-06T19:00:00.000Z',
  }),
];

const FLOW_ITEMS = [
  {
    id: 'flow-1',
    title: 'Heart & Angel',
    slug: 'heart-angel-40s5l',
    lang: 'ru',
    type: 'photo',
    status: 'published',
    visibility: 'public',
    body_md: 'Heart & Angel',
    published_at: '2026-11-26T09:56:00.000Z',
    created_at: '2026-11-26T09:56:00.000Z',
    updated_at: '2026-11-26T09:56:00.000Z',
    source_url: null,
    metadata: {},
  },
  {
    id: 'flow-2',
    title: 'The Sanctuary — Digital Temple',
    slug: 'the-sanctuary-digital-temple-yob2y',
    lang: 'ru',
    type: 'article',
    status: 'published',
    visibility: 'public',
    body_md: 'The Sanctuary — Digital Temple',
    published_at: '2026-11-26T06:01:00.000Z',
    created_at: '2026-11-26T06:01:00.000Z',
    updated_at: '2026-11-26T06:01:00.000Z',
    source_url: null,
    metadata: {},
  },
  {
    id: 'flow-3',
    title: 'Photo',
    slug: 'vigil-digital-temple-mbd4j',
    lang: 'ru',
    type: 'photo',
    status: 'published',
    visibility: 'public',
    body_md: 'Photo',
    published_at: '2026-11-25T08:16:00.000Z',
    created_at: '2026-11-25T08:16:00.000Z',
    updated_at: '2026-11-25T08:16:00.000Z',
    source_url: null,
    metadata: {},
  },
  {
    id: 'flow-4',
    title: 'Temple. Process. Pierrot feat. Heart & Angel',
    slug: 'temple-process-pierrot-feat-heart-angel-2sc7i',
    lang: 'ru',
    type: 'photo',
    status: 'published',
    visibility: 'public',
    body_md: 'Temple. Process. Pierrot feat. Heart & Angel',
    published_at: '2026-11-25T05:00:00.000Z',
    created_at: '2026-11-25T05:00:00.000Z',
    updated_at: '2026-11-25T05:00:00.000Z',
    source_url: null,
    metadata: {},
  },
];

module.exports = {
  LETTERS,
  FLOW_ITEMS,
  EN_TITLE,
  EN_LEAD,
  RU_LEAD,
  RU_SUMMARY,
};
