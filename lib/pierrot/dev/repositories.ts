import { assertServerOnly } from '@/lib/serverOnly';
import { getGitHubToken } from '@/lib/github';
import type {
  DevRepositoryConfig,
  DevRepositoryKey,
} from './types';

assertServerOnly('lib/pierrot/dev/repositories');

const DEFAULT_OWNER = 'merkurov1';
const REPOSITORY_DEFINITIONS: Array<{
  key: DevRepositoryKey;
  label: string;
  repo: string;
  description: string;
}> = [
  {
    key: 'newlove',
    label: 'newlove',
    repo: 'newlove',
    description: 'Next.js platform, Pierrot backend, Supabase, Brain, Flow.',
  },
  {
    key: 'pierrot',
    label: 'Pierrot',
    repo: 'Pierrot',
    description: 'Separate Expo mobile client for the Pierrot backend.',
  },
];

function envValue(name: string): string | null {
  const value = (process.env[name] || '').trim();
  return value || null;
}

function splitFullName(value: string | null): { owner: string; repo: string } | null {
  if (!value) return null;
  const [owner, repo] = value.split('/');
  if (!owner?.trim() || !repo?.trim()) return null;
  return { owner: owner.trim(), repo: repo.trim() };
}

function repositoryConfig(definition: (typeof REPOSITORY_DEFINITIONS)[number]): DevRepositoryConfig {
  const prefix = definition.key.toUpperCase();
  const override =
    envValue(`PIERROT_DEV_REPO_${prefix}`) ||
    (definition.key === 'newlove' ? envValue('PIERROT_GITHUB_REPO') : null);
  const split = splitFullName(override);
  const owner =
    split?.owner ||
    envValue(`PIERROT_DEV_OWNER_${prefix}`) ||
    envValue('GITHUB_OWNER') ||
    DEFAULT_OWNER;
  const repo = split?.repo || definition.repo;
  const defaultBranch =
    envValue(`PIERROT_DEV_DEFAULT_BRANCH_${prefix}`) ||
    envValue('GITHUB_DEFAULT_BRANCH') ||
    'main';
  const workBranch =
    envValue(`PIERROT_DEV_BRANCH_${prefix}`) || defaultBranch;

  return {
    key: definition.key,
    label: definition.label,
    owner,
    repo,
    fullName: `${owner}/${repo}`,
    defaultBranch,
    workBranch,
    description: definition.description,
    configured: Boolean(getGitHubToken()),
  };
}

export function getDevRepositoryConfigs(): DevRepositoryConfig[] {
  return REPOSITORY_DEFINITIONS.map(repositoryConfig);
}

export function getDevRepositoryConfig(key: DevRepositoryKey): DevRepositoryConfig {
  const config = getDevRepositoryConfigs().find((entry) => entry.key === key);
  if (!config) throw new Error(`Unknown Dev repository: ${key}`);
  return config;
}

/**
 * Accepts a short key, a full owner/repo name or an untrusted tool argument.
 * Ambiguous values are rejected instead of silently falling back to newlove.
 */
export function resolveDevRepository(
  value: unknown,
  fallback: DevRepositoryKey = 'newlove'
): DevRepositoryConfig {
  const configs = getDevRepositoryConfigs();

  if (value === undefined || value === null || value === '') {
    return getDevRepositoryConfig(fallback);
  }

  if (typeof value !== 'string') {
    throw new Error('repository must be "newlove" or "pierrot".');
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) return getDevRepositoryConfig(fallback);

  const byKey = configs.find((entry) => entry.key === normalized);
  if (byKey) return byKey;

  const byFullName = configs.find((entry) => entry.fullName.toLowerCase() === normalized);
  if (byFullName) return byFullName;

  throw new Error(
    `Unknown repository "${value}". Allowed: ${configs.map((entry) => entry.key).join(', ')}.`
  );
}

export function isDevRepositoryKey(value: unknown): value is DevRepositoryKey {
  return value === 'newlove' || value === 'pierrot';
}
