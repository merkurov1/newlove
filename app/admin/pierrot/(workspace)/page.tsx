import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/serverAuth';
import { loadOwnerHistoryView, loadWorkspaceOverview } from '@/lib/pierrot/workspace/data';
import { buildOverviewSummary } from '@/lib/pierrot/workspace/status';
import type { WorkspaceOverview } from '@/lib/pierrot/workspace/types';
import { emptyCommercialSummary } from '@/lib/pierrot/commercialSummary';
import { createPierrotStore } from '@/lib/pierrot/serverStore';
import { loadBrainStatus } from '@/lib/pierrot/memory/brainStatus';
import type { BrainStatusSnapshot } from '@/lib/pierrot/memory/brainStatusTypes';
import { overviewCookieName, parseOverviewCache } from '@/lib/pierrot/workspace/cache';
import ChatWorkspace from '@/components/pierrot/workspace/ChatWorkspace';
import { getPierrotProject } from '@/lib/pierrot/projects/store';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'CHAT',
};

function unavailableOverview(): WorkspaceOverview {
  const metrics = [
    ['users', 'Пользователи'],
    ['subscribers', 'Подписчики'],
    ['flow', 'Flow'],
    ['conversations', 'Диалоги'],
    ['media', 'Медиа'],
  ].map(([key, label]) => ({
    key: key as WorkspaceOverview['metrics'][number]['key'],
    label,
    current: 0,
    periodCount: 0,
    previousCount: 0,
    state: null,
    series: null,
    available: false,
  }));

  return {
    period: 7,
    from: new Date().toISOString(),
    to: new Date().toISOString(),
    metrics,
    commercial: emptyCommercialSummary('last_7_days', new Date()),
    summary: buildOverviewSummary(metrics),
    generatedAt: new Date().toISOString(),
    stale: true,
  };
}

function param(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) || '';
}

export default async function ChatPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const user = await requireAdmin();
  const params = searchParams || {};
  const requestedHistory = param(params.history);
  const requestedSession = param(params.session);
  const rawConversation = param(params.conversation);
  const projectRef = param(params.project);
  const requestedNew = param(params.new) === '1';

  // Old conversation URLs and legacy project links resolve to the permanent
  // history/session URL. The browser never opens a legacy conversation as an
  // independent chat again.
  if (rawConversation && !requestedHistory) {
    const legacyView = await loadOwnerHistoryView(user.id, {
      conversationId: rawConversation,
      createSession: false,
    });
    if (!legacyView) redirect('/admin/pierrot');
    const target = `/admin/pierrot?history=${encodeURIComponent(legacyView.scope.history.id)}${
      legacyView.scope.session ? `&session=${encodeURIComponent(legacyView.scope.session.id)}` : ''
    }`;
    redirect(target);
  }

  if (projectRef && !requestedHistory) {
    const project = await getPierrotProject(user.id, projectRef);
    if (!project) redirect('/admin/pierrot');
    const projectView = await loadOwnerHistoryView(user.id, {
      projectId: project.id,
      createSession: false,
    });
    if (!projectView) redirect('/admin/pierrot');
    redirect(`/admin/pierrot?history=${encodeURIComponent(projectView.scope.history.id)}`);
  }

  let view = await loadOwnerHistoryView(user.id, {
    historyId: requestedHistory || null,
    sessionId: requestedSession || null,
    createSession: false,
  });

  // A completely empty owner account still opens MAIN; the helper creates the
  // permanent history but not a session until the first message or explicit
  // “New chat”.
  if (!view) {
    view = await loadOwnerHistoryView(user.id, { createSession: true });
  }
  if (!view) redirect('/admin/pierrot');

  const canonicalTarget = `/admin/pierrot?history=${encodeURIComponent(view.scope.history.id)}${
    view.conversation.currentSessionId
      ? `&session=${encodeURIComponent(view.conversation.currentSessionId)}`
      : ''
  }`;
  if (requestedHistory && requestedHistory !== view.scope.history.id) {
    redirect(canonicalTarget);
  }

  const conversation = view.conversation;
  const project = view.project;

  // The five metrics and the commercial report are only rendered by the empty
  // state. Do not spend owner-data queries on a transcript that is already open.
  const needsOverview =
    requestedNew ||
    !conversation ||
    conversation.messages.length === 0 ||
    conversation.emptyCurrentSession === true;

  let cachedOverview: ReturnType<typeof parseOverviewCache> = null;
  if (needsOverview) {
    const raw = cookies().get(overviewCookieName(user.id))?.value;
    if (raw) {
      cachedOverview = parseOverviewCache(raw, user.id);
      if (!cachedOverview) {
        try {
          cachedOverview = parseOverviewCache(decodeURIComponent(raw), user.id);
        } catch {
          // Malformed cookie values are rejected by both parse attempts.
        }
      }
    }
  }

  const overviewPromise = !needsOverview
    ? Promise.resolve(unavailableOverview())
    : cachedOverview && !cachedOverview.stale
      ? Promise.resolve({ ...cachedOverview.overview, stale: false })
      : loadWorkspaceOverview(7).catch(() =>
          cachedOverview ? { ...cachedOverview.overview, stale: true } : unavailableOverview()
        );

  const [overview, brainStatus] = await Promise.all([
    overviewPromise,
    needsOverview
      ? loadBrainStatus(createPierrotStore(), user.id, { detailed: false }).catch(
          (): BrainStatusSnapshot | null => null
        )
      : Promise.resolve(null),
  ]);

  return (
    <ChatWorkspace
      ownerId={user.id}
      overview={overview}
      sessions={view.sessions}
      conversation={conversation}
      startNew={requestedNew}
      brainStatus={brainStatus}
      project={project}
    />
  );
}
