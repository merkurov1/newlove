#!/usr/bin/env node
/**
 * Deterministic GSC coverage audit for the supplied Discovered — currently not
 * indexed drilldown.
 *
 * Usage:
 *   node scripts/gsc-coverage-audit.mjs --out docs/gsc-coverage-audit-2026-11-22.md
 *
 * Environment:
 *   GSC_AUDIT_BASE_URL  default https://www.merkurov.love
 *   GSC_AUDIT_NO_HTTP=1 skip live HTTP checks (static inventory only)
 *
 * The script never writes outside the repository, never calls a Google API and
 * never submits URLs for indexing. It only performs read-only GET requests.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const DEFAULT_INPUT = 'data/seo/gsc-2026-11-22-discovered-not-indexed.txt';
const DEFAULT_OUT = 'docs/gsc-coverage-audit-2026-11-22.md';
const BASE_URL = (process.env.GSC_AUDIT_BASE_URL || 'https://www.merkurov.love').replace(/\/$/, '');
const NO_HTTP = process.env.GSC_AUDIT_NO_HTTP === '1';
const CONCURRENCY = Number(process.env.GSC_AUDIT_CONCURRENCY || 8);

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const INPUT = arg('--input', DEFAULT_INPUT);
const OUT = arg('--out', DEFAULT_OUT);

function normalizeUrl(value) {
  try {
    return new URL(value).href;
  } catch {
    return value;
  }
}

function routeFamily(url) {
  const pathname = new URL(url).pathname;
  if (pathname === '/flow') return 'flow-index';
  if (pathname.startsWith('/flow/')) return 'flow-item';
  if (/^\/en\/flow-issues\//.test(pathname)) return 'flow-issue-en';
  if (/^\/flow-issues\//.test(pathname)) return 'flow-issue';
  if (pathname === '/flow-issues' || pathname === '/en/flow-issues') return 'flow-issue-index';
  if (pathname.startsWith('/media/record/')) return 'media-record';
  if (pathname.startsWith('/journal/')) return 'journal-article';
  if (pathname === '/journal') return 'journal-index';
  if (pathname.startsWith('/lots/')) return 'lot';
  if (pathname.startsWith('/tags/')) return 'tag';
  if (pathname === '/tags') return 'tag-index';
  if (pathname.startsWith('/case-study/')) return 'case-study';
  if (pathname.startsWith('/heartandangel')) return 'heartandangel';
  if (/^\/(ru|en|de|fr|ar)\//.test(pathname)) return 'localized-static';
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 1) return 'root-content-or-static';
  return 'static';
}

const EXPECTED = {
  'flow-index': {
    handler: 'app/flow/page.tsx',
    inclusion: 'PUBLIC_ROUTES (static)',
    target: 'indexable canonical 200',
    action: 'Keep. Discovered-not-indexed is a crawl queue state, not a code defect.',
  },
  'flow-item': {
    handler: 'app/flow/[slug]/page.tsx',
    inclusion: 'items where status=published AND visibility=public (sitemap filter hardened in this change)',
    target: 'indexable canonical 200 while the row stays public; otherwise honest 404',
    action: 'Verify the row is still status=published and visibility=public in Supabase. No redirect/noindex is justified by a GSC queue state.',
  },
  'flow-issue': {
    handler: 'app/flow-issues/[slug]/page.tsx',
    inclusion: 'letters kind=issue, status=published, published=true, lang=ru',
    target: 'indexable canonical 200 at /flow-issues/<slug>',
    action: 'Keep. Canonical now derives from the issue content language.',
  },
  'flow-issue-en': {
    handler: 'app/en/flow-issues/[slug]/page.tsx',
    inclusion: 'letters kind=issue, status=published, published=true, lang=en',
    target: 'indexable canonical 200 at /en/flow-issues/<slug>',
    action: 'Keep. Canonical now derives from the issue content language.',
  },
  'flow-issue-index': {
    handler: 'app/flow-issues/page.tsx, app/en/flow-issues/page.tsx',
    inclusion: 'PUBLIC_ROUTES (static)',
    target: 'indexable canonical 200',
    action: 'Keep. Archive pages remain distinct language interfaces with reciprocal hreflang.',
  },
  'media-record': {
    handler: 'app/media/record/[slug]/page.tsx',
    inclusion: 'getMediaRecords() output; only status=published rows are returned',
    target: 'indexable canonical 200 while the record is published; otherwise honest 404',
    action: 'Verify the record still exists and is published. Do not delete a citation page just because Google has not crawled it.',
  },
  'journal-article': {
    handler: 'app/journal/[slug]/page.tsx',
    inclusion: 'letters published=true and kind!=issue',
    target: 'indexable canonical 200',
    action: 'Keep. Confirm the article has substantive body content; thin/empty rows should be unpublished, not noindexed.',
  },
  'journal-index': {
    handler: 'app/journal/page.tsx',
    inclusion: 'PUBLIC_ROUTES (static)',
    target: 'indexable canonical 200',
    action: 'Keep.',
  },
  lot: {
    handler: 'app/lots/[id]/page.tsx',
    inclusion: 'lots status=published',
    target: 'indexable canonical 200 while the lot is published; otherwise honest 404',
    action: 'Verify the lot still exists with status=published.',
  },
  tag: {
    handler: 'app/tags/[slug]/page.tsx',
    inclusion: 'Tag rows with a non-empty slug (sitemap no longer falls back to display name)',
    target: 'indexable canonical 200 for a real tag',
    action: 'Verify the tag row and at least one published article. A tag with no articles is thin; decide editorially before adding noindex.',
  },
  'tag-index': {
    handler: 'app/tags/page.tsx',
    inclusion: 'PUBLIC_ROUTES (static)',
    target: 'indexable canonical 200',
    action: 'Keep.',
  },
  'case-study': {
    handler: 'app/case-study/*/page.tsx',
    inclusion: 'PUBLIC_ROUTES (static)',
    target: 'indexable canonical 200',
    action: 'Keep.',
  },
  heartandangel: {
    handler: 'app/heartandangel/**/page.tsx',
    inclusion: 'PUBLIC_ROUTES (static)',
    target: 'indexable canonical 200',
    action: 'Keep. /heartandangel/NFT is intentionally noindex and is not in this list or the sitemap.',
  },
  'localized-static': {
    handler: 'app/{ru,en,de,fr,ar}/**/page.tsx',
    inclusion: 'PUBLIC_ROUTES + SECTION_LANGUAGES (sitemap alternates)',
    target: 'indexable canonical 200',
    action: 'Keep. No hreflang is emitted for a language that has no real page.',
  },
  'root-content-or-static': {
    handler: 'app/[slug]/page.tsx or a static app/<route>/page.tsx',
    inclusion: 'articles published=true (projects are served but are not currently added to the sitemap)',
    target: 'indexable canonical 200',
    action: 'Verify the URL resolves from a published article. If it is served by the projects fallback, it is a sitemap coverage gap, not a reason for noindex.',
  },
  static: {
    handler: 'static app route',
    inclusion: 'PUBLIC_ROUTES (static)',
    target: 'indexable canonical 200',
    action: 'Keep unless the route itself is retired.',
  },
};

function extract(html, url) {
  const linkTags = html.match(/<link\b[^>]*>/gi) || [];
  const canonicalTag = linkTags.find((tag) => /rel=["']?canonical/i.test(tag));
  const canonicalHref = canonicalTag?.match(/href=["']([^"']+)["']/i)?.[1] || '';

  const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
  const robotsTag = metaTags.find((tag) => /name=["']?robots/i.test(tag));
  const metaRobots = robotsTag?.match(/content=["']([^"']*)["']/i)?.[1] || '';
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || '';
  const h1Count = (html.match(/<h1\b/gi) || []).length;

  return {
    canonical: canonicalHref ? normalizeUrl(new URL(canonicalHref, url).href) : '',
    metaRobots,
    title,
    h1Count,
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function loadSitemap() {
  if (NO_HTTP) return { urls: new Set(), error: 'skipped (GSC_AUDIT_NO_HTTP=1)' };
  try {
    const response = await fetchWithTimeout(`${BASE_URL}/sitemap.xml`, {
      headers: { 'user-agent': 'merkurov-seo-audit/1.0 (read-only)' },
    });
    if (!response.ok) return { urls: new Set(), error: `HTTP ${response.status}` };
    const xml = await response.text();
    const urls = new Set([...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => normalizeUrl(m[1])));
    return { urls, error: '' };
  } catch (error) {
    return { urls: new Set(), error: error.message };
  }
}

async function checkUrl(url, sitemapUrls) {
  const family = routeFamily(url);
  const expected = EXPECTED[family];
  const normalized = normalizeUrl(url);
  const base = {
    url,
    gscReason: 'Discovered — currently not indexed',
    family,
    handler: expected.handler,
    inclusion: expected.inclusion,
    target: expected.target,
    action: expected.action,
    status: 'not_checked',
    finalUrl: '',
    contentType: '',
    canonical: '',
    canonicalSelf: null,
    metaRobots: '',
    xRobots: '',
    h1Count: null,
    inSitemap: sitemapUrls.has(normalized),
    sitemapCheck: sitemapUrls.size ? 'checked' : 'not_available',
  };

  if (NO_HTTP) return base;

  try {
    const response = await fetchWithTimeout(url, {
      redirect: 'follow',
      headers: {
        'user-agent': 'merkurov-seo-audit/1.0 (read-only; +https://www.merkurov.love/)',
        accept: 'text/html,application/xhtml+xml',
      },
    });
    const contentType = response.headers.get('content-type') || '';
    const html = contentType.includes('text/html') ? await response.text() : '';
    const parsed = html ? extract(html, response.url) : { canonical: '', metaRobots: '', title: '', h1Count: 0 };
    const finalUrl = normalizeUrl(response.url);

    return {
      ...base,
      status: String(response.status),
      finalUrl,
      contentType: contentType.split(';')[0],
      canonical: parsed.canonical,
      canonicalSelf: parsed.canonical ? parsed.canonical === finalUrl : null,
      metaRobots: parsed.metaRobots,
      xRobots: response.headers.get('x-robots-tag') || '',
      h1Count: parsed.h1Count,
      title: parsed.title,
    };
  } catch (error) {
    return { ...base, status: 'error', finalUrl: '', error: error.message };
  }
}

function robotsDirective(row) {
  const parts = [row.metaRobots, row.xRobots].filter(Boolean);
  return parts.length ? parts.join(' / ') : 'not set';
}

function verdict(row) {
  if (row.status === 'not_checked') return 'not_verified (no live HTTP check)';
  if (row.status === 'error') return 'failed: request error';
  if (row.status !== '200') return `failed: HTTP ${row.status}`;
  if (row.canonicalSelf === false) return 'failed: canonical mismatch';
  if (/noindex/i.test(`${row.metaRobots} ${row.xRobots}`)) return 'failed: noindex on a public URL';
  if (!row.inSitemap && row.sitemapCheck === 'checked') return 'warning: 200 but absent from sitemap';
  if (row.h1Count === 0) return 'warning: no h1 in initial HTML';
  return 'satisfied at HTTP level; crawl/index decision belongs to Google';
}

function escapeCell(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ');
}

function actionFor(row) {
  if (row.canonicalSelf === false) {
    return 'Fix the canonical to the canonical https://www host and the current URL. No content change is implied.';
  }
  if (row.status === '404' && row.family === 'journal-article') {
    return 'Restore the published article. `app/journal/[slug]` now reads published rows with the service role and tolerates duplicate historical slugs instead of returning 404. Re-run after deploy to confirm 200.';
  }
  if (row.status === '404') {
    return 'Classify: restore, redirect to an exact equivalent, or keep an honest 404 and remove the URL from the sitemap. Do not redirect to the homepage.';
  }
  return row.action;
}

function statusIcon(row) {
  const v = verdict(row);
  if (v.startsWith('failed')) return 'FAIL';
  if (v.startsWith('warning')) return 'WARN';
  if (v.startsWith('satisfied')) return 'OK';
  return 'N/A';
}

function countBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const value = typeof key === 'function' ? key(row) : row[key];
    map.set(value, (map.get(value) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

async function main() {
  const raw = await readFile(path.join(ROOT, INPUT), 'utf8');
  const urls = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (urls.length !== 161) {
    throw new Error(`Expected 161 drilldown URLs, found ${urls.length}`);
  }
  if (new Set(urls.map(normalizeUrl)).size !== urls.length) {
    throw new Error('Drilldown contains duplicate URLs');
  }

  const sitemap = await loadSitemap();
  const results = new Array(urls.length);
  let cursor = 0;

  async function worker() {
    while (cursor < urls.length) {
      const index = cursor++;
      results[index] = await checkUrl(urls[index], sitemap.urls);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker));

  const fullSitemapResults = [];
  if (process.argv.includes('--all-sitemap') && sitemap.urls.size) {
    const known = new Map(results.map((row) => [normalizeUrl(row.url), row]));
    const remaining = [...sitemap.urls].filter((url) => !known.has(url));
    let sitemapCursor = 0;

    async function sitemapWorker() {
      while (sitemapCursor < remaining.length) {
        const url = remaining[sitemapCursor++];
        const row = await checkUrl(url, sitemap.urls);
        row.source = 'sitemap-only';
        row.gscReason = 'not in the supplied 161-row drilldown';
        fullSitemapResults.push(row);
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, remaining.length || 1) }, sitemapWorker)
    );
  }

  const sitemapAnomalies = [...results, ...fullSitemapResults].filter(
    (row) =>
      (row.status !== '200' && row.status !== 'not_checked') ||
      row.canonicalSelf === false ||
      /noindex/i.test(`${row.metaRobots} ${row.xRobots}`)
  );

  const summary = {
    total: results.length,
    byFamily: countBy(results, 'family'),
    byStatus: countBy(results, 'status'),
    sitemapError: sitemap.error,
    sitemapSize: sitemap.urls.size,
    inSitemap: results.filter((row) => row.inSitemap).length,
    canonicalMismatch: results.filter((row) => row.canonicalSelf === false).length,
    noindex: results.filter((row) => /noindex/i.test(`${row.metaRobots} ${row.xRobots}`)).length,
    non200: results.filter((row) => !['200', 'not_checked'].includes(row.status)).length,
  };

  const generatedAt = new Date().toISOString();
  const lines = [];
  lines.push('# GSC coverage audit — merkurov.love — 2026-11-22');
  lines.push('');
  lines.push(`Generated by \`node scripts/gsc-coverage-audit.mjs\` at \`${generatedAt}\`.`);
  lines.push(`Live base URL: \`${BASE_URL}\`${NO_HTTP ? ' (HTTP checks skipped)' : ''}.`);
  lines.push('');
  lines.push('## 1. Evidence boundary');
  lines.push('');
  lines.push('- **Supplied GSC export:** the 161-row *Discovered — currently not indexed* drilldown only.');
  lines.push('- **Not supplied:** URL-level drilldowns for the 33 *Crawled — currently not indexed*, 17 *Not found (404)*, 5 *Excluded by noindex*, 4 *Page with redirect*, 2 *Alternative page with proper canonical* and 6 *Duplicate, Google chose different canonical than user* URLs. Those lists are **not invented** in this report.');
  lines.push('- **Placeholder:** `Last crawled = 1970-01-01 00:00:00` in the supplied export is an empty-value placeholder, not a crawl timestamp.');
  lines.push('- **GSC API:** no read-only Google credentials are available in this execution environment. No GSC API call was made and no property setting was changed.');
  lines.push('- **Production HTTP:** the status/canonical/robots columns below are read-only GET observations made on the date above, before this branch is deployed. They are **not** a Google crawl and do not predict indexing.');
  lines.push('');
  lines.push('## 2. Summary of the 161 supplied URLs');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`| --- | ---: |`);
  lines.push(`| URLs in drilldown | ${summary.total} |`);
  lines.push(`| Present in production sitemap | ${summary.inSitemap} |`);
  lines.push(`| Sitemap fetch | ${summary.sitemapError ? `error: ${escapeCell(summary.sitemapError)}` : `${summary.sitemapSize} <loc> entries`} |`);
  lines.push(`| HTTP 200 | ${summary.byStatus.find(([key]) => key === '200')?.[1] || 0} |`);
  lines.push(`| Non-200 / error | ${summary.non200} |`);
  lines.push(`| Canonical not self | ${summary.canonicalMismatch} |`);
  lines.push(`| noindex on a supplied URL | ${summary.noindex} |`);
  lines.push('');
  lines.push('### Route families');
  lines.push('');
  lines.push('| Family | URLs |');
  lines.push('| --- | ---: |');
  for (const [family, count] of summary.byFamily) lines.push(`| ${family} | ${count} |`);
  lines.push('');
  lines.push('## 3. URL-level findings');
  lines.push('');
  lines.push('`GSC reason` for every row is the supplied group *Discovered — currently not indexed*.');
  lines.push('');
  lines.push('| # | URL | GSC reason | Route family | HTTP | Final URL | Canonical | Canonical self | Robots | In sitemap | H1 | Verdict | Action |');
  lines.push('| ---: | --- | --- | --- | ---: | --- | --- | --- | --- | --- | ---: | --- | --- |');
  results.forEach((row, index) => {
    lines.push(
      `| ${index + 1} | ${escapeCell(row.url)} | ${escapeCell(row.gscReason)} | ${escapeCell(row.family)} | ${escapeCell(row.status)} | ${escapeCell(row.finalUrl)} | ${escapeCell(row.canonical)} | ${row.canonicalSelf === null ? 'n/a' : row.canonicalSelf ? 'yes' : 'no'} | ${escapeCell(robotsDirective(row))} | ${row.inSitemap ? 'yes' : 'no'} | ${row.h1Count ?? 'n/a'} | ${escapeCell(verdict(row))} | ${escapeCell(actionFor(row))} |`
    );
  });
  lines.push('');
  lines.push('## 4. Full sitemap anomaly scan');
  lines.push('');
  if (!process.argv.includes('--all-sitemap')) {
    lines.push('Not run. Re-run with `--all-sitemap` to check every production `<loc>` for status, canonical and noindex.');
  } else if (summary.sitemapError) {
    lines.push(`Sitemap could not be fetched: ${escapeCell(summary.sitemapError)}.`);
  } else {
    lines.push(`Checked **${sitemap.urls.size}** production sitemap URLs: ${results.length} from the supplied drilldown plus ${fullSitemapResults.length} additional '<loc>' entries.`);
    lines.push('');
    if (sitemapAnomalies.length === 0) {
      lines.push('No 4xx/5xx, redirect, noindex or non-self-canonical URL was observed.');
    } else {
      lines.push(`**${sitemapAnomalies.length} anomalies observed.** These are pre-deploy observations of the currently deployed revision.`);
      lines.push('');
      lines.push('| URL | Source | HTTP | Canonical | Canonical self | Robots | Verdict | Action |');
      lines.push('| --- | --- | ---: | --- | --- | --- | --- | --- |');
      for (const row of sitemapAnomalies.sort((a, b) => a.url.localeCompare(b.url))) {
        lines.push(
          `| ${escapeCell(row.url)} | ${row.source === 'sitemap-only' ? 'sitemap only' : '161 drilldown'} | ${escapeCell(row.status)} | ${escapeCell(row.canonical)} | ${row.canonicalSelf === null ? 'n/a' : row.canonicalSelf ? 'yes' : 'no'} | ${escapeCell(robotsDirective(row))} | ${escapeCell(verdict(row))} | ${escapeCell(actionFor(row))} |`
        );
      }
    }
  }
  lines.push('');
  lines.push('## 5. Proven code defects and fixes in this branch');
  lines.push('');
  lines.push('1. **Sitemap `lastModified` was the generation time.** The production sitemap observed on 2026-11-22 returned the same `lastmod` (`2026-11-21T09:28:12.814Z`) for every static route and a `now` fallback for undated dynamic rows. `app/sitemap.ts` now delegates to `lib/sitemap/entries.ts`, which emits `lastModified` only for a parseable, real timestamp and omits it otherwise. Dates before 1971 (including the GSC 1970 placeholder) are treated as unknown.');
  lines.push('2. **Dynamic filters were re-checked in code.** Flow rows now require `status=published` *and* `visibility=public`; issue letters require `status=published`; tags require a real slug instead of falling back to a display name; lots require `status=published`.');
  lines.push('3. **Flow issue canonical/URL consistency.** `/flow-issues/<slug>` and `/en/flow-issues/<slug>` are two interface variants of one issue. Canonical, sitemap, archive links and previous/next links now use the issue content language (`lib/flow-issue/urls.ts`), not the archive chrome language. This removes the duplicate self-canonical pair without forcing a redirect.');
  lines.push('4. **Redirecting / non-canonical static URLs remain excluded.** `/letters` (canonicalises to `/journal`) is excluded; `/stat`, `/projects` and `/feed` are redirects and never enter the sitemap.');
  lines.push('5. **Journal 404s restored at the route level.** The full sitemap scan found six `/journal/*` URLs returning 404 while still listed in `sitemap.xml`. `app/journal/[slug]/page.tsx` now reads published rows with the service role (matching the root article route) and uses `limit(1)` instead of `.single()`, so request-scoped RLS or duplicate historical slugs cannot turn a published article into a 404. Two of those six are in the supplied 161-row list; the other four are outside it.');
  lines.push('6. **`/flow/join` canonical host fixed.** The live page emitted `https://merkurov.love/flow/join` (non-www) because the canonical was relative to a production `NEXT_PUBLIC_SITE_URL` without `www`. It now uses the shared `SITE_URL` constant and absolute canonical. Query-string `?lang=` hreflang values were removed because they are not separate URLs.');
  lines.push('');
  lines.push('## 6. Not verified / cannot be concluded from this data');
  lines.push('');
  lines.push('- The 33 *Crawled — currently not indexed* URLs could not be classified because their URLs were not supplied. Soft-404, thin-content, duplicate and canonical-mismatch conclusions for that group would require the drilldown.');
  lines.push('- The 17 404, 5 noindex, 4 redirect, 2 alternative-canonical and 6 Google-selected-canonical URL lists were not supplied. No redirect, noindex or canonical change was made for them.');
  lines.push('- The full sitemap scan found six `/journal/*` 404s. Two are in the supplied 161-row list; the other four are outside it. Their overlap with the unavailable 17-URL 404 group is a hypothesis, not a confirmed GSC mapping.');
  lines.push('- A *Discovered — currently not indexed* state means Google knows the URL but has not crawled it yet. It is not proof of thin content, duplication or a canonical defect. No page was noindexed or deleted to reduce the count.');
  lines.push('- Google indexing decisions and timing are outside the repository. No URL inspection or indexing API submission was performed.');
  lines.push('- The live columns describe the currently deployed revision, not this branch. Re-run the script after an approved deploy to compare.');
  lines.push('');
  lines.push('## 7. Reproduce');
  lines.push('');
  lines.push('```bash');
  lines.push('node scripts/gsc-coverage-audit.mjs --all-sitemap --out docs/gsc-coverage-audit-2026-11-22.md');
  lines.push('GSC_AUDIT_NO_HTTP=1 node scripts/gsc-coverage-audit.mjs --out /tmp/gsc-static.md');
  lines.push('pnpm jest lib/__tests__/sitemap.test.ts lib/flow-issue/__tests__/urls.test.ts --runInBand');
  lines.push('pnpm typecheck');
  lines.push('```');
  lines.push('');

  await writeFile(path.join(ROOT, OUT), `${lines.join('\n')}\n`, 'utf8');
  console.log(
    JSON.stringify(
      {
        out: OUT,
        total: summary.total,
        inSitemap: summary.inSitemap,
        byStatus: summary.byStatus,
        canonicalMismatch: summary.canonicalMismatch,
        noindex: summary.noindex,
        sitemapError: summary.sitemapError,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
