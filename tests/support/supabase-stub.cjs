/**
 * Minimal Supabase stand-in for local Playwright runs.
 *
 * The production app reads NEXT_PUBLIC_SUPABASE_* from the environment even
 * when a test only needs an anonymous page. This stub answers auth/rest calls
 * so the middleware and layout can render without a real Supabase project.
 */
const http = require('http');

const port = Number(process.env.SUPABASE_STUB_PORT || 54321);

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
