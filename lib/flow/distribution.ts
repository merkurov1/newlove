/**
 * Pure helpers for reading Flow distribution state.
 *
 * This module is intentionally dependency-free so it can be used by the
 * client-side Flow list, the server-rendered item page and the admin editor.
 * The canonical state is `items.metadata.crosspost.channels`.
 */

export const FLOW_DISTRIBUTION_CHANNELS = [
  { key: 'telegram', label: 'Telegram' },
  { key: 'bluesky', label: 'Bluesky' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'threads', label: 'Threads' },
] as const;

export type FlowDistributionChannel = (typeof FLOW_DISTRIBUTION_CHANNELS)[number]['key'];

export type FlowDistributionState = {
  status?: string;
  externalId?: string | null;
  externalUri?: string | null;
  lastError?: string | null;
  attempts?: number;
  uncertain?: boolean;
  phase?: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function readDistributionState(
  metadata: unknown,
  channel: FlowDistributionChannel | string
): FlowDistributionState | null {
  const root = asRecord(metadata);
  const crosspost = asRecord(root?.crosspost);
  const channels = asRecord(crosspost?.channels);
  const state = asRecord(channels?.[channel]);

  return state ? (state as FlowDistributionState) : null;
}

export function readDistributionUrl(
  metadata: unknown,
  channel: FlowDistributionChannel | string
): string | null {
  const uri = readDistributionState(metadata, channel)?.externalUri;
  return typeof uri === 'string' && uri.trim() ? uri : null;
}
