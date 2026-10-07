export type YouTubeMetadata = {
  video_id: string;
  title: string;
  author_name: string | null;
  author_url: string | null;
  thumbnail_url: string;
  thumbnail_width: number | null;
  thumbnail_height: number | null;
  provider_name: 'YouTube';
};

export type YouTubeInfo = {
  videoId: string;
  canonicalUrl: string;
  metadata: YouTubeMetadata;
};

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
]);

const VIDEO_ID_PATTERN =
  /^[A-Za-z0-9_-]{6,20}$/;

function isValidVideoId(
  value: string | null | undefined,
): value is string {
  return Boolean(
    value &&
      VIDEO_ID_PATTERN.test(
        value,
      ),
  );
}

function getHost(
  value: string,
): string | null {
  try {
    const url =
      new URL(value);

    return url.hostname
      .toLowerCase()
      .replace(
        /\.$/,
        '',
      );
  } catch {
    return null;
  }
}

/**
 * Returns true when the URL belongs to YouTube
 * and looks like a supported video URL.
 */
export function isYouTubeUrl(
  value: string,
): boolean {
  const host =
    getHost(value);

  if (
    !host ||
    !YOUTUBE_HOSTS.has(host)
  ) {
    return false;
  }

  return Boolean(
    extractYouTubeVideoId(
      value,
    ),
  );
}

/**
 * Extracts a YouTube video ID from:
 *
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/shorts/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://www.youtube.com/live/VIDEO_ID
 * - https://www.youtube.com/v/VIDEO_ID
 */
export function extractYouTubeVideoId(
  value: string,
): string | null {
  const trimmed =
    value.trim();

  if (!trimmed) {
    return null;
  }

  let url: URL;

  try {
    url =
      new URL(trimmed);
  } catch {
    return null;
  }

  const host =
    url.hostname
      .toLowerCase()
      .replace(
        /\.$/,
        '',
      );

  if (
    !YOUTUBE_HOSTS.has(host)
  ) {
    return null;
  }

  /*
   * Standard watch URL:
   * youtube.com/watch?v=...
   */
  if (
    host === 'youtube.com' ||
    host === 'www.youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'music.youtube.com'
  ) {
    const queryId =
      url.searchParams.get(
        'v',
      );

    if (
      isValidVideoId(
        queryId,
      )
    ) {
      return queryId;
    }

    /*
     * Shorts:
     * /shorts/VIDEO_ID
     *
     * Embed:
     * /embed/VIDEO_ID
     *
     * Live:
     * /live/VIDEO_ID
     *
     * Legacy:
     * /v/VIDEO_ID
     */
    const match =
      url.pathname.match(
        /^\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{6,20})(?:\/|$)/,
      );

    if (
      match &&
      isValidVideoId(
        match[1],
      )
    ) {
      return match[1];
    }

    return null;
  }

  /*
   * Short URL:
   * youtu.be/VIDEO_ID
   */
  if (
    host === 'youtu.be' ||
    host === 'www.youtu.be'
  ) {
    const id =
      url.pathname
        .split('/')
        .filter(Boolean)[0] ??
      null;

    return isValidVideoId(
      id,
    )
      ? id
      : null;
  }

  return null;
}

/**
 * Converts any supported YouTube URL into
 * the canonical watch URL.
 */
export function getYouTubeCanonicalUrl(
  value: string,
): string | null {
  const videoId =
    extractYouTubeVideoId(
      value,
    );

  if (!videoId) {
    return null;
  }

  return `https://www.youtube.com/watch?v=${videoId}`;
}

type YouTubeOEmbedResponse = {
  type?: string;
  version?: string;
  provider_name?: string;
  provider_url?: string;
  title?: string;
  author_name?: string;
  author_url?: string;
  width?: number;
  height?: number;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
  html?: string;
};

function toNullableString(
  value:
    | string
    | null
    | undefined,
): string | null {
  if (
    typeof value !==
      'string' ||
    !value.trim()
  ) {
    return null;
  }

  return value.trim();
}

function toNullableNumber(
  value:
    | number
    | null
    | undefined,
): number | null {
  return typeof value ===
    'number' &&
    Number.isFinite(value)
    ? value
    : null;
}

/**
 * Fetches public metadata from YouTube's
 * oEmbed endpoint.
 *
 * No API key is required.
 */
export async function fetchYouTubeMetadata(
  value: string,
  options?: {
    signal?: AbortSignal;
  },
): Promise<YouTubeInfo> {
  const videoId =
    extractYouTubeVideoId(
      value,
    );

  if (!videoId) {
    throw new Error(
      'Invalid YouTube video URL.',
    );
  }

  const canonicalUrl =
    `https://www.youtube.com/watch?v=${videoId}`;

  const endpoint =
    new URL(
      'https://www.youtube.com/oembed',
    );

  endpoint.searchParams.set(
    'url',
    canonicalUrl,
  );

  endpoint.searchParams.set(
    'format',
    'json',
  );

  endpoint.searchParams.set(
    'maxwidth',
    '1280',
  );

  const controller =
    new AbortController();

  const timeout =
    setTimeout(() => {
      controller.abort();
    }, 8000);

  const signal =
    options?.signal
      ? AbortSignal.any([
          options.signal,
          controller.signal,
        ])
      : controller.signal;

  try {
    const response =
      await fetch(
        endpoint.toString(),
        {
          method: 'GET',
          headers: {
            Accept:
              'application/json',
          },
          signal,
          cache: 'no-store',
        },
      );

    if (!response.ok) {
      throw new Error(
        `YouTube metadata request failed with status ${response.status}.`,
      );
    }

    const data =
      (await response.json()) as YouTubeOEmbedResponse;

    if (
      data.type &&
      data.type !== 'video'
    ) {
      throw new Error(
        'The YouTube URL did not resolve to a video.',
      );
    }

    const title =
      toNullableString(
        data.title,
      );

    if (!title) {
      throw new Error(
        'YouTube did not return a video title.',
      );
    }

    const thumbnail =
      toNullableString(
        data.thumbnail_url,
      ) ??
      `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    const metadata: YouTubeMetadata =
      {
        video_id:
          videoId,

        title,

        author_name:
          toNullableString(
            data.author_name,
          ),

        author_url:
          toNullableString(
            data.author_url,
          ),

        thumbnail_url:
          thumbnail,

        thumbnail_width:
          toNullableNumber(
            data.thumbnail_width,
          ),

        thumbnail_height:
          toNullableNumber(
            data.thumbnail_height,
          ),

        provider_name:
          'YouTube',
      };

    return {
      videoId,
      canonicalUrl,
      metadata,
    };
  } finally {
    clearTimeout(
      timeout,
    );
  }
}

/**
 * Convenience helper for callers that only need
 * to know whether a URL is YouTube and obtain
 * normalized metadata.
 *
 * Returns null for non-YouTube URLs.
 */
export async function resolveYouTube(
  value: string,
  options?: {
    signal?: AbortSignal;
  },
): Promise<YouTubeInfo | null> {
  if (
    !isYouTubeUrl(value)
  ) {
    return null;
  }

  return fetchYouTubeMetadata(
    value,
    options,
  );
}