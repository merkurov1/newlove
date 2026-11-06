import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { attachDevTaskResult, getDevTask, updateDevTask } from '@/lib/pierrot/dev/tasks';
import type { DevTaskInput, DevTaskStatus, DevVerificationStatus } from '@/lib/pierrot/dev/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function arrayValue(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').slice(0, 60)
    : undefined;
}

function patchFromBody(body: Record<string, unknown>): Partial<DevTaskInput> {
  const patch: Partial<DevTaskInput> = {};
  const stringKeys: Array<keyof DevTaskInput> = [
    'title',
    'objective',
    'context',
    'repository',
    'baseRef',
    'currentBehavior',
    'requiredBehavior',
    'technicalPlan',
  ];
  for (const key of stringKeys) {
    if (typeof body[key] === 'string') {
      (patch as Record<string, unknown>)[key] = body[key];
    }
  }
  if (typeof body.baseCommit === 'string' || body.baseCommit === null) {
    patch.baseCommit = body.baseCommit as string | null;
  }
  if (typeof body.conversationId === 'string' || body.conversationId === null) {
    patch.conversationId = body.conversationId as string | null;
  }
  if (typeof body.projectId === 'string' || body.projectId === null) {
    patch.projectId = body.projectId as string | null;
  }
  if (typeof body.status === 'string') {
    patch.status = body.status as DevTaskStatus;
  }

  for (const key of [
    'affectedFiles',
    'backendChanges',
    'frontendChanges',
    'databaseChanges',
    'mobileChanges',
    'migrations',
    'securityConstraints',
    'tests',
    'acceptanceCriteria',
    'unverified',
    'decisionIds',
  ] as const) {
    const value = arrayValue(body[key]);
    if (value) patch[key] = value;
  }

  return patch;
}

export async function GET(req: Request, context: { params: { id: string } }) {
  let admin: Awaited<ReturnType<typeof requireAdminFromRequest>>;
  try {
    admin = await requireAdminFromRequest(req);
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }

  if (!UUID_PATTERN.test(context.params.id)) {
    return json({ error: 'Invalid task id.' }, 400);
  }

  const task = await getDevTask(admin.id, context.params.id);
  if (!task) return json({ error: 'Task not found.' }, 404);
  return json({ task });
}

export async function PATCH(req: Request, context: { params: { id: string } }) {
  let admin: Awaited<ReturnType<typeof requireAdminFromRequest>>;
  try {
    admin = await requireAdminFromRequest(req);
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }

  if (!UUID_PATTERN.test(context.params.id)) {
    return json({ error: 'Invalid task id.' }, 400);
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return json({ error: 'Invalid JSON body.' }, 400);
  }
  const value = body as Record<string, unknown>;

  try {
    if (value.action === 'attach_result') {
      const task = await attachDevTaskResult({
        userId: admin.id,
        taskId: context.params.id,
        resultCommit: typeof value.resultCommit === 'string' ? value.resultCommit : null,
        pullRequests: arrayValue(value.pullRequests),
        resultNotes: typeof value.resultNotes === 'string' ? value.resultNotes : undefined,
        verificationStatus:
          typeof value.verificationStatus === 'string'
            ? (value.verificationStatus as DevVerificationStatus)
            : undefined,
        verificationNotes:
          typeof value.verificationNotes === 'string' ? value.verificationNotes : undefined,
        status: typeof value.status === 'string' ? (value.status as DevTaskStatus) : undefined,
      });
      if (!task) return json({ error: 'Task not found or update failed.' }, 404);
      return json({ task });
    }

    const task = await updateDevTask(admin.id, context.params.id, patchFromBody(value));
    if (!task) return json({ error: 'Task not found or update failed.' }, 404);
    return json({ task });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'DEV_TASK_UPDATE_FAILED';
    const verificationError = code.startsWith('DEV_');
    return json(
      {
        error: verificationError
          ? 'Задача не может быть помечена проверенной без acceptance criteria, тестов/ручной проверки и подтверждённого результата.'
          : 'Unable to update the task.',
        code,
      },
      verificationError ? 409 : 500
    );
  }
}
