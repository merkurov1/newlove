/**
 * Minimal Supabase stand-in for local Playwright runs.
 *
 * The production app reads NEXT_PUBLIC_SUPABASE_* from the environment even
 * when a test only needs an anonymous page. This stub answers auth/rest calls
 * so the middleware and layout can render without a real Supabase project.
 */
const http = require('http');
const { LETTERS, FLOW_ITEMS } = require('./journal-fixture.cjs');

const port = Number(process.env.SUPABASE_STUB_PORT || 54321);

// Published Flow entries so Playwright can exercise the real detail route (and
// its reader) without a production database.
const FLOW_DETAIL_ITEMS = {
  'the-quiet-index': {
    id: 'flow-navigation-detail-1',
    title: 'The quiet index',
    slug: 'the-quiet-index',
    lang: 'en',
    type: 'note',
    status: 'published',
    visibility: 'public',
    body_md:
      'A publication is a way of deciding what deserves to stay in view. This entry belongs to the Flow index.\n\nEditorial rhythm, restrained type and a clear hierarchy.',
    source_url: null,
    ai_allowed: true,
    rag_allowed: true,
    metadata: {},
    published_at: '2026-11-24T12:00:00.000Z',
    created_at: '2026-11-24T12:00:00.000Z',
    updated_at: '2026-11-24T12:00:00.000Z',
    bluesky_uri: null,
    telegram_message_id: null,
  },
  // An image-only entry: the reader must not attach the text comment to it.
  'photo-study': {
    id: 'flow-photo-detail-1',
    title: 'A photo study',
    slug: 'photo-study',
    lang: 'en',
    type: 'photo',
    status: 'published',
    visibility: 'public',
    body_md: '',
    source_url: null,
    ai_allowed: true,
    rag_allowed: true,
    metadata: {
      images: [
        {
          url: 'https://images.flow.test/photo-study.jpg',
          alt: 'A pale study of light on paper',
          caption: 'Photo study',
          width: 1200,
          height: 900,
        },
      ],
    },
    published_at: '2026-11-21T11:00:00.000Z',
    created_at: '2026-11-21T11:00:00.000Z',
    updated_at: '2026-11-21T11:00:00.000Z',
    bluesky_uri: null,
    telegram_message_id: null,
  },
  // A longer, image-led entry for reader, progress and gallery coverage.
  'reader-with-images': {
    id: 'flow-reader-detail-1',
    title: 'Two rooms, one light',
    slug: 'reader-with-images',
    lang: 'en',
    type: 'article',
    status: 'published',
    visibility: 'public',
    body_md: [
      'The first room is empty on purpose. Morning arrives through the tall window and lands on the floor as a pale rectangle.',
      '',
      '## A room with one light',
      '',
      'Nothing in the room asks to be looked at. The wall keeps its own time. A chair stands slightly away from the table, as if someone has just left, or is about to return.',
      '',
      'The second room holds the archive. Folders, proofs, a rolled drawing that has never been framed. The light here is older, filtered through paper and dust.',
      '',
      '### The archive, late morning',
      '',
      'Reading is a way of staying in a room after leaving it. The page keeps the temperature. The sentence keeps the hour.',
      '',
      'Outside, the street begins its ordinary work. Inside, two photographs hold the two rooms open, long enough for a reader to notice the difference between silence and quiet.',
    ].join('\n'),
    source_url: null,
    ai_allowed: true,
    rag_allowed: true,
    metadata: {
      images: [
        {
          url: 'https://images.flow.test/first-light.jpg',
          alt: 'A pale rectangle of morning light on a wooden floor',
          caption: 'First light, the empty room',
          width: 1600,
          height: 1200,
        },
        {
          url: 'https://images.flow.test/archive-light.jpg',
          alt: 'Paper folders and a rolled drawing near a window',
          caption:
            'The archive, late morning — paper folders, a rolled drawing and the older light that reaches the back of the room after the street has already started its ordinary work outside.',
          width: 1600,
          height: 1200,
        },
      ],
    },
    published_at: '2026-11-22T09:30:00.000Z',
    created_at: '2026-11-22T09:30:00.000Z',
    updated_at: '2026-11-22T09:30:00.000Z',
    bluesky_uri: null,
    telegram_message_id: null,
  },
};

const FLOW_CONTEXTS = {
  'flow-navigation-detail-1': {
    id: 'flow-context-1',
    item_id: 'flow-navigation-detail-1',
    content: [
      '[EN] The quiet index works as a **reading discipline**: naming what stays in view and what recedes. It is less an archive than a *tempo*.',
      '',
      '> Attention becomes architecture when it is held long enough.',
      '',
      '- A note is a decision.',
      '- Silence is part of the index.',
      '',
      '| Layer | Function |',
      '| --- | --- |',
      '| Page | Keeps the hour |',
      '| Index | Keeps the order |',
      '',
      '`Flow` is the surface, and [the index](https://example.com/quiet-index) is its edge.',
      '',
      '```text',
      "index.keep('the hour')",
      '```',
      '',
      '## A second reading',
      '',
      'The entry returns to the same room with a different light.',
      '',
      '[RU] Тихий индекс работает как **дисциплина чтения**: он называет то, что остаётся в поле зрения, и то, что отступает. Это не столько архив, сколько *темп*.',
      '',
      '> Внимание становится архитектурой, когда его удерживают достаточно долго.',
      '',
      '- Заметка — это решение.',
      '- Тишина — часть индекса.',
      '',
      '| Слой | Функция |',
      '| --- | --- |',
      '| Страница | Хранит час |',
      '| Индекс | Хранит порядок |',
      '',
      '`Flow` — это поверхность, а [индекс](https://example.com/quiet-index) — её край.',
      '',
      '```text',
      "index.keep('the hour')",
      '```',
      '',
      '## Второе чтение',
      '',
      'Запись возвращается в ту же комнату при другом свете.',
    ].join('\n'),
    model: 'test',
    provider: 'test',
    status: 'ready',
    generated_at: '2026-11-24T12:00:00.000Z',
  },
  'flow-photo-detail-1': {
    id: 'flow-context-photo-1',
    item_id: 'flow-photo-detail-1',
    content: '[EN] A comment that must stay hidden on a photo item.',
    model: 'test',
    provider: 'test',
    status: 'ready',
    generated_at: '2026-11-21T12:00:00.000Z',
  },
};

const server = http.createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');

  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  response.setHeader('Content-Type', 'application/json');

  if (request.url?.includes('/auth/v1/user')) {
    response.writeHead(401);
    response.end(JSON.stringify({ message: 'no session' }));
    return;
  }

  if (request.url?.includes('/rest/v1/')) {
    const url = new URL(request.url, 'http://127.0.0.1');
    const wantsObject = String(request.headers.accept || '').includes(
      'application/vnd.pgrst.object+json'
    );

    const sendSingleOrEmpty = (row) => {
      if (!row) {
        response.writeHead(406);
        response.end(
          JSON.stringify({
            code: 'PGRST116',
            message: 'JSON object requested, multiple (or no) rows returned',
          })
        );
        return;
      }

      response.writeHead(200);
      response.end(JSON.stringify(row));
    };

    if (url.pathname.endsWith('/rest/v1/letters')) {
      const idParam = url.searchParams.get('id') ?? '';
      const id = idParam.startsWith('eq.') ? idParam.slice(3) : '';

      const rows = id ? LETTERS.filter((letter) => String(letter.id) === id) : LETTERS;

      if (wantsObject) {
        response.writeHead(rows.length === 1 ? 200 : 406);
        response.end(JSON.stringify(rows[0] ?? { message: 'No rows found' }));
        return;
      }

      response.setHeader('Content-Range', `0-${Math.max(0, rows.length - 1)}/${rows.length}`);
      response.writeHead(200);
      response.end(JSON.stringify(rows));
      return;
    }

    if (url.pathname.endsWith('/rest/v1/flow_ai_context')) {
      const itemParam = url.searchParams.get('item_id') ?? '';
      const itemId = itemParam.startsWith('eq.') ? itemParam.slice(3) : '';
      const context = FLOW_CONTEXTS[itemId];

      if (wantsObject) {
        sendSingleOrEmpty(context);
        return;
      }

      response.writeHead(200);
      response.end(JSON.stringify(context ? [context] : []));
      return;
    }

    if (url.pathname.endsWith('/rest/v1/items')) {
      const slugParam = url.searchParams.get('slug') ?? '';
      const slug = slugParam.startsWith('eq.') ? slugParam.slice(3) : '';
      const item = FLOW_DETAIL_ITEMS[slug];

      if (item) {
        if (wantsObject) {
          sendSingleOrEmpty(item);
          return;
        }

        response.writeHead(200);
        response.end(JSON.stringify([item]));
        return;
      }

      // Contextual neighbours for the reader footer. The query also carries a
      // `not.is.null` condition, so pick the ordered comparison explicitly.
      const publishedParam =
        url.searchParams
          .getAll('published_at')
          .find((value) => value.startsWith('gt.') || value.startsWith('lt.')) ?? '';
      const comparison = publishedParam.startsWith('gt.')
        ? 'gt'
        : publishedParam.startsWith('lt.')
          ? 'lt'
          : null;

      if (comparison) {
        const boundary = publishedParam.slice(3);
        const neighbours = Object.values(FLOW_DETAIL_ITEMS)
          .filter((entry) =>
            comparison === 'gt' ? entry.published_at > boundary : entry.published_at < boundary
          )
          .map((entry) => ({
            id: entry.id,
            title: entry.title,
            slug: entry.slug,
            published_at: entry.published_at,
          }));

        if (wantsObject) {
          sendSingleOrEmpty(neighbours[0]);
          return;
        }

        response.writeHead(200);
        response.end(JSON.stringify(neighbours.slice(0, 1)));
        return;
      }

      // Public Flow list for the Journal stream preview.
      response.setHeader(
        'Content-Range',
        `0-${Math.max(0, FLOW_ITEMS.length - 1)}/${FLOW_ITEMS.length}`
      );
      response.writeHead(200);
      response.end(JSON.stringify(FLOW_ITEMS));
      return;
    }

    response.writeHead(200);
    response.end('[]');
    return;
  }

  response.writeHead(200);
  response.end('{}');
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Supabase test stub listening on ${port}\n`);
});
