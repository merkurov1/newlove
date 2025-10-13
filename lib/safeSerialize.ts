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
