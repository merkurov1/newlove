// lib/metadataSanitize.ts
// Ensure metadata values are serializable for Next.js (no React elements, functions, symbols, cyclic refs).
import type { Metadata } from 'next';

function isPlainObject(item: unknown): item is Record<string, any> {
  return typeof item === 'object' && item !== null && !Array.isArray(item);
}

function sanitizeString(val: unknown): string | undefined {
  if (typeof val === 'string' && val.trim().length > 0) {
    return val.trim();
  }
  return undefined;
}

function sanitizeUrl(val: unknown): URL | string | undefined {
  if (val instanceof URL) return val;
  if (typeof val === 'string' && val.trim().length > 0) return val.trim();
  return undefined;
}

export function sanitizeMetadata(input: any): Metadata {
  try {
    if (!input || typeof input !== 'object') {
      return { title: 'Anton Merkurov', description: '' };
    }

    const out: Metadata = {};

    // 1. metadataBase
    const metaBase = sanitizeUrl(input.metadataBase);
    if (metaBase) {
      out.metadataBase = metaBase instanceof URL ? metaBase : new URL(metaBase);
    }

    // 2. title
    if (typeof input.title === 'string' && input.title.trim().length > 0) {
      out.title = input.title.trim();
    } else if (isPlainObject(input.title)) {
      if (typeof input.title.absolute === 'string' && input.title.absolute.trim().length > 0) {
        out.title = {
          absolute: input.title.absolute.trim(),
          ...(typeof input.title.template === 'string' ? { template: input.title.template } : {}),
        };
      } else {
        const defaultTitle = sanitizeString(input.title.default) || 'Anton Merkurov';
        if (typeof input.title.template === 'string' && input.title.template.trim().length > 0) {
          out.title = {
            default: defaultTitle,
            template: input.title.template.trim(),
          };
        } else {
          out.title = defaultTitle;
        }
      }
    }

    // 3. description
    if (typeof input.description === 'string') {
      out.description = input.description.trim();
    }

    // 4. applicationName, generator, category
    if (typeof input.applicationName === 'string') out.applicationName = input.applicationName.trim();
    if (typeof input.generator === 'string') out.generator = input.generator.trim();
    if (typeof input.category === 'string') out.category = input.category.trim();

    // 5. keywords
    if (Array.isArray(input.keywords)) {
      out.keywords = input.keywords.filter((k: unknown) => typeof k === 'string' && (k as string).trim().length > 0);
    } else if (typeof input.keywords === 'string') {
      out.keywords = input.keywords.split(',').map((k: string) => k.trim()).filter(Boolean);
    }

    // 6. authors, creator, publisher
    if (Array.isArray(input.authors)) {
      out.authors = input.authors
        .filter((a: any) => a && (typeof a.name === 'string' || typeof a.url === 'string'))
        .map((a: any) => ({
          name: sanitizeString(a.name) || 'Anton Merkurov',
          url: sanitizeString(a.url),
        }));
    } else if (typeof input.authors === 'string') {
      out.authors = [{ name: input.authors.trim() }];
    }

    if (typeof input.creator === 'string') out.creator = input.creator.trim();
    if (typeof input.publisher === 'string') out.publisher = input.publisher.trim();

    // 7. openGraph
    if (isPlainObject(input.openGraph)) {
      const og: any = {};
      if (typeof input.openGraph.title === 'string') og.title = input.openGraph.title.trim();
      if (typeof input.openGraph.description === 'string') og.description = input.openGraph.description.trim();
      if (typeof input.openGraph.url === 'string') og.url = input.openGraph.url.trim();
      if (typeof input.openGraph.siteName === 'string') og.siteName = input.openGraph.siteName.trim();
      if (typeof input.openGraph.locale === 'string') og.locale = input.openGraph.locale.trim();
      if (typeof input.openGraph.type === 'string') og.type = input.openGraph.type.trim();

      if (Array.isArray(input.openGraph.images)) {
        og.images = input.openGraph.images
          .map((img: any) => {
            if (typeof img === 'string') return img.trim();
            if (isPlainObject(img) && typeof img.url === 'string') {
              return {
                url: img.url.trim(),
                width: typeof img.width === 'number' ? img.width : undefined,
                height: typeof img.height === 'number' ? img.height : undefined,
                alt: typeof img.alt === 'string' ? img.alt : undefined,
              };
            }
            return null;
          })
          .filter(Boolean)
          .slice(0, 5);
      }
      out.openGraph = og;
    }

    // 8. twitter
    if (isPlainObject(input.twitter)) {
      const tw: any = {};
      if (typeof input.twitter.card === 'string') tw.card = input.twitter.card.trim();
      if (typeof input.twitter.title === 'string') tw.title = input.twitter.title.trim();
      if (typeof input.twitter.description === 'string') tw.description = input.twitter.description.trim();
      if (typeof input.twitter.site === 'string') tw.site = input.twitter.site.trim();
      if (typeof input.twitter.creator === 'string') tw.creator = input.twitter.creator.trim();

      if (Array.isArray(input.twitter.images)) {
        tw.images = input.twitter.images
          .map((img: any) => {
            if (typeof img === 'string') return img.trim();
            if (isPlainObject(img) && typeof img.url === 'string') return img.url.trim();
            return null;
          })
          .filter(Boolean)
          .slice(0, 5);
      } else if (typeof input.twitter.images === 'string') {
        tw.images = [input.twitter.images.trim()];
      }
      out.twitter = tw;
    }

    // 9. alternates
    if (isPlainObject(input.alternates)) {
      const alt: any = {};
      if (typeof input.alternates.canonical === 'string' && input.alternates.canonical.trim()) {
        alt.canonical = input.alternates.canonical.trim();
      }
      if (isPlainObject(input.alternates.languages)) {
        alt.languages = { ...input.alternates.languages };
      }
      if (isPlainObject(input.alternates.types)) {
        alt.types = { ...input.alternates.types };
      }
      out.alternates = alt;
    }

    // 10. robots
    if (isPlainObject(input.robots)) {
      const robotsOut: any = {};
      if (typeof input.robots.index === 'boolean') robotsOut.index = input.robots.index;
      if (typeof input.robots.follow === 'boolean') robotsOut.follow = input.robots.follow;
      if (typeof input.robots.nocache === 'boolean') robotsOut.nocache = input.robots.nocache;

      if (isPlainObject(input.robots.googleBot)) {
        robotsOut.googleBot = {};
        for (const k of [
          'index',
          'follow',
          'noimageindex',
          'max-snippet',
          'max-image-preview',
          'max-video-preview',
        ]) {
          if (k in input.robots.googleBot) robotsOut.googleBot[k] = input.robots.googleBot[k];
        }
      }
      out.robots = robotsOut;
    }

    // 11. icons
    if (input.icons) {
      if (typeof input.icons === 'string' || Array.isArray(input.icons)) {
        out.icons = input.icons;
      } else if (isPlainObject(input.icons)) {
        out.icons = { ...input.icons };
      }
    }

    // 12. manifest
    if (typeof input.manifest === 'string' || input.manifest instanceof URL) {
      out.manifest = input.manifest;
    }

    // 13. verification
    if (isPlainObject(input.verification)) {
      const ver: any = {};
      if (typeof input.verification.google === 'string') ver.google = input.verification.google.trim();
      if (typeof input.verification.yandex === 'string') ver.yandex = input.verification.yandex.trim();
      if (typeof input.verification.yahoo === 'string') ver.yahoo = input.verification.yahoo.trim();
      if (isPlainObject(input.verification.other)) ver.other = { ...input.verification.other };
      out.verification = ver;
    }

    // 14. other meta tags
    if (isPlainObject(input.other)) {
      const otherOut: Record<string, string | number | (string | number)[]> = {};
      for (const [k, v] of Object.entries(input.other)) {
        if (typeof v === 'string' || typeof v === 'number') {
          otherOut[k] = v;
        } else if (Array.isArray(v)) {
          otherOut[k] = v.filter((item) => typeof item === 'string' || typeof item === 'number');
        }
      }
      out.other = otherOut;
    }

    // Fallbacks
    if (!out.title) out.title = 'Anton Merkurov';
    if (out.description === undefined) out.description = '';

    return out;
  } catch {
    return { title: 'Anton Merkurov', description: '' };
  }
}
