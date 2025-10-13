// lib/metadataSanitize.ts
// Ensure metadata values are serializable for Next.js (no React elements, functions, symbols).
export function sanitizeMetadata(input: any): any {
  const seen = new WeakSet();

  function sanitize(value: any): any {
    // primitives are fine
    if (value == null) return value;
    const t = typeof value;
    if (t === 'string' || t === 'number' || t === 'boolean') return value;
    if (Array.isArray(value)) return value.map(sanitize).filter(v => v !== undefined);
    if (t === 'object') {
      if (seen.has(value)) return undefined; // circular
      seen.add(value);
      // If it's a plain object-like, sanitize its props
      const out: any = {};
      for (const k of Object.keys(value)) {
        const v = sanitize(value[k]);
        if (v !== undefined) out[k] = v;
      }
      return out;
    }
    // functions, symbols, BigInt, React elements -> skip or coerce to string
    try {
      return String(value);
    } catch {
      return undefined;
    }
  }

  return sanitize(input);
}
