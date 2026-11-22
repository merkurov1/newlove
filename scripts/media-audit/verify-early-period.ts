/**
 * Read-only verification of the 2006–2015 early-period additions.
 *
 * Usage:
 *   node --experimental-strip-types --no-warnings scripts/media-audit/verify-early-period.ts
 *
 * The script never touches Supabase, the network or credentials. It checks the
 * local fallback archive and the machine-readable candidate manifest, then
 * prints the year, outlet, language and participation-type distribution.
 */
import fs from 'node:fs';
import path from 'node:path';

import { records, publicRecords } from '../../data/media.ts';

type ConfirmedCandidate = {
  date: string;
  outlet: string;
  title: string;
  url: string;
  lang: string;
  kind: string;
  role: string;
  topic: string;
};

type Manifest = {
  generatedAt: string;
  confirmed: ConfirmedCandidate[];
  doubtful: Array<Record<string, unknown>>;
  deferredPossibleDuplicates: Array<Record<string, unknown>>;
};

const manifestPath = path.resolve('data/media-audit/early-period-2026-11-22.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Manifest;

const byUrl = new Map<string, (typeof records)[number]>();
const duplicateUrls: string[] = [];

for (const record of records) {
  if (byUrl.has(record.url)) duplicateUrls.push(record.url);
  byUrl.set(record.url, record);
}

const identityKeys = new Map<string, number>();
for (const record of records) {
  const key = `${record.title.toLowerCase()}|${record.outlet}|${record.date}`;
  identityKeys.set(key, (identityKeys.get(key) || 0) + 1);
}
const duplicateIdentities = [...identityKeys.entries()].filter(([, count]) => count > 1);

const errors: string[] = [];

for (const candidate of manifest.confirmed) {
  const record = byUrl.get(candidate.url);
  if (!record) {
    errors.push(`missing record: ${candidate.url}`);
    continue;
  }

  for (const field of ['date', 'outlet', 'title', 'lang', 'kind'] as const) {
    if (record[field] !== candidate[field]) {
      errors.push(
        `field mismatch for ${candidate.url}: ${field} expected ${candidate[field]} got ${record[field]}`
      );
    }
  }
}

if (duplicateUrls.length > 0) {
  errors.push(`duplicate URLs in local archive: ${duplicateUrls.join(', ')}`);
}

if (duplicateIdentities.length > 0) {
  errors.push(`duplicate title+outlet+date: ${duplicateIdentities.map(([key]) => key).join('; ')}`);
}

const confirmedUrls = new Set(manifest.confirmed.map((item) => item.url));
const fresh = records.filter((record) => confirmedUrls.has(record.url));

function countBy<T extends string | number>(
  items: Array<(typeof records)[number]>,
  selector: (record: (typeof records)[number]) => T
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = String(selector(item));
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

const years = Array.from({ length: 27 }, (_, index) => String(2000 + index));
const yearDistribution = countBy(records, (record) => record.date.slice(0, 4));
const coveredYears = years.filter((year) => (yearDistribution[year] || 0) > 0);
const emptyYears = years.filter((year) => (yearDistribution[year] || 0) === 0);

const report = {
  mode: 'read_only',
  manifest: path.relative(process.cwd(), manifestPath),
  generatedAt: manifest.generatedAt,
  localArchive: {
    records: records.length,
    publicRecords: publicRecords.length,
    drafts: records.length - publicRecords.length,
    uniqueUrls: byUrl.size,
    uniqueOutlets: new Set(records.map((record) => record.outlet)).size,
    uniqueLanguages: new Set(records.map((record) => record.lang)).size,
  },
  earlyPeriodAdditions: {
    confirmed: manifest.confirmed.length,
    presentInLocalArchive: fresh.length,
    byYear: countBy(fresh, (record) => record.date.slice(0, 4)),
    byOutlet: countBy(fresh, (record) => record.outlet),
    byLanguage: countBy(fresh, (record) => record.lang),
    byKind: countBy(fresh, (record) => record.kind),
    byTopic: countBy(fresh, (record) => record.topic),
  },
  coverage: {
    years: `${years[0]}–${years[years.length - 1]}`,
    coveredYears,
    emptyYears,
    localYearDistribution: yearDistribution,
  },
  unresolved: {
    doubtful: manifest.doubtful.length,
    deferredPossibleDuplicates: manifest.deferredPossibleDuplicates.length,
  },
  checks: {
    duplicateUrls: duplicateUrls.length,
    duplicateTitleOutletDate: duplicateIdentities.length,
    missingOrMismatchedCandidates: errors.length,
  },
  errors,
};

console.log(JSON.stringify(report, null, 2));

if (errors.length > 0) process.exitCode = 1;
