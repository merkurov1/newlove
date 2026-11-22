import crypto from 'node:crypto';

import { assertServerOnly } from '@/lib/serverOnly';

import { getSyncOwnerSecret } from '@/lib/analytics/website/config';
import { signState, verifyState } from '@/lib/analytics/website/tokenCrypto';

import {
  YOUTUBE_MANAGEMENT_ACTIONS,
  actionRequiresConfirmation,
  type YouTubeManagementAction,
} from './management';
import { YouTubeError } from './types';

assertServerOnly('lib/youtube/managementConfirmation');

const CONFIRMATION_TTL_MS = 5 * 60 * 1000;

export type ManagementConfirmationPayload = {
  uid: string;
  action: YouTubeManagementAction;
  hash: string;
  project: string;
  exp: number;
};

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * Hash of the exact action + parameters. The hash intentionally excludes file
 * bytes; the second request re-sends the same file and metadata. No token,
 * private description or comment text is stored in the hash itself.
 */
export function managementActionHash(
  action: YouTubeManagementAction,
  params: Record<string, unknown>
): string {
  const sanitized = { ...params };
  delete sanitized.bytes;
  delete sanitized.file;
  delete sanitized.confirmationToken;
  return crypto
    .createHash('sha256')
    .update(`${action}:${stable(sanitized)}`)
    .digest('hex');
}

export function createManagementConfirmation(input: {
  userId: string;
  action: YouTubeManagementAction;
  params: Record<string, unknown>;
  project: string;
  now?: number;
}): { token: string; expiresAt: string } {
  const exp = (input.now ?? Date.now()) + CONFIRMATION_TTL_MS;
  const token = signState(
    {
      uid: input.userId,
      action: input.action,
      hash: managementActionHash(input.action, input.params),
      project: input.project,
      exp,
    } satisfies ManagementConfirmationPayload,
    getSyncOwnerSecret()
  );

  return { token, expiresAt: new Date(exp).toISOString() };
}

export function verifyManagementConfirmation(input: {
  token: string | null | undefined;
  userId: string;
  action: YouTubeManagementAction;
  params: Record<string, unknown>;
  project: string;
  now?: number;
}): void {
  if (!input.token) {
    throw new YouTubeError({
      code: 'invalid_request',
      message: 'Explicit owner confirmation is required for this action.',
      stage: 'management_confirmation',
    });
  }

  const payload = verifyState<ManagementConfirmationPayload>(input.token, getSyncOwnerSecret());

  if (
    !payload ||
    payload.uid !== input.userId ||
    payload.action !== input.action ||
    payload.project !== input.project ||
    payload.exp < (input.now ?? Date.now()) ||
    payload.hash !== managementActionHash(input.action, input.params)
  ) {
    throw new YouTubeError({
      code: 'invalid_request',
      message:
        'The confirmation token is invalid or has expired. Review the action and confirm again.',
      stage: 'management_confirmation',
    });
  }
}

export type ManagementPreview = {
  requiresConfirmation: boolean;
  destructive: boolean;
  externallyVisible: boolean;
  action: YouTubeManagementAction;
  project: string;
  target: string | null;
  summary: string;
};

/**
 * Human-readable preview shown before the second (executing) request. It is
 * deliberately short: titles/descriptions stay in the owner UI, not in logs.
 */
export function describeManagementAction(input: {
  action: YouTubeManagementAction;
  params: Record<string, unknown>;
  project: string;
}): ManagementPreview {
  const definition = YOUTUBE_MANAGEMENT_ACTIONS[input.action];
  const target =
    (typeof input.params.videoId === 'string' && input.params.videoId) ||
    (typeof input.params.playlistId === 'string' && input.params.playlistId) ||
    (typeof input.params.commentId === 'string' && input.params.commentId) ||
    (typeof input.params.captionId === 'string' && input.params.captionId) ||
    null;

  return {
    requiresConfirmation: actionRequiresConfirmation(input.action),
    destructive: definition.destructive,
    externallyVisible: definition.external,
    action: input.action,
    project: input.project,
    target,
    summary: `${input.action} on the shared Pierrot + UNFRAMED YouTube channel${
      target ? ` (${target})` : ''
    }`,
  };
}
