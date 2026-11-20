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

/**
 * Compact, honest receipt for a just-finished publication.
 *
 * The POST /api/flow/items response contains the independent channel states.
 * This helper reduces them to the two channels the Flow composer owns
 * (Telegram and Bluesky) without ever turning a partial or uncertain result
 * into a success.
 */
export const FLOW_RECEIPT_CHANNELS = [
  { key: 'telegram', label: 'Telegram' },
  { key: 'bluesky', label: 'Bluesky' },
] as const;

export type FlowReceiptStatus =
  | 'published'
  | 'failed'
  | 'uncertain'
  | 'skipped'
  | 'publishing'
  | 'not_requested'
  | 'unknown';

export type FlowReceiptChannel = {
  key: (typeof FLOW_RECEIPT_CHANNELS)[number]['key'];
  label: string;
  status: FlowReceiptStatus;
  detail: string | null;
};

export type FlowPublishReceipt = {
  itemId: string | null;
  channels: FlowReceiptChannel[];
  hasProblem: boolean;
};

function receiptStatus(value: unknown, uncertain: unknown): FlowReceiptStatus {
  if (value === 'published') return 'published';
  if (value === 'failed') return uncertain === true ? 'uncertain' : 'failed';
  if (value === 'skipped') return 'skipped';
  if (value === 'publishing' || value === 'pending') return 'publishing';
  if (value === 'not_requested') return 'not_requested';
  return 'unknown';
}

export function summarizeCrosspostResult(
  result: unknown,
  itemId: string | null = null
): FlowPublishReceipt {
  const root = asRecord(result);
  const channels = asRecord(root?.channels);

  const receiptChannels: FlowReceiptChannel[] = FLOW_RECEIPT_CHANNELS.map(
    ({ key, label }) => {
      const state = asRecord(channels?.[key]);

      if (!root) {
        return { key, label, status: 'unknown', detail: null };
      }

      if (!state) {
        return { key, label, status: 'not_requested', detail: null };
      }

      const lastError = typeof state.lastError === 'string' ? state.lastError.trim() : '';

      return {
        key,
        label,
        status: receiptStatus(state.status, state.uncertain),
        detail: lastError || null,
      };
    }
  );

  return {
    itemId: typeof itemId === 'string' && itemId.trim() ? itemId : null,
    channels: receiptChannels,
    hasProblem: receiptChannels.some(
      (channel) =>
        channel.status === 'failed' ||
        channel.status === 'uncertain' ||
        channel.status === 'unknown'
    ),
  };
}
