// lib/metadataSanitize.ts
// Ensure metadata values are serializable for Next.js (no React elements, functions, symbols).
export function sanitizeMetadata(input: any): any {
  const DIAG = process.env.METADATA_DIAG === 'true';
  const seen = new WeakSet();

  function isReactElement(obj: any) {
    if (!obj || typeof obj !== 'object') return false;
    return Object.prototype.hasOwnProperty.call(obj, '$$typeof');
  }

  function constructorName(v: any) {
    try {
      return v && v.constructor && v.constructor.name ? v.constructor.name : typeof v;
    } catch (e) {
      return typeof v;
    }
  }

  function previewValue(v: any) {
    try {
      if (typeof v === 'string') return v.slice(0, 200);
      if (typeof v === 'number' || typeof v === 'boolean') return String(v);
      if (v === null || v === undefined) return String(v);
      if (Array.isArray(v)) return `[Array(${v.length})]`;
      if (v instanceof Date) return `Date(${v.toISOString()})`;
      if (v instanceof URL) return `URL(${v.toString()})`;
      if (v instanceof RegExp) return `RegExp(${v.toString()})`;
      if (typeof v === 'object') return Object.keys(v).slice(0, 10).join(', ');
      return typeof v;
    } catch (e) {
      return typeof v;
    }
  }

  function logDiag(path: string[], value: any, reason: string) {
    if (!DIAG) return;
    try {
      const p = path.length ? path.join('.') : '<root>';
      const preview = previewValue(value);
      const cname = constructorName(value);
      const stack = new Error().stack;
      // eslint-disable-next-line no-console
      console.error(`SANITIZE DIAG: ${reason} at metadata.${p} constructor=${cname} preview=${preview}`);
      // eslint-disable-next-line no-console
      console.error(stack);
    } catch (e) {
      // swallow
    }
  }

  function isPromiseLike(v: any) {
    return v && (typeof v.then === 'function' || Object.prototype.toString.call(v) === '[object Promise]');
  }

  function isRequestLike(v: any) {
    const name = constructorName(v);
    return name === 'Request' || name === 'NextRequest' || (v && typeof v.headers === 'object' && typeof v.method === 'string');
  }

  function isResponseLike(v: any) {
    const name = constructorName(v);
    return name === 'Response' || name === 'NextResponse' || (v && typeof v.json === 'function' && typeof v.headers === 'object');
  }

  function isStreamLike(v: any) {
    const name = constructorName(v);
    return name === 'ReadableStream' || name === 'Stream' || (v && typeof v.getReader === 'function');
  }

  function sanitize(value: any, path: string[] = []): any {
    if (value == null) return value;
    const t = typeof value;

    // Primitives
    if (t === 'string' || t === 'number' || t === 'boolean') return value;
    if (t === 'bigint' || t === 'symbol' || t === 'function') {
      logDiag(path, value, `unsupported-type:${t}`);
      return undefined;
    }

    // Promise-like -> drop
    if (isPromiseLike(value)) {
      logDiag(path, value, 'promise-like');
      return undefined;
    }

    // Dates -> ISO
    if (value instanceof Date) return isNaN(value.getTime()) ? undefined : value.toISOString();
    // URLs/RegExp -> toString
    if (value instanceof URL) return value.toString();
    if (value instanceof RegExp) return value.toString();

    // Request/Response/Stream/Headers detection
    if (isRequestLike(value)) {
      logDiag(path, value, 'request-like');
      return undefined;
    }
    if (isResponseLike(value)) {
      logDiag(path, value, 'response-like');
      return undefined;
    }
    if (isStreamLike(value)) {
      logDiag(path, value, 'stream-like');
      return undefined;
    }

    // Arrays: sanitize items and drop undefined
    if (Array.isArray(value)) {
      const arr = value.map((it, i) => sanitize(it, path.concat(String(i)))).filter(v => v !== undefined);
      return arr;
    }

    // Objects: drop React elements and circular refs
    if (t === 'object') {
      if (isReactElement(value)) {
        logDiag(path, value, 'react-element');
        return undefined;
      }
      if (seen.has(value)) {
        logDiag(path, value, 'circular');
        return undefined;
      }
      seen.add(value);

      const out: any = {};
      // iterate own enumerable keys only
      for (const k of Object.keys(value)) {
        try {
          const v = sanitize(value[k], path.concat(k));
          if (v !== undefined) out[k] = v;
        } catch (err) {
          // skip problematic property but log diag
          logDiag(path.concat(k), value[k], 'property-skip');
        }
      }
      return out;
    }

    // Fallback: unsupported
    logDiag(path, value, `fallback-unsupported:${t}`);
    return undefined;
  }

  return sanitize(input, []);
}
