import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import dns from 'node:dns/promises';
import net from 'node:net';

import { createClient } from '@/lib/supabase/server';
import { requireAdminFromRequest } from '@/lib/auth/admin';
import {
  getYouTubeCanonicalUrl,
  isYouTubeUrl,
  resolveYouTube,
} from '@/lib/flow/youtube';

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

function isPrivateIp(
  address: string,
): boolean {
  const family =
    net.isIP(address);

  if (family === 4) {
    const parts =
      address
        .split('.')
        .map(Number);

    if (parts.length !== 4) {
      return true;
    }

    const [
      a,
      b,
      c,
      d,
    ] = parts;

    if (a === 10) {
      return true;
    }

    if (
      a === 127
    ) {
      return true;
    }

    if (
      a === 169 &&
      b === 254
    ) {
      return true;
    }

    if (
      a === 172 &&
      b >= 16 &&
      b <= 31
    ) {
      return true;
    }

    if (
      a === 192 &&
      b === 168
    ) {
      return true;
    }

    if (
      a === 100 &&
      b >= 64 &&
      b <= 127
    ) {
      return true;
    }

    if (
      a === 192 &&
      b === 0 &&
      c === 0
    ) {
      return true;
    }

    if (
      a === 198 &&
      (b === 18 ||
        b === 19)
    ) {
      return true;
    }

    if (
      a === 198 &&
      b === 51 &&
      c === 100
    ) {
      return true;
    }

    if (
      a === 203 &&
      b === 0 &&
      c === 113
    ) {
      return true;
    }

    if (
      a >= 224
    ) {
      return true;
    }

    return false;
  }

  if (family === 6) {
    const normalized =
      address
        .toLowerCase();

    if (
      normalized === '::1' ||
      normalized === '::'
    ) {
      return true;
    }

    if (
      normalized.startsWith(
        'fc',
      ) ||
      normalized.startsWith(
        'fd',
      )
    ) {
      return true;
    }

    if (
      normalized.startsWith(
        'fe8',
      ) ||
      normalized.startsWith(
        'fe9',
      ) ||
      normalized.startsWith(
        'fea',
      ) ||
      normalized.startsWith(
        'feb',
      )
    ) {
      return true;
    }

    if (
      normalized.startsWith(
        'ff',
      )
    ) {
      return true;
    }

    if (
      normalized.startsWith(
        '::ffff:127.',
      )
    ) {
      return true;
    }

    if (
      normalized.startsWith(
        '::ffff:10.',
      )
    ) {
      return true;
    }

    if (
      normalized.startsWith(
        '::ffff:192.168.',
      )
    ) {
      return true;
    }

    return false;
  }

  return true;
}

async function assertSafeUrl(
  rawUrl: string,
): Promise<URL> {
  let url: URL;

  try {
    url = new URL(
      rawUrl,
    );
  } catch {
    throw new Error(
      'Invalid URL.',
    );
  }

  if (
    url.protocol !==
      'http:' &&
    url.protocol !==
      'https:'
  ) {
    throw new Error(
      'Only HTTP and HTTPS URLs are supported.',
    );
  }

  if (
    url.username ||
    url.password
  ) {
    throw new Error(
      'URLs with credentials are not allowed.',
    );
  }

  const hostname =
    url.hostname
      .toLowerCase();

  if (
    hostname ===
      'localhost' ||
    hostname.endsWith(
      '.localhost',
    )
  ) {
    throw new Error(
      'Localhost URLs are not allowed.',
    );
  }

  if (
    net.isIP(hostname)
  ) {
    if (
      isPrivateIp(
        hostname,
      )
    ) {
      throw new Error(
        'Private network URLs are not allowed.',
      );
    }

    return url;
  }

  let addresses;

  try {
    addresses =
      await dns.lookup(
        hostname,
        {
          all: true,
          verbatim: true,
        },
      );
  } catch {
    throw new Error(
      'Could not resolve hostname.',
    );
  }

  if (
    !addresses.length
  ) {
    throw new Error(
      'Could not resolve hostname.',
    );
  }

  for (const address of addresses) {
    if (
      isPrivateIp(
        address.address,
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
  url: string,
) {
  let currentUrl =
    new URL(url);

  for (
    let redirect = 0;
    redirect <= 5;
    redirect++
  ) {
    await assertSafeUrl(
      currentUrl.toString(),
    );

    const response =
      await fetch(
        currentUrl.toString(),
        {
          method: 'GET',
          headers: {
            'User-Agent':
              'Mozilla/5.0 (compatible; merkurov.love Flow/1.0)',
            Accept:
              'text/html,application/xhtml+xml',
          },
          redirect:
            'manual',
          cache: 'no-store',
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
          'Redirect response did not provide a location.',
        );
      }

      currentUrl =
        new URL(
          location,
          currentUrl,
        );

      continue;
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
        'The URL does not point to an HTML page.',
      );
    }

    const html =
      await response.text();

    return {
      url:
        currentUrl,
      html,
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

        if (
          Array.isArray(
            parsed,
          )
        ) {
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
          values.push(
            parsed,
          );
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

        if (
          Array.isArray(type)
        ) {
          return type.some(
            (entry) =>
              [
                'Article',
                'NewsArticle',
                'BlogPosting',
                'WebPage',
              ].includes(
                entry,
              ),
          );
        }

        return [
          'Article',
          'NewsArticle',
          'BlogPosting',
          'WebPage',
        ].includes(
          type,
        );
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
    url:
      inputUrl.toString(),
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
        ? String(
            publishedAt,
          )
        : null,
    type,
  };
}

function normalizeInputUrl(
  value: string,
): string {
  const trimmed =
    value
      .trim()
      .replace(
        /^<|>$/g,
        '',
      );

  if (
    /^https?:\/\//i.test(
      trimmed,
    )
  ) {
    return trimmed;
  }

  return `https://${trimmed}`;
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
      {
        status: 401,
      },
    );
  }

  try {
    const body =
      await req.json();

    const itemId =
      typeof body.item_id ===
      'string'
        ? body.item_id
        : null;

    const rawUrl =
      typeof body.url ===
      'string'
        ? body.url.trim()
        : '';

    if (!itemId) {
      return NextResponse.json(
        {
          error:
            'item_id is required.',
        },
        {
          status: 400,
        },
      );
    }

    if (!rawUrl) {
      return NextResponse.json(
        {
          error:
            'URL is required.',
        },
        {
          status: 400,
        },
      );
    }

    const supabase =
      createClient({
        useServiceRole:
          true,
      });

    /*
     * ---------------------------------------------------------
     * YouTube
     * ---------------------------------------------------------
     */

    const normalizedUrl =
      normalizeInputUrl(
        rawUrl,
      );

    const youtubeCanonicalUrl =
      getYouTubeCanonicalUrl(
        normalizedUrl,
      );

    if (
      youtubeCanonicalUrl &&
      isYouTubeUrl(
        youtubeCanonicalUrl,
      )
    ) {
      const youtube =
        await resolveYouTube(
          youtubeCanonicalUrl,
        );

      if (!youtube) {
        throw new Error(
          'Could not resolve YouTube video.',
        );
      }

      const {
        data:
          existingItem,
        error:
          existingError,
      } = await supabase
        .from('items')
        .select('metadata')
        .eq('id', itemId)
        .single();

      if (existingError) {
        throw existingError;
      }

      const existingMetadata =
        existingItem?.metadata &&
        typeof existingItem
          .metadata ===
          'object' &&
        !Array.isArray(
          existingItem.metadata,
        )
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

        description:
          youtube.metadata.title,

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
        success:
          true,
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
        normalizedUrl,
      );

    const {
      url,
      html,
      status,
    } = await fetchHtml(
      parsed.toString(),
    );

    const $ =
      cheerio.load(
        html,
      );

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
        {
          status: 422,
        },
      );
    }

    const {
      data:
        existingItem,
      error:
        existingError,
    } = await supabase
      .from('items')
      .select('metadata')
      .eq('id', itemId)
      .single();

    if (existingError) {
      throw existingError;
    }

    const existingMetadata =
      existingItem?.metadata &&
      typeof existingItem
        .metadata ===
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
        item_id:
          itemId,

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
      success:
        true,
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
      {
        status: 500,
      },
    );
  }
}