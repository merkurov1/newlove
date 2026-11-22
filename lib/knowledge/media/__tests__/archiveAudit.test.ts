/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { publicRecords as localRecords, records as allLocalRecords } from '@/data/media';

import {
  archiveSlug,
  inventoryMediaSnapshot,
  normalizeArchiveUrl,
  parseMediaInventoryCsv,
  reconcileNovayaArchive,
  type ArchiveManifestRecord,
} from '../archiveAudit';

const snapshotPath = path.join(
  process.cwd(),
  'docs',
  'audits',
  'media-rag-reconciliation-inventory.csv'
);
const manifestPath = path.join(
  process.cwd(),
  'data',
  'novaya-archive',
  'authored-columns.json'
);
const baselinePath = path.join(
  process.cwd(),
  'data',
  'media-audit',
  'current-baseline.json'
);

const rows = parseMediaInventoryCsv(fs.readFileSync(snapshotPath, 'utf8'));
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as {
  capturedAt: string;
  media: {
    records: number;
    published: number;
    drafts: number;
    fullText: number;
    linkedDocuments: number;
    duplicates: number;
    nullDates: number;
  };
  novaya: {
    manifestTotal: number;
    matched: number;
    alreadyPresent: number;
    added: number;
    ambiguous: number;
  };
};
const manifest = (
  JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    records: ArchiveManifestRecord[];
  }
).records;

describe('Media inventory from the captured snapshot', () => {
  const inventory = inventoryMediaSnapshot(rows);

  it('counts every record and publication status', () => {
    expect(inventory.total).toBe(223);
    expect(inventory.byArchiveStatus.published).toBe(223);
    expect(inventory.byKind).toMatchObject({
      column: 82,
      mention: 52,
      blog: 49,
      quote: 30,
      interview: 6,
      profile: 2,
      video: 1,
      radio: 1,
    });
  });

  it('keeps extraction and ingestion status separate from indexing', () => {
    expect(inventory.byCoverageStatus).toMatchObject({
      completed: 114,
      unknown: 104,
      failed: 3,
      blocked: 1,
      partial: 1,
    });
    expect(inventory.byTextQuality).toMatchObject({
      full_text: 115,
      unknown: 104,
      blocked: 2,
      partial_text: 2,
    });
    expect(inventory.byCorpusState).toMatchObject({
      indexed: 115,
      metadata_only_queued: 100,
      metadata_only_non_text: 4,
      embeddings_pending: 2,
      blocked: 1,
      extraction_failed: 1,
    });
    expect(inventory.byIngestionStatus).toMatchObject({
      completed: 115,
      unknown: 104,
      pending: 4,
    });
  });

  it('reports dates and document coverage without inventing values', () => {
    expect(inventory.unknownDates).toBe(2);
    expect(inventory.dateRange).toEqual({ from: '2010-02-25', to: '2026-10-24' });
    expect(inventory.documentLinked).toBe(119);
    expect(inventory.publishedWithoutDocument).toBe(104);
    expect(inventory.nonPublishedWithDocument).toBe(0);
    expect(inventory.dateConflicts).toHaveLength(0);
  });

  it('flags extraction quality contradictions instead of treating them as clean text', () => {
    expect(inventory.emptyTitles).toBe(0);
    expect(inventory.missingCanonicalUrls).toBe(0);
    expect(inventory.invalidCanonicalUrls).toBe(0);
    expect(inventory.documentsWithoutChunks).toBe(4);
    expect(inventory.fullTextWithoutChunks).toBe(1);
    expect(inventory.textQualityConflicts).toBe(1);
  });

  it('never merges duplicate identities automatically', () => {
    expect(inventory.duplicateCanonicalUrls).toHaveLength(0);
    expect(inventory.duplicateTitleOutletDate).toHaveLength(0);
    expect(inventory.duplicateTitles).toHaveLength(1);

    const [authorPages] = inventory.duplicateTitles;
    expect(authorPages.key).toBe('антон меркуров авторская страница');
    expect(authorPages.outlets.sort()).toEqual(['Republic (Слон.ру)', 'Новая газета']);
    expect(authorPages.recommendation).toBe('keep_distinct');
    expect(authorPages.automaticMerge).toBe(false);
  });
});

describe('Novaya Gazeta manifest reconciliation', () => {
  const reconciliation = reconcileNovayaArchive(manifest, rows);

  it('maps every manifest source exactly once', () => {
    expect(reconciliation.manifestTotal).toBe(157);
    expect(reconciliation.matched).toBe(117);
    expect(reconciliation.missing).toBe(40);
    expect(reconciliation.ambiguous).toBe(0);
    expect(reconciliation.matches).toHaveLength(157);
    expect(new Set(reconciliation.matches.map((match) => match.source)).size).toBe(157);
    expect(
      reconciliation.matches.every((match) =>
        ['matched', 'missing', 'ambiguous'].includes(match.status)
      )
    ).toBe(true);
  });

  it('has no duplicate manifest identity and no URL/date conflicts', () => {
    expect(new Set(manifest.map((record) => record.source)).size).toBe(manifest.length);
    expect(
      new Set(manifest.map((record) => record.title.trim().toLowerCase())).size
    ).toBe(manifest.length);

    const dateConflicts = manifest.filter((record) => {
      const fromUrl = record.source.match(/\/(\d{4})\/(\d{2})\/(\d{2})(?:\/|$)/);
      if (!fromUrl) return false;

      return `${fromUrl[1]}-${fromUrl[2]}-${fromUrl[3]}` !== record.date.slice(0, 10);
    });

    expect(dateConflicts).toEqual([]);
  });

  it('preserves the known missing source instead of reconstructing it', () => {
    const missing = reconciliation.missingSources.find((source) =>
      source.source.includes('/2026/11/03/iskusstvennoe-preryvanie-progressa')
    );

    expect(missing).toBeDefined();
    expect(missing?.title).toBe('Искусственное прерывание прогресса');
    expect(missing?.mediaId).toBeNull();
    expect(missing?.note).toContain('absent from GitHub archive');
  });

  it('accounts for every historical gap in the latest verified baseline', () => {
    expect(baseline.capturedAt).toBe('2026-11-05');
    expect(baseline.media).toMatchObject({
      records: 265,
      published: 263,
      drafts: 2,
      fullText: 231,
      linkedDocuments: 259,
      duplicates: 0,
      nullDates: 0,
      outlets: 43,
    });
    expect(baseline.novaya).toMatchObject({
      manifestTotal: reconciliation.manifestTotal,
      matched: reconciliation.manifestTotal,
      ambiguous: 0,
    });

    // 118 records already existed at the start of the reconciliation run and
    // 39 were inserted. One source was added between the 2026-10-30 snapshot
    // and that run, so every one of the 40 historical gaps is accounted for.
    const addedBetweenSnapshots =
      baseline.novaya.alreadyPresent - reconciliation.matched;
    expect(addedBetweenSnapshots + baseline.novaya.added).toBe(reconciliation.missing);
  });

  it('uses provenance, not guesses, for the corrected date', () => {
    const corrected = reconciliation.matches.find((match) =>
      match.source.includes('/2024/12/02/i-pogovorit-negde')
    );

    expect(corrected?.status).toBe('matched');
    expect(corrected?.manifestDate).toBe('2024-12-02');
    expect(corrected?.dateMatches).toBe(true);
    expect(corrected?.note).toContain('previous manifest date 2024-12-03 was corrected');
  });

  it('reports extended database titles as variants, not errors', () => {
    expect(reconciliation.metadataMismatches.titleDifferent).toBe(0);
    expect(reconciliation.metadataMismatches.dateMismatch).toBe(0);
    expect(
      reconciliation.matches.filter((match) => match.titleComparison === 'extended').length
    ).toBeGreaterThan(0);
  });
});

describe('Local fallback archive invariants', () => {
  it('has no duplicate URL identity and no conflicting slugs', () => {
    const urls = localRecords.map((record) => normalizeArchiveUrl(record.url));
    expect(new Set(urls).size).toBe(localRecords.length);
    expect(new Set(localRecords.map((record) => record.slug)).size).toBe(localRecords.length);
    expect(localRecords.flatMap((record) => record.slugAliases || [])).toHaveLength(0);
  });

  it('keeps authorship explicit for own columns and leaves external bylines unset', () => {
    const own = localRecords.filter(
      (record) => record.kind === 'column' || record.kind === 'blog'
    );
    const externalQuotes = localRecords.filter((record) => record.kind === 'quote');

    expect(own.length).toBeGreaterThan(0);
    expect(own.every((record) => record.author === 'Антон Меркуров')).toBe(true);
    expect(externalQuotes.every((record) => record.author === undefined)).toBe(true);
  });

  it('retains draft history without exposing it in the public fallback', () => {
    const drafts = allLocalRecords.filter((record) => record.status === 'draft');

    expect(drafts.map((record) => record.title)).toEqual(['Вечный зов']);
    expect(localRecords).toHaveLength(allLocalRecords.length - drafts.length);
    expect(localRecords.every((record) => record.status !== 'draft')).toBe(true);
  });

  it('extracts a stable slug from manifest and database URLs', () => {
    expect(
      archiveSlug('https://www.novayagazeta.ru/articles/2026/10/14/oblaka-to-na-zemle/')
    ).toBe('oblaka-to-na-zemle');
    expect(normalizeArchiveUrl('https://www.novayagazeta.ru/a/?b=1#c')).toBe(
      'https://novayagazeta.ru/a?b=1'
    );
  });
});
