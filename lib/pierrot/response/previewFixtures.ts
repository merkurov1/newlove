import { PIERROT_RESPONSE_VERSION, type PierrotResponse } from './types';

export type ResponsePreviewCase = {
  id: string;
  label: string;
  note: string;
  fallback: string;
  response: PierrotResponse;
};

function response(blocks: PierrotResponse['blocks']): PierrotResponse {
  return { version: PIERROT_RESPONSE_VERSION, language: 'ru', blocks };
}

export const RESPONSE_PREVIEW_CASES: ResponsePreviewCase[] = [
  {
    id: 'simple',
    label: '1 · Simple factual answer',
    note: 'Plain text. No card, chart or decorative component.',
    fallback: 'Сейчас в архиве 42 опубликованных материала.',
    response: response([{ type: 'text', markdown: 'Сейчас в архиве 42 опубликованных материала.' }]),
  },
  {
    id: 'analysis',
    label: '2 · Long analytical answer',
    note: 'Editorial hierarchy, one insight and a pull quote — not a card grid.',
    fallback:
      '## Что изменилось\n\nАрхив стал плотнее, но не однороднее. Основной сдвиг — от отдельных текстов к связной системе тем.\n\n### Наблюдение\n\nМатериалы о Digital Temple чаще ссылаются друг на друга, чем материалы о рынке.\n\n> Система важнее суммы текстов.',
    response: response([
      { type: 'heading', level: 1, text: 'Что изменилось' },
      {
        type: 'text',
        markdown:
          'Архив стал плотнее, но не однороднее. Основной сдвиг — от отдельных текстов к связной системе тем. Это не рост объёма, а изменение качества связей.',
      },
      {
        type: 'insight',
        label: 'Наблюдение',
        text: 'Материалы о Digital Temple чаще ссылаются друг на друга, чем материалы о рынке. Это интерпретация графа, не окончательный вывод.',
      },
      {
        type: 'quote',
        text: 'Система важнее суммы текстов.',
        attribution: 'Anton Merkurov',
        source: 'Рабочая заметка',
      },
    ]),
  },
  {
    id: 'msi',
    label: '3 · MSI calculation',
    note: 'Metric + formula + time series with real chart data.',
    fallback:
      '## MSI\n\nMSI = 0.42\n\nФормула: (охват тем × плотность связей) / индекс фрагментации.\n\n| Дата | MSI |\n| --- | --- |\n| 01.09 | 0.31 |\n| 01.10 | 0.37 |\n| 01.11 | 0.42 |',
    response: response([
      { type: 'heading', level: 1, text: 'MSI' },
      {
        type: 'metric',
        title: 'Индекс',
        metrics: [
          {
            label: 'MSI',
            value: 0.42,
            unit: 'ratio',
            period: 'ноябрь 2026',
            source: 'Расчёт по темам и связям',
            confidence: 'calculated',
            interpretation: '(охват тем × плотность связей) / индекс фрагментации',
          },
        ],
      },
      {
        type: 'chart',
        chart: 'line',
        title: 'Динамика MSI',
        description: 'Расчётный индекс по месяцам. Это не измерение аудитории.',
        data: [
          { date: '2026-09-01', msi: 0.31 },
          { date: '2026-10-01', msi: 0.37 },
          { date: '2026-11-01', msi: 0.42 },
        ],
        xKey: 'date',
        series: [{ key: 'msi', label: 'MSI', color: '#2F2B26' }],
        unit: 'индекс',
      },
      {
        type: 'text',
        markdown:
          '**Формула:** `(охват тем × плотность связей) / индекс фрагментации`. Значение 0.42 — расчётное, не прямое измерение.',
      },
    ]),
  },
  {
    id: 'timeline',
    label: '4 · Project history',
    note: 'A sourced timeline instead of a paragraph of dates.',
    fallback:
      '## История UNFRAMED\n\n- 2024 — первая рукопись.\n- 2025 — публикация фрагментов.\n- 2026 — новая редакция.',
    response: response([
      { type: 'heading', level: 1, text: 'История UNFRAMED' },
      {
        type: 'timeline',
        events: [
          {
            date: '2024-03-01',
            title: 'Первая рукопись',
            description: 'Черновая структура книги и первая редакция языка.',
            category: 'manuscript',
            status: 'завершено',
            source: 'Brain · UNFRAMED manuscript',
          },
          {
            date: '2025-06-01',
            title: 'Публикация фрагментов',
            description: 'Часть глав выходит отдельными эссе.',
            category: 'publication',
            status: 'опубликовано',
            source: '/unframed',
            url: '/unframed',
          },
          {
            date: '2026-10-01',
            title: 'Новая редакция',
            description: 'Пересобрана вторая часть и изменена линия аргумента.',
            category: 'revision',
            status: 'в работе',
            source: 'Brain · Weekly Review',
          },
        ],
      },
    ]),
  },
  {
    id: 'diagram',
    label: '5 · UNFRAMED structure',
    note: 'Hierarchical diagram with explicit relationships.',
    fallback:
      '## Структура UNFRAMED\n\nКнига состоит из трёх частей: язык, тело, институции.',
    response: response([
      { type: 'heading', level: 1, text: 'Структура UNFRAMED' },
      {
        type: 'diagram',
        diagram: 'hierarchy',
        title: 'Три уровня книги',
        description: 'Схема построена по структуре рукописи, а не по количеству сущностей.',
        nodes: [
          { id: 'book', label: 'UNFRAMED', detail: 'книга' },
          { id: 'lang', label: 'Язык', detail: 'часть I' },
          { id: 'body', label: 'Тело', detail: 'часть II' },
          { id: 'inst', label: 'Институции', detail: 'часть III' },
          { id: 'agents', label: 'Агенты языка', group: 'document' },
          { id: 'temple', label: 'Digital Temple', group: 'document' },
        ],
        edges: [
          { from: 'book', to: 'lang', label: 'part of', kind: 'direct' },
          { from: 'book', to: 'body', label: 'part of', kind: 'direct' },
          { from: 'book', to: 'inst', label: 'part of', kind: 'direct' },
          { from: 'lang', to: 'agents', label: 'discusses', kind: 'direct' },
          { from: 'inst', to: 'temple', label: 'develops', kind: 'inference' },
        ],
        caption: 'Сплошная линия — прямая связь; пунктир — inference-гипотеза.',
      },
    ]),
  },
  {
    id: 'comparison',
    label: '6 · Two-text comparison',
    note: 'Editorial columns make the actual differences visible.',
    fallback:
      '## Два текста\n\nПервый текст говорит о языке как инфраструктуре. Второй — о языке как институции.',
    response: response([
      { type: 'heading', level: 1, text: 'Два текста' },
      {
        type: 'comparison',
        title: 'Язык как инфраструктура / язык как институция',
        columns: [
          { id: 'a', title: 'Агенты ухватились за язык', subtitle: '2026' },
          { id: 'b', title: 'Институция языка', subtitle: '2024' },
        ],
        rows: [
          { label: 'Главный тезис', values: { a: 'Язык — инфраструктура агентов', b: 'Язык — институция власти' } },
          { label: 'Метод', values: { a: 'Технический анализ', b: 'Культурная критика' } },
          { label: 'Вывод', values: { a: 'Агенты меняют интерфейс', b: 'Институции меняют норму' } },
        ],
      },
    ]),
  },
  {
    id: 'bluesky',
    label: '7 · Bluesky statistics',
    note: 'Real counters and post-level engagement. No invented reach.',
    fallback: '## Bluesky\n\nПодписчики: 33. Взаимодействия: 59. Это не охват.',
    response: response([
      { type: 'heading', level: 1, text: 'Bluesky' },
      {
        type: 'metric',
        title: 'Публичные счётчики',
        metrics: [
          { label: 'Подписчики', value: 33, unit: 'count', source: 'Bluesky', confidence: 'measured' },
          { label: 'Посты', value: 12, unit: 'count', source: 'Bluesky', confidence: 'measured' },
          { label: 'Взаимодействия', value: 59, unit: 'count', source: 'Bluesky', confidence: 'calculated' },
        ],
      },
      {
        type: 'chart',
        chart: 'stacked_bar',
        title: 'Взаимодействие по постам',
        description: 'Лайки, репосты и ответы. Это не охват и не просмотры.',
        data: [
          { post: '#1 Digital Temple', likes: 12, reposts: 2, replies: 1 },
          { post: '#2 UNFRAMED', likes: 8, reposts: 1, replies: 0 },
          { post: '#3 Notes on AI', likes: 6, reposts: 3, replies: 2 },
        ],
        xKey: 'post',
        series: [
          { key: 'likes', label: 'Лайки', color: '#A5764F' },
          { key: 'reposts', label: 'Репосты', color: '#2F2B26' },
          { key: 'replies', label: 'Ответы', color: '#7C8A73' },
        ],
        unit: 'взаимодействия',
      },
      {
        type: 'insight',
        label: 'Ограничение',
        text: 'Bluesky отдаёт публичные счётчики, но не уникальный охват и не число просмотров.',
      },
    ]),
  },
  {
    id: 'code',
    label: '8 · Code explanation',
    note: 'Language label, copy control and restrained syntax highlighting.',
    fallback: '```ts\nconst response = parsePierrotResponse(value);\n```',
    response: response([
      { type: 'heading', level: 2, text: 'How validation works' },
      {
        type: 'text',
        markdown:
          'The server sends data, not UI. The client validates the payload before the registry renders anything.',
      },
      {
        type: 'code',
        language: 'typescript',
        filename: 'response.ts',
        showLineNumbers: true,
        code: "import { parsePierrotResponse } from './schema';\n\nconst response = parsePierrotResponse(value);\nif (!response) return fallbackMarkdown;",
      },
    ]),
  },
  {
    id: 'quote',
    label: '9 · Book excerpt',
    note: 'A quotation block with attribution and a source link.',
    fallback: '> Structure is the antidote to chaos.\n\n— Anton Merkurov',
    response: response([
      {
        type: 'quote',
        text: 'Structure is the antidote to chaos.',
        attribution: 'Anton Merkurov',
        source: 'UNFRAMED · рабочая тетрадь',
      },
    ]),
  },
  {
    id: 'gallery',
    label: '10 · Verified image gallery',
    note: 'Only same-origin images with a source. Unknown URLs are rejected.',
    fallback: 'Изображения доступны только при наличии проверенного источника.',
    response: response([
      {
        type: 'gallery',
        title: 'Визуальные источники',
        description: 'Проверенные изображения из архива merkurov.love.',
        layout: 'grid',
        images: [
          {
            src: '/og-image.jpg',
            alt: 'Editorial preview',
            caption: 'Визуальный архив merkurov.love.',
            source: 'merkurov.love',
            kind: 'photo',
          },
          {
            src: '/heartandangel/splash/splash-1170x2532.png',
            alt: 'Heart & Angel',
            caption: 'Heart & Angel · splash.',
            source: 'Heart & Angel',
            kind: 'artwork',
          },
        ],
      },
    ]),
  },
  {
    id: 'table',
    label: '11 · Wide table',
    note: 'Horizontal scroll on mobile, numeric alignment on desktop.',
    fallback: '| Издание | Материалы | Дата |',
    response: response([
      {
        type: 'table',
        title: 'Публикации в СМИ',
        columns: [
          { key: 'outlet', label: 'Издание' },
          { key: 'title', label: 'Материал' },
          { key: 'count', label: 'Упоминания', align: 'right', format: 'number' },
          { key: 'date', label: 'Дата', align: 'right' },
          { key: 'language', label: 'Язык' },
        ],
        rows: [
          { outlet: 'Le Monde', title: 'Digital sovereignty and the new archive', count: 12, date: '2026-10-14', language: 'FR' },
          { outlet: 'The Washington Post', title: 'The quiet return of the private museum', count: 7, date: '2026-09-02', language: 'EN' },
          { outlet: 'Новая газета', title: 'Агенты ухватились за язык', count: 5, date: '2026-08-21', language: 'RU' },
        ],
        caption: 'Полный SQL catalogue, не semantic sample.',
      },
    ]),
  },
];
