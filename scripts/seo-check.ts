/**
 * SEO regression check.
 *
 * Usage:
 *   SEO_BASE_URL=http://localhost:3000 node --experimental-strip-types scripts/seo-check.ts
 *
 * Fetches every URL in /sitemap.xml and asserts:
 *   200, exactly one <h1>, unique title, unique description,
 *   self-referencing canonical, parseable JSON-LD, reachable og:image.
 */
import * as cheerio from 'cheerio';

const BASE_URL = (process.env.SEO_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const CONCURRENCY = Number(process.env.SEO_CONCURRENCY || 6);
const LIMIT = Number(process.env.SEO_LIMIT || 0);

type Result = {
  url: string;
  status: number;
  h1Count: number;
  title: string;
  description: string;
  canonical: string;
  ogImage: string;
  jsonLdCount: number;
  failures: string[];
  warnings: string[];
};

function stripSlash(value: string): string {
  return value.replace(/\/$/, '') || '/';
}

function absolute(value: string, base: string): string {
  try {
    return new URL(value, base).toString();
  } catch {
    return value;
  }
}

async function fetchSitemap(): Promise<string[]> {
  const response = await fetch(`${BASE_URL}/sitemap.xml`);
  if (!response.ok) throw new Error(`Sitemap returned ${response.status}`);
  const xml = await response.text();
  const $ = cheerio.load(xml, { xmlMode: true });
  const urls: string[] = [];
  $('loc').each((_, node) => {
    const loc = $(node).text().trim();
    if (loc) {
      // Point sitemap production URLs at the local test server while keeping paths.
      const path = new URL(loc).pathname + new URL(loc).search;
      urls.push(`${BASE_URL}${path}`);
    }
  });
  return [...new Set(urls)];
}

async function checkUrl(url: string): Promise<Result> {
  const failures: string[] = [];
  const warnings: string[] = [];
  let response: Response;

  try {
    response = await fetch(url, { redirect: 'follow' });
  } catch (error) {
    return {
      url,
      status: 0,
      h1Count: 0,
      title: '',
      description: '',
      canonical: '',
      ogImage: '',
      jsonLdCount: 0,
      failures: [`fetch failed: ${(error as Error).message}`],
      warnings,
    };
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const h1Count = $('h1').length;
  const title = $('title').first().text().trim();
  const description = $('meta[name="description"]').attr('content')?.trim() || '';
  const canonical = $('link[rel="canonical"]').attr('href')?.trim() || '';
  const ogImage = $('meta[property="og:image"]').attr('content')?.trim() || '';
  const jsonLdBlocks = $('script[type="application/ld+json"]');

  if (response.status !== 200) failures.push(`status ${response.status}`);
  if (h1Count !== 1) failures.push(`h1 count ${h1Count}`);
  if (!title) failures.push('missing title');
  if (!description) failures.push('missing description');
  if (!canonical) failures.push('missing canonical');
  if (!ogImage) failures.push('missing og:image');

  if (canonical) {
    const canonicalUrl = new URL(canonical, url);
    const fetchedUrl = new URL(url);
    const sameHost = canonicalUrl.host === fetchedUrl.host;
    const isLocal = ['localhost', '127.0.0.1'].includes(fetchedUrl.hostname);
    const samePath =
      stripSlash(canonicalUrl.pathname) === stripSlash(fetchedUrl.pathname) &&
      canonicalUrl.search === fetchedUrl.search;

    if (!samePath || (!sameHost && !isLocal)) {
      failures.push(`canonical mismatch: ${canonical}`);
    }
  }

  if (title.length > 60) warnings.push(`title ${title.length} chars`);
  if (description.length < 120 || description.length > 160) {
    warnings.push(`description ${description.length} chars`);
  }

  jsonLdBlocks.each((index, node) => {
    const raw = $(node).html() || '';
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        failures.push(`JSON-LD #${index + 1} is not an object`);
      }
    } catch (error) {
      failures.push(`JSON-LD #${index + 1} parse error: ${(error as Error).message}`);
    }
  });

  if (ogImage) {
    let imageUrl = absolute(ogImage, url);
    try {
      const image = new URL(imageUrl);
      const page = new URL(url);
      const siteHost = new URL(canonical || url).host;
      const isLocal = ['localhost', '127.0.0.1'].includes(page.hostname);
      if (isLocal && image.host === siteHost) {
        imageUrl = `${page.origin}${image.pathname}${image.search}`;
      }
      let imageResponse = await fetch(imageUrl, { method: 'HEAD' });
      if (!imageResponse.ok) imageResponse = await fetch(imageUrl, { method: 'GET' });
      if (!imageResponse.ok) failures.push(`og:image ${imageResponse.status}: ${imageUrl}`);
    } catch {
      failures.push(`og:image unreachable: ${imageUrl}`);
    }
  }

  return {
    url,
    status: response.status,
    h1Count,
    title,
    description,
    canonical,
    ogImage,
    jsonLdCount: jsonLdBlocks.length,
    failures,
    warnings,
  };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function main() {
  const urls = await fetchSitemap();
  const selected = LIMIT > 0 ? urls.slice(0, LIMIT) : urls;
  console.log(`Checking ${selected.length} URLs against ${BASE_URL}\n`);

  const results = await mapLimit(selected, CONCURRENCY, checkUrl);

  const titles = new Map<string, string[]>();
  const descriptions = new Map<string, string[]>();
  for (const result of results) {
    if (result.title) titles.set(result.title, [...(titles.get(result.title) || []), result.url]);
    if (result.description) {
      descriptions.set(result.description, [
        ...(descriptions.get(result.description) || []),
        result.url,
      ]);
    }
  }

  for (const result of results) {
    if ((titles.get(result.title) || []).length > 1) {
      result.failures.push('duplicate title');
    }
    if ((descriptions.get(result.description) || []).length > 1) {
      result.failures.push('duplicate description');
    }
  }

  for (const result of results) {
    const mark = result.failures.length ? 'FAIL' : result.warnings.length ? 'WARN' : 'OK  ';
    console.log(
      `${mark} ${result.status} h1:${result.h1Count} ld:${result.jsonLdCount} ${result.url}`,
    );
    if (result.title) console.log(`     title: ${result.title} (${result.title.length})`);
    if (result.description) {
      console.log(`     desc:  ${result.description.slice(0, 100)}… (${result.description.length})`);
    }
    for (const warning of result.warnings) console.log(`     ~ ${warning}`);
    for (const failure of result.failures) console.log(`     ✗ ${failure}`);
  }

  const failed = results.filter((result) => result.failures.length > 0);
  const warned = results.filter((result) => result.failures.length === 0 && result.warnings.length > 0);

  console.log(
    `\n${results.length - failed.length}/${results.length} passed, ${failed.length} failed, ${warned.length} with warnings.`,
  );

  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
