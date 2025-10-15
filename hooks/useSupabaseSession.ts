"use client";
import { useEffect, useState } from 'react';

import { supabase, createClient as createBrowserClient } from '@/lib/supabase-browser';

// Centralized, well-structured hook for client-side auth state.
export default function useSupabaseSession() {
  const [session, setSession] = useState<any | null>(null);
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    // Initialize: process OAuth redirect (if any) and then read session
    const init = async () => {
      try {
        if (typeof window !== 'undefined') {
          const search = window.location.search || '';
          const hash = window.location.hash || '';
          const looksLikeOAuth = search.includes('code=') || search.includes('access_token') || hash.includes('access_token') || search.includes('provider_token');
          if (looksLikeOAuth) {
            try {
              if (typeof (supabase.auth as any).getSessionFromUrl === 'function') {
                console.debug('[useSupabaseSession] processing OAuth redirect via getSessionFromUrl');
                await (supabase.auth as any).getSessionFromUrl().catch(() => null);
              } else {
                console.debug('[useSupabaseSession] processing OAuth redirect via getSession fallback');
                await supabase.auth.getSession().catch(() => null);
              }
            } catch (e) {
              console.debug('[useSupabaseSession] OAuth redirect handling failed', e);
            }
            // Clean the URL so we don't reprocess the redirect params
            try {
              const qs = window.location.search.replace(/([?&](code|access_token|provider_token|expires_in|token_type)=[^&]*)/g, '').replace(/^\?/, '');
              const h = window.location.hash.replace(/(#.*access_token=[^&]*)/g, '');
              const cleanUrl = window.location.pathname + (qs ? `?${qs}` : '') + (h || '');
              window.history.replaceState({}, document.title, cleanUrl || window.location.pathname);
            } catch (e) {
              // ignore
            }
          }
        }

        // Try to read current session
        try {
          const { data: sessData } = await supabase.auth.getSession();
          const sess = (sessData as any)?.session || null;
          if (sess && sess.user) {
            const role = await resolveRole(sess.user, sess.access_token || null);
            if (!mounted) return;
            setSession({ user: mapUser(sess.user, role), accessToken: sess.access_token || null });
            setStatus('authenticated');
            console.debug('[useSupabaseSession] initialized session from getSession', { user: sess.user.id, role });
            return;
          }
        } catch (e) {
          // ignore
        }

        // If no session found, set unauthenticated
        if (mounted) {
          setSession(null);
          setStatus('unauthenticated');
        }
      } catch (err: any) {
        console.error('[useSupabaseSession] init error', err);
        if (mounted) setError(String(err));
      }
    };

    init();

    // Subscribe to auth state changes
    const { data: listener } = supabase.auth.onAuthStateChange(async (event, payload) => {
      console.debug('[useSupabaseSession] onAuthStateChange', { event });
      if (!mounted) return;
      try {
        // If payload contains session, prefer it
        let user = null;
        let accessToken: string | null = null;
        if (payload && (payload as any).session) {
          user = (payload as any).session.user || null;
          accessToken = (payload as any).session.access_token || null;
        }
        // fallback to getUser
        if (!user) {
          const { data: ud } = await supabase.auth.getUser();
          user = (ud as any)?.user || null;
        }
        if (user) {
          const role = await resolveRole(user, accessToken);
          setSession({ user: mapUser(user, role), accessToken });
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

// Helpers
function mapUser(u: any, role: string) {
  return {
    id: u.id,
    email: u.email,
    name: u.user_metadata?.name || null,
    username: u.user_metadata?.username || null,
    image: u.user_metadata?.image || null,
    role,
  };
}

async function resolveRole(u: any, accessToken?: string | null) {
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
    const headers: any = {};
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const res = await fetch('/api/user/role', { headers });
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
}
