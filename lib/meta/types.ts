/**
 * Shared types for the Meta publishing adapters (Facebook Page, Threads).
 *
 * The Flow crosspost engine treats every channel identically. These types are
 * the small, explicit boundary between that engine and the two Meta APIs.
 */

export type MetaPublishPhase = 'container_created' | 'published';

export type MetaPublishResult = {
  ok: boolean;
  /** The channel is intentionally not published because it is not configured. */
  skipped?: boolean;
  /** The API may have accepted the request, but we could not confirm it. */
  uncertain?: boolean;
  externalId: string | null;
  externalUri: string | null;
  error?: string;
  phase?: MetaPublishPhase | null;
};

export type MetaResumeState = {
  externalId?: string | null;
  externalUri?: string | null;
  uncertain?: boolean;
  phase?: string | null;
};

export type MetaEnv = Record<string, string | undefined>;

export type MetaAdapterOptions = {
  fetch?: typeof fetch;
  env?: MetaEnv;
  resume?: MetaResumeState;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
};
