/**
 * Threads adapter for Flow crossposting.
 *
 * Threads uses a two-step publish flow:
 *   1. POST /{user-id}/threads        — create a publishing container
 *   2. POST /{user-id}/threads_publish — confirm the publication
 *
 * Creating a container is NOT a publication. The Flow state becomes
 * `published` only after step 2 returns a media ID. If step 2 times out, the
 * container ID is kept and the result is marked uncertain, so an automatic
 * retry cannot create a duplicate.
 */

import { normalizeFlowItem, type FlowItemInput } from '@/lib/flow/content';

import { composeThreadsPost } from './content';
import {
  isTimeoutError,
  metaErrorMessage,
  metaResponseIsUncertain,
  readRecord,
  readString,
  sanitizeMetaError,
} from './http';
import type { MetaAdapterOptions, MetaPublishResult, MetaResumeState } from './types';

type ThreadsInput = FlowItemInput & {
  imageUrl?: string | null;
  imageUrls?: string[] | null;
  youtubeUrl?: string | null;
  description?: string | null;
};

export type ThreadsConfig = {
  userId: string | null;
  accessToken: string | null;
  version: string;
  configured: boolean;
};

const DEFAULT_THREADS_VERSION = 'v1.0';
const REQUEST_TIMEOUT_MS = 15_000;
const CONTAINER_POLL_ATTEMPTS = 5;
const CONTAINER_POLL_INTERVAL_MS = 1_000;

function normalizeVersion(value: string | undefined): string {
  const version = (value ?? '').trim();
  if (!version) return DEFAULT_THREADS_VERSION;
  return /^v\d+\.\d+$/.test(version) ? version : DEFAULT_THREADS_VERSION;
}

export function readThreadsConfig(
  env: Record<string, string | undefined> = process.env
): ThreadsConfig {
  const userId = readString(env.META_THREADS_USER_ID);
  const accessToken = readString(env.META_THREADS_ACCESS_TOKEN);
  const version = normalizeVersion(env.META_THREADS_API_VERSION);

  return {
    userId,
    accessToken,
    version,
    configured: Boolean(userId && accessToken),
  };
}

export function isThreadsConfigured(
  env: Record<string, string | undefined> = process.env
): boolean {
  return readThreadsConfig(env).configured;
}

function threadsUrl(config: ThreadsConfig, path: string): string {
  return `https://graph.threads.net/${config.version}/${path.replace(/^\/+/, '')}`;
}

function formBody(values: Record<string, string | null | undefined>): string {
  const form = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'string' && value.trim()) form.set(key, value);
  }

  return form.toString();
}

function responseHeaders(config: ThreadsConfig): HeadersInit {
  return {
    Authorization: `Bearer ${config.accessToken ?? ''}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function skippedResult(): MetaPublishResult {
  return {
    ok: false,
    skipped: true,
    externalId: null,
    externalUri: null,
    error: 'Threads is not configured.',
    phase: null,
  };
}

type ContainerStatus = {
  status: string | null;
  permalink: string | null;
  error: string | null;
  published: boolean;
  terminalError: boolean;
};

async function readContainerStatus(
  config: ThreadsConfig,
  containerId: string,
  options: MetaAdapterOptions
): Promise<ContainerStatus> {
  const fetcher = options.fetch ?? fetch;
  const url = threadsUrl(
    config,
    `${encodeURIComponent(containerId)}?fields=status,error_message,permalink`
  );

  try {
    const response = await fetcher(url, {
      method: 'GET',
      headers: responseHeaders(config),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const payload = await readJson(response);

    if (!response.ok) {
      return {
        status: null,
        permalink: null,
        error: sanitizeMetaError(
          metaErrorMessage(payload) ?? `Threads status returned HTTP ${response.status}.`,
          config.accessToken
        ),
        published: false,
        terminalError: false,
      };
    }

    const root = readRecord(payload);
    const status = readString(root?.status)?.toUpperCase() ?? null;
    const permalink = readString(root?.permalink);
    const error = readString(root?.error_message);

    return {
      status,
      permalink,
      error,
      published: status === 'PUBLISHED',
      terminalError: status === 'ERROR' || status === 'EXPIRED',
    };
  } catch (error) {
    return {
      status: null,
      permalink: null,
      error: sanitizeMetaError(error, config.accessToken),
      published: false,
      terminalError: false,
    };
  }
}

/**
 * Wait briefly for image containers. A failed status request is not treated as
 * a publication failure: we still attempt the publish step, which is the
 * authoritative confirmation.
 */
async function waitForContainer(
  config: ThreadsConfig,
  containerId: string,
  options: MetaAdapterOptions
): Promise<ContainerStatus> {
  const sleep = options.sleep ?? defaultSleep;
  let last: ContainerStatus = {
    status: null,
    permalink: null,
    error: null,
    published: false,
    terminalError: false,
  };

  for (let attempt = 0; attempt < CONTAINER_POLL_ATTEMPTS; attempt += 1) {
    last = await readContainerStatus(config, containerId, options);

    if (last.published || last.terminalError) return last;

    if (last.status === 'FINISHED' || last.status === 'IN_PROGRESS') {
      if (last.status === 'FINISHED') return last;
    }

    if (attempt < CONTAINER_POLL_ATTEMPTS - 1) {
      await sleep(CONTAINER_POLL_INTERVAL_MS);
    }
  }

  return last;
}

async function fetchPermalink(
  config: ThreadsConfig,
  mediaId: string,
  options: MetaAdapterOptions
): Promise<string | null> {
  const fetcher = options.fetch ?? fetch;

  try {
    const response = await fetcher(
      threadsUrl(config, `${encodeURIComponent(mediaId)}?fields=id,permalink`),
      {
        method: 'GET',
        headers: responseHeaders(config),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }
    );
    const payload = await readJson(response);

    if (!response.ok) return null;

    return readString(readRecord(payload)?.permalink);
  } catch {
    // The post is already confirmed by threads_publish; a missing permalink
    // must not turn a successful publication into a failure.
    return null;
  }
}

async function verifyPublishedMedia(
  config: ThreadsConfig,
  mediaId: string,
  options: MetaAdapterOptions
): Promise<MetaPublishResult | null> {
  const fetcher = options.fetch ?? fetch;

  try {
    const response = await fetcher(
      threadsUrl(config, `${encodeURIComponent(mediaId)}?fields=id,permalink`),
      {
        method: 'GET',
        headers: responseHeaders(config),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }
    );
    const payload = await readJson(response);

    if (response.ok) {
      const root = readRecord(payload);
      const id = readString(root?.id) ?? mediaId;
      const permalink = readString(root?.permalink);

      return {
        ok: true,
        externalId: id,
        externalUri: permalink,
        phase: 'published',
      };
    }

    const root = readRecord(payload);
    const error = readRecord(root?.error);

    if (response.status === 404 || error?.code === 100 || error?.code === 803) {
      return null;
    }

    return {
      ok: false,
      uncertain: true,
      externalId: mediaId,
      externalUri: null,
      error: sanitizeMetaError(
        metaErrorMessage(payload) ?? `Threads verification returned HTTP ${response.status}.`,
        config.accessToken
      ),
      phase: 'published',
    };
  } catch (error) {
    return {
      ok: false,
      uncertain: true,
      externalId: mediaId,
      externalUri: null,
      error: sanitizeMetaError(error, config.accessToken),
      phase: 'published',
    };
  }
}

async function publishContainer(
  config: ThreadsConfig,
  containerId: string,
  options: MetaAdapterOptions
): Promise<MetaPublishResult> {
  const fetcher = options.fetch ?? fetch;

  try {
    const response = await fetcher(
      threadsUrl(config, `${encodeURIComponent(config.userId ?? '')}/threads_publish`),
      {
        method: 'POST',
        headers: responseHeaders(config),
        body: formBody({ creation_id: containerId }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }
    );
    const payload = await readJson(response);

    if (!response.ok) {
      const uncertain = metaResponseIsUncertain(response.status);

      return {
        ok: false,
        uncertain,
        externalId: containerId,
        externalUri: null,
        error: sanitizeMetaError(
          metaErrorMessage(payload) ?? `Threads publish returned HTTP ${response.status}.`,
          config.accessToken
        ),
        // The container still exists. A later explicit retry can inspect it
        // before deciding whether to publish it again.
        phase: 'container_created',
      };
    }

    const root = readRecord(payload);
    const mediaId = readString(root?.id);

    if (!mediaId) {
      return {
        ok: false,
        uncertain: true,
        externalId: containerId,
        externalUri: null,
        error: 'Threads accepted the request but returned no post ID.',
        phase: 'container_created',
      };
    }

    const permalink = await fetchPermalink(config, mediaId, options);

    return {
      ok: true,
      externalId: mediaId,
      externalUri: permalink,
      phase: 'published',
    };
  } catch (error) {
    return {
      ok: false,
      uncertain: true,
      externalId: containerId,
      externalUri: null,
      error: isTimeoutError(error)
        ? 'Threads publish request timed out.'
        : sanitizeMetaError(error, config.accessToken),
      phase: 'container_created',
    };
  }
}

async function createContainer(
  config: ThreadsConfig,
  text: string,
  imageUrl: string | null,
  options: MetaAdapterOptions
): Promise<MetaPublishResult> {
  const fetcher = options.fetch ?? fetch;

  try {
    const response = await fetcher(
      threadsUrl(config, `${encodeURIComponent(config.userId ?? '')}/threads`),
      {
        method: 'POST',
        headers: responseHeaders(config),
        body: formBody({
          media_type: imageUrl ? 'IMAGE' : 'TEXT',
          text,
          image_url: imageUrl,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }
    );
    const payload = await readJson(response);

    if (!response.ok) {
      const uncertain = metaResponseIsUncertain(response.status);

      return {
        ok: false,
        uncertain,
        externalId: null,
        externalUri: null,
        error: sanitizeMetaError(
          metaErrorMessage(payload) ?? `Threads container returned HTTP ${response.status}.`,
          config.accessToken
        ),
        phase: null,
      };
    }

    const root = readRecord(payload);
    const containerId = readString(root?.id);

    if (!containerId) {
      return {
        ok: false,
        uncertain: true,
        externalId: null,
        externalUri: null,
        error: 'Threads accepted the container request but returned no container ID.',
        phase: null,
      };
    }

    const status = await waitForContainer(config, containerId, options);

    if (status.published) {
      return {
        ok: true,
        externalId: containerId,
        externalUri: status.permalink,
        phase: 'published',
      };
    }

    if (status.terminalError) {
      return {
        ok: false,
        uncertain: false,
        externalId: containerId,
        externalUri: null,
        error: status.error ?? 'Threads could not process the publishing container.',
        phase: 'container_created',
      };
    }

    return publishContainer(config, containerId, options);
  } catch (error) {
    return {
      ok: false,
      uncertain: true,
      externalId: null,
      externalUri: null,
      error: isTimeoutError(error)
        ? 'Threads container request timed out.'
        : sanitizeMetaError(error, config.accessToken),
      phase: null,
    };
  }
}

/**
 * Publish one Flow item to the configured Threads profile.
 *
 * `resume` is used only for an explicit administrator retry of an uncertain
 * publication. A stored container is inspected first; a stored media ID is
 * verified first. Only if neither confirms a publication is a new container
 * created.
 */
export async function publishToThreads(
  input: ThreadsInput,
  options: MetaAdapterOptions = {}
): Promise<MetaPublishResult> {
  const env = options.env ?? process.env;
  const config = readThreadsConfig(env);

  if (!config.configured) return skippedResult();

  const resume: MetaResumeState = options.resume ?? {};

  if (resume.externalId) {
    if (resume.phase === 'container_created') {
      const status = await waitForContainer(config, resume.externalId, options);

      if (status.published) {
        return {
          ok: true,
          externalId: resume.externalId,
          externalUri: status.permalink,
          phase: 'published',
        };
      }

      if (status.status === null && !status.terminalError) {
        // We could not inspect the stored container. Creating another one
        // could duplicate an already published post, so require an explicit
        // administrator decision instead.
        return {
          ok: false,
          uncertain: true,
          externalId: resume.externalId,
          externalUri: resume.externalUri ?? null,
          error:
            status.error ??
            'Threads could not confirm the status of the stored publishing container.',
          phase: 'container_created',
        };
      }

      if (!status.terminalError) {
        // The container exists and is ready but not confirmed as published.
        return publishContainer(config, resume.externalId, options);
      }
    } else {
      const verified = await verifyPublishedMedia(config, resume.externalId, options);

      if (verified) return verified;
    }
  }

  let content;

  try {
    content = normalizeFlowItem(input);
  } catch (error) {
    return {
      ok: false,
      externalId: null,
      externalUri: null,
      error: sanitizeMetaError(error, config.accessToken),
      phase: null,
    };
  }

  const post = composeThreadsPost(content);

  return createContainer(config, post.text, post.imageUrl, options);
}
