import { assertServerOnly } from '@/lib/serverOnly';
import type { DevReleaseSmokeResult } from './types';

assertServerOnly('lib/pierrot/dev/workbench/smokeTests');

/**
 * Live production smoke tests.
 *
 * These run against the production alias or, when no alias is configured, the
 * exact promoted deployment URL. They are intentionally unauthenticated and
 * read-only: a release must never create data, send email or use owner content.
 */

const DEFAULT_PATHS = ['/api/health', '/'];
const REQUEST_TIMEOUT_MS = 15_000;

export function releaseSmokePaths(): string[] {
  const configured = (process.env.PIERROT_RELEASE_SMOKE_PATHS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const paths = configured.length > 0 ? configured : DEFAULT_PATHS;
  return paths
    .map((value) => (value.startsWith('/') ? value : `/${value}`))
    .filter((value) => !/[\r\n]/.test(value))
    .slice(0, 5);
}

export function resolveProductionSmokeBaseUrl(deploymentUrl: string | null): string | null {
  const configured = (
    process.env.PIERROT_RELEASE_PRODUCTION_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    ''
  ).trim();
  const candidate = configured || (deploymentUrl || '').trim();
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (!/^https?:$/.test(url.protocol)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

async function checkPath(baseUrl: string, pathname: string): Promise<DevReleaseSmokeResult> {
  const startedAt = Date.now();
  const url = new URL(pathname, `${baseUrl.replace(/\/$/, '')}/`).toString();
  const checkedAt = new Date().toISOString();
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { 'User-Agent': 'pierrot-production-release-smoke/1.0' },
    });
    const durationMs = Date.now() - startedAt;
    let detail = `HTTP ${response.status}`;
    let ok = response.status >= 200 && response.status < 400;

    if (pathname === '/api/health' && ok) {
      try {
        const body = (await response.json()) as { status?: string };
        detail = `HTTP ${response.status} · ${body.status || 'unknown'}`;
        ok = response.status === 200 && body.status === 'healthy';
      } catch {
        detail = `HTTP ${response.status} · unreadable health JSON`;
        ok = false;
      }
    }
    return { path: pathname, url, ok, status: response.status, durationMs, detail, checkedAt };
  } catch (error) {
    return {
      path: pathname,
      url,
      ok: false,
      status: null,
      durationMs: Date.now() - startedAt,
      detail:
        error instanceof Error
          ? `Request failed: ${error.message.slice(0, 300)}`
          : 'Request failed.',
      checkedAt,
    };
  }
}

export async function runProductionSmokeTests(
  baseUrl: string,
  paths: string[] = releaseSmokePaths()
): Promise<DevReleaseSmokeResult[]> {
  const results: DevReleaseSmokeResult[] = [];
  for (const pathname of paths) {
    results.push(await checkPath(baseUrl, pathname));
  }
  return results;
}
