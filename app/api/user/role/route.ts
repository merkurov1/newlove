import { NextResponse } from 'next/server';
import getUserAndSupabaseForRequest from '@/lib/getUserAndSupabaseForRequest';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import tokenUtils from '@/lib/auth/tokenUtils';

export async function GET(req: Request) {
  try {
    // Диагностика: логируем Authorization заголовок и наличие токена в cookie
    try {
      const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || null;
      const cookieHeader = req.headers.get('cookie') || null;
      if (authHeader && typeof authHeader === 'string') {
        if (authHeader.toLowerCase().startsWith('bearer ')) {
          const token = authHeader.slice(7).trim();
          console.debug('[api/user/role] Authorization header present (Bearer), token prefix=', token.slice(0, 8));
        } else {
          console.debug('[api/user/role] Authorization header present but not Bearer (will try cookies). header=', authHeader.slice(0, 40));
        }
      } else {
        // Try to detect Supabase-style access token in cookies for clearer diagnostics
        let cookieTokenPreview = null;
        try {
          const res = tokenUtils.extractTokenFromCookieHeader(cookieHeader || '');
          if (res && res.token) cookieTokenPreview = String(res.token).slice(0, 12) + '…';
        } catch (ee) {
          // ignore
        }
        console.debug('[api/user/role] No Authorization header; cookie present=', Boolean(cookieHeader), 'cookie token preview=', cookieTokenPreview);
      }
    } catch (e) {
      console.debug('[api/user/role] cannot read authorization header or cookies', e);
    }

    // Try to extract user id from Authorization header or cookies first.
    // This avoids initializing the request-scoped supabase client which in some
    // runtimes can mutate cookies/sessions and cause cross-tab logout.
    let token: string | null = null;
    let authHeaderPresent = false;
    let cookieNames: string[] = [];
    let tokenSource: 'authorization' | 'cookie' | 'none' = 'none';
  // Debug info is collected and returned to help middleware diagnose role checks.
  // Capture raw cookie header and header keys early for troubleshooting missing cookies.
  const rawCookieHeader = (req.headers.get('cookie') as string) || null;
  const requestHeaderKeys = Array.from(req.headers.keys());
  const debugInfo: Record<string, any> = { authHeaderPresent, cookieNames, tokenSource, decodedUid: null, rawCookieHeader, requestHeaderKeys };
    try {
      const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || null;
      if (authHeader && typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
        token = authHeader.slice(7).trim();
        authHeaderPresent = true;
        tokenSource = 'authorization';
      }
    } catch (e) {
      // ignore
    }

    if (!token) {
      try {
        const cookieHeader = req.headers.get('cookie') || '';
        const res = tokenUtils.extractTokenFromCookieHeader(cookieHeader);
        token = res.token;
        cookieNames = res.cookieNames || [];
        if (res.matchedCookieBase) {
          debugInfo.matchedCookieBase = res.matchedCookieBase;
          debugInfo.matchedCookieParts = res.matchedCookieParts;
        }
        if (token) tokenSource = 'cookie';
      } catch (e) {
        // ignore
      }
    }

    // If we have a token, try to decode user id (sub) and perform a service-role RPC
    // directly. This is the safest server-side check and avoids touching request client.
  let decodedUid: string | null = null;
    if (token) {
      try {
        token = tokenUtils.normalizeToken(token);
        debugInfo.normalizedTokenPreview = typeof token === 'string' ? (token.slice(0, 12) + '…') : null;
      } catch (e) {
        // non-fatal
      }
      try {
        const parts = (token || '').split('.');
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
        // ignore parsing errors
      }
    }

  // update debug with decodedUid later - ensure debugInfo reflects runtime values
  // (debugInfo was declared earlier; refresh its fields now so returned JSON matches actual values)
  debugInfo.authHeaderPresent = authHeaderPresent;
  debugInfo.cookieNames = cookieNames;
  debugInfo.tokenSource = tokenSource;

    if (decodedUid) {
      debugInfo.decodedUid = decodedUid;
      try {
        let serviceInitError: any = null;
        let serviceSupabase: any = null;
        try {
          serviceSupabase = getServerSupabaseClient({ useServiceRole: true });
          debugInfo.serviceClientAvailable = true;
        } catch (e) {
          serviceInitError = String(e);
          debugInfo.serviceClientAvailable = false;
          debugInfo.serviceInitError = serviceInitError;
        }

        if (serviceSupabase) {
          const rpcAny = await (serviceSupabase as any).rpc('get_my_user_roles_any', { uid_text: decodedUid });
          const rpcResults: Record<string, any> = { get_my_user_roles_any: rpcAny };
          debugInfo.rpc = rpcResults;
          if (!rpcAny?.error && Array.isArray(rpcAny.data) && rpcAny.data.length) {
            const found = rpcAny.data.some((r: any) => {
              if (!r) return false;
              if (typeof r === 'string') return r.toUpperCase() === 'ADMIN';
              const vals = Object.values(r).map((v: any) => String(v).toUpperCase());
              return vals.includes('ADMIN');
            });
            if (found) {
              return NextResponse.json({ role: 'ADMIN', rpc: rpcResults, debug: debugInfo });
            }
          }
          // If RPC did not find ADMIN, continue to full fallback logic below
        }
      } catch (e) {
        console.debug('[api/user/role] service-role RPC by decoded token failed', e);
      }
    }

    // Fallback: use canonical helper which may use request-scoped client or server fallback
    const { supabase, user } = await getUserAndSupabaseForRequest(req as any);
    if (!user) {
      console.debug('[api/user/role] no user resolved for request; returning ANON');
      return NextResponse.json({ role: 'ANON', debug: debugInfo });
    }
    console.debug('[api/user/role] resolved user:', { id: user.id, role: (user.user_metadata?.role || user.role) });

  // Prefer already-resolved role from user object and normalize to uppercase
  let role = (user.user_metadata && user.user_metadata.role) || user.role || 'USER';
  role = String(role).toUpperCase();

  // Normalize common Supabase value 'authenticated' -> 'USER'
  if (role === 'AUTHENTICATED') role = 'USER';

  // Collect diagnostic info about RPCs/queries so callers (middleware) can
  // decide based on service-side checks even if request-scoped reads are blocked.
  const rpcResults: Record<string, any> = {};

  // Regardless of metadata, attempt a server-side lookup for roles membership (service role key)
  // This ensures that DB-assigned roles (user_roles -> roles) are detected even when user metadata
  // is not populated or contains a generic 'authenticated' value.
  try {
    let serviceSupabase: any = null;
    try {
      serviceSupabase = getServerSupabaseClient({ useServiceRole: true });
    } catch (e) {
      // Service client not available in environment; we'll fall back to request-scoped client below
      serviceSupabase = null;
    }

    // First, try a SECURITY DEFINER RPC which is the most reliable way to check DB-owned roles.
    try {
      const rpcClient = serviceSupabase || supabase;
      if (rpcClient) {
        try {
          const rpcAny = await (rpcClient as any).rpc('get_my_user_roles_any', { uid_text: user.id });
          rpcResults.get_my_user_roles_any = rpcAny;
          if (!rpcAny?.error && Array.isArray(rpcAny.data) && rpcAny.data.length) {
            const found = rpcAny.data.some((r: any) => {
              if (!r) return false;
              if (typeof r === 'string') return r.toUpperCase() === 'ADMIN';
              const vals = Object.values(r).map((v: any) => String(v).toUpperCase());
              return vals.includes('ADMIN');
            });
            if (found) {
              console.debug('[api/user/role] detected ADMIN via get_my_user_roles_any RPC');
              role = 'ADMIN';
              return NextResponse.json({ role, rpc: rpcResults, debug: debugInfo });
            }
          }
        } catch (e) {
          rpcResults.get_my_user_roles_any = { error: String(e) };
          console.debug('[api/user/role] get_my_user_roles_any RPC failed', e);
        }
      }
    } catch (e) {
      // continue to other checks
      console.debug('[api/user/role] rpc any check top-level failed', e);
    }

    let rolesData: any = null;
    let rolesErr: any = null;

    if (serviceSupabase) {
      const res = await (serviceSupabase as any)
        .from('user_roles')
        .select('role_id,roles(name)')
        .eq('user_id', user.id);
      rolesData = res.data;
      rolesErr = res.error;
      rpcResults.user_roles_svc = res;
      console.debug('[api/user/role] checked user_roles via service role client');
    } else {
      try {
        // Direct read may be blocked by RLS for request-scoped client.
        const res = await (supabase as any)
          .from('user_roles')
          .select('role_id,roles(name)')
          .eq('user_id', user.id);
        rolesData = res.data;
        rolesErr = res.error;
        rpcResults.user_roles_req = res;
        console.debug('[api/user/role] checked user_roles via request supabase client (fallback)');
      } catch (e) {
        rolesErr = e;
        rpcResults.user_roles_req = { error: String(e) };
      }
    }

    if (!rolesErr && Array.isArray(rolesData)) {
      // Check for ADMIN in related roles payload
      let hasAdmin = rolesData.some((r: any) => {
        const roleList: any = r.roles;
        if (Array.isArray(roleList)) return roleList.some((roleObj: any) => String(roleObj.name).toUpperCase() === 'ADMIN');
        return String(roleList?.name).toUpperCase() === 'ADMIN';
      });

      // If relation not present, lookup role names by role_id
      if (!hasAdmin) {
        const roleIds = rolesData.map((row: any) => row.role_id).filter(Boolean);
        if (roleIds.length && serviceSupabase) {
          try {
            const rRes = await (serviceSupabase as any).from('roles').select('id,name').in('id', roleIds);
            rpcResults.roles_svc = rRes;
            if (!rRes.error && Array.isArray(rRes.data)) {
              hasAdmin = rRes.data.some((rr: any) => String(rr.name).toUpperCase() === 'ADMIN');
            }
          } catch (e) {
            rpcResults.roles_svc = { error: String(e) };
          }
        }
      }

      if (hasAdmin) role = 'ADMIN';
    }
    // If the direct queries failed (RLS or missing service key), try a SECURITY DEFINER RPC
    // which many deployments create as a safe server-side helper: get_my_roles / get_my_user_roles(_any)
    if (role !== 'ADMIN' && (rolesErr || !Array.isArray(rolesData) || rolesData.length === 0)) {
      try {
        const rpcClient = serviceSupabase || supabase;
        let rpcResp: any = null;

        // Try common RPC names in order
        try {
          rpcResp = await (rpcClient as any).rpc('get_my_roles');
        } catch (e) {
          // ignore
        }
        if ((!rpcResp || rpcResp.error) && rpcClient) {
          try {
            rpcResp = await (rpcClient as any).rpc('get_my_user_roles');
          } catch (e) {
            // ignore
          }
        }
        if ((!rpcResp || rpcResp.error) && rpcClient) {
          try {
            rpcResp = await (rpcClient as any).rpc('get_my_user_roles_any', { uid_text: user.id });
          } catch (e) {
            // ignore
          }
        }

        if (rpcResp && !rpcResp.error && Array.isArray(rpcResp.data)) {
          const found = rpcResp.data.some((r: any) => {
            if (!r) return false;
            if (typeof r === 'string') return r.toUpperCase() === 'ADMIN';
            // object shape: { role: 'ADMIN' } or { name: 'ADMIN' }
            const vals = Object.values(r).map((v: any) => String(v).toUpperCase());
            return vals.includes('ADMIN');
          });
          if (found) {
            role = 'ADMIN';
            console.debug('[api/user/role] detected ADMIN via RPC');
          }
        } else if (rpcResp && rpcResp.error) {
          rpcResults.rpc_fallback = rpcResp;
          console.debug('[api/user/role] RPC call error', rpcResp.error);
        }
      } catch (e) {
        console.debug('[api/user/role] rpc fallback failed', e);
      }
    }
  } catch (e) {
    console.debug('[api/user/role] role lookup failed', e);
  }

    return NextResponse.json({ role, rpc: rpcResults, debug: debugInfo });
  } catch (e) {
    return NextResponse.json({ role: 'ANON', debug: { error: String(e) } });
  }
}

export const dynamic = 'force-dynamic';
