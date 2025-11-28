// Utilities for reconstructing and normalizing Supabase tokens from cookies/headers
export type ReconstructResult = {
  token: string | null;
  cookieNames: string[];
  matchedCookieBase?: string;
  matchedCookieParts?: Array<{ idx: number; len: number }>;
};

export function parseCookies(cookieHeader: string): Record<string, string> {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader
      .split(';')
      .map((s) => {
        const [k, ...v] = s.split('=');
        return [k && k.trim(), decodeURIComponent((v || []).join('='))];
      })
      .filter(Boolean)
  );
}

export function reconstructTokenFromCookies(cookies: Record<string, string>): ReconstructResult {
  const cookieNames = Object.keys(cookies || {});
  // Try standard names first
  let token = cookies['sb-access-token'] || cookies['supabase-access-token'] || null;
  let matchedCookieBase: string | undefined;
  let matchedCookieParts: Array<{ idx: number; len: number }> | undefined;
  if (!token) {
    // Broaden matching to capture more cookie-name patterns seen in deployments
    // Examples: '__Host-sb-access-token', 'sb:token', 'sb.token.0', 'supabase-access-token'
    const candidates: Record<string, string[]> = {};
    const nameRegex = /(sb[:._-]?.*(?:auth-token|access-token|token)|supabase[:._-]?access[:._-]?token)/i;
    for (const name of cookieNames) {
      if (nameRegex.test(name)) {
        const m = name.match(/^(.*?)(?:\.(\d+))?$/);
        const base = m ? m[1] : name;
        const partIndex = m && m[2] ? parseInt(m[2], 10) : -1;
        if (!candidates[base]) candidates[base] = [];
        candidates[base].push(typeof partIndex === 'number' && partIndex >= 0 ? `${partIndex}:${cookies[name]}` : `-:${cookies[name]}`);
      }
    }
    for (const base of Object.keys(candidates)) {
      const parts = candidates[base]
        .map((s) => {
          const [idx, ...rest] = s.split(':');
          return { idx: idx === '-' ? -1 : parseInt(idx, 10), val: rest.join(':') } as any;
        })
        .sort((a: any, b: any) => a.idx - b.idx);
      const joined = parts.map((p: any) => p.val).join('');
      if (joined && joined.length > 0) {
        token = joined;
        matchedCookieBase = base;
        matchedCookieParts = parts.map((p: any) => ({ idx: p.idx, len: p.val.length }));
        break;
      }
    }
  }

  return { token, cookieNames, matchedCookieBase, matchedCookieParts };
}

export function normalizeToken(raw?: string | null): string | null {
  if (!raw) return null;
  let normalized: any = raw;
  try {
    const maybe = typeof normalized === 'string' ? decodeURIComponent(normalized) : normalized;
    if (typeof maybe === 'string' && maybe.trim().startsWith('{')) {
      const parsed = JSON.parse(maybe);
      if (parsed && (parsed.access_token || parsed.token || parsed.accessToken)) {
        normalized = parsed.access_token || parsed.token || parsed.accessToken;
      }
    }
  } catch (e) {
    // ignore
  }

  if (typeof normalized === 'string' && normalized.startsWith('base64-')) {
    try {
      const b64 = normalized.slice('base64-'.length);
      const buf = Buffer.from(b64, 'base64');
      const txt = buf.toString('utf8');
      try {
        const parsed = JSON.parse(txt);
        if (parsed && (parsed.access_token || parsed.token || parsed.accessToken)) {
          normalized = parsed.access_token || parsed.token || parsed.accessToken;
        } else {
          normalized = txt;
        }
      } catch (e) {
        normalized = txt;
      }
    } catch (e) {
      // ignore
    }
  }

  return typeof normalized === 'string' ? normalized : null;
}

export function decodeUidFromJwt(token?: string | null): string | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = payloadB64.length % 4;
    const padded = payloadB64 + (pad ? '='.repeat(4 - pad) : '');
    const buf = Buffer.from(padded, 'base64');
    const payloadJson = buf.toString('utf8');
    const payload = JSON.parse(payloadJson || '{}');
    return payload.sub || payload.user_id || null;
  } catch (e) {
    return null;
  }
}

export function extractTokenFromCookieHeader(cookieHeader: string): ReconstructResult {
  const cookies = parseCookies(cookieHeader || '');
  return reconstructTokenFromCookies(cookies);
}

const tokenUtils = {
  parseCookies,
  reconstructTokenFromCookies,
  normalizeToken,
  decodeUidFromJwt,
  extractTokenFromCookieHeader,
};

export default tokenUtils;
