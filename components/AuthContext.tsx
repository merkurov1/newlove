"use client";
import React, { createContext, useContext, useMemo, useCallback } from 'react';
import useSupabaseSession from '@/hooks/useSupabaseSession';
import { createClient as createBrowserClient } from '@/lib/supabase-browser';

const supabase = createBrowserClient();

type AuthState = {
  user: any | null;
  roles: string[];
  session: any | null;
  isLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

// Provider: single source of truth that wraps useSupabaseSession and exposes memoized value
export function AuthProviderInner({ children }: { children: React.ReactNode }) {
  const { session, status, signIn, signOut, error } = useSupabaseSession() as any;

  const signInWithGoogle = useCallback(async () => {
    const redirectTo = typeof window !== 'undefined' ? window.location.href : undefined;
    try {
      if (typeof window !== 'undefined' && redirectTo) {
        try { localStorage.setItem('supabase_oauth_redirect', redirectTo); } catch (e) {}
      }
      await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } } as any);
    } catch (e) {
      console.error('signInWithGoogle failed', e);
    }
  }, []);

  const roles: string[] = useMemo(() => {
    try {
      const r = (session && session.user && session.user.role) || null;
      if (r) return [String(r).toUpperCase()];
      return [];
    } catch (e) {
      return [];
    }
  }, [session]);

  const value = useMemo<AuthState>(() => ({
    user: session ? session.user : null,
    roles,
    session: session || null,
    isLoading: status === 'loading',
    signInWithGoogle,
    signOut: async () => { try { await signOut(); } catch (e) { /* ignore */ } },
  }), [session, status, roles, signInWithGoogle, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthContext;
