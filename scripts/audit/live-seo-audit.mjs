#!/usr/bin/env node
/**
 * Read-only live SEO audit.
 *
 * Usage:
 *   node scripts/audit/live-seo-audit.mjs --limit 100
 *   node scripts/audit/live-seo-audit.mjs --json .audit/live-seo.json
 *
 * It fetches robots.txt, sitemap.xml and every sitemap URL, then checks:
 * HTTP status, final URL, self-referencing canonical, robots/noindex,
 * title/description presence and uniqueness, H1 count, JSON-LD parseability,
 * Open Graph image presence and hreflang reciprocity.
 *
 * The script never writes outside the repository, never calls an authenticated
 * API and never modifies the site.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const BASE_URL = (process.env.SEO_BASE_URL || 'https://www.merkurov.love').replace(/\/$/, '');
const CONCURRENCY = Number(process.env.SEO_CONCURRENCY || 8);
const TIMEOUT_MS = Number(process.env.SEO_TIMEOUT_MS || 20000);
const LIMIT = Number(arg('--limit', 0));

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function absolute(value, base) {
  try {
    return new URL(value, base).toString();
  } catch {
    return value;
  }
}

function stripSlash(value) {
  return value.replace(/\/$/, '') || '/';
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function firstMatch(html, regex) {
  const match = html.match(regex);
  return match ? decodeEntities(match[1].trim()) : '';
}

function templateOf(url) {
  const pathname = new URL(url).pathname;
  if (pathname === '/') return 'home';
  if (pathname.startsWith('/flow/')) return 'flow-item';
  if (pathname === '/flow') return 'flow-index';
  if (pathname.startsWith('/media/record/')) return 'media-record';
  if (pathname === '/media') return 'media-index';
  if (pathname.startsWith('/journal/')) return 'journal-article';
  if (pathname === '/journal') return 'journal-index';
  if (pathname.startsWith('/lots/')) return 'lot';
  if (pathname.startsWith('/tags/')) return 'tag';
  if (pathname.startsWith('/heartandangel')) return 'heartandangel';
  if (/^\/(ru|en|de|fr|ar)\//.test(pathname)) return 'localized-static';
  if (pathname.split('/').filter(Boolean).length === 1) return 'article-or-static';
  return 'other';
}

async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; NewloveSEOAudit/1.0; +https://www.merkurov.love)',
        accept: 'text/html,xml;q=0.9,*/*;q=0.8',
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    return { response, text };
  } finally {
    clearTimeout(timer);
  }
}

function parseSitemap(xml) {
  const urls = [];
  const alternateMap = new Map();
  const blocks = xml.split('<url>').slice(1);

  for (const block of blocks) {
    const loc = firstMatch(block, /<loc>([\s\S]*?)<\/loc>/);
    if (!loc) continue;
    urls.push(loc);
    const alternates = {};
    for (const match of block.matchAll(/<xhtml:link[^>]*hreflang="([^"]+)"[^>]*href="([^"]+)"/g)) {
      alternates[decodeEntities(match[1])] = decodeEntities(match[2]);
    }
    alternateMap.set(loc, alternates);
  }

  return { urls: [...new Set(urls)], alternateMap };
}

async function auditUrl(url) {
  const failures = [];
  const warnings = [];
  let status = 0;
  let finalUrl = url;
  let html = '';

  try {
    const { response, text } = await fetchText(url);
    status = response.status;
    finalUrl = response.url || url;
    html = text;
    if (status !== 200) failures.push(`status ${status}`);
    if (stripSlash(finalUrl) !== stripSlash(url)) failures.push(`redirected to ${finalUrl}`);
  } catch (error) {
    failures.push(`fetch failed: ${error.message}`);
    return { url, status, finalUrl, title: '', description: '', canonical: '', robots: '', h1: 0, jsonLd: 0, ogImage: '', alternates: {}, failures, warnings, bytes: 0 };
  }

  const title = firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = firstMatch(html, /<meta[^>]+name="description"[^>]+content="([^"]*)"/i) ||
    firstMatch(html, /<meta[^>]+content="([^"]*)"[^>]+name="description"/i);
  const canonical = firstMatch(html, /<link[^>]+rel="canonical"[^>]+href="([^"]*)"/i) ||
    firstMatch(html, /<link[^>]+href="([^"]*)"[^>]+rel="canonical"/i);
  const robots = firstMatch(html, /<meta[^>]+name="robots"[^>]+content="([^"]*)"/i);
  const xRobots = '';
  const ogImage = firstMatch(html, /<meta[^>]+property="og:image"[^>]+content="([^"]*)"/i);
  const h1 = (html.match(/<h1[\s>]/gi) || []).length;
  const jsonLdBlocks = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  let jsonLd = 0;
  for (const block of jsonLdBlocks) {
    try {
      JSON.parse(block[1]);
      jsonLd += 1;
    } catch (error) {
      failures.push(`JSON-LD parse error: ${error.message}`);
    }
  }

  const alternates = {};
  for (const match of html.matchAll(/<link[^>]+rel="alternate"[^>]+hreflang="([^"]+)"[^>]+href="([^"]+)"/gi)) {
    alternates[decodeEntities(match[1])] = decodeEntities(match[2]);
  }

  if (!title) failures.push('missing title');
  if (!description) warnings.push('missing description');
  if (!canonical) failures.push('missing canonical');
  if (robots && /noindex/i.test(robots)) failures.push(`noindex: ${robots}`);
  if (!h1) failures.push('missing h1');
  if (h1 > 1) warnings.push(`${h1} h1 elements`);
  if (!ogImage) warnings.push('missing og:image');
  if (!jsonLd) warnings.push('no JSON-LD');

  if (canonical) {
    const canonicalUrl = absolute(canonical, url);
    const samePath =
      stripSlash(new URL(canonicalUrl).pathname) === stripSlash(new URL(url).pathname) &&
      new URL(canonicalUrl).search === new URL(url).search;
    if (!samePath) failures.push(`canonical mismatch: ${canonical}`);
  }

  const bodyText = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    url,
    status,
    finalUrl,
    title,
    description,
    canonical,
    robots,
    h1,
    jsonLd,
    ogImage,
    alternates,
    failures,
    warnings,
    bytes: html.length,
    textLength: bodyText.length,
    xRobots,
  };
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
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

function duplicateGroups(rows, field) {
  const map = new Map();
  for (const row of rows) {
    const value = row[field];
    if (!value) continue;
    map.set(value, [...(map.get(value) || []), row.url]);
  }
  return [...map.entries()]
    .filter(([, urls]) => urls.length > 1)
    .map(([value, urls]) => ({ value, count: urls.length, urls: urls.slice(0, 10) }));
}

async function main() {
  const startedAt = new Date().toISOString();
  const [{ response: robotsResponse, text: robotsText }, { response: sitemapResponse, text: sitemapXml }] =
    await Promise.all([
      fetchText(`${BASE_URL}/robots.txt`),
      fetchText(`${BASE_URL}/sitemap.xml`),
    ]);

  const { urls, alternateMap } = parseSitemap(sitemapXml);
  const selected = LIMIT > 0 ? urls.slice(0, LIMIT) : urls;
  const rows = await mapLimit(selected, CONCURRENCY, auditUrl);

  const sitemapAlternateMismatches = [];
  for (const [loc, alternates] of alternateMap) {
    const sourceLang = /^\/(ru|en|de|fr|ar)(\/|$)/.exec(new URL(loc).pathname)?.[1] || 'en';
    for (const [lang, href] of Object.entries(alternates)) {
      if (lang === 'x-default') continue;
      const target = alternateMap.get(href);
      if (!target) {
        sitemapAlternateMismatches.push({ source: loc, lang, href, reason: 'alternate not in sitemap' });
        continue;
      }
      if (target[sourceLang] !== loc) {
        sitemapAlternateMismatches.push({
          source: loc,
          lang,
          href,
          reason: `target has no reciprocal ${sourceLang} alternate`,
        });
      }
    }
  }

  const onPageAlternateMismatches = [];
  for (const row of rows) {
    const sourceLang = /^\/(ru|en|de|fr|ar)(\/|$)/.exec(new URL(row.url).pathname)?.[1] || 'en';
    for (const [lang, href] of Object.entries(row.alternates)) {
      if (lang === 'x-default') continue;
      const target = rows.find((candidate) => stripSlash(candidate.url) === stripSlash(href));
      if (!target) continue;
      if (target.alternates[sourceLang] !== row.url && stripSlash(target.alternates[sourceLang] || '') !== stripSlash(row.url)) {
        onPageAlternateMismatches.push({ source: row.url, lang, href, reason: `target missing reciprocal ${sourceLang} alternate` });
      }
    }
  }

  const byTemplate = {};
  for (const row of rows) {
    const key = templateOf(row.url);
    byTemplate[key] ||= { count: 0, failures: 0, warnings: 0, missingH1: 0, noindex: 0 };
    byTemplate[key].count += 1;
    byTemplate[key].failures += row.failures.length;
    byTemplate[key].warnings += row.warnings.length;
    if (!row.h1) byTemplate[key].missingH1 += 1;
    if (/noindex/i.test(row.robots || '')) byTemplate[key].noindex += 1;
  }

  const summary = {
    startedAt,
    finishedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    robots: {
      status: robotsResponse.status,
      hasSitemap: /Sitemap:\s*https:\/\/www\.merkurov\.love\/sitemap\.xml/i.test(robotsText),
      disallows: [...robotsText.matchAll(/^Disallow:\s*(.+)$/gim)].map((m) => m[1].trim()),
    },
    sitemap: { status: sitemapResponse.status, urlCount: urls.length, audited: selected.length },
    counts: {
      failedUrls: rows.filter((row) => row.failures.length > 0).length,
      warningUrls: rows.filter((row) => row.warnings.length > 0).length,
      missingH1: rows.filter((row) => !row.h1).length,
      noindexInSitemap: rows.filter((row) => /noindex/i.test(row.robots || '')).length,
      non200: rows.filter((row) => row.status !== 200).length,
      canonicalsNotSelf: rows.filter((row) => row.failures.some((f) => f.startsWith('canonical mismatch'))).length,
    },
    templates: byTemplate,
    duplicates: {
      titles: duplicateGroups(rows, 'title').slice(0, 20),
      descriptions: duplicateGroups(rows, 'description').slice(0, 20),
    },
    sitemapAlternateMismatches: sitemapAlternateMismatches.slice(0, 50),
    onPageAlternateMismatches: onPageAlternateMismatches.slice(0, 50),
    failures: rows.filter((row) => row.failures.length > 0).map((row) => ({ url: row.url, failures: row.failures })),
    warnings: rows
      .filter((row) => row.warnings.length > 0)
      .map((row) => ({ url: row.url, warnings: row.warnings }))
      .slice(0, 100),
  };

  console.log(JSON.stringify(summary, null, 2));

  const out = arg('--json', '');
  if (out) {
    const target = path.resolve(process.cwd(), out);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `${JSON.stringify({ ...summary, rows }, null, 2)}\n`);
    console.log(`\nWrote ${out}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
