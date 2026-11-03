import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { findLotById, updateLotById } from '@/lib/art-engine/repository';
import { mergeVault, normalizeVault } from '@/lib/art-engine/vault';
import { extractionFromLotRow } from '@/lib/art-engine/extraction';
import { generateCuratorialEssay } from '@/lib/art-engine/essay';
import { listParseAttemptsForLot } from '@/lib/lots/db';
import type { EditorialDraft } from '@/lib/art-engine/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
export const maxDuration = 60;

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  let admin: Awaited<ReturnType<typeof requireAdminFromRequest>>;

  try {
    admin = await requireAdminFromRequest(req);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const lot = await findLotById(params.id);
  if (!lot) {
    return NextResponse.json({ error: 'Vault record not found.' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const regenerate = body?.regenerate === true;
  const vault = normalizeVault(lot.vault);
  const existing = vault.editorial?.current || null;

  if (existing && !regenerate) {
    return NextResponse.json({
      success: true,
      unchanged: true,
      version: existing.version,
      essay: existing.curatorial_essay,
      editorial: vault.editorial,
    });
  }

  const attempts = await listParseAttemptsForLot({
    lotId: String(lot.id),
    urls: [
      lot.source_url,
      vault.ingestion?.source_url,
      vault.ingestion?.canonical_url,
    ].filter((value): value is string => Boolean(value)),
    attemptIds: vault.ingestion?.attempt_ids || [],
    limit: 10,
  });

  const latestWithResult = attempts.find(
    (attempt) => attempt?.payload?.result,
  );

  const extraction = extractionFromLotRow(
    lot,
    vault,
    latestWithResult?.payload?.result,
  );

  if (!extraction.artist || !extraction.title) {
    return NextResponse.json(
      {
        error: 'Artist and title are required before an essay can be generated.',
        missing: [
          !extraction.artist ? 'artist' : null,
          !extraction.title ? 'title' : null,
        ].filter(Boolean),
      },
      { status: 422 },
    );
  }

  const now = new Date().toISOString();
  const version = existing ? existing.version + 1 : 1;

  try {
    const result = await generateCuratorialEssay({
      extraction,
      wikipedia: vault.wikipedia || null,
      sourceUrl: lot.source_url,
    });

    const warnings: string[] = [];
    if (vault.wikipedia?.status !== 'found') {
      warnings.push(
        'No verified Wikipedia artist context was available; the essay relies on auction-house data only.',
      );
    }

    const draft: EditorialDraft = {
      version,
      title: extraction.title,
      artist: extraction.artist,
      year: extraction.year ? String(extraction.year) : null,
      medium: extraction.medium,
      dimensions: extraction.dimensions,
      signed: extraction.signature,
      auction_house: extraction.auctionHouse,
      auction_date: extraction.auctionDate,
      lot_number: extraction.lotNumber,
      estimate: extraction.estimate?.raw || null,
      price_realized: extraction.price?.raw || null,
      currency: extraction.currency,
      curatorial_essay: result.essay,
      quote: null,
      specs: null,
      provenance: extraction.provenance,
      exhibitions: extraction.exhibitions,
      literature: extraction.literature,
      sources_used: [
        lot.source_url || null,
        vault.wikipedia?.status === 'found' ? vault.wikipedia.url : null,
      ].filter((value): value is string => Boolean(value)),
      warnings,
      model: result.model,
      prompt_version: result.promptVersion,
      generated_at: now,
    };

    const history = existing
      ? [
          ...(vault.editorial?.history || []),
          { ...existing, archived_at: now },
        ].slice(-20)
      : vault.editorial?.history || [];

    const publication =
      vault.publication?.status === 'published'
        ? {
            ...vault.publication,
            status: 'update_pending' as const,
            update_pending: true,
          }
        : vault.publication;

    const updatedVault = mergeVault(vault, {
      editorial: {
        status: 'draft',
        current: draft,
        history,
        last_error: null,
        last_attempt_at: now,
        updated_at: now,
      },
      publication,
      audit: [
        {
          at: now,
          action: regenerate ? 'essay.regenerated' : 'essay.generated',
          actor: admin.email || admin.id,
          details: {
            version,
            model: result.model,
            prompt_version: result.promptVersion,
            wikipedia_status: vault.wikipedia?.status || 'idle',
          },
        },
      ],
    });

    const saved = await updateLotById(String(lot.id), { vault: updatedVault });

    if (!saved.lot) {
      return NextResponse.json(
        { error: 'The essay was generated but could not be saved in Vault.' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      version,
      essay: draft.curatorial_essay,
      editorial: updatedVault.editorial,
      publication: updatedVault.publication || null,
      warnings,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Essay generation failed.';

    const failedVault = mergeVault(vault, {
      editorial: {
        ...(vault.editorial || {}),
        status: existing ? 'draft' : 'failed',
        current: existing,
        history: vault.editorial?.history || [],
        last_error: message,
        last_attempt_at: now,
        updated_at: now,
      },
      audit: [
        {
          at: now,
          action: 'essay.failed',
          actor: admin.email || admin.id,
          details: { version, error: message },
        },
      ],
    });

    await updateLotById(String(lot.id), { vault: failedVault });

    return NextResponse.json(
      {
        error: 'Essay generation failed. The parsed data and previous draft are preserved.',
        details: message,
        editorial: failedVault.editorial,
      },
      { status: 502 },
    );
  }
}
