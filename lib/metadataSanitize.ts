// lib/metadataSanitize.ts
// Ensure metadata values are serializable for Next.js (no React elements, functions, symbols).
export function sanitizeMetadata(input: any): any {
  // Lightweight sanitizer that preserves simple string titles/descriptions
  // while stripping non-serializable values (functions, React elements, symbols).
  // This keeps pages from losing their titles while remaining safe for Next.js.
  try {
    if (!input || typeof input !== 'object') return { title: String(input || ''), description: '' };

    const out: any = {};
    if (typeof input.title === 'string' && input.title.trim().length > 0) {
      out.title = input.title;
    } else if (
      input.title &&
      typeof input.title === 'object' &&
      input.title.default &&
      typeof input.title.default === 'string'
    ) {
      // support `{ default, template }` shape from root layout
      out.title = input.title.default;
    }

    if (typeof input.description === 'string') out.description = input.description;

    // OpenGraph / twitter images and other fields are optional; keep minimal safe values
    if (input.openGraph && typeof input.openGraph === 'object') {
      out.openGraph = {};
      if (typeof input.openGraph.title === 'string') out.openGraph.title = input.openGraph.title;
      if (typeof input.openGraph.description === 'string')
        out.openGraph.description = input.openGraph.description;
      // Preserve canonical URL and type if provided (useful for social scrapers)
      if (typeof input.openGraph.url === 'string' && input.openGraph.url.trim())
        out.openGraph.url = input.openGraph.url;
      if (typeof input.openGraph.type === 'string' && input.openGraph.type.trim())
        out.openGraph.type = input.openGraph.type;
      if (Array.isArray(input.openGraph.images)) {
        out.openGraph.images = input.openGraph.images
          .filter((i: any) => {
            if (!i) return false;
            if (typeof i === 'string') return true;
            if (i && typeof i === 'object' && typeof i.url === 'string') return true;
            return false;
          })
          .slice(0, 3);
      }
    }

    // Twitter card images: preserve if provided
    if (input.twitter && typeof input.twitter === 'object') {
      out.twitter = {};
      if (typeof input.twitter.card === 'string') out.twitter.card = input.twitter.card;
      if (typeof input.twitter.title === 'string') out.twitter.title = input.twitter.title;
      if (typeof input.twitter.description === 'string')
        out.twitter.description = input.twitter.description;
      if (Array.isArray(input.twitter.images)) {
        out.twitter.images = input.twitter.images
          .filter(
            (i: any) =>
              typeof i === 'string' || (i && typeof i === 'object' && typeof i.url === 'string')
          )
          .slice(0, 3);
      }
    }

    // Preserve canonical alternate URL when provided so Next can emit a <link rel="canonical"> tag.
    if (input.alternates && typeof input.alternates === 'object') {
      if (typeof input.alternates.canonical === 'string' && input.alternates.canonical.trim()) {
        out.alternates = { canonical: input.alternates.canonical };
      }
    }

    // Preserve robots hints (index/follow) when explicitly provided. Next will render proper meta tags.
    if (input.robots && typeof input.robots === 'object') {
      // Only copy simple primitive values to avoid React elements or functions
      const robotsOut: any = {};
      if (typeof input.robots.index === 'boolean') robotsOut.index = input.robots.index;
      if (typeof input.robots.follow === 'boolean') robotsOut.follow = input.robots.follow;
      if (input.robots.googleBot && typeof input.robots.googleBot === 'object') {
        robotsOut.googleBot = {};
        for (const k of [
          'index',
          'follow',
          'max-snippet',
          'max-image-preview',
          'max-video-preview',
        ]) {
          if (k in input.robots.googleBot) robotsOut.googleBot[k] = input.robots.googleBot[k];
        }
      }
      if (Object.keys(robotsOut).length > 0) out.robots = robotsOut;
    }

    // Fallback to minimal metadata when nothing useful found
    if (!out.title) out.title = 'Untitled';
    if (!out.description) out.description = '';

    return out;
  } catch (e) {
    return { title: 'Untitled', description: '' };
  }
}
