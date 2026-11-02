/**
 * Server-only configuration for autonomous web evidence. The API key is read
 * from the process environment and is never imported by a client component.
 */

export type WebSearchEnvironment = Record<string, string | undefined>;

export const EXA_SEARCH_ENDPOINT = 'https://api.exa.ai/search';

export const WEB_SEARCH_DEFAULT_NUM_RESULTS = 5;
export const WEB_SEARCH_MAX_NUM_RESULTS = 6;
export const WEB_SEARCH_DEFAULT_TIMEOUT_MS = 6_000;
export const WEB_SEARCH_MAX_TIMEOUT_MS = 10_000;
export const WEB_SEARCH_MAX_QUERY_CHARS = 500;
export const WEB_SEARCH_MAX_TEXT_CHARS = 2_000;
export const WEB_SEARCH_TOTAL_TEXT_CHARS = 6_000;
export const WEB_SEARCH_EXCERPT_CHARS = 280;
export const WEB_SEARCH_PROMPT_BUDGET_CHARS = 9_000;

/**
 * Explicit opt-in. Web search is disabled unless the deployment sets the flag
 * to "true" and provides EXA_API_KEY. A missing key is a normal, non-fatal
 * state: chat continues with model knowledge and Brain only.
 */
export function isPierrotWebSearchEnabled(env: WebSearchEnvironment = process.env): boolean {
  return (env.PIERROT_WEB_SEARCH_ENABLED || '').trim().toLowerCase() === 'true';
}

export function getExaApiKey(env: WebSearchEnvironment = process.env): string | null {
  const key = (env.EXA_API_KEY || '').trim();
  return key || null;
}

export function isWebSearchConfigured(env: WebSearchEnvironment = process.env): boolean {
  return isPierrotWebSearchEnabled(env) && Boolean(getExaApiKey(env));
}

export function resolveWebSearchTimeoutMs(env: WebSearchEnvironment = process.env): number {
  const raw = (env.PIERROT_WEB_SEARCH_TIMEOUT_MS || '').trim();

  if (!raw) return WEB_SEARCH_DEFAULT_TIMEOUT_MS;

  const value = Number(raw);

  if (!Number.isFinite(value) || value < 1_000) return WEB_SEARCH_DEFAULT_TIMEOUT_MS;

  return Math.min(Math.trunc(value), WEB_SEARCH_MAX_TIMEOUT_MS);
}

export function resolveWebSearchNumResults(env: WebSearchEnvironment = process.env): number {
  const raw = (env.PIERROT_WEB_SEARCH_MAX_RESULTS || '').trim();

  if (!raw) return WEB_SEARCH_DEFAULT_NUM_RESULTS;

  const value = Number(raw);

  if (!Number.isFinite(value) || value < 1) return WEB_SEARCH_DEFAULT_NUM_RESULTS;

  return Math.min(Math.trunc(value), WEB_SEARCH_MAX_NUM_RESULTS);
}
