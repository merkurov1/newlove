import type { Metadata } from 'next';
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
import ChatWorkspace from '@/components/pierrot/workspace/ChatWorkspace';

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

  const [conversations, conversation] = await Promise.all([
    loadOwnerConversations(user.id),
    rawConversation ? loadOwnerConversation(user.id, rawConversation) : Promise.resolve(null),
  ]);

  if (rawConversation && !conversation) {
    redirect('/admin/pierrot');
  }

  // The five metrics and the commercial report are only rendered by the empty
  // state. Do not spend owner-data queries on a transcript that is already open.
  const needsOverview = startNew || !conversation || conversation.messages.length === 0;
  const overview = needsOverview
    ? await loadWorkspaceOverview(7).catch(() => unavailableOverview())
    : unavailableOverview();

  return (
    <ChatWorkspace
      key={conversation?.id || 'new'}
      overview={overview}
      conversations={conversations}
      conversation={conversation}
      startNew={startNew}
    />
  );
}
