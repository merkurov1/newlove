/**
 * Minimal Supabase stand-in for local Playwright runs.
 *
 * The production app reads NEXT_PUBLIC_SUPABASE_* from the environment even
 * when a test only needs an anonymous page. This stub answers auth/rest calls
 * so the middleware and layout can render without a real Supabase project.
 */
const http = require('http');

const port = Number(process.env.SUPABASE_STUB_PORT || 54321);

// One published Flow entry so Playwright can exercise the real detail route
// (and its route-aware navigation) without a production database.
const FLOW_DETAIL_ITEM = {
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

    if (
      url.pathname.endsWith('/rest/v1/items') &&
      url.searchParams.get('slug') === `eq.${FLOW_DETAIL_ITEM.slug}`
    ) {
      response.writeHead(200);
      response.end(JSON.stringify([FLOW_DETAIL_ITEM]));
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
