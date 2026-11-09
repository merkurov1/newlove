import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { createPierrotStore } from '@/lib/pierrot/serverStore';
import {
  createSession,
  ensureProjectHistory,
  getHistoryById,
} from '@/lib/pierrot/history/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Starts a new episode inside an existing permanent history.
 *
 * This endpoint can never create a history: `historyId` is required unless a
 * project id is supplied, and project histories are resolved by the existing
 * canonical project conversation.
 */
export async function POST(request: Request) {
  let admin: Awaited<ReturnType<typeof requireAdminFromRequest>>;
  try {
    admin = await requireAdminFromRequest(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const historyId = typeof body.historyId === 'string' ? body.historyId : '';
  const projectId = typeof body.projectId === 'string' ? body.projectId : '';
  const title = typeof body.title === 'string' ? body.title.slice(0, 120) : null;

  if (!historyId && !projectId) {
    return NextResponse.json({ error: 'historyId or projectId is required.' }, { status: 400 });
  }
  if (historyId && !/^[A-Za-z0-9_-]{8,64}$/.test(historyId)) {
    return NextResponse.json({ error: 'Invalid history id.' }, { status: 400 });
  }

  const store = createPierrotStore();
  if (!store) {
    return NextResponse.json({ error: 'Storage is unavailable.' }, { status: 503 });
  }

  try {
    const history = historyId
      ? await getHistoryById(store, admin.id, historyId)
      : await ensureProjectHistory(store, admin.id, projectId);

    if (!history) {
      return NextResponse.json({ error: 'History not found.' }, { status: 404 });
    }

    const session = await createSession(store, admin.id, history.id, title);
    if (!session) {
      return NextResponse.json({ error: 'Session was not created.' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      historyId: history.id,
      session: {
        id: session.id,
        title: session.title,
        startedAt: session.startedAt,
        ordinal: session.ordinal,
      },
    });
  } catch (error) {
    console.error(
      '[admin/pierrot/sessions] create failed:',
      error instanceof Error ? error.message : 'unknown'
    );
    return NextResponse.json({ error: 'Session creation failed.' }, { status: 500 });
  }
}
