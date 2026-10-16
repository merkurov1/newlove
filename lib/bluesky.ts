
import { BskyAgent, RichText } from '@atproto/api';
import sharp from 'sharp';

let cachedAgent: BskyAgent | null = null;

const IMAGE_LIMIT = 2_000_000;
const THUMB_LIMIT = 950_000;
const MAX_IMAGES = 4;

type LinkPreview = {
  url?: string;
  title?: string;
  description?: string;
  image?: string;
};

type PublishInput = {
  title?: string | null;
  type?: string | null;
  body_md?: string | null;
  source_url?: string | null;
  slug?: string | null;
  lang?: string;
  imageUrl?: string | null;
  imageUrls?: string[];
  youtubeUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  description?: string | null;
};

async function getBlueskyAgent(): Promise<BskyAgent> {
  if (cachedAgent?.hasSession) return cachedAgent;

  const identifier = process.env.BLUESKY_IDENTIFIER;
  const password = process.env.BLUESKY_PASSWORD;

  if (!identifier || !password) {
    throw new Error(
      'BLUESKY_IDENTIFIER or BLUESKY_PASSWORD is missing.',
    );
  }

  const agent = new BskyAgent({
    service: 'https://bsky.social',
  });

  await agent.login({ identifier, password });
  cachedAgent = agent;

  return agent;
}

function validUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;

  try {
    const url = new URL(value.trim());

    if (!['http:', 'https:'].includes(url.protocol)) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function flowUrl(slug?: string | null): string | null {
  if (!slug?.trim()) return null;

  return (
    'https://www.merkurov.love/flow/' +
    encodeURIComponent(slug.trim())
  );
}

function cleanMarkdown(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
      '$1 ($2)',
    )
    .replace(/\x60{3}[\s\S]*?\x60{3}/g, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/\x60([^\x60]+)\x60/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateText(value: string, limit = 275): string {
  const Segmenter = (Intl as any).Segmenter;

  const parts: string[] = Segmenter
    ? Array.from(
        new Segmenter(undefined, {
          granularity: 'grapheme',
        }).segment(value),
        (part: any) => part.segment,
      )
    : Array.from(value);

  if (parts.length <= limit) return value;

  return parts.slice(0, limit - 1).join('').trimEnd() + '…';
}

function getPreviews(
  metadata?: Record<string, unknown> | null,
): LinkPreview[] {
  if (!metadata) return [];

  const value = Array.isArray(metadata.link_previews)
    ? metadata.link_previews
    : metadata.link_preview
      ? [metadata.link_preview]
      : [];

  return value.filter(
    (entry): entry is LinkPreview =>
      Boolean(entry && typeof entry === 'object'),
  );
}

/**
 * Download and normalize images before uploading them to Bluesky.
 * EXIF rotation is applied and output is converted to JPEG.
 */
async function uploadImage(
  agent: BskyAgent,
  imageUrl: string,
  maxBytes: number,
): Promise<any | null> {
  const url = validUrl(imageUrl);

  if (!url) {
    console.warn('[bluesky:image] Invalid image URL.');
    return null;
  }

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      headers: {
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.5',
      },
    });

    if (!response.ok) {
      console.warn(
        '[bluesky:image] Image request failed:',
        response.status,
        url,
      );
      return null;
    }

    const contentType = (
      response.headers.get('content-type') || ''
    )
      .split(';')[0]
      .toLowerCase();

    if (!contentType.startsWith('image/')) {
      console.warn(
        '[bluesky:image] URL did not return an image:',
        contentType,
      );
      return null;
    }

    const declaredSize = Number(
      response.headers.get('content-length') || 0,
    );

    if (declaredSize > 15_000_000) {
      console.warn('[bluesky:image] Source exceeds 15 MB.');
      return null;
    }

    const source = Buffer.from(await response.arrayBuffer());

    if (!source.length || source.length > 15_000_000) {
      console.warn('[bluesky:image] Empty or oversized image.');
      return null;
    }

    let normalized: Buffer | null = null;

    const attempts = [
      { width: 2000, quality: 86 },
      { width: 1800, quality: 78 },
      { width: 1500, quality: 70 },
      { width: 1200, quality: 62 },
    ];

    for (const attempt of attempts) {
      const output = await sharp(source, {
        animated: false,
        failOn: 'none',
      })
        .rotate()
        .resize({
          width: attempt.width,
          height: attempt.width,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({
          quality: attempt.quality,
          mozjpeg: true,
        })
        .toBuffer();

      if (output.length <= maxBytes) {
        normalized = output;
        break;
      }
    }

    if (!normalized) {
      console.warn(
        '[bluesky:image] Unable to compress image within the size limit.',
      );
      return null;
    }

    const uploaded = await agent.uploadBlob(
      new Uint8Array(normalized),
      { encoding: 'image/jpeg' },
    );

    console.info('[bluesky:image] Image uploaded:', {
      bytes: normalized.length,
      limit: maxBytes,
      host: new URL(url).hostname,
    });

    return uploaded.data?.blob || null;
  } catch (error) {
    console.error('[bluesky:image] Processing failed:', error);
    return null;
  }
}

export async function publishToBluesky({
  title,
  type,
  body_md,
  source_url,
  slug,
  imageUrl,
  imageUrls,
  youtubeUrl,
  metadata,
  description,
}: PublishInput): Promise<{ uri: string; cid: string } | null> {
  try {
    const agent = await getBlueskyAgent();

    const postType = (type || 'note').toLowerCase();
    const pageUrl = flowUrl(slug);
    const previews = getPreviews(metadata);
    const firstPreview = previews[0];

    const cleanTitle = (title || '').trim();
    const cleanBody = cleanMarkdown(body_md || '');

    const images = Array.from(
      new Set(
        [
          ...(Array.isArray(imageUrls) ? imageUrls : []),
          ...(imageUrl ? [imageUrl] : []),
        ]
          .map(validUrl)
          .filter((url): url is string => Boolean(url)),
      ),
    ).slice(0, MAX_IMAGES);

    const youtube = validUrl(youtubeUrl) ||
      validUrl((metadata?.youtube as any)?.url) ||
      (
        typeof (metadata?.youtube as any)?.video_id === 'string'
          ? 'https://www.youtube.com/watch?v=' +
            (metadata?.youtube as any).video_id
          : null
      );

    const isVideo = postType === 'video' || Boolean(youtube);
    const isLink = postType === 'link';

    // Real Flow attachments take priority over an Open Graph thumbnail.
    // A video or link keeps its own external preview card.
    const useImageEmbed =
      images.length > 0 && !isVideo && !isLink;

    let cardUrl: string | null;

    if (isVideo) {
      cardUrl = youtube;
    } else if (isLink) {
      cardUrl =
        validUrl(firstPreview?.url) ||
        validUrl(source_url);
    } else {
      cardUrl = pageUrl || validUrl(source_url);
    }

    const isRedundantTitle =
      !cleanTitle ||
      cleanTitle.toLowerCase() === cleanBody.toLowerCase() ||
      cleanBody.toLowerCase().startsWith(cleanTitle.toLowerCase());

    const textParts = [
      isRedundantTitle ? null : cleanTitle,
      cleanBody,
    ].filter(Boolean);

    let postText = textParts.join('\n\n');

    // With native image attachments, include the Flow link in the text.
    // For external cards, the card itself is the destination.
    if (
      (useImageEmbed || !cardUrl) &&
      pageUrl &&
      !postText.includes(pageUrl)
    ) {
      postText = postText
        ? postText + '\n\n' + pageUrl
        : pageUrl;
    }

    const finalText = truncateText(
      postText || 'Flow | Anton Merkurov',
    );

    const richText = new RichText({ text: finalText });
    await richText.detectFacets(agent);

    let embed: any;

    if (useImageEmbed) {
      const uploadedImages: Array<{
        image: any;
        alt: string;
      }> = [];

      for (let index = 0; index < images.length; index += 1) {
        const blob = await uploadImage(
          agent,
          images[index],
          IMAGE_LIMIT,
        );

        if (blob) {
          uploadedImages.push({
            image: blob,
            alt:
              cleanTitle ||
              'Flow image ' + (index + 1),
          });
        }
      }

      if (uploadedImages.length > 0) {
        embed = {
          $type: 'app.bsky.embed.images',
          images: uploadedImages,
        };
      } else {
        console.warn(
          '[bluesky] No attached image uploaded; using a link card fallback.',
        );
      }
    }

    if (!embed && cardUrl) {
      const youtubeMeta = metadata?.youtube as any;

      const cardTitle = (
        (isLink && firstPreview?.title) ||
        (isVideo && youtubeMeta?.title) ||
        cleanTitle ||
        cleanBody.slice(0, 100) ||
        'Flow | Anton Merkurov'
      ).slice(0, 200);

      const cardDescription = (
        (isLink && firstPreview?.description) ||
        description ||
        cleanBody ||
        (isVideo
          ? 'Watch on YouTube.'
          : 'Read on merkurov.love.')
      ).slice(0, 300);

      const thumbnailUrl = isLink
        ? validUrl(firstPreview?.image)
        : isVideo
          ? validUrl(youtubeMeta?.thumbnail_url) ||
            validUrl(youtubeMeta?.thumbnail)
          : null;

      let thumb: any = null;

      if (thumbnailUrl) {
        thumb = await uploadImage(
          agent,
          thumbnailUrl,
          THUMB_LIMIT,
        );
      }

      embed = {
        $type: 'app.bsky.embed.external',
        external: {
          uri: cardUrl,
          title: cardTitle,
          description: cardDescription,
          ...(thumb ? { thumb } : {}),
        },
      };
    }

    const record: any = {
      $type: 'app.bsky.feed.post',
      text: richText.text,
      createdAt: new Date().toISOString(),
      ...(richText.facets?.length
        ? { facets: richText.facets }
        : {}),
      ...(embed ? { embed } : {}),
    };

    const result = await agent.post(record);

    console.info('[bluesky] Published:', {
      type: postType,
      embedType: embed?.$type || 'none',
      imageCount:
        embed?.$type === 'app.bsky.embed.images'
          ? embed.images.length
          : 0,
      uri: result.uri,
    });

    return {
      uri: result.uri,
      cid: result.cid,
    };
  } catch (error) {
    console.error('[bluesky] Publish failed:', error);
    return null;
  }
}

export async function deleteFromBluesky(
  uri: string,
): Promise<boolean> {
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
