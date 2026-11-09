import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { createPierrotStore } from '@/lib/pierrot/serverStore';
import { loadWorkspaceHealth } from '@/lib/pierrot/grooming/service';
import { isGroomingStorageUnavailable, listRecentOperations } from '@/lib/pierrot/grooming/store';
import { formatWorkspaceHealth } from '@/lib/pierrot/grooming/format';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const admin = await requireAdminFromRequest(request);
    const store = createPierrotStore();
    if (!store) {
      return NextResponse.json({ error: 'Storage is unavailable.' }, { status: 503 });
    }

    const [{ health, snapshotWarnings }, operations] = await Promise.all([
      loadWorkspaceHealth({ store, userId: admin.id }),
      listRecentOperations(store, admin.id, 10).catch(() => []),
    ]);

    return NextResponse.json({
      health,
      summary: formatWorkspaceHealth(health),
      warnings: snapshotWarnings,
      recentOperations: operations.map((operation) => ({
        id: operation.id,
        operation: operation.operation,
        entityType: operation.entity_type,
        entityId: operation.entity_id,
        result: operation.result,
        errorDetails: operation.error_details,
        createdAt: operation.created_at,
      })),
    });
  } catch (error) {
    if (isGroomingStorageUnavailable(error)) {
      return NextResponse.json(
        {
          error: 'Grooming migration is required.',
          code: 'GROOMING_MIGRATION_REQUIRED',
        },
        { status: 503 }
      );
    }
    const message = error instanceof Error ? error.message : 'Workspace health failed';
    return NextResponse.json(
      { error: message },
      { status: message === 'Unauthorized' ? 401 : 500 }
    );
  }
}
