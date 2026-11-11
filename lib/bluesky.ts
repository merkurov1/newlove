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
  resolveBlueskyShareUrl,
  BLUESKY_MAX_GRAPHEMES,
} from '@/lib/flow/blueskyPost';
import {
  buildBlueskyPresentation,
  resolveBlueskyPresentationMode,
  validateBlueskyPresentation,
  type BlueskyPresentation,
} from '@/lib/flow/blueskyPresentation';
import { generateFlowAIText } from '@/lib/flow/ai';

let cachedAgent: BskyAgent | null = null;

const THUMB_LIMIT = 950_000;

export type BlueskyPublishResult =
  | {
      uri: string;
      cid: string;
      presentation?: BlueskyPresentation;
      warnings?: string[];
    }
  | {
      error: string;
      uncertain?: boolean;
      presentation?: BlueskyPresentation;
      warnings?: string[];
    };

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

type UploadedImage = {
  blob: any;
  width: number;
  height: number;
};

type ImageUploadOutcome = {
  image: UploadedImage | null;
  error: string | null;
};

/**
 * Download and normalize an image before uploading it to Bluesky.
 *
 * The outcome is explicit so a failed upload can be logged, surfaced in the
 * publish result and handled by the external-card fallback instead of silently
 * dropping the visual.
 */
async function uploadImage(
  agent: BskyAgent,
  imageUrl: string,
  maxBytes: number
): Promise<ImageUploadOutcome> {
  const url = validUrl(imageUrl);
  if (!url) return { image: null, error: 'invalid_image_url' };

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
      return { image: null, error: `image_http_${response.status}` };
    }

    const contentType = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();

    if (!contentType.startsWith('image/')) {
      return { image: null, error: `unsupported_content_type:${contentType || 'unknown'}` };
    }

    const declaredSize = Number(response.headers.get('content-length') || 0);
    if (declaredSize > 15_000_000) {
      return { image: null, error: 'image_too_large' };
    }

    const source = Buffer.from(await response.arrayBuffer());
    if (!source.length || source.length > 15_000_000) {
      return { image: null, error: 'image_too_large' };
    }

    let normalized: { data: Buffer; width: number; height: number } | null = null;

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
        .toBuffer({ resolveWithObject: true });

      if (output.data.length <= maxBytes) {
        normalized = {
          data: output.data,
          width: output.info.width,
          height: output.info.height,
        };
        break;
      }
    }

    if (!normalized) {
      return { image: null, error: 'image_normalization_failed' };
    }

    const uploaded = await agent.uploadBlob(new Uint8Array(normalized.data), {
      encoding: 'image/jpeg',
    });

    const blob = uploaded.data?.blob;
    if (!blob) return { image: null, error: 'empty_blob_response' };

    return {
      image: {
        blob,
        width: normalized.width,
        height: normalized.height,
      },
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'image_processing_failed';
    console.error('[bluesky:image] Processing failed:', message);
    return { image: null, error: message.slice(0, 180) };
  }
}

async function summarizeForBluesky(
  content: ReturnType<typeof normalizeFlowItem>,
  shareUrl: string
): Promise<string | null> {
  if (!content.bodyText.trim()) return null;

  const mode = resolveBlueskyPresentationMode(content);
  const available = BLUESKY_MAX_GRAPHEMES - graphemeLength(shareUrl) - 2;
  const threshold = mode === 'article' ? Math.min(available, 220) : available;

  if (graphemeLength(content.bodyText) <= threshold) return null;

  try {
    const generated = await generateFlowAIText(buildBlueskySummaryPrompt(content));
    return cleanSummary(generated.content);
  } catch (error) {
    console.warn(
      '[bluesky] Summary generation failed; using local fallback:',
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

function facetValidationIssues(
  text: string,
  facets: Array<Record<string, any>> | undefined
): string[] {
  const issues: string[] = [];
  const bytes = Buffer.from(text, 'utf8');

  for (const facet of facets ?? []) {
    const start = facet?.index?.byteStart;
    const end = facet?.index?.byteEnd;

    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end > bytes.length ||
      start >= end
    ) {
      issues.push('facet index is outside the UTF-8 post text');
      continue;
    }

    for (const feature of Array.isArray(facet.features) ? facet.features : []) {
      if (feature?.$type !== 'app.bsky.richtext.facet#link') continue;

      const visible = bytes.subarray(start, end).toString('utf8');
      if (!validUrl(feature.uri) || visible !== feature.uri) {
        issues.push(`link facet does not match its UTF-8 slice: ${String(feature.uri)}`);
      }
    }
  }

  return issues;
}

function externalEmbed(presentation: BlueskyPresentation, thumb: any | null) {
  return {
    $type: 'app.bsky.embed.external',
    external: {
      uri: presentation.destinationUrl,
      title: truncateGraphemes(presentation.cardTitle, 200).trim(),
      description: truncateGraphemes(presentation.cardDescription ?? '', 300).trim(),
      ...(thumb ? { thumb } : {}),
    },
  };
}

async function buildBlueskyEmbed(
  agent: BskyAgent,
  presentation: BlueskyPresentation,
  warnings: string[]
): Promise<any> {
  if (presentation.embedType === 'images' && presentation.nativeImageUrl && presentation.imageAlt) {
    const uploaded = await uploadImage(agent, presentation.nativeImageUrl, THUMB_LIMIT);

    if (uploaded.image) {
      const image: Record<string, any> = {
        alt: presentation.imageAlt,
        image: uploaded.image.blob,
      };

      if (uploaded.image.width > 0 && uploaded.image.height > 0) {
        image.aspectRatio = {
          width: uploaded.image.width,
          height: uploaded.image.height,
        };
      }

      return {
        $type: 'app.bsky.embed.images',
        images: [image],
      };
    }

    const warning = `Native image upload failed for ${
      presentation.nativeImageUrl
    }: ${uploaded.error ?? 'unknown_error'}`;
    warnings.push(warning);
    console.warn('[bluesky:image]', warning);

    // Do not retry the same failed URL as a card thumbnail. Only a different
    // fallback image (for example a generated Flow card) is worth uploading.
    let thumb: any | null = null;
    const fallbackImage =
      presentation.cardImage && presentation.cardImage !== presentation.nativeImageUrl
        ? presentation.cardImage
        : null;

    if (fallbackImage) {
      const fallback = await uploadImage(agent, fallbackImage, THUMB_LIMIT);
      if (fallback.image) {
        thumb = fallback.image.blob;
      } else {
        const warning = `Card image upload failed for ${fallbackImage}: ${fallback.error}`;
        warnings.push(warning);
        console.warn('[bluesky:image]', warning);
      }
    }

    return externalEmbed(presentation, thumb);
  }

  let thumb: any | null = null;

  if (presentation.cardImage) {
    const uploaded = await uploadImage(agent, presentation.cardImage, THUMB_LIMIT);
    if (uploaded.image) {
      thumb = uploaded.image.blob;
    } else {
      const warning = `Card image upload failed for ${presentation.cardImage}: ${uploaded.error}`;
      warnings.push(warning);
      console.warn('[bluesky:image]', warning);
    }
  }

  return externalEmbed(presentation, thumb);
}

/**
 * Publish an already-built presentation. Validation happens before any image
 * upload or post request. Exported so the same publication path can be tested
 * with an invalid presentation without hitting Bluesky.
 */
export async function publishBlueskyPresentation(
  presentation: BlueskyPresentation,
  options: { agent: BskyAgent; warnings?: string[] }
): Promise<BlueskyPublishResult> {
  const warnings = options.warnings ?? [];
  let agent = options.agent;

  const issues = validateBlueskyPresentation(presentation);

  if (issues.length > 0) {
    const detail = issues
      .map((issue) => `${issue.code}: ${issue.message}`)
      .join('; ')
      .slice(0, 500);

    console.warn('[bluesky] Presentation validation failed; refusing to publish.', {
      issues,
      presentation,
    });

    return {
      error: `Bluesky presentation validation failed: ${detail}`,
      presentation,
      warnings,
    };
  }

  const richText = new RichText({ text: presentation.postText });
  richText.detectFacetsWithoutResolution();

  if (richText.graphemeLength > BLUESKY_MAX_GRAPHEMES) {
    console.warn('[bluesky] Post still exceeds the grapheme limit; refusing.', {
      graphemes: richText.graphemeLength,
      shareUrl: presentation.flowUrl,
    });
    return {
      error: `Bluesky rejected the post: ${richText.graphemeLength} graphemes exceeds ${BLUESKY_MAX_GRAPHEMES}.`,
      presentation,
      warnings,
    };
  }

  const facetIssues = facetValidationIssues(
    presentation.postText,
    richText.facets as Array<Record<string, any>> | undefined
  );

  if (facetIssues.length > 0) {
    return {
      error: `Bluesky rich-text validation failed: ${facetIssues.join('; ').slice(0, 400)}`,
      presentation,
      warnings,
    };
  }

  const embed = await buildBlueskyEmbed(agent, presentation, warnings);

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
    presentationMode: presentation.presentationMode,
    destinationUrl: presentation.destinationUrl,
    usedSummary: presentation.usedSummary,
    graphemes: richText.graphemeLength,
    facets: richText.facets?.length ?? 0,
    embedType: embed.$type,
    cardTitle: presentation.cardTitle,
    warnings,
  });

  return {
    uri: result.uri,
    cid: result.cid,
    presentation,
    warnings,
  };
}

/**
 * Publish one short Bluesky post. The complete presentation is built and
 * validated before any upload or network publication happens.
 */
export async function publishToBluesky(input: PublishInput): Promise<BlueskyPublishResult> {
  let presentation: BlueskyPresentation | undefined;
  const warnings: string[] = [];

  try {
    let agent = await getBlueskyAgent();

    const explicitMedia = [
      ...(Array.isArray((input as any).media) ? (input as any).media : []),
      ...(input.imageUrl ? [{ url: input.imageUrl }] : []),
      ...(Array.isArray(input.imageUrls)
        ? input.imageUrls
            .filter((url): url is string => typeof url === 'string' && Boolean(url.trim()))
            .map((url) => ({ url: url.trim() }))
        : []),
    ];
    const normalized = normalizeFlowItem(input, {
      media: explicitMedia,
    });
    const inputDescription = typeof input.description === 'string' ? input.description.trim() : '';
    const content = inputDescription
      ? {
          ...normalized,
          description: truncateGraphemes(inputDescription, 300).trim(),
        }
      : normalized;

    const shareUrl = resolveBlueskyShareUrl({
      canonicalUrl: content.canonicalUrl,
      id: content.id,
    });
    const summary = await summarizeForBluesky(content, shareUrl);
    presentation = buildBlueskyPresentation({
      content,
      summary,
      flowUrl: shareUrl,
    });

    return publishBlueskyPresentation(presentation, { agent, warnings });
  } catch (error) {
    const message = blueskyErrorMessage(error);
    console.error('[bluesky] Publish failed:', {
      message,
      error,
      warnings,
    });
    return {
      error: message,
      uncertain: isUncertainBlueskyError(error),
      presentation,
      warnings,
    };
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
