import { createHash, timingSafeEqual } from 'crypto';
import { assertServerOnly } from '@/lib/serverOnly';

assertServerOnly('lib/pierrot/dev/workbench/workerAuth');

export const WORKER_TOKEN_ENV = 'PIERROT_DEV_WORKER_TOKEN';
export const WORKER_TOKEN_HEADER = 'x-pierrot-worker-token';
const MIN_TOKEN_LENGTH = 32;

export class WorkerAuthError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 401, code = 'WORKER_UNAUTHORIZED') {
    super(message);
    this.name = 'WorkerAuthError';
    this.status = status;
    this.code = code;
  }
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

export function getWorkerToken(): string | null {
  const value = (process.env[WORKER_TOKEN_ENV] || '').trim();
  return value.length >= MIN_TOKEN_LENGTH ? value : null;
}

export function isWorkerAuthConfigured(): boolean {
  return getWorkerToken() !== null;
}

/** Constant-time comparison of the supplied worker token. */
export function verifyWorkerToken(supplied: string | null | undefined): boolean {
  const expected = getWorkerToken();
  if (!expected || typeof supplied !== 'string' || !supplied.trim()) return false;
  const a = digest(expected);
  const b = digest(supplied.trim());
  return timingSafeEqual(a, b);
}

function tokenFromRequest(req: Request): string | null {
  const header = req.headers.get(WORKER_TOKEN_HEADER);
  if (header?.trim()) return header.trim();
  const authorization = req.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

/**
 * Internal worker endpoints use a dedicated shared secret, never the Supabase
 * service-role key and never an admin session. The secret is compared in
 * constant time and must be at least 32 characters.
 */
export function requireWorker(req: Request): void {
  const expected = getWorkerToken();
  if (!expected) {
    throw new WorkerAuthError(
      `${WORKER_TOKEN_ENV} is not configured on the server.`,
      503,
      'WORKER_AUTH_NOT_CONFIGURED'
    );
  }

  const supplied = tokenFromRequest(req);
  if (!verifyWorkerToken(supplied)) {
    throw new WorkerAuthError('Worker authentication failed.', 401, 'WORKER_UNAUTHORIZED');
  }
}

/** Bounded body reader for internal endpoints. */
export async function readJsonBody(req: Request, maxBytes = 512 * 1024): Promise<Record<string, unknown>> {
  const contentLength = Number(req.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new WorkerAuthError('Request body too large.', 413, 'WORKER_BODY_TOO_LARGE');
  }
  const text = await req.text();
  if (Buffer.byteLength(text, 'utf8') > maxBytes) {
    throw new WorkerAuthError('Request body too large.', 413, 'WORKER_BODY_TOO_LARGE');
  }
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not an object');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new WorkerAuthError('Invalid JSON body.', 400, 'WORKER_BAD_BODY');
  }
}
