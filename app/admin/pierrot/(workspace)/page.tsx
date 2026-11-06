import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/serverAuth';
import {
  loadOwnerConversation,
  loadOwnerConversations,
  loadWorkspaceOverview,
} from '@/lib/pierrot/workspace/data';
import { buildOverviewSummary } from '@/lib/pierrot/workspace/status';
import type { WorkspaceOverview } from '@/lib/pierrot/workspace/types';
import { emptyCommercialSummary } from '@/lib/pierrot/commercialSummary';
import { createPierrotStore } from '@/lib/pierrot/serverStore';
import { loadBrainStatus } from '@/lib/pierrot/memory/brainStatus';
import type { BrainStatusSnapshot } from '@/lib/pierrot/memory/brainStatusTypes';
import {
  overviewCookieName,
  parseOverviewCache,
} from '@/lib/pierrot/workspace/cache';
import ChatWorkspace from '@/components/pierrot/workspace/ChatWorkspace';
import {
  getPierrotProject,
  getPierrotProjectForConversation,
} from '@/lib/pierrot/projects/store';

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

export default async function ChatPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const user = await requireAdmin();
  const params = searchParams || {};
  const rawConversation = Array.isArray(params.conversation)
    ? params.conversation[0]
    : params.conversation;
  const startNew = (Array.isArray(params.new) ? params.new[0] : params.new) === '1';
  const projectRef = Array.isArray(params.project) ? params.project[0] : params.project;

  const [conversations, conversation, explicitProject] = await Promise.all([
    loadOwnerConversations(user.id),
    rawConversation ? loadOwnerConversation(user.id, rawConversation) : Promise.resolve(null),
    projectRef ? getPierrotProject(user.id, projectRef) : Promise.resolve(null),
  ]);

  if (rawConversation && !conversation) {
    redirect('/admin/pierrot');
  }

  const project = explicitProject ||
    (conversation ? await getPierrotProjectForConversation(user.id, conversation.id) : null);

  // The five metrics and the commercial report are only rendered by the empty
  // state. Do not spend owner-data queries on a transcript that is already open.
  const needsOverview = startNew || !conversation || conversation.messages.length === 0;

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
          cachedOverview
            ? { ...cachedOverview.overview, stale: true }
            : unavailableOverview()
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
      key={conversation?.id || 'new'}
      ownerId={user.id}
      overview={overview}
      conversations={conversations}
      conversation={conversation}
      startNew={startNew}
      brainStatus={brainStatus}
      project={project}
    />
  );
}
