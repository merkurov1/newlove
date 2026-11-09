import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isCronAuthorized } from '@/lib/knowledge/brain/cronAuth';
import { beginWorkerInvocation } from '@/lib/operations/guard';
import { loadWorkspaceHealth, prepareWorkspaceAudit } from '@/lib/pierrot/grooming/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

async function handle(request: Request) {
  if (!isCronAuthorized(request)) return json({ error: 'Unauthorized' }, 401);

  const guard = await beginWorkerInvocation({
    scope: 'grooming',
    trigger: 'cron',
    workerId: `pierrot-workspace-health-${Date.now().toString(36)}`,
    maxDurationMs: 55_000,
  });
  if (!guard.ok) return json({ status: 'skipped', reason: guard.reason }, 200);

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return json({ error: 'Storage is not configured.' }, 503);

    const store = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });

    const [conversationOwners, projectOwners] = await Promise.all([
      store
        .from('pierrot_conversations')
        .select('user_id')
        .eq('identity_type', 'owner')
        .not('user_id', 'is', null)
        .limit(200),
      store
        .from('pierrot_projects')
        .select('owner_user_id')
        .limit(200),
    ]);

    const ownerIds = Array.from(
      new Set(
        [
          ...(Array.isArray(conversationOwners.data) ? conversationOwners.data : []).map((row) =>
            typeof row.user_id === 'string' ? row.user_id : ''
          ),
          ...(Array.isArray(projectOwners.data) ? projectOwners.data : []).map((row) =>
            typeof row.owner_user_id === 'string' ? row.owner_user_id : ''
          ),
        ].filter(Boolean)
      )
    ).slice(0, 10);

    const prepareAudits =
      (process.env.PIERROT_WORKSPACE_HEALTH_PREPARE_AUDITS || '').toLowerCase() === 'true';
    const results: Array<Record<string, unknown>> = [];
    const day = new Date().toISOString().slice(0, 10);

    for (const userId of ownerIds) {
      if (guard.remainingMs() < 5_000) break;
      try {
        const { health, snapshotWarnings } = await loadWorkspaceHealth({ store, userId });
        let preparedAuditId: string | null = null;

        if (prepareAudits) {
          const conversation = await store
            .from('pierrot_conversations')
            .select('id')
            .eq('user_id', userId)
            .eq('identity_type', 'owner')
            .eq('mode', 'site')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          const conversationId =
            conversation.data && typeof conversation.data.id === 'string'
              ? conversation.data.id
              : null;
          if (conversationId) {
            const prepared = await prepareWorkspaceAudit({
              store,
              userId,
              conversationId,
              requestMessageId: `grooming-health:${day}`,
              scope: 'all',
              projectId: null,
              language: 'ru',
            });
            preparedAuditId = prepared.audit.id;
          }
        }

        results.push({
          userId,
          attentionProjects: health.attentionProjects,
          blockedProjects: health.blockedProjects,
          githubErrors: health.githubErrors,
          staleTasks: health.staleTasks,
          warnings: snapshotWarnings.slice(0, 5),
          preparedAuditId,
        });
      } catch (error) {
        results.push({
          userId,
          error: error instanceof Error ? error.message.slice(0, 300) : 'health_failed',
        });
      }
    }

    const failed = results.filter((result) => 'error' in result).length;
    await guard.finish({
      status: failed > 0 ? 'completed_with_errors' : 'completed',
      processed: results.length - failed,
      failed,
    });

    return json({
      status: 'ok',
      owners: ownerIds.length,
      prepareAudits,
      results,
      ranAt: new Date().toISOString(),
    });
  } catch {
    await guard.finish({ status: 'failed', errorCode: 'WORKSPACE_HEALTH_FAILED' });
    return json({ error: 'Workspace health failed.' }, 503);
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
