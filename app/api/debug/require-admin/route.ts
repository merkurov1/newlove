import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';

export async function GET(req: Request) {
  try {
    // Snapshot incoming headers for diagnostics
    const headers: Record<string, string | null> = {};
    for (const k of Array.from(req.headers.keys())) headers[k] = req.headers.get(k);

    const diagnostics: Record<string, any> = { headers };

    // 1) Try interop helper if available
    try {
      const mod = await import('@/lib/supabaseInterop');
      if (mod && typeof mod.getUserAndSupabaseFromRequestInterop === 'function') {
        try {
          const res = await mod.getUserAndSupabaseFromRequestInterop(req as Request);
          diagnostics.interop = res || null;
        } catch (e) {
          diagnostics.interopError = String(e);
        }
      }
    } catch (e) {
      diagnostics.interopModule = 'not-available';
    }

    // 2) Attempt to call requireAdminFromRequest and capture its outcome
    try {
      const user = await requireAdminFromRequest(req as Request);
      diagnostics.requireAdmin = { ok: true, user };
    } catch (e: any) {
      diagnostics.requireAdmin = { ok: false, error: String(e) };
    }

    // 3) Reconstruct split cookies and attempt normalization/decoding + service RPC
    try {
      const cookieHeader = req.headers.get('cookie') || '';
      diagnostics.rawCookieHeader = cookieHeader;
      const cookies = Object.fromEntries(
        cookieHeader
          .split(';')
          .map((s) => {
            const [k, ...v] = s.split('=');
            return [k && k.trim(), decodeURIComponent((v || []).join('='))];
          })
          .filter(Boolean)
      );
      diagnostics.cookieNames = Object.keys(cookies || {});

      let reconstructedToken: string | null = null;
      // standard names
      reconstructedToken = cookies['sb-access-token'] || cookies['supabase-access-token'] || null;
      if (!reconstructedToken) {
        const candidates: Record<string, string[]> = {};
        for (const name of Object.keys(cookies || {})) {
          if (/sb-.*(?:auth-token|access-token|token)/i.test(name) || /supabase-?access-?token/i.test(name)) {
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
              return { idx: idx === '-' ? -1 : parseInt(idx, 10), val: rest.join(':') };
            })
            .sort((a, b) => a.idx - b.idx);
          const joined = parts.map((p) => p.val).join('');
          if (joined && joined.length) {
            reconstructedToken = joined;
            diagnostics.matchedCookieBase = base;
            diagnostics.matchedCookieParts = parts.map((p) => ({ idx: p.idx, len: p.val.length }));
            break;
          }
        }
      }
      diagnostics.reconstructedTokenPreview = reconstructedToken ? (String(reconstructedToken).slice(0, 12) + '…') : null;

      // Normalize shapes
      let normalized: string | null = reconstructedToken;
      if (normalized) {
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
      }
      diagnostics.normalizedTokenPreview = normalized ? (String(normalized).slice(0, 12) + '…') : null;

      // decode JWT sub
      let decodedUid: string | null = null;
      if (normalized) {
        try {
          const parts = String(normalized).split('.');
          if (parts.length >= 2) {
            const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const pad = payloadB64.length % 4;
            const padded = payloadB64 + (pad ? '='.repeat(4 - pad) : '');
            const buf = Buffer.from(padded, 'base64');
            const payloadJson = buf.toString('utf8');
            const payload = JSON.parse(payloadJson || '{}');
            decodedUid = payload.sub || payload.user_id || null;
          }
        } catch (e) {
          diagnostics.decodeError = String(e);
        }
      }
      diagnostics.decodedUid = decodedUid;

      // Try service RPC by decoded uid
      try {
        if (decodedUid) {
          const { getServerSupabaseClient } = await import('@/lib/serverAuth');
          const svc = getServerSupabaseClient({ useServiceRole: true });
          try {
            const rpcAny = await (svc as any).rpc('get_my_user_roles_any', { uid_text: decodedUid });
            diagnostics.reconstructedRpc = rpcAny || null;
          } catch (e) {
            diagnostics.reconstructedRpcError = String(e);
          }
        }
      } catch (e) {
        diagnostics.reconstructedRpcInitError = String(e);
      }
    } catch (e) {
      diagnostics.cookieReconstructError = String(e);
    }

    // Safely serialize diagnostics to avoid circular structures (clients, SDKs)
    const getCircularReplacer = () => {
      const seen = new WeakSet();
      return function (_key: string, value: any) {
        if (typeof value === 'function') return undefined;
        if (value && typeof value === 'object') {
          if (seen.has(value)) return '[Circular]';
          seen.add(value);
        }
        return value;
      };
    };

    const safeDiagnostics: any = {};
    for (const k of Object.keys(diagnostics)) {
      const v = diagnostics[k];
      try {
        // try to JSON stringify with circular replacer and parse back
        const s = JSON.stringify(v, getCircularReplacer());
        safeDiagnostics[k] = JSON.parse(s);
      } catch (e) {
        // fallback to a short string summary
        try {
          safeDiagnostics[k] = String(v).slice(0, 1000);
        } catch (ee) {
          safeDiagnostics[k] = '(unserializable)';
        }
      }
    }

    return NextResponse.json({ diagnostics: safeDiagnostics });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
