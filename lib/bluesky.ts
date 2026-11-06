import { BskyAgent, RichText } from '@atproto/api';
import sharp from 'sharp';

import {
  graphemeLength,
  normalizeFlowItem,
  truncateGraphemes,
  type FlowItemInput,
} from '@/lib/flow/content';
import {
  buildBlueskySummaryPrompt,
  composeBlueskyPost,
  resolveBlueskyShareUrl,
  BLUESKY_MAX_GRAPHEMES,
} from '@/lib/flow/blueskyPost';
import { resolveFlowMetadataFromContent } from '@/lib/flow/metadata';
import { generateFlowAIText } from '@/lib/flow/ai';

let cachedAgent: BskyAgent | null = null;

const THUMB_LIMIT = 950_000;

export type BlueskyPublishResult =
  { uri: string; cid: string } | { error: string; uncertain?: boolean };

function blueskyErrorRecord(error: unknown): {
  status: number | null;
  code: string | null;
  message: string;
} {
  if (!error || typeof error !== 'object') {
    return {
      status: null,
      code: null,
      message: error instanceof Error ? error.message : 'Bluesky publish failed.',
    };
  }

  const record = error as {
    status?: unknown;
    error?: unknown;
    message?: unknown;
    name?: unknown;
  };

  return {
    status: typeof record.status === 'number' ? record.status : null,
    code: typeof record.error === 'string' ? record.error : null,
    message:
      typeof record.message === 'string'
        ? record.message
        : typeof record.name === 'string'
          ? record.name
          : 'Bluesky publish failed.',
  };
}

function isBlueskyAuthError(error: unknown): boolean {
  const info = blueskyErrorRecord(error);

  return (
    info.status === 401 ||
    info.code === 'ExpiredToken' ||
    info.code === 'InvalidToken' ||
    info.code === 'AuthRequired' ||
    /not logged in|expired token|invalid token/i.test(info.message)
  );
}

function isUncertainBlueskyError(error: unknown): boolean {
  const info = blueskyErrorRecord(error);

  return (
    info.status === null ||
    info.status === 408 ||
    info.status === 429 ||
    info.status >= 500 ||
    /timeout|timed out|network|fetch failed|econnreset/i.test(info.message)
  );
}

/** Safe, actionable message stored in crosspost channel state. */
function blueskyErrorMessage(error: unknown): string {
  const info = blueskyErrorRecord(error);

  if (isBlueskyAuthError(error)) {
    return 'Bluesky session expired or invalid. Retry the crosspost.';
  }

  if (info.status === 429) {
    return 'Bluesky rate limit exceeded. Retry later.';
  }

  if (info.status !== null && info.status >= 500) {
    return 'Bluesky PDS is unavailable. Retry later.';
  }

  if (/grapheme|record\/text|too long|invalid/i.test(info.message)) {
    return `Bluesky rejected the post: ${info.message.slice(0, 180)}`;
  }

  return `Bluesky publish failed: ${info.message.slice(0, 180)}`;
}

type LinkPreview = {
  url?: string;
  title?: string;
  description?: string;
  image?: string;
};

type PublishInput = FlowItemInput & {
  imageUrl?: string | null;
  imageUrls?: string[] | null;
  youtubeUrl?: string | null;
  description?: string | null;
};

async function getBlueskyAgent(): Promise<BskyAgent> {
  if (cachedAgent?.hasSession) return cachedAgent;

  const identifier = process.env.BLUESKY_IDENTIFIER;
  const password = process.env.BLUESKY_PASSWORD;

  if (!identifier || !password) {
    throw new Error('BLUESKY_IDENTIFIER or BLUESKY_PASSWORD is missing.');
  }

  const agent = new BskyAgent({ service: 'https://bsky.social' });
  await agent.login({ identifier, password });
  cachedAgent = agent;

  return agent;
}

function validUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;

  try {
    const url = new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function cleanSummary(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;

  const clean = value
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^["'«»“”]+|["'«»“”]+$/g, '')
    .replace(/#[\p{L}\p{N}_]+/gu, '')
    .replace(/https?:\/\/[^\s<>"']+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  return clean || null;
}

/**
 * Download and normalize an image before uploading it to Bluesky.
 */
async function uploadImage(
  agent: BskyAgent,
  imageUrl: string,
  maxBytes: number
): Promise<any | null> {
  const url = validUrl(imageUrl);
  if (!url) return null;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.5',
      },
    });

    if (!response.ok) {
      console.warn('[bluesky:image] Image request failed:', response.status);
      return null;
    }

    const contentType = (response.headers.get('content-type') || '')
      .split(';')[0]
      .toLowerCase();

    if (!contentType.startsWith('image/')) return null;

    const declaredSize = Number(response.headers.get('content-length') || 0);
    if (declaredSize > 15_000_000) return null;

    const source = Buffer.from(await response.arrayBuffer());
    if (!source.length || source.length > 15_000_000) return null;

    let normalized: Buffer | null = null;

    for (const attempt of [
      { width: 2000, quality: 86 },
      { width: 1800, quality: 78 },
      { width: 1500, quality: 70 },
      { width: 1200, quality: 62 },
    ]) {
      const output = await sharp(source, { animated: false, failOn: 'none' })
        .rotate()
        .resize({
          width: attempt.width,
          height: attempt.width,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: attempt.quality, mozjpeg: true })
        .toBuffer();

      if (output.length <= maxBytes) {
        normalized = output;
        break;
      }
    }

    if (!normalized) return null;

    const uploaded = await agent.uploadBlob(new Uint8Array(normalized), {
      encoding: 'image/jpeg',
    });

    return uploaded.data?.blob || null;
  } catch (error) {
    console.error('[bluesky:image] Processing failed:', error);
    return null;
  }
}

async function summarizeForBluesky(
  content: ReturnType<typeof normalizeFlowItem>
): Promise<string | null> {
  if (!content.bodyText.trim()) return null;

  const available = BLUESKY_MAX_GRAPHEMES - graphemeLength(content.canonicalUrl) - 4;
  if (graphemeLength(content.bodyText) <= available) return null;

  try {
    const generated = await generateFlowAIText(
      buildBlueskySummaryPrompt(content)
    );
    return cleanSummary(generated.content);
  } catch (error) {
    console.warn(
      '[bluesky] Summary generation failed; using local fallback:',
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

/**
 * Publish one short Bluesky post with a meaningful summary and the canonical
 * Flow URL. The Flow link is also used as an external embed so every platform
 * shows the same editorial card.
 */
export async function publishToBluesky(input: PublishInput): Promise<BlueskyPublishResult> {
  try {
    let agent = await getBlueskyAgent();

    const content = normalizeFlowItem(input, {
      media: Array.isArray((input as any).media) ? (input as any).media : [],
    });

    const shareUrl = resolveBlueskyShareUrl({
      canonicalUrl: content.canonicalUrl,
      id: content.id,
    });
    const summary = await summarizeForBluesky(content);
    const post = composeBlueskyPost({
      title: content.showTitle ? content.title : null,
      bodyText: content.bodyText,
      language: content.language,
      flowUrl: shareUrl,
      summary,
    });

    const richText = new RichText({ text: post.text });
    richText.detectFacetsWithoutResolution();

    if (richText.graphemeLength > BLUESKY_MAX_GRAPHEMES) {
      console.warn('[bluesky] Post still exceeds the grapheme limit; refusing.', {
        graphemes: richText.graphemeLength,
        shareUrl,
      });
      return {
        error: `Bluesky rejected the post: ${richText.graphemeLength} graphemes exceeds ${BLUESKY_MAX_GRAPHEMES}.`,
      };
    }

    const metadata = resolveFlowMetadataFromContent(content);
    const thumb = metadata.previewImage
      ? await uploadImage(agent, metadata.previewImage, THUMB_LIMIT)
      : null;

    const embed = {
      $type: 'app.bsky.embed.external',
      external: {
        uri: shareUrl,
        title: truncateGraphemes(metadata.title, 200).trim(),
        description: truncateGraphemes(metadata.description, 300).trim(),
        ...(thumb ? { thumb } : {}),
      },
    };

    const record: any = {
      $type: 'app.bsky.feed.post',
      text: richText.text,
      createdAt: new Date().toISOString(),
      ...(richText.facets?.length ? { facets: richText.facets } : {}),
      embed,
    };

    let result: { uri: string; cid: string };
    try {
      result = await agent.post(record);
    } catch (error) {
      if (!isBlueskyAuthError(error)) throw error;

      // A warm serverless instance can hold an expired session. Drop it and
      // retry once with a fresh login before reporting a channel failure.
      console.warn('[bluesky] Session rejected; re-authenticating once.');
      cachedAgent = null;
      agent = await getBlueskyAgent();
      result = await agent.post(record);
    }

    console.info('[bluesky] Published:', {
      uri: result.uri,
      usedSummary: Boolean(summary),
      graphemes: richText.graphemeLength,
      facets: richText.facets?.length ?? 0,
      embedType: embed.$type,
      shareUrl,
    });

    return { uri: result.uri, cid: result.cid };
  } catch (error) {
    const message = blueskyErrorMessage(error);
    console.error('[bluesky] Publish failed:', {
      message,
      error,
    });
    return { error: message, uncertain: isUncertainBlueskyError(error) };
  }
}

export async function deleteFromBluesky(uri: string): Promise<boolean> {
  try {
    if (!uri) return false;

    const agent = await getBlueskyAgent();
    const parts = uri.replace('at://', '').split('/');

    const repo = parts[0];
    const collection = parts[1];
    const rkey = parts[2];

    if (!repo || !collection || !rkey) return false;

    await agent.api.com.atproto.repo.deleteRecord({
      repo,
      collection,
      rkey,
    });

    return true;
  } catch (error) {
    console.error('[bluesky] Delete failed:', error);
    return false;
  }
}
