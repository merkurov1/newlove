import { NextResponse } from 'next/server';
import { assertSafePublicUrl } from '@/lib/flow/parseUrl';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { parserRegistry } from '@/lib/lots/registry';
import {
  downloadAndStoreImageDetailed,
  imageMetadataFromStoredImage,
  resolveUrl,
} from '@/lib/lots/images';
import { startParseAttempt, finishParseAttempt } from '@/lib/lots/db';
import {
  buildIngestionState,
  computeIngestionStatus,
  findMissingFields,
  mergeVault,
} from '@/lib/art-engine/vault';
import {
  buildLotRow,
  canonicalUrlFromHtml,
  contentHash,
  normalizeSourceUrl,
  rawHtmlExcerpt,
  toExtractedSpecs,
} from '@/lib/art-engine/ingest';
import { buildLotExtractionState } from '@/lib/art-engine/extraction';
import { fetchAuctionHtml, HtmlFetchError } from '@/lib/art-engine/fetchHtml';
import { findLotBySourceUrl, upsertLot } from '@/lib/art-engine/repository';
import type { ImageCandidate, ImageMetadata, LotData } from '@/lib/lots/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function collectImageCandidates(lot: LotData): ImageCandidate[] {
  const raw: ImageCandidate[] = [
    ...(lot.imageCandidates || []),
    ...(lot.imageUrl
      ? [{ url: lot.imageUrl, source: lot.parserName || 'primary' }]
      : []),
  ];

  const seen = new Set<string>();
  const result: ImageCandidate[] = [];

  for (const candidate of raw) {
    const url = (candidate.url || '').trim();
    if (!url || seen.has(url)) continue;

    seen.add(url);
    result.push({ ...candidate, url });
  }

  return result.slice(0, 6);
}

export async function POST(req: Request) {
  const startedAt = Date.now();

  let admin: Awaited<ReturnType<typeof requireAdminFromRequest>>;

  try {
    admin = await requireAdminFromRequest(req);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const rawUrl = body?.url;

  if (!rawUrl || typeof rawUrl !== 'string') {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  let sourceUrl: string;

  try {
    sourceUrl = normalizeSourceUrl(
      assertSafePublicUrl(rawUrl.trim()).toString(),
    );
  } catch {
    return NextResponse.json({ error: 'URL is not allowed' }, { status: 400 });
  }

  const house = parserRegistry.detectHouse(sourceUrl);
  const attemptId = await startParseAttempt({ url: sourceUrl, house });

  const warnings: string[] = [];
  const errors: string[] = [];

  try {
    const apiKey = process.env.SCRAPINGANT_API_KEY;
    const fetchResult = await fetchAuctionHtml(sourceUrl, { apiKey });
    warnings.push(...fetchResult.warnings);

    const canonicalUrl = canonicalUrlFromHtml(
      fetchResult.html,
      fetchResult.finalUrl,
    );

    const lotData = parserRegistry.parse(
      fetchResult.html,
      fetchResult.finalUrl,
      house,
    );

    if (lotData.parseErrors?.length) {
      warnings.push(...lotData.parseErrors);
    }
    if (lotData.warnings?.length) {
      warnings.push(...lotData.warnings);
    }

    let imageMeta: ImageMetadata | null = null;
    const imageWarnings: string[] = [];

    for (const candidate of collectImageCandidates(lotData)) {
      let absoluteUrl: string;

      try {
        absoluteUrl = assertSafePublicUrl(
          resolveUrl(candidate.url, fetchResult.finalUrl),
        ).toString();
      } catch {
        imageWarnings.push(
          `Image candidate rejected as unsafe: ${candidate.url}`,
        );
        continue;
      }

      try {
        const stored = await downloadAndStoreImageDetailed(
          absoluteUrl,
          fetchResult.finalUrl,
          apiKey,
        );

        imageMeta = imageMetadataFromStoredImage({
          originalUrl: absoluteUrl,
          source: candidate.source || null,
          stored,
        });
        break;
      } catch (imageError) {
        imageWarnings.push(
          imageError instanceof Error
            ? `Image mirror failed: ${imageError.message}`
            : 'Image mirror failed.',
        );
      }
    }

    if (!imageMeta && lotData.imageUrl) {
      try {
        const absoluteUrl = assertSafePublicUrl(
          resolveUrl(lotData.imageUrl, fetchResult.finalUrl),
        ).toString();

        imageMeta = {
          originalUrl: absoluteUrl,
          storedPath: null,
          publicUrl: absoluteUrl,
          source: 'auction-house-original',
          availability: 'hotlink-only',
          fetchedAt: new Date().toISOString(),
          rights: {
            basis: 'auction-house-original',
            publication: 'unreviewed',
            note: 'Image could not be mirrored. Publication requires an explicit rights check.',
          },
          warnings: imageWarnings,
        };

        warnings.push(
          'The original image could not be mirrored; Vault kept the auction-house URL only.',
        );
      } catch {
        imageWarnings.push('The original image URL is not a safe public URL.');
      }
    }

    if (!imageMeta) {
      warnings.push('No usable original image was found on the auction page.');
    } else if (
      imageMeta.width &&
      imageMeta.height &&
      Math.min(imageMeta.width, imageMeta.height) < 800
    ) {
      warnings.push(
        `The original image is small (${imageMeta.width}×${imageMeta.height}); review it before publication.`,
      );
    } else if (
      imageMeta.bytes &&
      imageMeta.bytes > 0 &&
      imageMeta.bytes < 40_000
    ) {
      warnings.push(
        'The original image file is unusually small; check its quality before publication.',
      );
    }

    if (imageWarnings.length) {
      warnings.push(...imageWarnings);
    }

    const lotForStatus: LotData = {
      ...lotData,
      imageUrl:
        imageMeta?.storedPath ||
        imageMeta?.originalUrl ||
        lotData.imageUrl ||
        null,
    };

    const missingFields = findMissingFields(lotForStatus);
    const status = computeIngestionStatus(lotForStatus);

    if (missingFields.length) {
      warnings.push(`Missing fields: ${missingFields.join(', ')}.`);
    }

    if (status === 'failed') {
      const message =
        'The page was fetched, but no usable artwork fields were extracted.';

      await finishParseAttempt(attemptId, {
        url: sourceUrl,
        status: 'failed',
        error_message: message,
        house: lotData.auctionHouse || house,
        parsed_title: lotData.title || null,
        execution_time_ms: Date.now() - startedAt,
        payload: {
          stage: 'extraction',
          parser: lotData.parserName || null,
          parser_version: lotData.parserVersion || null,
          canonical_url: canonicalUrl,
          http_status: fetchResult.status,
          fetch_method: fetchResult.method,
          warnings,
          errors: [...errors, message],
          missing_fields: missingFields,
          image: imageMeta,
          content_hash: contentHash(fetchResult.html),
          raw_excerpt: rawHtmlExcerpt(fetchResult.html),
          result: lotData,
        },
      });

      return NextResponse.json(
        {
          success: false,
          status: 'failed',
          attempt_id: attemptId,
          error: message,
          warnings,
          errors: [...errors, message],
          missing_fields: missingFields,
          parser: {
            name: lotData.parserName || null,
            version: lotData.parserVersion || null,
            house: lotData.auctionHouse || house,
          },
        },
        { status: 422 },
      );
    }

    const lookupUrl = canonicalUrl || sourceUrl;
    const existing =
      (await findLotBySourceUrl(lookupUrl)) ||
      (await findLotBySourceUrl(sourceUrl)) ||
      (await findLotBySourceUrl(rawUrl.trim()));

    const rowSourceUrl = existing?.source_url || sourceUrl;

    const extraction = buildLotExtractionState(lotData, {
      imageCandidates: collectImageCandidates(lotData),
      warnings,
      errors,
      sourceUrl: rowSourceUrl,
    });

    const vault = mergeVault(existing?.vault, {
      extraction,
      ingestion: buildIngestionState({
        status,
        attemptId,
        parser: lotData.parserName,
        parserVersion: lotData.parserVersion,
        house: lotData.auctionHouse || house,
        sourceUrl,
        canonicalUrl,
        httpStatus: fetchResult.status,
        fetchMethod: fetchResult.method,
        fetchedAt: new Date().toISOString(),
        extractedAt: new Date().toISOString(),
        executionTimeMs: Date.now() - startedAt,
        warnings,
        errors,
        missingFields,
        image: imageMeta,
        rawExcerptChars: Math.min(
          fetchResult.html.length,
          120_000,
        ),
        contentHash: contentHash(fetchResult.html),
      }),
      image: imageMeta,
      audit: [
        {
          at: new Date().toISOString(),
          action: 'lot.ingested',
          actor: admin.email || admin.id,
          details: {
            attempt_id: attemptId,
            parser: lotData.parserName,
            parser_version: lotData.parserVersion,
            house: lotData.auctionHouse || house,
            status,
            image_availability: imageMeta?.availability || 'missing',
          },
        },
      ],
    });

    const row = buildLotRow({
      lot: lotData,
      image: imageMeta
        ? {
            storedPath: imageMeta.storedPath,
            originalUrl: imageMeta.originalUrl,
          }
        : null,
      vault,
      sourceUrl: rowSourceUrl,
      existing,
    });

    const saved = await upsertLot(row);

    if (!saved.lot) {
      throw new Error('Failed to persist the extracted lot in Vault.');
    }

    if (!saved.vaultPersisted) {
      warnings.push(...saved.warnings);
    }

    await finishParseAttempt(attemptId, {
      url: sourceUrl,
      status,
      error_message: errors.length ? errors.join('; ') : null,
      house: lotData.auctionHouse || house,
      parsed_title: lotData.title || null,
      execution_time_ms: Date.now() - startedAt,
      payload: {
        stage: 'complete',
        parser: lotData.parserName || null,
        parser_version: lotData.parserVersion || null,
        canonical_url: canonicalUrl,
        http_status: fetchResult.status,
        fetch_method: fetchResult.method,
        warnings,
        errors,
        missing_fields: missingFields,
        image: imageMeta,
        lot_id: saved.lot.id,
        content_hash: contentHash(fetchResult.html),
        raw_excerpt: rawHtmlExcerpt(fetchResult.html),
        result: lotData,
      },
    });

    const publicImageUrl =
      imageMeta?.publicUrl ||
      imageMeta?.originalUrl ||
      '';

    return NextResponse.json({
      success: true,
      status,
      lot_id: saved.lot.id,
      attempt_id: attemptId,
      lot: {
        id: saved.lot.id,
        artist: row.artist,
        title: row.title,
        year: row.year,
        medium: row.medium,
        dimensions: row.dimensions,
        estimate: row.estimate,
        price_realized: row.price_realized,
        provenance: row.provenance,
        source_url: row.source_url,
        image_path: row.image_path,
        auction_house: row.auction_house,
        auction_date: row.auction_date,
        external_id: row.external_id,
        status: row.status,
      },
      extracted: {
        artist: lotData.artist || '',
        artist_dates: lotData.artistDates || '',
        title: lotData.title || '',
        year: lotData.year || null,
        medium: lotData.medium || '',
        dimensions: lotData.dimensions || '',
        signature: lotData.signature || '',
        lot_essay: lotData.lotEssay || '',
        catalogue_note: lotData.catalogueNote || '',
        condition_report: lotData.conditionReport || '',
        condition_report_status: lotData.conditionReportStatus || 'unknown',
        lot_number: lotData.lotNumber || '',
        estimate: lotData.estimate?.raw || '',
        price_realized: lotData.price?.raw || '',
        currency:
          lotData.currency ||
          lotData.estimate?.currency ||
          lotData.price?.currency ||
          '',
        auction_date: lotData.auctionDate || '',
        auction_house: row.auction_house,
        description: lotData.description || '',
        provenance: lotData.provenance || [],
        exhibitions: lotData.exhibitions || [],
        literature: lotData.literature || [],
        canonical_url: canonicalUrl,
        source_url: row.source_url,
        image_url: publicImageUrl,
      },
      specs: toExtractedSpecs(lotData),
      image_url: publicImageUrl,
      imageUrl: publicImageUrl,
      warnings,
      errors,
      missing_fields: missingFields,
      parser: {
        name: lotData.parserName || null,
        version: lotData.parserVersion || null,
        house: lotData.auctionHouse || house,
        confidence: lotData.confidence ?? null,
      },
      vault_persisted: saved.vaultPersisted,
      execution_time_ms: Date.now() - startedAt,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to parse lot';

    errors.push(message);

    const status =
      error instanceof HtmlFetchError &&
      error.status &&
      error.status >= 400
        ? error.status
        : error instanceof HtmlFetchError
          ? 502
          : 500;

    await finishParseAttempt(attemptId, {
      url: sourceUrl,
      status: 'failed',
      error_message: message,
      house,
      parsed_title: null,
      execution_time_ms: Date.now() - startedAt,
      payload: {
        stage: 'fetch',
        error_code:
          error instanceof HtmlFetchError ? error.code : 'unknown',
        warnings,
        errors,
      },
    });

    return NextResponse.json(
      {
        success: false,
        status: 'failed',
        attempt_id: attemptId,
        error: message,
        code: error instanceof HtmlFetchError ? error.code : 'unknown',
        warnings,
        errors,
      },
      { status },
    );
  }
}
