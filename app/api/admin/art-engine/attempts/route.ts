import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { listRecentAttempts } from '@/lib/lots/db';
import { summarizeAttempt } from '@/lib/art-engine/attempts';

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
  const limit = Number(searchParams.get('limit') || 20);

  try {
    const rows = await listRecentAttempts(limit);
    return NextResponse.json({
      attempts: rows.map((row) => summarizeAttempt(row)),
    });
  } catch (error) {
    console.error('[ArtEngine] list attempts failed:', error);
    return NextResponse.json(
      { error: 'Unable to load parser attempts.' },
      { status: 500 },
    );
  }
}
