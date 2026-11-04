import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/serverAuth';
import { getDevIntegrationStatus } from '@/lib/pierrot/dev/config';
import {
  loadDevConversation,
  loadDevConversations,
} from '@/lib/pierrot/dev/store';
import DevWorkspace from '@/components/pierrot/workspace/DevWorkspace';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'DEV',
};

export default async function DevPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const user = await requireAdmin();
  const rawConversation = Array.isArray(searchParams?.conversation)
    ? searchParams?.conversation[0]
    : searchParams?.conversation;

  const [list, conversation, integration] = await Promise.all([
    loadDevConversations(user.id),
    rawConversation ? loadDevConversation(user.id, rawConversation) : Promise.resolve(null),
    getDevIntegrationStatus(),
  ]);

  if (rawConversation && !conversation) {
    redirect('/admin/pierrot/dev');
  }

  return (
    <DevWorkspace
      key={conversation?.id || 'new'}
      conversations={list.conversations}
      conversation={conversation}
      integration={integration}
      migrationRequired={list.migrationRequired}
    />
  );
}
