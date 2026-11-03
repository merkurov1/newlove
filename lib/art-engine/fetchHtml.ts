import { assertSafePublicUrl } from '@/lib/flow/parseUrl';
import { assertServerOnly } from '@/lib/serverOnly';

assertServerOnly('lib/art-engine/fetchHtml');

export const MAX_HTML_BYTES = 2_000_000;

export type FetchMethod = 'direct' | 'scrapingant';

export interface FetchHtmlResult {
  html: string;
  finalUrl: string;
  status: number;
  method: FetchMethod;
  warnings: string[];
}

export class HtmlFetchError extends Error {
  readonly code: string;
  readonly status: number | null;

  constructor(message: string, code: string, status: number | null = null) {
    super(message);
    this.name = 'HtmlFetchError';
    this.code = code;
    this.status = status;
  }
}

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export function isBlockedHtml(html: string): boolean {
  if (!html || html.length < 500) return true;

  const lower = html.toLowerCase();

  return (
    lower.includes('just a moment...') ||
    lower.includes('enable javascript and cookies to continue') ||
    lower.includes('cf-browser-verification') ||
    lower.includes('challenge-running') ||
    lower.includes('attention required! | cloudflare')
  );
}

function assertHtmlResponse(
  response: Response,
  html: string,
): void {
  const contentType = response.headers.get('content-type') || '';
  const contentLength = Number(response.headers.get('content-length') || 0);

  if (contentLength > MAX_HTML_BYTES) {
    throw new HtmlFetchError(
      'The target page is larger than the 2 MB limit.',
      'too_large',
      response.status,
    );
  }

  if (
    contentType &&
    !contentType.includes('text/html') &&
    !contentType.includes('application/xhtml+xml')
  ) {
    throw new HtmlFetchError(
      'The URL does not point to an HTML page.',
      'not_html',
      response.status,
    );
  }

  if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) {
    throw new HtmlFetchError(
      'The target page is larger than the 2 MB limit.',
      'too_large',
      response.status,
    );
  }

  if (isBlockedHtml(html)) {
    throw new HtmlFetchError(
      'The target page is blocked by a bot challenge or returned too little HTML.',
      'blocked',
      response.status,
    );
  }
}

async function fetchDirect(url: string): Promise<FetchHtmlResult> {
  let currentUrl = url;

  for (let redirect = 0; redirect <= 5; redirect += 1) {
    assertSafePublicUrl(currentUrl);

    let response: Response;

    try {
      response = await fetch(currentUrl, {
        headers: {
          'User-Agent': BROWSER_UA,
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(8_000),
        cache: 'no-store',
      });
    } catch (error) {
      throw new HtmlFetchError(
        error instanceof Error
          ? `Direct fetch failed: ${error.message}`
          : 'Direct fetch failed.',
        'network_error',
      );
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new HtmlFetchError(
          'Redirect response did not provide a location.',
          'redirect_error',
          response.status,
        );
      }

      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    if (!response.ok) {
      throw new HtmlFetchError(
        `The target returned HTTP ${response.status}.`,
        'http_error',
        response.status,
      );
    }

    const html = await response.text();
    assertHtmlResponse(response, html);

    return {
      html,
      finalUrl: currentUrl,
      status: response.status,
      method: 'direct',
      warnings: [],
    };
  }

  throw new HtmlFetchError('Too many redirects.', 'too_many_redirects');
}

async function fetchScrapingAnt(
  url: string,
  apiKey: string,
): Promise<FetchHtmlResult> {
  const endpoint = new URL('https://api.scrapingant.com/v2/general');
  endpoint.searchParams.set('url', url);
  endpoint.searchParams.set('browser', 'true');

  let response: Response;

  try {
    response = await fetch(endpoint, {
      headers: { 'x-api-key': apiKey },
      signal: AbortSignal.timeout(25_000),
      cache: 'no-store',
    });
  } catch (error) {
    throw new HtmlFetchError(
      error instanceof Error
        ? `ScrapingAnt request failed: ${error.message}`
        : 'ScrapingAnt request failed.',
      'network_error',
    );
  }

  if (!response.ok) {
    throw new HtmlFetchError(
      `ScrapingAnt returned HTTP ${response.status}.`,
      'http_error',
      response.status,
    );
  }

  const html = await response.text();
  assertHtmlResponse(response, html);

  return {
    html,
    finalUrl: url,
    status: response.status,
    method: 'scrapingant',
    warnings: [],
  };
}

export async function fetchAuctionHtml(
  url: string,
  options: { apiKey?: string } = {},
): Promise<FetchHtmlResult> {
  const warnings: string[] = [];

  try {
    return await fetchDirect(url);
  } catch (directError) {
    warnings.push(
      directError instanceof Error
        ? directError.message
        : 'Direct fetch failed.',
    );

    if (!options.apiKey) {
      if (directError instanceof HtmlFetchError) throw directError;
      throw new HtmlFetchError('Direct fetch failed.', 'network_error');
    }

    try {
      const result = await fetchScrapingAnt(url, options.apiKey);
      return { ...result, warnings };
    } catch (proxyError) {
      const message =
        proxyError instanceof Error
          ? proxyError.message
          : 'ScrapingAnt fallback failed.';

      throw new HtmlFetchError(
        `${warnings[0]} ${message}`.trim(),
        proxyError instanceof HtmlFetchError
          ? proxyError.code
          : 'network_error',
        proxyError instanceof HtmlFetchError ? proxyError.status : null,
      );
    }
  }
}
