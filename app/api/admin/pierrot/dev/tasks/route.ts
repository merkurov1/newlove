import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { getClientIp } from '@/lib/rateLimit';
import { checkPierrotRateLimit } from '@/lib/pierrot/rateLimit';
import { createDevTask, listDevTasks } from '@/lib/pierrot/dev/tasks';
import type { DevTaskInput } from '@/lib/pierrot/dev/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function inputFromBody(body: unknown): DevTaskInput {
  const value =
    body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const stringArray = (key: string): string[] | undefined =>
    Array.isArray(value[key])
      ? (value[key] as unknown[])
          .filter((item): item is string => typeof item === 'string')
          .slice(0, 60)
      : undefined;

  return {
    title: typeof value.title === 'string' ? value.title : '',
    objective: typeof value.objective === 'string' ? value.objective : undefined,
    context: typeof value.context === 'string' ? value.context : undefined,
    repository:
      typeof value.repository === 'string' ? value.repository : undefined,
    baseRef: typeof value.baseRef === 'string' ? value.baseRef : undefined,
    baseCommit:
      typeof value.baseCommit === 'string' ? value.baseCommit : undefined,
    affectedFiles: stringArray('affectedFiles'),
    currentBehavior:
      typeof value.currentBehavior === 'string' ? value.currentBehavior : undefined,
    requiredBehavior:
      typeof value.requiredBehavior === 'string' ? value.requiredBehavior : undefined,
    technicalPlan:
      typeof value.technicalPlan === 'string' ? value.technicalPlan : undefined,
    backendChanges: stringArray('backendChanges'),
    frontendChanges: stringArray('frontendChanges'),
    databaseChanges: stringArray('databaseChanges'),
    mobileChanges: stringArray('mobileChanges'),
    migrations: stringArray('migrations'),
    securityConstraints: stringArray('securityConstraints'),
    tests: stringArray('tests'),
    acceptanceCriteria: stringArray('acceptanceCriteria'),
    unverified: stringArray('unverified'),
    conversationId:
      typeof value.conversationId === 'string' ? value.conversationId : null,
    status: typeof value.status === 'string' ? (value.status as DevTaskInput['status']) : undefined,
  };
}

export async function GET(req: Request) {
  let admin: Awaited<ReturnType<typeof requireAdminFromRequest>>;
  try {
    admin = await requireAdminFromRequest(req);
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }

  const result = await listDevTasks(admin.id, 60);
  return json({
    tasks: result.tasks,
    migrationRequired: result.migrationRequired,
  });
}

export async function POST(req: Request) {
  let admin: Awaited<ReturnType<typeof requireAdminFromRequest>>;
  try {
    admin = await requireAdminFromRequest(req);
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }

  const limited = await checkPierrotRateLimit({
    identifier: `dev-task:${admin.id || getClientIp(req)}`,
    intervalMs: 60 * 1000,
    maxRequests: 20,
    keyPrefix: 'pierrot-dev-task',
  });
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const input = inputFromBody(body);

  if (!input.title.trim() && !input.objective?.trim()) {
    return json({ error: 'Task title or objective is required.' }, 400);
  }

  try {
    const task = await createDevTask(admin.id, input);
    return json({ task }, 201);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'DEV_TASK_FAILED';
    if (code === 'DEV_TASKS_TABLE_MISSING') {
      return json(
        {
          error:
            'Task Studio requires the additive migration 2026-11-18_pierrot_dev_engineering.sql.',
          code,
        },
        503
      );
    }
    console.error('[Pierrot Dev] task create failed', { code });
    return json({ error: 'Unable to create the task.', code }, 500);
  }
}
