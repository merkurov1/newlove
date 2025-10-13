// Small helper to ensure data returned from DB is plain JSON-serializable.
// It uses JSON round-trip to strip functions, Dates become ISO strings, and
// any circular / unsupported values cause a safe fallback.
export function safeData<T>(obj: T): T {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (e) {
    // If serialization fails (circular refs etc.), return an empty structure of same kind
    return (Array.isArray(obj) ? ([] as unknown as T) : ({} as unknown as T));
  }
}

// Safe error logger: avoid passing complex objects (like React Server Components)
// directly into console.error which can trigger serialization errors in Next.js.
export function safeLogError(message: string, err: any) {
  try {
    if (!err) return console.error(message);
    // Prefer primitive error fields
    const out: any = { message: err.message || String(err) };
    if (err.code) out.code = err.code;
    if (err.digest) out.digest = err.digest;
    return console.error(message, JSON.stringify(out));
  } catch (e) {
    return console.error(message, String(err));
  }
}

export function safeStringify(obj: any) {
  try {
    return JSON.stringify(obj);
  } catch (e) {
    try {
      // fallback: attempt to convert common errors/props
      if (obj && obj.message) return JSON.stringify({ message: obj.message });
      return JSON.stringify(String(obj));
    } catch (e2) {
      return '"[unserializable]"';
    }
  }
}

