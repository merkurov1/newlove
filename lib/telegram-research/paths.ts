import path from 'node:path';

export const DEFAULT_DATA_DIR = path.join('data', 'telegram-research');

export function dataRoot(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.TELEGRAM_RESEARCH_DATA_DIR;
  return configured ? path.resolve(configured) : path.resolve(DEFAULT_DATA_DIR);
}

export function normalizeHandle(value: string): string {
  return value.trim().replace(/^@/, '').toLowerCase();
}

export function slugifyChat(value: string): string {
  const slug = value
    .trim()
    .replace(/^@/, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return slug || 'chat';
}

export interface ChatPaths {
  root: string;
  discovery: string;
  approval: string;
  meta: string;
  state: string;
  corpus: string;
  manifest: string;
  rawDir: string;
  rawPagesDir: string;
  analysisDir: string;
  stats: string;
  deepseekDir: string;
}

export function chatPaths(slug: string, env: NodeJS.ProcessEnv = process.env): ChatPaths {
  const root = path.join(dataRoot(env), slug);
  return {
    root,
    discovery: path.join(root, 'discovery.json'),
    approval: path.join(root, 'approval.json'),
    meta: path.join(root, 'raw', 'meta.json'),
    state: path.join(root, 'export-state.json'),
    corpus: path.join(root, 'corpus.jsonl'),
    manifest: path.join(root, 'manifest.json'),
    rawDir: path.join(root, 'raw'),
    rawPagesDir: path.join(root, 'raw', 'pages'),
    analysisDir: path.join(root, 'analysis'),
    stats: path.join(root, 'analysis', 'stats.json'),
    deepseekDir: path.join(root, 'analysis', 'deepseek'),
  };
}
