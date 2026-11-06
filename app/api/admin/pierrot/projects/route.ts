import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import {
  createPierrotProject,
  getPierrotProjectSnapshot,
  listPierrotProjects,
  PierrotProjectValidationError,
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
    const message = error instanceof Error ? error.message : 'Project lookup failed';
    return NextResponse.json(
      { error: message },
      { status: message === 'Unauthorized' ? 401 : 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdminFromRequest(request);
    const body = await request.json().catch(() => ({}));
    const project = await createPierrotProject(admin.id, {
      name: body?.name,
      description: body?.description,
      objective: body?.objective,
      projectBrief: body?.projectBrief,
    });
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Project could not be created';
    const validation = error instanceof PierrotProjectValidationError;
    const duplicate = /duplicate|unique/i.test(message);
    return NextResponse.json(
      { error: validation ? validationCopy(error.code) : duplicate ? 'Проект с таким именем уже существует.' : message },
      { status: validation || duplicate ? 400 : message === 'Unauthorized' ? 401 : 500 }
    );
  }
}

function validationCopy(code: PierrotProjectValidationError['code']): string {
  if (code === 'PROJECT_NAME_REQUIRED') return 'Введите название проекта.';
  if (code === 'PROJECT_NAME_TOO_LONG') return 'Название проекта слишком длинное.';
  if (code === 'PROJECT_EXISTS') return 'Проект с таким названием уже существует.';
  return 'Бриф проекта слишком длинный.';
}
