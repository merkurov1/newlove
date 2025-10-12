"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';

export default function useSupabaseSession() {
  const [session, setSession] = useState<any | null>(null);
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');

  useEffect(() => {
    let mounted = true;
    const get = async () => {
      const { data } = await supabase.auth.getSession();
      const s = data.session;
      if (!mounted) return;
      if (s?.user) {
        const user = s.user;
        // map to session-like shape
        const sessionLike = {
          user: {
            id: user.id,
            email: user.email,
            name: user.user_metadata?.name || null,
            username: user.user_metadata?.username || null,
            image: user.user_metadata?.image || null,
            role: user.user_metadata?.role || 'USER',
          },
          accessToken: s.access_token,
        };
        setSession(sessionLike);
        setStatus('authenticated');
      } else {
        setSession(null);
        setStatus('unauthenticated');
      }
    };

    get();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!mounted) return;
      if (s?.user) {
        const user = s.user;
        const sessionLike = {
          user: {
            id: user.id,
            email: user.email,
            name: user.user_metadata?.name || null,
            username: user.user_metadata?.username || null,
            image: user.user_metadata?.image || null,
            role: user.user_metadata?.role || 'USER',
          },
          accessToken: s.access_token,
        };
        setSession(sessionLike);
        setStatus('authenticated');
      } else {
        setSession(null);
        setStatus('unauthenticated');
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, status };
}
