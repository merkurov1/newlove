"use client";
import { useEffect, useState } from 'react';

import { supabase, createClient as createBrowserClient } from '@/lib/supabase-browser';

// Use a single browser client factory so all components share the same
// auth state and subscriptions. Other components already import and call
// `createBrowserClient()` from `lib/supabase-browser.js`.


export default function useSupabaseSession() {
  const [session, setSession] = useState<any | null>(null);
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
  let mounted = true;
    const get = async () => {
      try {
        // Handle OAuth redirect if present in URL
        try {
          if (typeof window !== 'undefined') {
            const search = window.location.search || '';
            const hash = window.location.hash || '';
            const looksLikeOAuth = search.includes('code=') || search.includes('access_token') || hash.includes('access_token') || search.includes('provider_token');
            if (looksLikeOAuth) {
              // Prefer getSessionFromUrl if available (supabase-js v2 helper to parse OAuth redirect)
              try {
                if (typeof (supabase.auth as any).getSessionFromUrl === 'function') {
                  console.debug('[useSupabaseSession] calling getSessionFromUrl to process OAuth redirect');
                  await (supabase.auth as any).getSessionFromUrl().catch(() => null);
                } else {
                  // Fallback: call getSession to let client pick up a session if tokens were appended
                  console.debug('[useSupabaseSession] calling getSession as fallback to process redirect');
                  await supabase.auth.getSession().catch(() => null);
                }
                // Clean URL to remove OAuth parameters so we don't attempt to reprocess on navigation
                try {
                  const cleanUrl = window.location.pathname + window.location.search.replace(/([?&](code|access_token|provider_token|expires_in|token_type)=[^&]*)/g, '').replace(/^\?/, '') + window.location.hash.replace(/(#.*access_token=[^&]*)/g, '');
                  window.history.replaceState({}, document.title, cleanUrl || window.location.pathname);
                } catch (e) {
                  // ignore replaceState errors
                }
              } catch (e) {
                console.debug('[useSupabaseSession] OAuth redirect processing failed', e);
              }
            }
          }
        } catch (e) {
          // ignore parsing errors
        }

        // Fetch canonical user (ensures user_metadata is available)
        const { data: userData, error: userErr } = await supabase.auth.getUser();
        const user = (userData as any)?.user || null;
        console.debug('[useSupabaseSession] getUser ->', { userId: user?.id, userErr });
        if (!mounted) return;
        if (user) {
          // resolve role via helper below
            const role = await (async (u: any) => {
              // 1) Сначала смотрим user_metadata / user.role (локально в объекте пользователя)
                let r = (u.user_metadata?.role || u.role || 'USER');
                // Supabase may set `user.role` to the auth-level 'authenticated' which is NOT an app role.
                // Treat such values as missing and fallback to USER so server/user_roles checks can run.
                const rNormRaw = String(r).toUpperCase();
                const rNorm = (rNormRaw === 'AUTHENTICATED' || rNormRaw === 'ANONYMOUS') ? 'USER' : rNormRaw;
              if (rNorm === 'ADMIN') {
                console.debug('[useSupabaseSession] role resolved from user metadata -> ADMIN');
                return 'ADMIN';
              }
              // 2) Попробуем проверить через публичный (anon) клиент таблицу user_roles — если RLS позволяет
              try {
                const { data: rolesData, error: rolesErr } = await supabase
                  .from('user_roles')
                  .select('role_id,roles(name)')
                  .eq('user_id', u.id);
                if (!rolesErr && Array.isArray(rolesData)) {
                  const hasAdmin = rolesData.some((row: any) => {
                    const roleList: any = row.roles;
                    if (Array.isArray(roleList)) return roleList.some((roleObj: any) => String(roleObj.name).toUpperCase() === 'ADMIN');
                    return String(roleList?.name).toUpperCase() === 'ADMIN';
                  });
                  if (hasAdmin) {
                    console.debug('[useSupabaseSession] role resolved from user_roles -> ADMIN');
                    return 'ADMIN';
                  }
                }
              } catch (e) {
                console.debug('[useSupabaseSession] user_roles check failed', e);
              }
              // 3) Как fallback — спросим серверный endpoint. ВАЖНО: передаём access token, чтобы сервер мог идентифицировать пользователя
              try {
                const { data: sessData } = await supabase.auth.getSession();
                const accessToken = (sessData as any)?.session?.access_token || null;
                console.debug('[useSupabaseSession] fetching /api/user/role, hasAccessToken=', Boolean(accessToken));
                const res = await fetch('/api/user/role', {
                  headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
                });
                if (res.ok) {
                  const json = await res.json();
                  if (json && json.role) {
                    const rFromServer = String(json.role).toUpperCase();
                    // Не принимаем ANON как переопределяющую информацию, если у нас уже есть хотя бы USER
                    if (rFromServer !== 'ANON') {
                      console.debug('[useSupabaseSession] role resolved from /api/user/role ->', rFromServer);
                      return rFromServer;
                    } else {
                      console.debug('[useSupabaseSession] /api/user/role returned ANON, ignoring');
                    }
                  }
                }
              } catch (e) {
                console.debug('[useSupabaseSession] /api/user/role fetch failed', e);
              }
              // 4) Фоллбек — возвращаем локально определённую роль (нормализованную)
              return rNorm;
            })(user);

          setSession({
            user: {
              id: user.id,
              email: user.email,
              name: user.user_metadata?.name || null,
              username: user.user_metadata?.username || null,
              image: user.user_metadata?.image || null,
              role,
            },
            accessToken: null,
          });
          setStatus('authenticated');
        } else {
          setSession(null);
          setStatus('unauthenticated');
        }
      } catch (e: any) {
        console.error('[useSupabaseSession] getSession error', e);
        if (mounted) setError(String(e));
        return;
      }
    };
    get();
  const { data: listener } = supabase.auth.onAuthStateChange(async (event, _s) => {
      console.debug('[useSupabaseSession] onAuthStateChange', { event });
      if (!mounted) return;
      try {
        const { data: userData } = await supabase.auth.getUser();
        const user = (userData as any)?.user || null;
        if (user) {
          const role = await (async (u: any) => {
            // Дублируем ту же логику что и выше: сначала метаданные, затем user_roles, затем серверный fallback
            let r = (u.user_metadata?.role || u.role || 'USER');
              const rNormRaw = String(r).toUpperCase();
              const rNorm = (rNormRaw === 'AUTHENTICATED' || rNormRaw === 'ANONYMOUS') ? 'USER' : rNormRaw;
            if (rNorm === 'ADMIN') return 'ADMIN';
            try {
              const { data: rolesData, error: rolesErr } = await supabase
                .from('user_roles')
                .select('role_id,roles(name)')
                .eq('user_id', u.id);
              if (!rolesErr && Array.isArray(rolesData)) {
                const hasAdmin = rolesData.some((row: any) => {
                  const roleList: any = row.roles;
                  if (Array.isArray(roleList)) return roleList.some((roleObj: any) => String(roleObj.name).toUpperCase() === 'ADMIN');
                  return String(roleList?.name).toUpperCase() === 'ADMIN';
                });
                if (hasAdmin) return 'ADMIN';
              }
            } catch (e) {
              console.debug('[useSupabaseSession] user_roles check failed', e);
            }
            try {
              const { data: sessData } = await supabase.auth.getSession();
              const accessToken = (sessData as any)?.session?.access_token || null;
              const res = await fetch('/api/user/role', {
                headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
              });
              if (res.ok) {
                const json = await res.json();
                if (json && json.role) {
                  const rFromServer = String(json.role).toUpperCase();
                  if (rFromServer !== 'ANON') return rFromServer;
                }
              }
            } catch (e) {
              console.debug('[useSupabaseSession] /api/user/role fetch failed', e);
            }
              return rNorm;
          })(user);
          setSession({
            user: {
              id: user.id,
              email: user.email,
              name: user.user_metadata?.name || null,
              username: user.user_metadata?.username || null,
              image: user.user_metadata?.image || null,
              role,
            },
            accessToken: null,
          });
          setStatus('authenticated');
        } else {
          console.debug('[useSupabaseSession] signed out');
          setSession(null);
          setStatus('unauthenticated');
        }
      } catch (e) {
        console.error('[useSupabaseSession] onAuthStateChange handler error', e);
      }
    });
    return () => {
      mounted = false;
      // Defensive unsubscribe
      try {
        listener?.subscription?.unsubscribe?.();
      } catch (e) {
        // ignore
      }
    };
  }, []);
  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    return error;
  };
  const signOut = async () => {
    await supabase.auth.signOut();
  };
  return { session, status, signIn, signOut, error };
}
