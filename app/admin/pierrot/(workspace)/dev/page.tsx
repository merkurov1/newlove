import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/serverAuth';
import { getDevIntegrationStatus } from '@/lib/pierrot/dev/config';
import { getDevRepositoryConfigs } from '@/lib/pierrot/dev/repositories';
import { getProjectMemory } from '@/lib/pierrot/dev/memory';
import { isDevRequestStoreAvailable } from '@/lib/pierrot/dev/requests';
import { listDevTasks } from '@/lib/pierrot/dev/tasks';
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

  const [list, conversation, integration, taskList, requestStoreAvailable] =
    await Promise.all([
      loadDevConversations(user.id),
      rawConversation ? loadDevConversation(user.id, rawConversation) : Promise.resolve(null),
      getDevIntegrationStatus(),
      listDevTasks(user.id, 40),
      isDevRequestStoreAvailable(),
    ]);

  if (rawConversation && !conversation) {
    redirect('/admin/pierrot/dev');
  }

  const memory = getProjectMemory({
    repositories: integration.repositories,
    configs: getDevRepositoryConfigs(),
  });

  return (
    <DevWorkspace
      key={conversation?.id || 'new'}
      conversations={list.conversations}
      conversation={conversation}
      integration={integration}
      migrationRequired={list.migrationRequired}
      tasks={taskList.tasks}
      taskMigrationRequired={taskList.migrationRequired}
      requestStoreAvailable={requestStoreAvailable}
      memory={memory}
    />
  );
}
