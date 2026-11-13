import { NextResponse } from 'next/server';
import { getServerSupabaseClient, requireAdminFromRequest } from '@/lib/serverAuth';
import { syncUnframedProjectKnowledge } from '@/lib/pierrot/editorial/projectSync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Owner-only, additive repair of the UNFRAMED project relations. It links only
 * verified manuscript/episode/blueprint documents and regenerates the project
 * brief from recorded sources. No document, chunk or source file is deleted.
 */
export async function POST(request: Request) {
  try {
    const admin = await requireAdminFromRequest(request);
    const result = await syncUnframedProjectKnowledge({
      ownerUserId: admin.id,
      store: getServerSupabaseClient({ useServiceRole: true }),
      applyBrief: true,
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Project sync failed';
    return NextResponse.json(
      { error: message, code: 'project_sync_failed' },
      { status: message === 'Unauthorized' ? 401 : 500 }
    );
  }
}
