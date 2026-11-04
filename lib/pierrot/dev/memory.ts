import { assertServerOnly } from '@/lib/serverOnly';
import type {
  DevMemoryEntry,
  DevRepositoryConfig,
  DevRepositoryStatus,
} from './types';

assertServerOnly('lib/pierrot/dev/memory');

type MemorySeed = Omit<DevMemoryEntry, 'commitSha'>;

/**
 * Compact, curated engineering memory.
 *
 * It is intentionally small and human-reviewable. There is no automatic
 * indexing, cron job or background worker. Each entry names its source and
 * whether the claim is current. Commit SHAs are attached from the on-demand
 * repository status, so stale claims are visible instead of silently trusted.
 */
const MEMORY_SEEDS: MemorySeed[] = [
  {
    id: 'dev-isolation',
    title: 'Dev Mode isolation',
    area: 'Pierrot Dev',
    repository: 'newlove',
    source: 'lib/pierrot/dev/store.ts, migrations/2026-11-17_pierrot_dev_mode.sql',
    updatedAt: '2026-11-04',
    status: 'current',
    content:
      'Dev threads use pierrot_conversations/pierrot_messages with mode=dev. They are owner-scoped, server-only and never used for RAG or the normal owner chat list.',
  },
  {
    id: 'owner-workspace',
    title: 'Owner Workspace routes',
    area: 'UI',
    repository: 'newlove',
    source: 'lib/pierrot/workspace/navigation.ts, app/admin/pierrot/(workspace)',
    updatedAt: '2026-11-04',
    status: 'current',
    content:
      'The PWA has five routes: CHAT /admin/pierrot, FLOW /flow, BRAIN /brain, DASH /dash, DEV /dev. The rail becomes a bottom tab bar on small screens.',
  },
  {
    id: 'supabase-private-tables',
    title: 'Pierrot private data model',
    area: 'Supabase',
    repository: 'newlove',
    source: 'migrations/2026-10-29_create_pierrot_conversations.sql',
    updatedAt: '2026-11-04',
    status: 'current',
    content:
      'pierrot_conversations, pierrot_messages and pierrot_events have RLS enabled, no anon/authenticated policies, and service_role-only access. The API uses the service role server-side.',
  },
  {
    id: 'dev-prompts-table',
    title: 'Task Studio storage',
    area: 'Supabase',
    repository: 'newlove',
    source: 'production schema + migrations/2026-11-18_pierrot_dev_engineering.sql',
    updatedAt: '2026-11-04',
    status: 'current',
    content:
      'pierrot_dev_prompts exists in production and was unused. Dev Mode reads and writes it through server-only routes. The additive migration extends it for structured tasks and request traces.',
  },
  {
    id: 'github-auth',
    title: 'GitHub access boundary',
    area: 'GitHub',
    repository: 'newlove',
    source: 'lib/github.ts, lib/pierrot/dev/repository.ts',
    updatedAt: '2026-11-04',
    status: 'current',
    content:
      'A single server-side GITHUB_TOKEN is used for both repositories. Tokens never reach the client or database. Dev Mode is read-only by default and exposes no write tools to the model.',
  },
  {
    id: 'provider-fallback',
    title: 'LLM provider fallback',
    area: 'LLM',
    repository: 'newlove',
    source: 'lib/pierrot/dev/llm.ts',
    updatedAt: '2026-11-04',
    status: 'current',
    content:
      'DeepSeek direct is primary and OpenRouter is fallback. Fallback is allowed only before a side effect. Dev Mode has a global deadline, per-tool timeout, tool-call cap and request statuses.',
  },
  {
    id: 'technical-debt-schema-drift',
    title: 'Migration drift',
    area: 'Technical debt',
    repository: 'newlove',
    source: 'migrations/, production PostgREST schema',
    updatedAt: '2026-11-04',
    status: 'current',
    content:
      'Production contained columns and pierrot_dev_prompts without a matching repository migration. The new additive migration documents the expected schema; it must be applied manually and reconciled with production before future changes.',
  },
  {
    id: 'mobile-repository',
    title: 'Separate mobile repository',
    area: 'Repositories',
    repository: 'pierrot',
    source: 'GitHub repository merkurov1/Pierrot',
    updatedAt: '2026-11-04',
    status: 'current',
    content:
      'merkurov1/Pierrot is a separate Expo client. Backend chat, Brain, RAG, workers and provider credentials belong to newlove unless the Pierrot source proves otherwise.',
  },
];

export function getProjectMemory(input: {
  repositories: DevRepositoryStatus[];
  configs?: DevRepositoryConfig[];
}): DevMemoryEntry[] {
  const commits = new Map<string, string | null>();
  for (const repo of input.repositories) commits.set(repo.key, repo.lastCommitSha);
  for (const config of input.configs || []) {
    if (!commits.has(config.key)) commits.set(config.key, null);
  }

  return MEMORY_SEEDS.map((seed) => ({
    ...seed,
    commitSha: commits.get(seed.repository) || null,
  }));
}

export function getMemoryForRepository(
  entries: DevMemoryEntry[],
  repository: string
): DevMemoryEntry[] {
  return entries.filter((entry) => entry.repository === repository);
}
