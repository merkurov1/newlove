import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { listVaultLots } from '@/lib/art-engine/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    await requireAdminFromRequest(req);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get('limit') || 18);

  try {
    const lots = await listVaultLots(limit);
    return NextResponse.json({ lots });
  } catch (error) {
    console.error('[ArtEngine] list vault lots failed:', error);
    return NextResponse.json(
      { error: 'Unable to load the secure vault.' },
      { status: 500 },
    );
  }
}
