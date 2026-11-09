import { assertServerOnly } from '@/lib/serverOnly';
import type {
  DevProjectContext,
  DevProjectContextKey,
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
    // Configuration only: the token itself is read by the repository client.
    configured: Boolean((process.env.GITHUB_TOKEN || '').trim()),
  };
}

const PROJECT_CONTEXTS: DevProjectContext[] = [
  {
    key: 'heart_angel',
    label: 'Heart & Angel',
    repository: 'newlove',
    paths: ['app/heartandangel/', 'components/heartandangel/', 'lib/heartandangel/'],
    description: 'Heart & Angel art project: app routes, components and related modules.',
  },
  {
    key: 'art_engine',
    label: 'Art Engine',
    repository: 'newlove',
    paths: ['app/art-engine/', 'app/lots/', 'lib/art-engine/', 'lib/lots/'],
    description: 'Art Engine and the auction vault: routes, lots and related modules.',
  },
  {
    key: 'pierrot_backend',
    label: 'Pierrot backend',
    repository: 'newlove',
    paths: ['lib/pierrot/', 'app/api/pierrot/', 'app/api/pierrot-web/', 'app/api/admin/pierrot/'],
    description: 'Pierrot backend, owner workspace, Brain integration and API routes.',
  },
  {
    key: 'pierrot_mobile',
    label: 'Pierrot mobile',
    repository: 'pierrot',
    paths: ['pierrot-ios/', 'app/', 'src/'],
    description: 'The separate Expo mobile client for the Pierrot backend.',
  },
  {
    key: 'main_platform',
    label: 'Main platform',
    repository: 'newlove',
    paths: [],
    description: 'The whole newlove platform: site, Supabase, Brain, Flow and Art Engine.',
  },
];

const PROJECT_CONTEXT_ALIASES: Record<DevProjectContextKey, string[]> = {
  heart_angel: ['heart & angel', 'heart and angel', 'heartandangel', 'heartangel', 'сердце и ангел'],
  art_engine: ['art engine', 'art-engine', 'artengine', 'арт引擎', 'арт-движок', 'арт движок', 'лоты', 'vault'],
  pierrot_backend: [
    'pierrot backend',
    'pierrot бэкенд',
    'бэкенд pierrot',
    'pierrot api',
    'pierrot backend api',
    'пирро бэкенд',
  ],
  pierrot_mobile: [
    'pierrot mobile',
    'pierrot ios',
    'expo',
    'мобильный pierrot',
    'пирро мобильный',
    'мобильное приложение',
  ],
  main_platform: ['main platform', 'whole project', 'весь проект', 'основная платформа', 'newlove'],
};

export function getDevProjectContexts(): DevProjectContext[] {
  return PROJECT_CONTEXTS.map((context) => ({ ...context, paths: [...context.paths] }));
}

export function getDevProjectContext(key: DevProjectContextKey): DevProjectContext {
  const context = PROJECT_CONTEXTS.find((entry) => entry.key === key);
  if (!context) throw new Error(`Unknown Dev project context: ${key}`);
  return { ...context, paths: [...context.paths] };
}

/**
 * Resolves a context key, label or common project name. Aliases are matched
 * case-insensitively; overly broad values must not silently select newlove.
 */
export function resolveDevProjectContext(
  value: unknown
): DevProjectContext | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new Error(
      `project context must be one of: ${PROJECT_CONTEXTS.map((entry) => entry.key).join(', ')}.`
    );
  }

  const normalized = value.trim().toLowerCase().replace(/ё/g, 'е');
  if (!normalized) return null;

  const byKey = PROJECT_CONTEXTS.find(
    (entry) => entry.key === normalized.replace(/[\s-]+/g, '_')
  );
  if (byKey) return { ...byKey, paths: [...byKey.paths] };

  const byLabel = PROJECT_CONTEXTS.find((entry) => entry.label.toLowerCase() === normalized);
  if (byLabel) return { ...byLabel, paths: [...byLabel.paths] };

  const byAlias = PROJECT_CONTEXTS.find((entry) =>
    PROJECT_CONTEXT_ALIASES[entry.key].some(
      (alias) => alias.replace(/ё/g, 'е') === normalized
    )
  );
  if (byAlias) return { ...byAlias, paths: [...byAlias.paths] };

  throw new Error(
    `Unknown project context "${value}". Allowed: ${PROJECT_CONTEXTS.map((entry) => entry.key).join(', ')}.`
  );
}

/**
 * Detects a project context from a free-form owner message. Longest aliases are
 * checked first so "pierrot mobile" wins over a generic "pierrot" mention.
 * Returns null when the text is ambiguous or names no project.
 */
export function detectDevProjectContext(message: string): DevProjectContext | null {
  const text = message.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
  const matches: Array<{ context: DevProjectContext; alias: string; index: number }> = [];

  for (const context of PROJECT_CONTEXTS) {
    if (context.key === 'main_platform') continue;
    for (const alias of PROJECT_CONTEXT_ALIASES[context.key]) {
      const needle = alias.replace(/ё/g, 'е');
      const index = text.indexOf(needle);
      if (index >= 0) {
        matches.push({ context, alias: needle, index });
      }
    }
  }

  if (matches.length === 0) return null;
  matches.sort((a, b) => b.alias.length - a.alias.length || a.index - b.index);
  const winner = matches[0];

  // If two non-overlapping projects are named explicitly, the request is
  // ambiguous and must be clarified rather than guessed.
  const distinct = new Set(matches.map((entry) => entry.context.key));
  if (distinct.size > 1) {
    const sameSentenceProject = matches.some(
      (entry) =>
        entry.context.key !== winner.context.key &&
        Math.abs(entry.index - winner.index) < 40
    );
    if (sameSentenceProject) return null;
  }

  return { ...winner.context, paths: [...winner.context.paths] };
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
