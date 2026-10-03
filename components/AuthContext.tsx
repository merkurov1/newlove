'use client';

import React from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useRouter } from 'next/navigation';

interface AuthContextType {
  user: any;
  profile: any;
  session: any;
  isLoading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const initialAuthContext: AuthContextType = {
  user: null,
  profile: null,
  session: null,
  isLoading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
};

const AuthContext = React.createContext(initialAuthContext);

export function AuthProvider(props: React.PropsWithChildren<{}>) {
  const [user, setUser] = React.useState(null as any);
  const [profile, setProfile] = React.useState(null as any);
  const [session, setSession] = React.useState(null as any);
  const [isLoading, setIsLoading] = React.useState(true);
  const supabase = createClient();
  const router = useRouter();

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (!error && data) {
        setProfile(data);
      }
    } catch (e) {
      console.warn('Failed to fetch profile:', e);
    }
  };

  const refreshProfile = async () => {
    if (user?.id) {
      await fetchProfile(user.id);
    }
  };

  React.useEffect(() => {
    let mounted = true;

    async function getInitialSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          await fetchProfile(session.user.id);
        }
      } catch (e) {
        console.warn('Session init error:', e);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    getInitialSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!mounted) return;
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          await fetchProfile(session.user.id);
        } else {
          setProfile(null);
        }
        setIsLoading(false);
      }
    );

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
    router.refresh();
  };

  const value = React.useMemo(
    () => ({
      user,
      profile,
      session,
      isLoading,
      signOut,
      refreshProfile,
    }),
    [user, profile, session, isLoading]
  );

  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>;
}

export const useAuth = () => React.useContext(AuthContext);
