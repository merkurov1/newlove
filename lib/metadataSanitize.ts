// lib/metadataSanitize.ts
// Ensure metadata values are serializable for Next.js (no React elements, functions, symbols).
export function sanitizeMetadata(input: any): any {
  const seen = new WeakSet();
  function isReactElement(obj: any) {
    if (!obj || typeof obj !== 'object') return false;
    // React elements have a $$typeof property that is a Symbol
    return Object.prototype.hasOwnProperty.call(obj, '$$typeof');
  }

  function sanitize(value: any): any {
    if (value == null) return value;
    const t = typeof value;

    // Primitives
    if (t === 'string' || t === 'number' || t === 'boolean') return value;
    if (t === 'bigint' || t === 'symbol' || t === 'function') return undefined;

    // Dates -> ISO
    if (value instanceof Date) return isNaN(value.getTime()) ? undefined : value.toISOString();
    // URLs/RegExp -> toString
    if (value instanceof URL) return value.toString();
    if (value instanceof RegExp) return value.toString();

    // Arrays: sanitize items and drop undefined
    if (Array.isArray(value)) return value.map(sanitize).filter(v => v !== undefined);

    // Objects: drop React elements and circular refs
    if (t === 'object') {
      if (isReactElement(value)) return undefined;
      if (seen.has(value)) return undefined;
      seen.add(value);

      const out: any = {};
      // iterate own enumerable keys only
      for (const k of Object.keys(value)) {
        try {
          const v = sanitize(value[k]);
          if (v !== undefined) out[k] = v;
        } catch {
          // skip problematic property
        }
      }
      return out;
    }

    return undefined;
  }

  return sanitize(input);
}
