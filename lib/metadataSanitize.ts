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
    } else if (input.title && typeof input.title === 'object' && input.title.default && typeof input.title.default === 'string') {
      // support `{ default, template }` shape from root layout
      out.title = input.title.default;
    }

    if (typeof input.description === 'string') out.description = input.description;

    // OpenGraph / twitter images and other fields are optional; keep minimal safe values
    if (input.openGraph && typeof input.openGraph === 'object') {
      out.openGraph = {};
      if (typeof input.openGraph.title === 'string') out.openGraph.title = input.openGraph.title;
      if (typeof input.openGraph.description === 'string') out.openGraph.description = input.openGraph.description;
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

    // Fallback to minimal metadata when nothing useful found
    if (!out.title) out.title = 'Untitled';
    if (!out.description) out.description = '';

    return out;
  } catch (e) {
    return { title: 'Untitled', description: '' };
  }
}

