import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { findLotById, updateLotById } from '@/lib/art-engine/repository';
import { mergeVault, normalizeVault } from '@/lib/art-engine/vault';
import { extractionFromLotRow } from '@/lib/art-engine/extraction';
import { findWikipediaArticle } from '@/lib/art-engine/wikipedia';
import { listParseAttemptsForLot } from '@/lib/lots/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
export const maxDuration = 30;

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
  const force = body?.force === true;
  const vault = normalizeVault(lot.vault);

  if (vault.wikipedia?.status === 'found' && !force) {
    return NextResponse.json({
      success: true,
      unchanged: true,
      wikipedia: vault.wikipedia,
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
  const artist = extraction.artist || lot.artist || '';

  if (!artist.trim()) {
    const wikipedia = {
      status: 'skipped' as const,
      artist: '',
      warnings: ['Artist name is missing; Wikipedia lookup was skipped.'],
      retrieved_at: new Date().toISOString(),
      candidates: [],
    };

    const updatedVault = mergeVault(vault, {
      wikipedia,
      audit: [
        {
          at: new Date().toISOString(),
          action: 'wikipedia.skipped',
          actor: admin.email || admin.id,
          details: { reason: 'missing_artist' },
        },
      ],
    });

    await updateLotById(String(lot.id), { vault: updatedVault });

    return NextResponse.json(
      { success: false, status: 'skipped', wikipedia, warnings: wikipedia.warnings },
      { status: 422 },
    );
  }

  const wikipedia = await findWikipediaArticle(artist, { timeoutMs: 10_000 });

  const updatedVault = mergeVault(vault, {
    wikipedia,
    audit: [
      {
        at: new Date().toISOString(),
        action: 'wikipedia.lookup',
        actor: admin.email || admin.id,
        details: {
          status: wikipedia.status,
          query: wikipedia.query || null,
          title: wikipedia.title || null,
          match_score: wikipedia.match_score ?? null,
        },
      },
    ],
  });

  const saved = await updateLotById(String(lot.id), { vault: updatedVault });

  if (!saved.lot) {
    return NextResponse.json(
      { error: 'Wikipedia result could not be saved in Vault.' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: wikipedia.status === 'found',
    status: wikipedia.status,
    wikipedia,
    warnings: wikipedia.warnings,
  });
}
