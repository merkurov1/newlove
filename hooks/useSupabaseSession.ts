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
        pushDebug({ where: 'onAuthStateChange', note: 'authenticated', userId: s.user?.id });
      } else {
        setSession(null);
        setStatus('unauthenticated');
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

  return { session, status, signOut, error };
}
