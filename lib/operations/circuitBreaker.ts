import type { SupabaseClient } from '@supabase/supabase-js';

import { globalLimits } from './config';
import { recordOpsEvent } from './events';
import { createOpsClient, isMissingOpsTable } from './store';

export type CircuitDependency = 'embedding' | 'llm' | 'extraction' | 'email' | 'external';
export type CircuitState = 'closed' | 'open' | 'half_open';

type MemoryCircuit = {
  state: CircuitState;
  failures: number;
  openUntil: number;
  reopenCount: number;
  lastErrorCode: string | null;
};

const memoryCircuits = new Map<CircuitDependency, MemoryCircuit>();

/** Test helper: clear in-process breaker state between test cases. */
export function resetCircuitBreakerState(): void {
  memoryCircuits.clear();
}

function nowIso(): string {
  return new Date().toISOString();
}

function defaultCircuit(): MemoryCircuit {
  return { state: 'closed', failures: 0, openUntil: 0, reopenCount: 0, lastErrorCode: null };
}

export function circuitIsOpen(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith('circuit_open:');
}

export async function assertCircuitClosed(
  dependency: CircuitDependency,
  client: SupabaseClient | null = createOpsClient()
): Promise<void> {
  if (!client) {
    const memory = memoryCircuits.get(dependency) || defaultCircuit();
    if (memory.state === 'open' && memory.openUntil > Date.now()) {
      throw new Error(`circuit_open:${dependency}`);
    }
    return;
  }

  try {
    const { data, error } = await client
      .from('ops_circuit_breakers')
      .select('state,open_until')
      .eq('dependency', dependency)
      .maybeSingle();

    if (error) {
      if (isMissingOpsTable(error)) return;
      return;
    }

    const row = data as { state?: unknown; open_until?: unknown } | null;

    if (row?.state !== 'open') return;

    const openUntil = typeof row.open_until === 'string' ? Date.parse(row.open_until) : 0;

    if (Number.isFinite(openUntil) && openUntil > Date.now()) {
      throw new Error(`circuit_open:${dependency}`);
    }

    await client
      .from('ops_circuit_breakers')
      .update({ state: 'half_open', updated_at: nowIso() })
      .eq('dependency', dependency)
      .eq('state', 'open');
  } catch (error) {
    if (circuitIsOpen(error)) throw error;
    // Circuit storage must not take the dependency down by itself.
  }
}

export async function recordCircuitSuccess(
  dependency: CircuitDependency,
  client: SupabaseClient | null = createOpsClient()
): Promise<void> {
  const memory = memoryCircuits.get(dependency) || defaultCircuit();
  const wasOpen = memory.state !== 'closed';
  memoryCircuits.set(dependency, defaultCircuit());

  if (!client) {
    if (wasOpen) {
      await recordOpsEvent({ event: 'circuit_closed', scope: dependency, client: null });
    }
    return;
  }

  try {
    const { data } = await client
      .from('ops_circuit_breakers')
      .select('state')
      .eq('dependency', dependency)
      .maybeSingle();

    const previousState = (data as { state?: unknown } | null)?.state;

    await client.from('ops_circuit_breakers').upsert(
      {
        dependency,
        state: 'closed',
        consecutive_failures: 0,
        opened_at: null,
        open_until: null,
        reopen_count: 0,
        last_error_code: null,
        updated_at: nowIso(),
      },
      { onConflict: 'dependency' }
    );

    if (previousState === 'open' || previousState === 'half_open') {
      await recordOpsEvent({ event: 'circuit_closed', scope: dependency, client });
    }
  } catch {
    // Best effort.
  }
}

export async function recordCircuitFailure(input: {
  dependency: CircuitDependency;
  errorCode: string;
  permanent?: boolean;
  client?: SupabaseClient | null;
}): Promise<void> {
  const limits = globalLimits();
  const memory = memoryCircuits.get(input.dependency) || defaultCircuit();
  memory.failures += 1;

  const shouldOpen =
    input.permanent === true || memory.state === 'half_open' || memory.failures >= limits.circuitFailureThreshold;

  if (shouldOpen) {
    memory.reopenCount += 1;
    const cooldown = Math.min(
      limits.circuitMaxCooldownSeconds,
      limits.circuitCooldownSeconds * 2 ** Math.max(0, memory.reopenCount - 1)
    );
    memory.state = 'open';
    memory.openUntil = Date.now() + cooldown * 1000;
  }

  memory.lastErrorCode = input.errorCode.slice(0, 120);
  memoryCircuits.set(input.dependency, memory);

  const client = input.client === undefined ? createOpsClient() : input.client;

  if (client) {
    try {
      const { data } = await client
        .from('ops_circuit_breakers')
        .select('consecutive_failures,reopen_count,state')
        .eq('dependency', input.dependency)
        .maybeSingle();

      const row = data as
        | { consecutive_failures?: unknown; reopen_count?: unknown; state?: unknown }
        | null;
      const failures =
        (typeof row?.consecutive_failures === 'number' ? row.consecutive_failures : 0) + 1;
      const reopenCount =
        (typeof row?.reopen_count === 'number' ? row.reopen_count : 0) + (shouldOpen ? 1 : 0);
      const cooldown = Math.min(
        limits.circuitMaxCooldownSeconds,
        limits.circuitCooldownSeconds * 2 ** Math.max(0, reopenCount - 1)
      );

      await client.from('ops_circuit_breakers').upsert(
        {
          dependency: input.dependency,
          state: shouldOpen ? 'open' : 'closed',
          consecutive_failures: failures,
          opened_at: shouldOpen ? nowIso() : null,
          open_until: shouldOpen ? new Date(Date.now() + cooldown * 1000).toISOString() : null,
          reopen_count: reopenCount,
          last_error_code: input.errorCode.slice(0, 120),
          updated_at: nowIso(),
        },
        { onConflict: 'dependency' }
      );

      if (shouldOpen) {
        await recordOpsEvent({
          event: 'circuit_opened',
          scope: input.dependency,
          severity: 'warning',
          details: { error_code: input.errorCode, cooldown_seconds: cooldown },
          client,
        });
      }
    } catch {
      // Best effort.
    }
  } else if (shouldOpen) {
    await recordOpsEvent({
      event: 'circuit_opened',
      scope: input.dependency,
      severity: 'warning',
      details: { error_code: input.errorCode },
      client: null,
    });
  }
}

export async function listCircuitBreakers(
  client: SupabaseClient | null = createOpsClient()
): Promise<Array<Record<string, unknown>>> {
  if (!client) return [];

  try {
    const { data, error } = await client
      .from('ops_circuit_breakers')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(50);

    if (error) return [];
    return Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
  } catch {
    return [];
  }
}
