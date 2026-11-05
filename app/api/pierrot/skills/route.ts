import { NextResponse } from 'next/server';
import { createPierrotStore } from '@/lib/pierrot/serverStore';
import { resolveMemoryOwner } from '@/lib/pierrot/memory/auth';
import { createSkillDraft, getSkill, listSkills } from '@/lib/pierrot/skills/store';
import { SKILL_STATUSES, type SkillDefinition, type SkillStatus } from '@/lib/pierrot/skills/types';

export const dynamic = 'force-dynamic';

function parseStatus(value: string | null): SkillStatus | null {
  return value && (SKILL_STATUSES as readonly string[]).includes(value)
    ? (value as SkillStatus)
    : null;
}

function definitionFrom(body: Record<string, unknown>): SkillDefinition {
  return (
    body.definition && typeof body.definition === 'object' ? body.definition : body
  ) as SkillDefinition;
}

export async function GET(req: Request) {
  const userId = await resolveMemoryOwner(req);
  if (!userId) {
    return NextResponse.json({ error: 'Owner only.', code: 'owner_only' }, { status: 403 });
  }

  const store = createPierrotStore();
  if (!store) {
    return NextResponse.json(
      { error: 'Skill storage is unavailable.', code: 'skills_unavailable' },
      { status: 503 }
    );
  }

  const url = new URL(req.url);

  try {
    const id = url.searchParams.get('id');
    if (id) {
      const skill = await getSkill(store, userId, id);
      if (!skill) return NextResponse.json({ error: 'Skill not found.' }, { status: 404 });
      return NextResponse.json({ available: true, skill });
    }

    const skills = await listSkills(store, userId, {
      query: url.searchParams.get('q'),
      status: parseStatus(url.searchParams.get('status')),
    });

    return NextResponse.json({ available: true, skills });
  } catch {
    return NextResponse.json(
      { error: 'Skills are unavailable.', code: 'skills_unavailable' },
      { status: 503 }
    );
  }
}

export async function POST(req: Request) {
  const userId = await resolveMemoryOwner(req);
  if (!userId) {
    return NextResponse.json({ error: 'Owner only.', code: 'owner_only' }, { status: 403 });
  }

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

  try {
    const skill = await createSkillDraft(store, userId, {
      definition: definitionFrom(record),
      changelog: typeof record.changelog === 'string' ? record.changelog : null,
      ...(typeof record.slug === 'string' ? { slug: record.slug } : {}),
    });

    return NextResponse.json({ available: true, skill }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: 'Skill draft could not be created.', code: 'skill_write_failed' },
      { status: 503 }
    );
  }
}
