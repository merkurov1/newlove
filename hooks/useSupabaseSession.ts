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
        // If OAuth redirected with tokens in URL, attempt to call getSession to pick up session.
        // (Supabase JS v2 may not have getSessionFromUrl in some environments.)
        try {
          if (typeof window !== 'undefined' && (window.location.search.includes('access_token') || window.location.hash.includes('access_token'))) {
            await supabase.auth.getSession().catch(() => null);
            console.debug('[useSupabaseSession] attempted to pick session after redirect');
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
            // user metadata first (normalize to uppercase to tolerate 'admin' vs 'ADMIN')
            let r = (u.user_metadata?.role || u.role || 'USER');
            const rNorm = String(r).toUpperCase();
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
              // ignore
            }
            try {
              const res = await fetch('/api/user/role');
              if (res.ok) {
                const json = await res.json();
                if (json && json.role) return String(json.role).toUpperCase();
              }
            } catch (e) {
              // ignore
            }
            return r;
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
            let r = (u.user_metadata?.role || u.role || 'USER');
            const rNorm = String(r).toUpperCase();
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
              // ignore
            }
            try {
              const res = await fetch('/api/user/role');
              if (res.ok) {
                const json = await res.json();
                if (json && json.role) return String(json.role).toUpperCase();
              }
            } catch (e) {
              // ignore
            }
            return String(r).toUpperCase();
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
