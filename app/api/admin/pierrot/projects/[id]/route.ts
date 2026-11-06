import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { linkConversationToProject, updatePierrotProject } from '@/lib/pierrot/projects/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdminFromRequest(request);
    const body = await request.json().catch(() => ({}));
    if (body.action === 'link_conversation' && typeof body.conversationId === 'string') {
      await linkConversationToProject(admin.id, params.id, body.conversationId);
      return NextResponse.json({ ok: true });
    }
    const project = await updatePierrotProject(admin.id, params.id, body || {});
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    return NextResponse.json({ project });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Project update failed' },
      { status: 400 }
    );
  }
}
