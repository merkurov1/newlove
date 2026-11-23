#!/usr/bin/env tsx
/**
 * Offline integrity check for a Media Archive source bundle.
 *
 * It does not touch Supabase. It verifies that the archived PDF is unchanged,
 * that the proofread UTF-8 text matches the PDF article page, and that the
 * manifest describes the same hashes/paths that the importer will write.
 *
 * Usage:
 *   npx tsx scripts/knowledge/verify-media-archive-bundle.ts \
 *     --record-id 775e8169-a02e-4b64-b3f8-e3722a48c28f
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_RECORD_ID = '775e8169-a02e-4b64-b3f8-e3722a48c28f';
const EXPECTED_PDF_SHA256 = 'b86b1dc5e4ef6f48c3563d0293e77873a0bcf9500803f3cddd8a12c41c041acf';
const EXPECTED_TEXT_SHA256 = '59141b0aa36b37938dc677013371f239402f39da2c6f21a09b455d89e46460a3';
const EXPECTED_CONTENT_HASH = 'fc485f44fd9fa9814dc72527aad4b1a83bc40f6678833134575e01efa906adbe';
const EXPECTED_PDF_PAGES = 16;
const ARTICLE_PAGE = 3;
const BYLINE = 'Антон (Палыч) МЕРКУРОВ';

type Check = { name: string; ok: boolean; detail: string };

type PdfPage = { num: number; text: string };

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * The 2001 PDF was typeset with a subset font that maps soft hyphens to
 * U+0019 and sometimes uses Cyrillic «С» for the Latin «C». The proofread text
 * fixes those presentation artefacts. Comparing only letters and digits proves
 * that no words were added or dropped.
 */
function normalizeForComparison(value: string): string {
  return value
    .replace(/\u0019/g, '')
    .replace(/\u0421/g, 'C')
    .replace(/[^0-9A-Za-zА-Яа-яЁё]+/g, '')
    .toLowerCase();
}

function argValue(argv: string[], key: string, fallback: string): string {
  const inline = argv.find((arg) => arg.startsWith(`--${key}=`));
  if (inline) return inline.slice(key.length + 3);

  const index = argv.indexOf(`--${key}`);
  const next = index >= 0 ? argv[index + 1] : null;

  return next && !next.startsWith('--') ? next : fallback;
}

function push(checks: Check[], name: string, ok: boolean, detail: string): void {
  checks.push({ name, ok, detail });
}

async function main(argv: string[]): Promise<number> {
  const recordId = argValue(argv, 'record-id', DEFAULT_RECORD_ID);
  const bundleDir = path.join('data', 'media-archive', recordId);
  const pdfPath = path.join(bundleDir, 'Pilot.pdf');
  const textPath = path.join(bundleDir, 'yarmarka-intellekta.txt');
  const manifestPath = path.join(bundleDir, 'manifest.json');

  const checks: Check[] = [];

  for (const [name, file] of [
    ['pdf-present', pdfPath],
    ['text-present', textPath],
    ['manifest-present', manifestPath],
  ] as const) {
    push(checks, name, fs.existsSync(file), file);
  }

  if (checks.some((check) => !check.ok)) {
    console.log(JSON.stringify({ ok: false, recordId, checks }, null, 2));
    return 1;
  }

  const pdf = fs.readFileSync(pdfPath);
  const textBytes = fs.readFileSync(textPath);
  const text = textBytes.toString('utf8');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;

  const pdfSha = sha256(pdf);
  const textSha = sha256(textBytes);
  const contentHash = sha256(Buffer.from(text.trim(), 'utf8'));

  push(checks, 'pdf-signature', pdf.subarray(0, 5).toString('latin1') === '%PDF-', 'PDF header');
  push(checks, 'pdf-sha256', pdfSha === EXPECTED_PDF_SHA256, pdfSha);
  push(checks, 'text-sha256', textSha === EXPECTED_TEXT_SHA256, textSha);
  push(checks, 'content-hash', contentHash === EXPECTED_CONTENT_HASH, contentHash);
  push(checks, 'text-utf8', !text.includes('\uFFFD'), 'no replacement characters');
  push(
    checks,
    'text-paragraphs',
    text
      .trim()
      .split(/\n\s*\n/)
      .filter(Boolean).length >= 32,
    String(
      text
        .trim()
        .split(/\n\s*\n/)
        .filter(Boolean).length
    )
  );
  push(checks, 'byline', text.includes(BYLINE), BYLINE);

  const source = manifest.source as { sha256?: string; bytes?: number } | undefined;
  const article = manifest.article as
    | { sha256?: string; contentHash?: string; textFile?: string }
    | undefined;
  const storage = manifest.storage as
    | { originalPdfPath?: string; cleanedTextPath?: string }
    | undefined;
  const recordUpdate = manifest.recordUpdate as
    | { source_path?: string; source_sha256?: string; content_hash?: string }
    | undefined;

  push(
    checks,
    'manifest-source-sha',
    source?.sha256 === pdfSha && source?.bytes === pdf.length,
    `${source?.sha256 ?? 'missing'} / ${source?.bytes ?? 'missing'}`
  );
  push(
    checks,
    'manifest-text-sha',
    article?.sha256 === textSha && article?.contentHash === contentHash,
    `${article?.sha256 ?? 'missing'} / ${article?.contentHash ?? 'missing'}`
  );
  push(
    checks,
    'manifest-paths',
    storage?.originalPdfPath === `brain-sources/${pdfSha.slice(0, 2)}/${pdfSha}.pdf` &&
      storage?.cleanedTextPath === `brain-sources/${textSha.slice(0, 2)}/${textSha}.txt` &&
      recordUpdate?.source_path === storage.cleanedTextPath &&
      recordUpdate?.source_sha256 === textSha &&
      recordUpdate?.content_hash === contentHash,
    recordUpdate?.source_path ?? 'missing'
  );

  let pageCount = 0;
  let articleMatches = false;
  let articleChars = 0;

  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({
      data: new Uint8Array(pdf),
      verbosity: 0,
      isEvalSupported: false,
      useWorkerFetch: false,
      useWasm: false,
      stopAtErrors: true,
    });

    try {
      const result = await parser.getText();
      const pages: PdfPage[] =
        Array.isArray(result.pages) && result.pages.length > 0
          ? (result.pages as PdfPage[])
          : String(result.text || '')
              .split('\f')
              .map((pageText, index) => ({ num: index + 1, text: pageText }));

      pageCount = Number(result.total) || pages.length;

      const page = pages.find((entry) => entry.num === ARTICLE_PAGE);
      const pageText = page?.text ?? '';
      const start = pageText.indexOf('28ноября');
      const bylineIndex = pageText.indexOf(BYLINE, Math.max(0, start));

      if (start >= 0 && bylineIndex > start) {
        const articleFromPdf = pageText.slice(start, bylineIndex + BYLINE.length);
        const normalizedPdf = normalizeForComparison(articleFromPdf);
        const normalizedText = normalizeForComparison(text);

        articleChars = normalizedPdf.length;
        articleMatches = normalizedPdf.length > 6_000 && normalizedPdf === normalizedText;
      }
    } finally {
      await parser.destroy();
    }
  } catch (error) {
    push(
      checks,
      'pdf-parse',
      false,
      error instanceof Error ? error.message.slice(0, 300) : 'pdf_parse_failed'
    );
  }

  push(checks, 'pdf-page-count', pageCount === EXPECTED_PDF_PAGES, String(pageCount));
  push(checks, 'article-matches-pdf-page-3', articleMatches, `normalized chars=${articleChars}`);

  const ok = checks.every((check) => check.ok);

  console.log(
    JSON.stringify(
      {
        ok,
        recordId,
        bundleDir,
        pdf: { sha256: pdfSha, bytes: pdf.length, pageCount },
        text: {
          sha256: textSha,
          contentHash,
          bytes: textBytes.length,
          characters: text.trim().length,
        },
        checks,
      },
      null,
      2
    )
  );

  return ok ? 0 : 1;
}

void main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
