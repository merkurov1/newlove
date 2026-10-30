import TurndownService from 'turndown';
import { absoluteUrl, SITE_NAME } from '@/lib/seo';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].replace(/\s+/g, ' ').trim() : SITE_NAME;
}

function extractDescription(html: string): string {
  const match = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
  );
  return match ? match[1].trim() : '';
}

function extractCanonical(html: string): string {
  const match = html.match(
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i,
  );
  return match ? match[1].trim() : '';
}

function extractMain(html: string): string {
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  const source = main ? main[1] : html;

  return source
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<header\b[^>]*class=["'][^"']*site-header[^"']*["'][^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer\b[^>]*class=["'][^"']*site-footer[^"']*["'][^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, '');
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const path = searchParams.get('path') || '/';
  const query = searchParams.get('query') || '';

  if (!path.startsWith('/')) {
    return new Response('Invalid path', { status: 400 });
  }

  let response: Response;
  try {
    response = await fetch(`${origin}${path}${query ? `?${query}` : ''}`, {
      headers: {
        'x-md-internal': '1',
        accept: 'text/html',
      },
      cache: 'no-store',
    });
  } catch (error) {
    console.error('[markdown] fetch failed:', error);
    return new Response('Markdown conversion unavailable', { status: 502 });
  }

  if (!response.ok) {
    return new Response(`Markdown twin unavailable (${response.status})`, {
      status: response.status === 404 ? 404 : 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const html = await response.text();
  const title = extractTitle(html);
  const description = extractDescription(html);
  const canonical = extractCanonical(html) || absoluteUrl(path);

  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });
  turndown.remove(['script', 'style', 'noscript']);

  const body = turndown.turndown(extractMain(html)).trim();

  const markdown = [
    `# ${title}`,
    '',
    description ? `> ${description}` : '',
    '',
    `Canonical: ${canonical}`,
    '',
    body,
    '',
  ]
    .filter((line, index, all) => !(line === '' && all[index - 1] === ''))
    .join('\n');

  return new Response(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600',
      Vary: 'Accept',
      Link: `<${canonical}>; rel="canonical"`,
    },
  });
}
