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
      VIDEO_ID_PATTERN.test(value),
  );
}

function normalizeHost(
  hostname: string,
): string {
  return hostname
    .toLowerCase()
    .replace(/\.$/, '');
}

function cleanInput(
  value: string,
): string {
  return value
    .trim()
    .replace(/^<|>$/g, '');
}

function toUrl(
  value: string,
): URL | null {
  const cleaned =
    cleanInput(value);

  if (!cleaned) {
    return null;
  }

  try {
    return new URL(cleaned);
  } catch {
    try {
      return new URL(
        `https://${cleaned}`,
      );
    } catch {
      return null;
    }
  }
}

function getYouTubeHost(
  value: string,
): string | null {
  const url =
    toUrl(value);

  if (!url) {
    return null;
  }

  const host =
    normalizeHost(
      url.hostname,
    );

  return YOUTUBE_HOSTS.has(host)
    ? host
    : null;
}

export function extractYouTubeVideoId(
  value: string,
): string | null {
  const url =
    toUrl(value);

  if (!url) {
    return null;
  }

  const host =
    normalizeHost(
      url.hostname,
    );

  if (!YOUTUBE_HOSTS.has(host)) {
    return null;
  }

  if (
    host === 'youtube.com' ||
    host === 'www.youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'music.youtube.com'
  ) {
    const queryId =
      url.searchParams.get('v');

    if (
      isValidVideoId(
        queryId,
      )
    ) {
      return queryId;
    }

    const match =
      url.pathname.match(
        /^\/(?:shorts|live|embed|v)\/([A-Za-z0-9_-]{6,20})(?:\/|$)/,
      );

    if (
      match &&
      isValidVideoId(
        match[1],
      )
    ) {
      return match[1];
    }

    const encodedUrl =
      url.searchParams.get('u');

    if (encodedUrl) {
      try {
        const decoded =
          decodeURIComponent(
            encodedUrl,
          );

        const nestedId =
          extractYouTubeVideoId(
            decoded,
          );

        if (nestedId) {
          return nestedId;
        }
      } catch {
        // Ignore malformed URL.
      }
    }

    return null;
  }

  if (
    host === 'youtu.be' ||
    host === 'www.youtu.be'
  ) {
    const id =
      url.pathname
        .split('/')
        .filter(Boolean)[0] ??
      null;

    return isValidVideoId(id)
      ? id
      : null;
  }

  return null;
}

export function isYouTubeUrl(
  value: string,
): boolean {
  return Boolean(
    getYouTubeHost(value) &&
      extractYouTubeVideoId(value),
  );
}

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

function nullableString(
  value:
    | string
    | null
    | undefined,
): string | null {
  if (
    typeof value !== 'string' ||
    !value.trim()
  ) {
    return null;
  }

  return value.trim();
}

function nullableNumber(
  value:
    | number
    | null
    | undefined,
): number | null {
  return typeof value === 'number' &&
    Number.isFinite(value)
    ? value
    : null;
}

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

  const abortFromCaller =
    () => controller.abort();

  if (options?.signal) {
    if (options.signal.aborted) {
      controller.abort();
    } else {
      options.signal.addEventListener(
        'abort',
        abortFromCaller,
        { once: true },
      );
    }
  }

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
          signal:
            controller.signal,
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
        'This YouTube URL is not a video.',
      );
    }

    const title =
      nullableString(
        data.title,
      );

    if (!title) {
      throw new Error(
        'YouTube did not return a video title.',
      );
    }

    const thumbnail =
      nullableString(
        data.thumbnail_url,
      ) ??
      `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    const metadata: YouTubeMetadata = {
      video_id:
        videoId,

      title,

      author_name:
        nullableString(
          data.author_name,
        ),

      author_url:
        nullableString(
          data.author_url,
        ),

      thumbnail_url:
        thumbnail,

      thumbnail_width:
        nullableNumber(
          data.thumbnail_width,
        ),

      thumbnail_height:
        nullableNumber(
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

    if (options?.signal) {
      options.signal.removeEventListener(
        'abort',
        abortFromCaller,
      );
    }
  }
}

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