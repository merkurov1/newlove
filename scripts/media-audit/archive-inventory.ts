/**
 * Read-only Media Archive inventory.
 *
 * Usage:
 *   pnpm media:inventory
 *   pnpm media:inventory -- --snapshot docs/audits/media-rag-reconciliation-inventory.csv
 *
 * No database, network or secret is touched. The script reports totals,
 * duplicate identities, public/private boundary violations and every Novaya
 * Gazeta manifest source as matched, missing or ambiguous.
 */
import fs from 'node:fs';
import path from 'node:path';

import { publicRecords as localPublicRecords, records as localRecords } from '../../data/media.ts';
import {
  inventoryMediaSnapshot,
  normalizeArchiveUrl,
  parseMediaInventoryCsv,
  reconcileNovayaArchive,
  type ArchiveManifestRecord,
} from '../../lib/knowledge/media/archiveAudit.ts';

function arg(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || '' : null;
}

const snapshotPath = path.resolve(
  arg('--snapshot') ||
    path.join('docs', 'audits', 'media-rag-reconciliation-inventory.csv')
);
const manifestPath = path.resolve(
  arg('--manifest') || path.join('data', 'novaya-archive', 'authored-columns.json')
);
const baselinePath = path.resolve(
  arg('--baseline') || path.join('data', 'media-audit', 'current-baseline.json')
);

const rows = parseMediaInventoryCsv(fs.readFileSync(snapshotPath, 'utf8'));
const manifest = (
  JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    records: ArchiveManifestRecord[];
  }
).records;
const currentBaseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as {
  capturedAt: string;
  source: string;
  media: {
    records: number;
    published: number;
    drafts: number;
    fullText: number;
    linkedDocuments: number;
    duplicates: number;
    nullDates: number;
    outlets: number;
    languages: number;
  };
  novaya: {
    manifestTotal: number;
    matched: number;
    alreadyPresent: number;
    added: number;
    ambiguous: number;
  };
};

const inventory = inventoryMediaSnapshot(rows);
const reconciliation = reconcileNovayaArchive(manifest, rows);

const localUrls = localPublicRecords.map((record) => normalizeArchiveUrl(record.url));
const localSlugs = localPublicRecords.map((record) => record.slug);

const report = {
  mode: 'read_only' as const,
  snapshot: path.relative(process.cwd(), snapshotPath),
  manifest: path.relative(process.cwd(), manifestPath),
  currentBaseline: {
    ...currentBaseline,
    note:
      'Latest verified post-repair state. Historical snapshot gaps are closed: ' +
      `${currentBaseline.novaya.alreadyPresent - reconciliation.matched} record(s) were added between snapshots and ` +
      `${currentBaseline.novaya.added} were inserted by the Novaya reconciliation.`,
  },
  inventory,
  novaya: {
    manifestTotal: reconciliation.manifestTotal,
    matched: reconciliation.matched,
    missing: reconciliation.missing,
    ambiguous: reconciliation.ambiguous,
    titleDifferent: reconciliation.metadataMismatches.titleDifferent,
    dateMismatch: reconciliation.metadataMismatches.dateMismatch,
    missingSources: reconciliation.missingSources.map((source) => ({
      date: source.manifestDate,
      title: source.title,
      source: source.source,
      note: source.note,
    })),
    ambiguousSources: reconciliation.ambiguousSources,
  },
  localFallback: {
    records: localRecords.length,
    publicRecords: localPublicRecords.length,
    drafts: localRecords.length - localPublicRecords.length,
    uniqueUrls: new Set(localUrls).size,
    uniqueSlugs: new Set(localSlugs).size,
    ownWithoutAuthor: localPublicRecords.filter(
      (record) =>
        (record.kind === 'column' || record.kind === 'blog') && !record.author
    ).length,
  },
  boundary: {
    nonPublishedWithDocument: inventory.nonPublishedWithDocument,
    duplicateCanonicalUrls: inventory.duplicateCanonicalUrls.length,
    ambiguousNovayaSources: reconciliation.ambiguous,
    automaticMerges: 0,
  },
};

console.log(JSON.stringify(report, null, 2));

if (process.argv.includes('--fail-on-boundary')) {
  const violations =
    inventory.nonPublishedWithDocument +
    inventory.duplicateCanonicalUrls.length +
    reconciliation.ambiguous;

  if (violations > 0) process.exitCode = 1;
}
