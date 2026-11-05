import { NextResponse } from 'next/server';
import { createPierrotStore } from '@/lib/pierrot/serverStore';
import { resolveMemoryOwner } from '@/lib/pierrot/memory/auth';
import { suggestSkillDraft } from '@/lib/pierrot/skills/suggest';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const userId = await resolveMemoryOwner(req);
  if (!userId) {
    return NextResponse.json({ error: 'Owner only.', code: 'owner_only' }, { status: 403 });
  }

  const store = createPierrotStore();
  if (!store) {
    return NextResponse.json(
      { available: false, suggestion: null, reason: 'storage_unavailable' },
      { status: 503 }
    );
  }

  try {
    // Detection only. It never creates or approves a skill.
    const result = await suggestSkillDraft(store, userId);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { available: false, suggestion: null, reason: 'suggestion_failed' },
      { status: 503 }
    );
  }
}
