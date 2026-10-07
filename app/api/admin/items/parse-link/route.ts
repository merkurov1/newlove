import {
  NextRequest,
  NextResponse,
} from 'next/server';

import dns from 'node:dns/promises';
import net from 'node:net';

import * as cheerio from 'cheerio';

import { createClient } from '@/lib/supabase/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import {
  isYouTubeUrl,
  resolveYouTube,
} from '@/lib/flow/youtube';

export const dynamic = 'force-dynamic';

const MAX_HTML_BYTES =
  2 * 1024 * 1024;

const MAX_REDIRECTS = 5;

type LinkMetadata = {
  url: string;
  canonical_url: string;
  domain: string;
  title: string | null;
  description: string | null;
  image: string | null;
  site_name: string | null;
  author: string | null;
  published_at: string | null;
  type: string | null;
};

function normalizeInputUrl(
  value: string,
) {
  const trimmed =
    value.trim();

  if (!trimmed) {
    throw new Error(
      'URL is required.',
    );
  }

  if (
    /^https?:\/\//i.test(
      trimmed,
    )
  ) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

function isPrivateIp(
  address: string,
) {
  const version =
    net.isIP(address);

  if (version === 4) {
    const parts =
      address
        .split('.')
        .map(Number);

    const [
      a,
      b,
    ] = parts;

    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 &&
        b === 254) ||
      (a === 172 &&
        b >= 16 &&
        b <= 31) ||
      (a === 192 &&
        b === 168)
    );
  }

  if (version === 6) {
    const normalized =
      address.toLowerCase();

    return (
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb')
    );
  }

  return true;
}

async function assertSafeUrl(
  input: string,
) {
  let url: URL;

  try {
    url = new URL(
      normalizeInputUrl(input),
    );
  } catch {
    throw new Error(
      'Invalid URL.',
    );
  }

  if (
    url.protocol !== 'http:' &&
    url.protocol !== 'https:'
  ) {
    throw new Error(
      'Only HTTP and HTTPS links are supported.',
    );
  }

  const hostname =
    url.hostname.toLowerCase();

  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname ===
      'metadata.google.internal'
  ) {
    throw new Error(
      'This URL is not allowed.',
    );
  }

  const addresses =
    await dns.lookup(
      hostname,
      {
        all: true,
      },
    );

  if (!addresses.length) {
    throw new Error(
      'Could not resolve host.',
    );
  }

  for (const entry of addresses) {
    if (
      isPrivateIp(
        entry.address,
      )
    ) {
      throw new Error(
        'Private network URLs are not allowed.',
      );
    }
  }

  return url;
}

async function fetchHtml(
  initialUrl: string,
) {
  let current =
    await assertSafeUrl(
      initialUrl,
    );

  for (
    let redirect = 0;
    redirect <= MAX_REDIRECTS;
    redirect++
  ) {
    const response =
      await fetch(
        current.toString(),
        {
          method: 'GET',
          redirect: 'manual',
          headers: {
            'User-Agent':
              'MerkurovFlow/1.0 (+https://www.merkurov.love)',
            Accept:
              'text/html,application/xhtml+xml',
          },
          signal:
            AbortSignal.timeout(
              10000,
            ),
        },
      );

    if (
      response.status >= 300 &&
      response.status < 400
    ) {
      const location =
        response.headers.get(
          'location',
        );

      if (!location) {
        throw new Error(
          'Redirect without location.',
        );
      }

      current =
        await assertSafeUrl(
          new URL(
            location,
            current,
          ).toString(),
        );

      continue;
    }

    if (!response.ok) {
      throw new Error(
        `Remote server returned HTTP ${response.status}.`,
      );
    }

    const contentType =
      response.headers.get(
        'content-type',
      ) ?? '';

    if (
      !contentType.includes(
        'text/html',
      ) &&
      !contentType.includes(
        'application/xhtml+xml',
      )
    ) {
      throw new Error(
        `URL is not an HTML page (${contentType || 'unknown content type'}).`,
      );
    }

    const contentLength =
      Number(
        response.headers.get(
          'content-length',
        ) ?? 0,
      );

    if (
      contentLength >
      MAX_HTML_BYTES
    ) {
      throw new Error(
        'Page is too large to parse.',
      );
    }

    const buffer =
      await response.arrayBuffer();

    if (
      buffer.byteLength >
      MAX_HTML_BYTES
    ) {
      throw new Error(
        'Page is too large to parse.',
      );
    }

    return {
      url: current,
      html: new TextDecoder(
        'utf-8',
      ).decode(buffer),
      status:
        response.status,
    };
  }

  throw new Error(
    'Too many redirects.',
  );
}

function meta(
  $: cheerio.CheerioAPI,
  selectors: string[],
) {
  for (const selector of selectors) {
    const value =
      $(selector)
        .first()
        .attr('content')
        ?.trim();

    if (value) {
      return value;
    }
  }

  return null;
}

function text(
  value: string | null,
) {
  return (
    value
      ?.replace(/\s+/g, ' ')
      .trim() || null
  );
}

function parseJsonLd(
  $: cheerio.CheerioAPI,
) {
  const values: any[] = [];

  $(
    'script[type="application/ld+json"]',
  ).each(
    (_, element) => {
      const raw =
        $(element)
          .text()
          .trim();

      if (!raw) {
        return;
      }

      try {
        const parsed =
          JSON.parse(raw);

        if (Array.isArray(parsed)) {
          values.push(
            ...parsed,
          );
        } else if (
          parsed?.['@graph'] &&
          Array.isArray(
            parsed['@graph'],
          )
        ) {
          values.push(
            ...parsed['@graph'],
          );
        } else {
          values.push(parsed);
        }
      } catch {
        // Ignore malformed JSON-LD.
      }
    },
  );

  return values;
}

function findJsonLdArticle(
  values: any[],
) {
  return (
    values.find(
      (value) => {
        const type =
          value?.['@type'];

        if (Array.isArray(type)) {
          return type.some(
            (entry) =>
              [
                'Article',
                'NewsArticle',
                'BlogPosting',
                'WebPage',
              ].includes(entry),
          );
        }

        return [
          'Article',
          'NewsArticle',
          'BlogPosting',
          'WebPage',
        ].includes(type);
      },
    ) ??
    values[0] ??
    null
  );
}

function normalizeMetadata(
  inputUrl: URL,
  $: cheerio.CheerioAPI,
): LinkMetadata {
  const jsonLd =
    findJsonLdArticle(
      parseJsonLd($),
    );

  const canonical =
    $('link[rel="canonical"]')
      .first()
      .attr('href')
      ?.trim();

  const canonicalUrl =
    canonical
      ? new URL(
          canonical,
          inputUrl,
        ).toString()
      : inputUrl.toString();

  const title =
    meta($, [
      'meta[property="og:title"]',
      'meta[name="twitter:title"]',
    ]) ??
    text(
      $('title')
        .first()
        .text(),
    ) ??
    text(
      jsonLd?.headline ??
        jsonLd?.name ??
        null,
    );

  const description =
    meta($, [
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
      'meta[name="description"]',
    ]) ??
    text(
      jsonLd?.description ??
        null,
    );

  const image =
    meta($, [
      'meta[property="og:image"]',
      'meta[property="og:image:url"]',
      'meta[name="twitter:image"]',
    ]) ??
    (typeof jsonLd?.image ===
    'string'
      ? jsonLd.image
      : Array.isArray(
          jsonLd?.image,
        )
        ? jsonLd.image[0]
        : jsonLd?.image?.url ??
          null);

  const author =
    meta($, [
      'meta[name="author"]',
      'meta[property="article:author"]',
    ]) ??
    (typeof jsonLd?.author
      ?.name === 'string'
      ? jsonLd.author.name
      : typeof jsonLd?.author ===
          'string'
        ? jsonLd.author
        : null);

  const publishedAt =
    meta($, [
      'meta[property="article:published_time"]',
      'meta[name="date"]',
      'meta[itemprop="datePublished"]',
    ]) ??
    jsonLd?.datePublished ??
    null;

  const siteName =
    meta($, [
      'meta[property="og:site_name"]',
    ]) ??
    text(
      jsonLd?.publisher?.name ??
        null,
    );

  const type =
    meta($, [
      'meta[property="og:type"]',
    ]) ??
    (typeof jsonLd?.['@type'] ===
    'string'
      ? jsonLd['@type']
      : null);

  const absoluteImage =
    image
      ? new URL(
          image,
          inputUrl,
        ).toString()
      : null;

  return {
    url: inputUrl.toString(),
    canonical_url:
      canonicalUrl,
    domain:
      inputUrl.hostname,
    title,
    description,
    image:
      absoluteImage,
    site_name:
      siteName,
    author,
    published_at:
      publishedAt
        ? String(publishedAt)
        : null,
    type,
  };
}

export async function POST(
  req: NextRequest,
) {
  try {
    await requireAdminFromRequest(
      req,
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unauthorized',
      },
      { status: 401 },
    );
  }

  try {
    const body =
      await req.json();

    const itemId =
      typeof body.item_id === 'string'
        ? body.item_id
        : null;

    const rawUrl =
      typeof body.url === 'string'
        ? body.url.trim()
        : '';

    if (!itemId) {
      return NextResponse.json(
        {
          error:
            'item_id is required.',
        },
        { status: 400 },
      );
    }

    if (!rawUrl) {
      return NextResponse.json(
        {
          error:
            'URL is required.',
        },
        { status: 400 },
      );
    }

    const supabase =
      createClient({
        useServiceRole: true,
      });

    /*
     * ---------------------------------------------------------
     * YouTube
     * ---------------------------------------------------------
     *
     * YouTube is handled separately from the generic HTML
     * parser. This avoids fetching the YouTube page just to
     * extract metadata and gives Flow a stable video model.
     */

    const normalizedUrl =
      normalizeInputUrl(
        rawUrl,
      );

    if (
      isYouTubeUrl(
        normalizedUrl,
      )
    ) {
      const youtube =
        await resolveYouTube(
          normalizedUrl,
        );

      if (!youtube) {
        throw new Error(
          'Could not resolve YouTube video.',
        );
      }

      const {
        data: existingItem,
        error:
          existingError,
      } = await supabase
        .from('items')
        .select(
          'metadata',
        )
        .eq('id', itemId)
        .single();

      if (existingError) {
        throw existingError;
      }

      const existingMetadata =
        existingItem?.metadata &&
        typeof existingItem.metadata ===
          'object'
          ? existingItem.metadata
          : {};

      const mergedMetadata = {
        ...existingMetadata,
        image:
          youtube.metadata
            .thumbnail_url,
        site_name:
          'YouTube',
        type:
          'video',
        youtube:
          youtube.metadata,
      };

      const {
        data: item,
        error:
          updateError,
      } = await supabase
        .from('items')
        .update({
          type: 'video',
          source_url:
            youtube.canonicalUrl,
          title:
            youtube.metadata.title,
          body_md:
            '',
          metadata:
            mergedMetadata,
        })
        .eq('id', itemId)
        .select('*')
        .single();

      if (updateError) {
        throw updateError;
      }

      return NextResponse.json({
        success: true,
        item,
        metadata:
          mergedMetadata,
      });
    }

    /*
     * ---------------------------------------------------------
     * Generic web link
     * ---------------------------------------------------------
     */

    const parsed =
      await assertSafeUrl(
        rawUrl,
      );

    const {
      url,
      html,
      status,
    } = await fetchHtml(
      parsed.toString(),
    );

    const $ =
      cheerio.load(html);

    const metadata =
      normalizeMetadata(
        url,
        $,
      );

    if (
      !metadata.title &&
      !metadata.description
    ) {
      return NextResponse.json(
        {
          error:
            'Could not extract useful metadata from this page.',
        },
        { status: 422 },
      );
    }

    const {
      data: existingItem,
      error:
        existingError,
    } = await supabase
      .from('items')
      .select(
        'metadata',
      )
      .eq('id', itemId)
      .single();

    if (existingError) {
      throw existingError;
    }

    const existingMetadata =
      existingItem?.metadata &&
      typeof existingItem.metadata ===
        'object'
        ? existingItem.metadata
        : {};

    const bodyMd =
      metadata.description ??
      '';

    const mergedMetadata = {
      ...existingMetadata,
      ...metadata,
      http_status:
        status,
    };

    const {
      data: item,
      error:
        updateError,
    } = await supabase
      .from('items')
      .update({
        type: 'link',
        source_url:
          metadata.canonical_url,
        title:
          metadata.title ??
          metadata.domain,
        body_md:
          bodyMd,
        metadata:
          mergedMetadata,
      })
      .eq('id', itemId)
      .select('*')
      .single();

    if (updateError) {
      throw updateError;
    }

    const {
      error:
        snapshotError,
    } = await supabase
      .from('link_snapshots')
      .insert({
        item_id: itemId,
        url:
          metadata.canonical_url,
        fetched_at:
          new Date().toISOString(),
        http_status:
          status,
      });

    if (snapshotError) {
      console.warn(
        '[parse-link] snapshot insert failed:',
        snapshotError,
      );
    }

    return NextResponse.json({
      success: true,
      item,
      metadata:
        mergedMetadata,
    });
  } catch (error) {
    console.error(
      '[parse-link]',
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to parse link.',
      },
      { status: 500 },
    );
  }
}