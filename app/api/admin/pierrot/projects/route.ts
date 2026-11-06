import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import {
  createPierrotProject,
  getPierrotProjectSnapshot,
  listPierrotProjects,
} from '@/lib/pierrot/projects/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const admin = await requireAdminFromRequest(request);
    const ref = new URL(request.url).searchParams.get('project');
    if (ref) return NextResponse.json({ project: await getPierrotProjectSnapshot(admin.id, ref) });
    return NextResponse.json({ projects: await listPierrotProjects(admin.id) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unauthorized' },
      { status: 401 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdminFromRequest(request);
    const body = await request.json().catch(() => ({}));
    const project = await createPierrotProject(admin.id, body || {});
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Project could not be created';
    return NextResponse.json(
      { error: message },
      { status: message === 'PROJECT_NAME_REQUIRED' ? 400 : 500 }
    );
  }
}
