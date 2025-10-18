// lib/serializeForClient.ts
/**
 * Serialize data for passing from Server Components to Client Components.
 * - Converts Date -> ISO string
 * - Strips non-enumerable/prototype properties by copying own enumerable keys
 * - Removes functions and symbols (stringifies them)
 * - Handles circular references by replacing with the string "[Circular]"
 */
export function serializeForClient<T = any>(value: T): any {
    const seen = new WeakMap<object, any>();

    function _serialize(v: any): any {
        if (v === null || v === undefined) return v;
        const t = typeof v;
        if (t === 'string' || t === 'number' || t === 'boolean') return v;
        if (v instanceof Date) return v.toISOString();
        if (Array.isArray(v)) {
            if (seen.has(v)) return '[Circular]';
            const out: any[] = [];
            seen.set(v, out);
            for (let i = 0; i < v.length; i++) out[i] = _serialize(v[i]);
            return out;
        }
        if (t === 'object') {
            if (seen.has(v)) return '[Circular]';
            // Create a plain object
            const out: any = {};
            seen.set(v, out);
            // Only copy own enumerable string keys
            for (const key of Object.keys(v)) {
                try {
                    out[key] = _serialize(v[key]);
                } catch (e) {
                    out[key] = String(v[key]);
                }
            }
            return out;
        }
        // functions, symbols: stringify
        try { return String(v); } catch (e) { return null; }
    }

    return _serialize(value);
}

export default serializeForClient;
