import { NextResponse } from 'next/server';
import { createPierrotStore } from '@/lib/pierrot/serverStore';
import { resolveMemoryOwner } from '@/lib/pierrot/memory/auth';
import {
  approveSkill,
  createSkillVersion,
  disableSkill,
  getSkill,
  restoreSkillVersion,
  testSkill,
} from '@/lib/pierrot/skills/store';
import type { SkillDefinition } from '@/lib/pierrot/skills/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function definitionFrom(body: Record<string, unknown>): SkillDefinition {
  return (
    body.definition && typeof body.definition === 'object' ? body.definition : body
  ) as SkillDefinition;
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : '';

  if (message === 'skill_not_found' || message === 'skill_version_not_found') {
    return NextResponse.json({ error: 'Skill not found.' }, { status: 404 });
  }

  if (message === 'skill_test_required') {
    return NextResponse.json(
      {
        error: 'A passing control test is required before approval or rollback.',
        code: 'skill_test_required',
      },
      { status: 409 }
    );
  }

  return NextResponse.json(
    { error: 'Skill operation failed.', code: 'skill_operation_failed' },
    { status: 503 }
  );
}

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await resolveMemoryOwner(req);
  if (!userId) {
    return NextResponse.json({ error: 'Owner only.', code: 'owner_only' }, { status: 403 });
  }

  const { id } = await context.params;
  const store = createPierrotStore();
  if (!store) {
    return NextResponse.json(
      { error: 'Skill storage is unavailable.', code: 'skills_unavailable' },
      { status: 503 }
    );
  }

  try {
    const skill = await getSkill(store, userId, id);
    if (!skill) return NextResponse.json({ error: 'Skill not found.' }, { status: 404 });
    return NextResponse.json({ available: true, skill });
  } catch {
    return NextResponse.json(
      { error: 'Skills are unavailable.', code: 'skills_unavailable' },
      { status: 503 }
    );
  }
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await resolveMemoryOwner(req);
  if (!userId) {
    return NextResponse.json({ error: 'Owner only.', code: 'owner_only' }, { status: 403 });
  }

  const { id } = await context.params;
  const store = createPierrotStore();
  if (!store) {
    return NextResponse.json(
      { error: 'Skill storage is unavailable.', code: 'skills_unavailable' },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid skill payload.' }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const action = typeof record.action === 'string' ? record.action : '';
  const versionId = typeof record.versionId === 'string' ? record.versionId : null;

  try {
    if (action === 'version' || action === 'save') {
      const skill = await createSkillVersion(store, userId, id, {
        definition: definitionFrom(record),
        changelog: typeof record.changelog === 'string' ? record.changelog : null,
      });
      return NextResponse.json({ available: true, skill });
    }

    if (action === 'test') {
      const run = await testSkill(store, userId, id, versionId, {
        includeHistorical: record.historical !== false,
        days:
          typeof record.days === 'number' && Number.isFinite(record.days)
            ? Math.min(180, Math.max(7, Math.trunc(record.days)))
            : undefined,
      });
      const skill = await getSkill(store, userId, id);
      return NextResponse.json({ available: true, run, skill });
    }

    if (action === 'approve') {
      const skill = await approveSkill(store, userId, id, versionId);
      return NextResponse.json({ available: true, skill });
    }

    if (action === 'disable') {
      const skill = await disableSkill(store, userId, id);
      return NextResponse.json({ available: true, skill });
    }

    if (action === 'restore') {
      if (!versionId) {
        return NextResponse.json({ error: 'versionId is required.' }, { status: 400 });
      }
      const skill = await restoreSkillVersion(store, userId, id, versionId);
      return NextResponse.json({ available: true, skill });
    }

    return NextResponse.json({ error: 'Unknown skill action.' }, { status: 400 });
  } catch (error) {
    return failure(error);
  }
}
