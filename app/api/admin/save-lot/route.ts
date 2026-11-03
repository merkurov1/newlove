import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import {
  downloadAndStoreImageDetailed,
  imageMetadataFromStoredImage,
  storagePathFromArtifactsPublicUrl,
} from '@/lib/lots/images';
import { mapAuctionHouse, normalizeSourceUrl } from '@/lib/art-engine/ingest';
import { mergeVault } from '@/lib/art-engine/vault';
import {
  findLotById,
  findLotBySourceUrl,
  updateLotById,
  upsertLot,
} from '@/lib/art-engine/repository';
import type { ImageMetadata } from '@/lib/lots/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function asString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(asString).filter(Boolean);
  }

  return asString(value)
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function provenanceText(value: unknown): string | null {
  const items = asStringArray(value);
  return items.length ? items.join('\n') : null;
}

export async function POST(req: Request) {
  let admin: Awaited<ReturnType<typeof requireAdminFromRequest>>;

  try {
    admin = await requireAdminFromRequest(req);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      artist,
      title,
      link,
      image_url,
      ai_content,
      specs,
      lot_id,
    } = body || {};

    if (!link || typeof link !== 'string') {
      return NextResponse.json(
        { error: 'Source link is required' },
        { status: 400 },
      );
    }

    let sourceUrl: string;

    try {
      const parsed = new URL(link);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('invalid protocol');
      }
      sourceUrl = normalizeSourceUrl(parsed.toString());
    } catch {
      return NextResponse.json(
        { error: 'A valid source URL is required' },
        { status: 400 },
      );
    }

    const existing = lot_id
      ? await findLotById(String(lot_id))
      : (await findLotBySourceUrl(sourceUrl)) ||
        (await findLotBySourceUrl(link));

    if (lot_id && !existing) {
      return NextResponse.json(
        { error: 'Vault record not found.' },
        { status: 404 },
      );
    }

    const warnings: string[] = [];
    const aiContent =
      ai_content && typeof ai_content === 'object' && !Array.isArray(ai_content)
        ? ai_content
        : {};

    const mergedAiContent = {
      ...(existing?.ai_content || {}),
      ...aiContent,
    };

    let imageMeta: ImageMetadata | null =
      existing?.vault?.image || null;

    const incomingImage = asString(image_url);

    if (incomingImage) {
      const storagePath = storagePathFromArtifactsPublicUrl(incomingImage);

      if (storagePath) {
        imageMeta = {
          originalUrl:
            existing?.vault?.image?.originalUrl || incomingImage,
          storedPath: storagePath,
          publicUrl: incomingImage,
          source:
            existing?.vault?.image?.source || 'auction-house-original',
          availability: 'mirrored',
          fetchedAt: new Date().toISOString(),
          rights: {
            basis: 'auction-house-original',
            publication: 'unreviewed',
            note: 'Publication rights must be confirmed before Selection.',
          },
        };
      } else if (/^https?:\/\//i.test(incomingImage)) {
        try {
          const stored = await downloadAndStoreImageDetailed(
            incomingImage,
            sourceUrl,
            process.env.SCRAPINGANT_API_KEY,
          );

          imageMeta = imageMetadataFromStoredImage({
            originalUrl: incomingImage,
            source: existing?.vault?.image?.source || 'auction-house-original',
            stored,
          });
        } catch (error) {
          warnings.push(
            error instanceof Error
              ? `Image could not be mirrored: ${error.message}`
              : 'Image could not be mirrored.',
          );

          imageMeta = {
            originalUrl: incomingImage,
            storedPath: null,
            publicUrl: incomingImage,
            source: 'auction-house-original',
            availability: 'hotlink-only',
            fetchedAt: new Date().toISOString(),
            rights: {
              basis: 'auction-house-original',
              publication: 'unreviewed',
              note: 'External image URL retained; publication requires an explicit rights check.',
            },
            warnings,
          };
        }
      }
    }

    const estimateFromSpecs = asString(specs?.estimate);
    const yearFromSpecs =
      asString(specs?.year) ||
      asString(specs?.date);

    const resolvedArtist =
      asString(artist) ||
      asString(aiContent?.artist) ||
      asString(existing?.artist);

    const resolvedTitle =
      asString(title) ||
      asString(aiContent?.title) ||
      asString(existing?.title);

    const auctionHouse = mapAuctionHouse({
      auctionHouse: existing?.auction_house || undefined,
      house: existing?.auction_house || undefined,
      parserName: existing?.auction_house || undefined,
    });

    const vault = mergeVault(existing?.vault, {
      image: imageMeta,
      audit: [
        {
          at: new Date().toISOString(),
          action: existing ? 'lot.dossier_merged' : 'lot.dossier_created',
          actor: admin.email || admin.id,
          details: {
            has_ai_content: Object.keys(mergedAiContent).length > 0,
            image_availability: imageMeta?.availability || 'missing',
          },
        },
      ],
    });

    const row: Record<string, any> = {
      artist: resolvedArtist || '',
      title: resolvedTitle || '',
      year:
        asString(aiContent?.year) ||
        yearFromSpecs ||
        existing?.year ||
        null,
      medium:
        asString(aiContent?.medium) ||
        asString(specs?.medium) ||
        existing?.medium ||
        null,
      dimensions:
        asString(aiContent?.dimensions) ||
        asString(specs?.dimensions) ||
        existing?.dimensions ||
        null,
      estimate:
        asString(aiContent?.estimate_raw) ||
        estimateFromSpecs ||
        existing?.estimate ||
        null,
      price_realized:
        asString(aiContent?.price_realized) ||
        asString(aiContent?.price_realized_raw) ||
        existing?.price_realized ||
        null,
      provenance:
        provenanceText(aiContent?.provenance) ||
        existing?.provenance ||
        null,
      source_url: existing?.source_url || sourceUrl,
      image_path:
        imageMeta?.storedPath ||
        imageMeta?.originalUrl ||
        existing?.image_path ||
        null,
      status: existing?.status || 'draft',
      tags: Array.isArray(existing?.tags) ? existing.tags : null,
      auction_date: existing?.auction_date || null,
      currency:
        asString(aiContent?.currency) ||
        existing?.currency ||
        null,
      estimate_low:
        finiteNumber(aiContent?.estimate_low) ??
        existing?.estimate_low ??
        null,
      estimate_high:
        finiteNumber(aiContent?.estimate_high) ??
        existing?.estimate_high ??
        null,
      auction_house:
        existing?.auction_house ||
        (auctionHouse !== 'Unknown' ? auctionHouse : 'Unknown'),
      external_id: existing?.external_id || null,
      vault,
      ai_content: mergedAiContent,
    };

    const saved = lot_id
      ? await updateLotById(String(lot_id), row)
      : await upsertLot(row);

    if (!saved.lot) {
      return NextResponse.json(
        { error: 'Failed to save the lot in Vault.' },
        { status: 500 },
      );
    }

    if (!saved.vaultPersisted) {
      warnings.push(...saved.warnings);
    }

    if (!resolvedArtist) {
      warnings.push('Artist is missing; no value was invented.');
    }
    if (!resolvedTitle) {
      warnings.push('Title is missing; no value was invented.');
    }
    if (!imageMeta) {
      warnings.push('No original image is stored for this lot.');
    }

    return NextResponse.json({
      success: true,
      lot_id: saved.lot.id,
      redirect_url: `/art-engine?lot=${encodeURIComponent(saved.lot.id)}`,
      warnings,
      image_availability: imageMeta?.availability || 'missing',
    });
  } catch (error: any) {
    console.error('Error saving lot:', error);
    const message = error?.message || 'Internal Server Error';

    return NextResponse.json(
      { error: message },
      { status: message.includes('Unauthorized') ? 401 : 500 },
    );
  }
}
