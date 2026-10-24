import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function ensureDir(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
}

/** Write a JSON file atomically, so an interrupted run leaves no half file. */
export async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(file));
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, file);
}

export async function writeTextAtomic(file: string, value: string): Promise<void> {
  await ensureDir(path.dirname(file));
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, value, 'utf8');
  await rename(temporary, file);
}

export async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function readJsonOrThrow<T>(file: string): Promise<T> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Не удалось прочитать ${file}: ${detail}`);
  }
}

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? 0;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function countBy<T>(values: T[], key: (value: T) => string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) {
    const k = key(value);
    result[k] = (result[k] ?? 0) + 1;
  }
  return result;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Операция отменена'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('Операция отменена'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isoTimestamp(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;

  if (typeof value === 'number') {
    const milliseconds = value > 10_000_000_000 ? value : value * 1000;
    return new Date(milliseconds).toISOString();
  }

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return isoTimestamp(Number(trimmed));

  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

export function unixSeconds(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return value > 10_000_000_000 ? Math.floor(value / 1000) : Math.floor(value);
  }
  if (!/^\d+$/.test(value.trim())) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000);
  }
  return unixSeconds(Number(value));
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
