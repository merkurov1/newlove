"use client";
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase-browser';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export default function useSupabaseSession() {
  const [session, setSession] = useState<any | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  // debug mode opt-in via URL param
  const isDebug = typeof window !== 'undefined' && new URL(window.location.href).searchParams.get('auth_debug') === '1';
  const pushDebug = (entry: any) => {
    try {
      if (typeof window === 'undefined') return;
      const prev = (window as any).__newloveAuth || { history: [] };
      const e = { ts: Date.now(), ...entry };
      prev.history = (prev.history || []).concat(e).slice(-50);
      (window as any).__newloveAuth = { ...prev, last: e };
      if (isDebug) console.debug('[useSupabaseSession debug]', entry, prev.history.length);
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    mountedRef.current = true;

    // Try to hydrate from a short-lived client-side cache to avoid flicker
    try {
      if (typeof window !== 'undefined') {
        const cached = sessionStorage.getItem('newlove_auth_user');
        if (cached) {
          const parsed = JSON.parse(cached || 'null');
          if (parsed && parsed.id) {
            setSession({ user: parsed, accessToken: null });
            setStatus('authenticated');
            pushDebug({ where: 'init', step: 'hydrated-from-cache', userId: parsed.id });
          }
        }
      }
    } catch (e) {
      // ignore cache read errors
    }

    const emit = () => {
      try { if (typeof window !== 'undefined') window.dispatchEvent(new Event('supabase:session-changed')); } catch {}
    };

    const unsub = supabase.auth.onAuthStateChange((event, payload: any) => {
      if (!mountedRef.current) return;
      try {
        pushDebug({ where: 'onAuthStateChange', event, payload: !!payload });
      } catch (e) {}
      const s = payload?.session ?? null;
      if (s && s.user) {
        setSession({ user: s.user, accessToken: s.access_token });
        setStatus('authenticated');
        try {
          if (typeof window !== 'undefined') {
            // persist minimal user info to sessionStorage to survive client-side navigation
            const toStore = { id: s.user.id, email: s.user.email, name: s.user.name, image: s.user.user_metadata?.avatar_url || s.user?.picture || s.user?.image, role: s.user.role };
            try { sessionStorage.setItem('newlove_auth_user', JSON.stringify(toStore)); } catch (e) {}
          }
        } catch (e) {}
        // One-time redirect after auth state change to respect stored redirect path
        try {
          if (typeof window !== 'undefined') {
            const redirectKey1 = sessionStorage.getItem('login_redirect_path') || localStorage.getItem('login_redirect_path');
            const redirectKey2 = localStorage.getItem('supabase_oauth_redirect');
            const redirectTo = (redirectKey1 || redirectKey2) || null;
            if (redirectTo) {
              try { sessionStorage.removeItem('login_redirect_path'); } catch {}
              try { localStorage.removeItem('login_redirect_path'); } catch {}
              try { localStorage.removeItem('supabase_oauth_redirect'); } catch {}
              const current = window.location.pathname + window.location.search;
              if (redirectTo !== current) {
                try {
                  const targetUrl = new URL(redirectTo, window.location.origin);
                  const isAdminTarget = targetUrl.pathname.startsWith('/admin');
                  const userRole = (s && s.user && s.user.role) ? String(s.user.role).toUpperCase() : null;
                  if (!isAdminTarget || (isAdminTarget && userRole === 'ADMIN')) {
                    window.location.replace(redirectTo);
                    return;
                  }
                } catch (e) {
                  // If URL parsing fails, play safe and do not redirect to admin
                  try { window.location.replace(redirectTo); return; } catch (err) {}
                }
              }
            }
          }
        } catch (e) {}
        pushDebug({ where: 'onAuthStateChange', note: 'authenticated', userId: s.user?.id });
      } else {
        setSession(null);
        setStatus('unauthenticated');
        try { if (typeof window !== 'undefined') sessionStorage.removeItem('newlove_auth_user'); } catch (e) {}
        pushDebug({ where: 'onAuthStateChange', note: 'no-session' });
      }
      emit();
    });

    (async () => {
      try {
        pushDebug({ where: 'init', step: 'getSession' });
        const { data } = await supabase.auth.getSession();
        const s = (data as any)?.session || null;
        if (s && s.user) {
          pushDebug({ where: 'init', note: 'client-session-found', userId: s.user?.id });
          setSession({ user: s.user, accessToken: s.access_token });
          try { if (typeof window !== 'undefined') { const toStore = { id: s.user.id, email: s.user.email, name: s.user.name, image: s.user.user_metadata?.avatar_url || s.user?.picture || s.user?.image, role: s.user.role }; try { sessionStorage.setItem('newlove_auth_user', JSON.stringify(toStore)); } catch (e) {} } } catch (e) {}
          // After successful client-side session detection, attempt one-time post-login redirect
          try {
            if (typeof window !== 'undefined') {
              const redirectKey1 = sessionStorage.getItem('login_redirect_path') || localStorage.getItem('login_redirect_path');
              const redirectKey2 = localStorage.getItem('supabase_oauth_redirect');
              const redirectTo = (redirectKey1 || redirectKey2) || null;
              if (redirectTo) {
                try { sessionStorage.removeItem('login_redirect_path'); } catch {}
                try { localStorage.removeItem('login_redirect_path'); } catch {}
                try { localStorage.removeItem('supabase_oauth_redirect'); } catch {}
                // If already on that path, don't navigate
                const current = window.location.pathname + window.location.search;
                if (redirectTo !== current) {
                  try {
                    const targetUrl = new URL(redirectTo, window.location.origin);
                    const isAdminTarget = targetUrl.pathname.startsWith('/admin');
                    const userRole = (s && s.user && s.user.role) ? String(s.user.role).toUpperCase() : null;
                    if (!isAdminTarget || (isAdminTarget && userRole === 'ADMIN')) {
                      window.location.replace(redirectTo);
                      return;
                    }
                  } catch (e) {
                    try { window.location.replace(redirectTo); return; } catch (err) {}
                  }
                }
              }
            }
          } catch (e) {}
          setStatus('authenticated');
          return;
        }

        try {
          pushDebug({ where: 'init', step: 'server-fallback' });
          const resp = await fetch('/api/auth/me', { credentials: 'same-origin' });
          pushDebug({ where: 'init', step: 'server-fallback-response', status: resp?.status });
          if (resp.ok) {
            const j = await resp.json();
            if (j?.user) {
              pushDebug({ where: 'init', note: 'server-session-found', userId: j.user?.id });
              setSession({ user: j.user, accessToken: null });
              try { if (typeof window !== 'undefined') { const toStore = { id: j.user.id, email: j.user.email, name: j.user.name, image: j.user.image, role: null }; try { sessionStorage.setItem('newlove_auth_user', JSON.stringify(toStore)); } catch (e) {} } } catch (e) {}
              // One-time redirect after server-side session detected (e.g., after OAuth)
              try {
                if (typeof window !== 'undefined') {
                  const redirectKey1 = sessionStorage.getItem('login_redirect_path') || localStorage.getItem('login_redirect_path');
                  const redirectKey2 = localStorage.getItem('supabase_oauth_redirect');
                  const redirectTo = (redirectKey1 || redirectKey2) || null;
                  if (redirectTo) {
                    try { sessionStorage.removeItem('login_redirect_path'); } catch {}
                    try { localStorage.removeItem('login_redirect_path'); } catch {}
                    try { localStorage.removeItem('supabase_oauth_redirect'); } catch {}
                    const current = window.location.pathname + window.location.search;
                    if (redirectTo !== current) {
                      try {
                        const targetUrl = new URL(redirectTo, window.location.origin);
                        const isAdminTarget = targetUrl.pathname.startsWith('/admin');
                        const userRole = (j && j.user && j.user.role) ? String(j.user.role).toUpperCase() : null;
                        if (!isAdminTarget || (isAdminTarget && userRole === 'ADMIN')) {
                          window.location.replace(redirectTo);
                          return;
                        }
                      } catch (e) {
                        try { window.location.replace(redirectTo); return; } catch (err) {}
                      }
                    }
                  }
                }
              } catch (e) {}
              setStatus('authenticated');
              return;
            }
          }
        } catch (e) {
          pushDebug({ where: 'init', step: 'server-fallback-error', error: String(e) });
        }

  pushDebug({ where: 'init', note: 'no-session' });
  setSession(null);
  setStatus('unauthenticated');
      } catch (e) {
        setError(String(e));
        pushDebug({ where: 'init', step: 'init-error', error: String(e) });
        setSession(null);
        setStatus('unauthenticated');
      }
    })();

    return () => {
      mountedRef.current = false;
      try { (unsub as any)?.data?.subscription?.unsubscribe?.(); } catch {}
      pushDebug({ where: 'cleanup' });
    };
  }, []);

  const signOut = async () => { try { await supabase.auth.signOut(); } catch {} };

  // Wrap signOut to also clear sessionStorage (consumer code expects signOut function)
  const wrappedSignOut = async () => {
    try { await supabase.auth.signOut(); } catch (e) {}
    try { if (typeof window !== 'undefined') sessionStorage.removeItem('newlove_auth_user'); } catch (e) {}
  };

  return { session, status, signOut: wrappedSignOut, error };
}
