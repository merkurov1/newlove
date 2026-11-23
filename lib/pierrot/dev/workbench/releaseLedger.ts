import { randomUUID } from 'crypto';
import { assertServerOnly } from '@/lib/serverOnly';
import { appendEvent, listProductionReleaseEvents } from './store';
import type {
  DevProductionRelease,
  DevReleasePhase,
  DevReleaseSmokeResult,
  DevReleaseStatus,
} from './types';

assertServerOnly('lib/pierrot/dev/workbench/releaseLedger');

const STATUSES: DevReleaseStatus[] = ['requested', 'running', 'succeeded', 'failed', 'blocked'];
const PHASES: DevReleasePhase[] = [
  'requested',
  'preflight',
  'migrations',
  'preview',
  'promote',
  'production_ready',
  'smoke',
  'completed',
];

function text(value: unknown, limit = 2000): string {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function nullableText(value: unknown, limit = 2000): string | null {
  const valueText = text(value, limit);
  return valueText || null;
}

function stringList(value: unknown, limit = 200): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').slice(0, limit)
    : [];
}

function smokeList(value: unknown): DevReleaseSmokeResult[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      path: text(item.path, 300),
      url: text(item.url, 1000),
      ok: item.ok === true,
      status: typeof item.status === 'number' ? item.status : null,
      durationMs: typeof item.durationMs === 'number' ? item.durationMs : 0,
      detail: text(item.detail, 600),
      checkedAt: text(item.checkedAt, 40),
    }))
    .filter((item) => item.path && item.url);
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function recordFromPayload(payload: unknown): DevProductionRelease | null {
  const record = objectValue(payload);
  const id = text(record.id, 80);
  const status = text(record.status, 20) as DevReleaseStatus;
  const phase = text(record.phase, 30) as DevReleasePhase;
  const pinnedSha = text(record.pinnedSha, 40);
  if (!id || !pinnedSha || !STATUSES.includes(status) || !PHASES.includes(phase)) return null;
  return {
    id,
    actorId: text(record.actorId, 120) || 'unknown',
    status,
    phase,
    pinnedSha,
    previousProductionSha: nullableText(record.previousProductionSha, 40),
    previousProductionDeploymentId: nullableText(record.previousProductionDeploymentId, 120),
    previewDeploymentId: nullableText(record.previewDeploymentId, 120),
    previewUrl: nullableText(record.previewUrl, 1000),
    productionDeploymentId: nullableText(record.productionDeploymentId, 120),
    productionUrl: nullableText(record.productionUrl, 1000),
    migrationVersions: stringList(record.migrationVersions),
    migrationSummary: objectValue(record.migrationSummary),
    smokeResults: smokeList(record.smokeResults),
    blockers: stringList(record.blockers),
    errorCode: nullableText(record.errorCode, 120),
    errorMessage: nullableText(record.errorMessage, 1200),
    rolledBack: record.rolledBack === true,
    rollbackError: nullableText(record.rollbackError, 600),
    requestedAt: text(record.requestedAt, 40) || new Date().toISOString(),
    startedAt: nullableText(record.startedAt, 40),
    updatedAt: text(record.updatedAt, 40) || new Date().toISOString(),
    finishedAt: nullableText(record.finishedAt, 40),
  };
}

/**
 * Read the latest immutable snapshot per release id from the append-only journal.
 * Events are ordered newest-first, so the first record for an id is authoritative.
 */
export async function listProductionReleases(limit = 500): Promise<DevProductionRelease[]> {
  const events = await listProductionReleaseEvents(limit);
  const seen = new Set<string>();
  const records: DevProductionRelease[] = [];
  for (const event of events) {
    const record = recordFromPayload(event.payload);
    if (!record || seen.has(record.id)) continue;
    seen.add(record.id);
    records.push(record);
  }
  return records;
}

export async function getProductionRelease(id: string): Promise<DevProductionRelease | null> {
  if (!id) return null;
  const records = await listProductionReleases(1000);
  return records.find((record) => record.id === id) || null;
}

export async function getLatestProductionRelease(): Promise<DevProductionRelease | null> {
  const records = await listProductionReleases();
  return records[0] || null;
}

export async function getActiveProductionRelease(): Promise<DevProductionRelease | null> {
  const records = await listProductionReleases();
  return (
    records.find((record) => record.status === 'requested' || record.status === 'running') || null
  );
}

export function newProductionRelease(input: {
  actorId: string;
  pinnedSha: string;
  previousProductionSha: string | null;
  previousProductionDeploymentId: string | null;
}): DevProductionRelease {
  const at = new Date().toISOString();
  return {
    id: randomUUID(),
    actorId: input.actorId.slice(0, 120),
    status: 'requested',
    phase: 'requested',
    pinnedSha: input.pinnedSha,
    previousProductionSha: input.previousProductionSha,
    previousProductionDeploymentId: input.previousProductionDeploymentId,
    previewDeploymentId: null,
    previewUrl: null,
    productionDeploymentId: null,
    productionUrl: null,
    migrationVersions: [],
    migrationSummary: {},
    smokeResults: [],
    blockers: [],
    errorCode: null,
    errorMessage: null,
    rolledBack: false,
    rollbackError: null,
    requestedAt: at,
    startedAt: null,
    updatedAt: at,
    finishedAt: null,
  };
}

export async function recordProductionRelease(record: DevProductionRelease): Promise<void> {
  const level =
    record.status === 'failed'
      ? 'error'
      : record.status === 'blocked'
        ? 'warn'
        : record.status === 'succeeded'
          ? 'info'
          : 'info';
  const message =
    record.status === 'blocked'
      ? `Production release blocked at ${record.phase}: ${record.blockers[0] || record.errorMessage || 'see ledger'}`
      : record.status === 'failed'
        ? `Production release failed at ${record.phase}: ${record.errorMessage || 'see ledger'}`
        : record.status === 'succeeded'
          ? `Production release succeeded for ${record.pinnedSha.slice(0, 7)}${record.productionDeploymentId ? ` (${record.productionDeploymentId})` : ''}.`
          : `Production release ${record.status} at ${record.phase} for ${record.pinnedSha.slice(0, 7)}.`;
  await appendEvent({
    type: `release.${record.status}`,
    level,
    message,
    payload: { ...record },
  });
}
