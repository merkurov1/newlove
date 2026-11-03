import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { findLotById } from '@/lib/art-engine/repository';
import { normalizeVault } from '@/lib/art-engine/vault';
import { summarizeAttempt } from '@/lib/art-engine/attempts';
import { extractionFromLotRow } from '@/lib/art-engine/extraction';
import { listParseAttemptsForLot } from '@/lib/lots/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

function publicImageUrl(imagePath: string | null | undefined): string | null {
  if (!imagePath) return null;
  if (/^https?:\/\//i.test(imagePath)) return imagePath;

  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  return base
    ? `${base}/storage/v1/object/public/artifacts/${imagePath}`
    : null;
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    await requireAdminFromRequest(req);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const lot = await findLotById(params.id);

  if (!lot) {
    return NextResponse.json({ error: 'Vault record not found.' }, { status: 404 });
  }

  const vault = normalizeVault(lot.vault);
  const urls = Array.from(
    new Set(
      [
        lot.source_url,
        vault.ingestion?.source_url,
        vault.ingestion?.canonical_url,
      ]
        .filter((value): value is string => typeof value === 'string' && Boolean(value))
    ),
  );

  const rawAttempts = await listParseAttemptsForLot({
    lotId: String(lot.id),
    urls,
    attemptIds: vault.ingestion?.attempt_ids || [],
    limit: 40,
  });

  const attempts = rawAttempts.map(summarizeAttempt);
  const latestSuccessfulAttempt = rawAttempts.find((attempt) =>
    ['ready', 'partial', 'success'].includes(String(attempt.status)),
  );
  const latestAttempt = latestSuccessfulAttempt || rawAttempts[0];
  const latestWithResult = rawAttempts.find(
    (attempt) => attempt?.payload?.result,
  );
  const extraction = extractionFromLotRow(
    lot,
    vault,
    latestWithResult?.payload?.result,
  );
  const extracted = {
    description: extraction.description,
    signature: extraction.signature,
    lot_number: extraction.lotNumber,
    auction_date: extraction.auctionDate,
    estimate_raw: extraction.estimate?.raw || null,
    price_realized_raw: extraction.price?.raw || null,
    provenance: extraction.provenance,
    exhibitions: extraction.exhibitions,
    literature: extraction.literature,
    artist_dates: extraction.artistDates,
    lot_essay: extraction.lotEssay,
    catalogue_note: extraction.catalogueNote,
    condition_report: extraction.conditionReport,
    condition_report_status: extraction.conditionReportStatus,
  };

  // Deploy-safe fallback: older lots were ingested before the `vault` column
  // existed. Their latest parser attempt still carries enough state for the
  // workspace, so do not show an empty "unknown" record.
  const fallbackIngestion = latestAttempt
    ? {
        status:
          latestAttempt.status === 'success'
            ? 'ready'
            : latestAttempt.status || 'unknown',
        attempt_id: latestAttempt.id,
        attempt_ids: [latestAttempt.id],
        parser:
          latestAttempt.payload?.parser ||
          latestAttempt.house ||
          null,
        parser_version: latestAttempt.payload?.parser_version || null,
        house: latestAttempt.house || null,
        source_url: latestAttempt.url || lot.source_url || null,
        http_status: latestAttempt.payload?.http_status ?? null,
        fetch_method: latestAttempt.payload?.fetch_method ?? null,
        warnings: Array.isArray(latestAttempt.payload?.warnings)
          ? latestAttempt.payload.warnings
          : [],
        errors: Array.isArray(latestAttempt.payload?.errors)
          ? latestAttempt.payload.errors
          : [],
        missing_fields: Array.isArray(latestAttempt.payload?.missing_fields)
          ? latestAttempt.payload.missing_fields
          : [],
        image: latestAttempt.payload?.image || null,
      }
    : null;

  const ingestion = vault.ingestion || fallbackIngestion;

  const fallbackImage =
    vault.image ||
    latestAttempt?.payload?.image ||
    (lot.image_path
      ? {
          originalUrl: /^https?:\/\//i.test(lot.image_path)
            ? lot.image_path
            : null,
          storedPath: /^https?:\/\//i.test(lot.image_path)
            ? null
            : lot.image_path,
          publicUrl: publicImageUrl(lot.image_path),
          availability: /^https?:\/\//i.test(lot.image_path)
            ? 'hotlink-only'
            : 'mirrored',
          rights: {
            basis: 'auction-house-original',
            publication: 'unreviewed',
            note: 'Publication rights must be confirmed before Selection.',
          },
        }
      : null);

  return NextResponse.json({
    lot: {
      id: String(lot.id),
      artist: lot.artist || '',
      title: lot.title || '',
      year: lot.year || null,
      medium: lot.medium || null,
      dimensions: lot.dimensions || null,
      estimate: lot.estimate || null,
      price_realized: lot.price_realized || null,
      provenance: lot.provenance || null,
      source_url: lot.source_url || null,
      image_path: lot.image_path || null,
      image_url: publicImageUrl(lot.image_path),
      auction_house: lot.auction_house || null,
      auction_date: lot.auction_date || null,
      currency: lot.currency || null,
      external_id: lot.external_id || null,
      status: lot.status || null,
      created_at: lot.created_at || null,
    },
    vault: {
      ingestion: ingestion || null,
      image: fallbackImage || null,
    },
    extraction,
    wikipedia: vault.wikipedia || null,
    editorial: vault.editorial
      ? {
          status: vault.editorial.status || 'idle',
          current: vault.editorial.current || null,
          history_count: Array.isArray(vault.editorial.history)
            ? vault.editorial.history.length
            : 0,
          last_error: vault.editorial.last_error || null,
          last_attempt_at: vault.editorial.last_attempt_at || null,
          updated_at: vault.editorial.updated_at || null,
        }
      : null,
    publication: vault.publication
      ? {
          status: vault.publication.status || 'unpublished',
          article_id: vault.publication.article_id || null,
          slug: vault.publication.slug || null,
          version: vault.publication.version ?? null,
          published_at: vault.publication.published_at || null,
          approved_at: vault.publication.approved_at || null,
          update_pending: Boolean(vault.publication.update_pending),
          history_count: Array.isArray(vault.publication.history)
            ? vault.publication.history.length
            : 0,
        }
      : null,
    attempts,
    extracted,
  });
}
