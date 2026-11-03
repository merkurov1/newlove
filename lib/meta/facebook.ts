/**
 * Facebook Page adapter for Flow crossposting.
 *
 * Official Meta Graph API only. This module publishes to a Page, never to a
 * personal profile. Credentials are read on the server and are never written
 * to Flow metadata, logs, or the client bundle.
 *
 * Text/link posts use /{page-id}/feed. Image posts use /{page-id}/photos with
 * a publicly reachable image URL, because the photo endpoint has no link
 * parameter — the canonical Flow URL is appended to the caption instead.
 */

import { normalizeFlowItem, type FlowItemInput } from '@/lib/flow/content';

import { composeFacebookPost } from './content';
import {
  isTimeoutError,
  metaErrorMessage,
  metaResponseIsUncertain,
  readRecord,
  readString,
  sanitizeMetaError,
} from './http';
import type { MetaAdapterOptions, MetaPublishResult, MetaResumeState } from './types';

type FacebookInput = FlowItemInput & {
  imageUrl?: string | null;
  imageUrls?: string[] | null;
  youtubeUrl?: string | null;
  description?: string | null;
};

export type FacebookConfig = {
  pageId: string | null;
  accessToken: string | null;
  version: string;
  configured: boolean;
};

const DEFAULT_GRAPH_VERSION = 'v26.0';
const REQUEST_TIMEOUT_MS = 15_000;

function normalizeVersion(value: string | undefined): string {
  const version = (value ?? '').trim();
  if (!version) return DEFAULT_GRAPH_VERSION;
  return /^v\d+\.\d+$/.test(version) ? version : DEFAULT_GRAPH_VERSION;
}

export function readFacebookConfig(
  env: Record<string, string | undefined> = process.env
): FacebookConfig {
  const pageId = readString(env.META_FACEBOOK_PAGE_ID);
  const accessToken = readString(env.META_FACEBOOK_PAGE_ACCESS_TOKEN);
  const version = normalizeVersion(env.META_GRAPH_API_VERSION);

  return {
    pageId,
    accessToken,
    version,
    configured: Boolean(pageId && accessToken),
  };
}

export function isFacebookConfigured(
  env: Record<string, string | undefined> = process.env
): boolean {
  return readFacebookConfig(env).configured;
}

function graphUrl(config: FacebookConfig, path: string): string {
  return `https://graph.facebook.com/${config.version}/${path.replace(/^\/+/, '')}`;
}

function formBody(values: Record<string, string | null | undefined>): string {
  const form = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'string' && value.trim()) form.set(key, value);
  }

  return form.toString();
}

function responseHeaders(config: FacebookConfig): HeadersInit {
  return {
    Authorization: `Bearer ${config.accessToken ?? ''}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
}

function postUrl(id: string, kind: 'post' | 'photo'): string {
  const [pageId, objectId] = id.split('_');

  if (pageId && objectId) {
    return kind === 'photo'
      ? `https://www.facebook.com/${pageId}/photos/${objectId}`
      : `https://www.facebook.com/${pageId}/posts/${objectId}`;
  }

  return `https://www.facebook.com/${id}`;
}

function isNotFound(status: number, payload: unknown): boolean {
  if (status === 404) return true;

  const root = readRecord(payload);
  const error = readRecord(root?.error);
  const code = error?.code;

  // Graph API uses 100/803 for "object does not exist / unavailable".
  return code === 100 || code === 803;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function verifyPublishedPost(
  config: FacebookConfig,
  externalId: string,
  options: MetaAdapterOptions
): Promise<MetaPublishResult | null> {
  const fetcher = options.fetch ?? fetch;
  const url = graphUrl(
    config,
    `${encodeURIComponent(externalId)}?fields=id,permalink_url,created_time`
  );

  try {
    const response = await fetcher(url, {
      method: 'GET',
      headers: responseHeaders(config),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const payload = await readJson(response);

    if (response.ok) {
      const root = readRecord(payload);
      const id = readString(root?.id) ?? externalId;
      const permalink = readString(root?.permalink_url);

      return {
        ok: true,
        externalId: id,
        externalUri: permalink ?? postUrl(id, 'post'),
        phase: 'published',
      };
    }

    if (isNotFound(response.status, payload)) return null;

    return {
      ok: false,
      uncertain: true,
      externalId,
      externalUri: null,
      error: sanitizeMetaError(
        metaErrorMessage(payload) ?? `Facebook verification returned HTTP ${response.status}.`,
        config.accessToken
      ),
      phase: 'published',
    };
  } catch (error) {
    return {
      ok: false,
      uncertain: true,
      externalId,
      externalUri: null,
      error: sanitizeMetaError(error, config.accessToken),
      phase: 'published',
    };
  }
}

function skippedResult(): MetaPublishResult {
  return {
    ok: false,
    skipped: true,
    externalId: null,
    externalUri: null,
    error: 'Facebook Page is not configured.',
    phase: null,
  };
}

/**
 * Publish one Flow item to the configured Facebook Page.
 *
 * `resume` is used only for an explicit administrator retry of an uncertain
 * publication. The adapter first checks whether the stored post ID exists; if
 * it does, the post is reported as published instead of being sent twice.
 */
export async function publishToFacebook(
  input: FacebookInput,
  options: MetaAdapterOptions = {}
): Promise<MetaPublishResult> {
  const env = options.env ?? process.env;
  const config = readFacebookConfig(env);

  if (!config.configured) return skippedResult();

  const resume: MetaResumeState = options.resume ?? {};

  if (resume.externalId) {
    const verified = await verifyPublishedPost(config, resume.externalId, options);

    if (verified) return verified;
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

  const post = composeFacebookPost(content);
  const fetcher = options.fetch ?? fetch;
  const isPhoto = Boolean(post.imageUrl);

  const url = graphUrl(
    config,
    `${encodeURIComponent(config.pageId ?? '')}/${isPhoto ? 'photos' : 'feed'}`
  );

  const body = isPhoto
    ? formBody({
        url: post.imageUrl,
        caption: post.message,
        published: 'true',
      })
    : formBody({
        message: post.message,
        link: post.link,
      });

  try {
    const response = await fetcher(url, {
      method: 'POST',
      headers: responseHeaders(config),
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const payload = await readJson(response);

    if (!response.ok) {
      const uncertain = metaResponseIsUncertain(response.status);

      return {
        ok: false,
        uncertain,
        externalId: null,
        externalUri: null,
        error: sanitizeMetaError(
          metaErrorMessage(payload) ?? `Facebook returned HTTP ${response.status}.`,
          config.accessToken
        ),
        phase: null,
      };
    }

    const root = readRecord(payload);
    const id = readString(root?.id);

    if (!id) {
      // Meta returned success but no object ID: never call this published.
      return {
        ok: false,
        uncertain: true,
        externalId: null,
        externalUri: null,
        error: 'Facebook accepted the request but returned no post ID.',
        phase: null,
      };
    }

    const permalink = readString(root?.permalink_url);

    return {
      ok: true,
      externalId: id,
      externalUri: permalink ?? postUrl(id, isPhoto ? 'photo' : 'post'),
      phase: 'published',
    };
  } catch (error) {
    return {
      ok: false,
      uncertain: true,
      externalId: null,
      externalUri: null,
      error: isTimeoutError(error)
        ? 'Facebook request timed out.'
        : sanitizeMetaError(error, config.accessToken),
      phase: null,
    };
  }
}
