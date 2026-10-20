'use client';

import React from 'react';
import type {
  AuthChangeEvent,
  Session,
  User,
} from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase-browser';
import { useRouter } from 'next/navigation';

type Profile = Record<string, unknown> & {
  id: string;
};

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  roles: string[];
  isLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithPasskey: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const initialAuthContext: AuthContextType = {
  user: null,
  profile: null,
  session: null,
  roles: [],
  isLoading: true,
  signInWithGoogle: async () => {},
  signInWithPasskey: async () => {},
  signOut: async () => {},
  refreshProfile: async () => {},
};

const AuthContext =
  React.createContext<AuthContextType>(initialAuthContext);

export function AuthProvider(props: React.PropsWithChildren) {
  const [user, setUser] = React.useState<User | null>(null);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [session, setSession] = React.useState<Session | null>(null);
  const [roles, setRoles] = React.useState<string[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const supabase = React.useMemo(() => createClient(), []);
  const router = useRouter();

  const activeUserIdRef = React.useRef<string | null>(null);
  const loadedProfileForUserRef = React.useRef<string | null>(null);
  const authEventReceivedRef = React.useRef(false);

  const profileRequestRef = React.useRef<{
    userId: string;
    promise: Promise<void>;
  } | null>(null);

  const fetchProfile = React.useCallback(
    async (userId: string, force = false): Promise<void> => {
      if (!userId) return;

      if (
        !force &&
        loadedProfileForUserRef.current === userId
      ) {
        return;
      }

      const existingRequest = profileRequestRef.current;

      if (existingRequest?.userId === userId) {
        return existingRequest.promise;
      }

      const request = (async () => {
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle();

          if (error) {
            console.warn('Failed to fetch profile:', error);
            return;
          }

          // Не применяем профиль предыдущего пользователя,
          // если авторизация успела измениться во время запроса.
          if (activeUserIdRef.current !== userId) {
            return;
          }

          setProfile((data as Profile | null) ?? null);
          loadedProfileForUserRef.current = userId;
        } catch (error) {
          console.warn('Failed to fetch profile:', error);
        }
      })();

      profileRequestRef.current = {
        userId,
        promise: request,
      };

      try {
        await request;
      } finally {
        if (profileRequestRef.current?.promise === request) {
          profileRequestRef.current = null;
        }
      }
    },
    [supabase],
  );

  const refreshProfile = React.useCallback(async (): Promise<void> => {
    const userId = activeUserIdRef.current;

    if (userId) {
      await fetchProfile(userId, true);
    }
  }, [fetchProfile]);

  // Загружаем роли пользователя через существующий API.
  // Клиентские роли нужны для интерфейса; API-маршруты
  // по-прежнему должны проверять права на сервере.
  React.useEffect(() => {
    let active = true;
    const userId = user?.id;

    setRoles([]);

    if (!userId) {
      return () => {
        active = false;
      };
    }

    const loadRoles = async (): Promise<void> => {
      try {
        const response = await fetch('/api/auth/me', {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(
            `Failed to load user roles: ${response.status}`,
          );
        }

        const result: unknown = await response.json();

        if (
          !result ||
          typeof result !== 'object' ||
          !('user' in result) ||
          !('roles' in result)
        ) {
          if (active) {
            setRoles([]);
          }
          return;
        }

        const payload = result as {
          user?: { id?: unknown } | null;
          roles?: unknown;
        };

        // Не принимаем роли из ответа, если они относятся
        // к другому пользователю или сессия уже сменилась.
        if (
          !active ||
          activeUserIdRef.current !== userId ||
          payload.user?.id !== userId
        ) {
          return;
        }

        const nextRoles = Array.isArray(payload.roles)
          ? payload.roles.filter(
              (role: unknown): role is string =>
                typeof role === 'string',
            )
          : [];

        setRoles(nextRoles);
      } catch (error) {
        if (active) {
          setRoles([]);
          console.warn('Failed to fetch user roles:', error);
        }
      }
    };

    void loadRoles();

    return () => {
      active = false;
    };
  }, [user?.id]);

  React.useEffect(() => {
    let mounted = true;

    const applySession = (nextSession: Session | null): void => {
      if (!mounted) return;

      const nextUser = nextSession?.user ?? null;
      const nextUserId = nextUser?.id ?? null;

      activeUserIdRef.current = nextUserId;

      setSession(nextSession);
      setUser(nextUser);

      if (!nextUserId) {
        loadedProfileForUserRef.current = null;
        profileRequestRef.current = null;

        setProfile(null);
        setRoles([]);
        setIsLoading(false);

        return;
      }

      if (loadedProfileForUserRef.current !== nextUserId) {
        setProfile(null);
      }

      setIsLoading(false);

      // Даём обработчику auth-события завершиться до
      // обращения к таблице profiles.
      void Promise.resolve().then(() => {
        if (
          mounted &&
          activeUserIdRef.current === nextUserId
        ) {
          return fetchProfile(nextUserId);
        }
      });
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, nextSession: Session | null) => {
        authEventReceivedRef.current = true;
        applySession(nextSession);
      },
    );

    const getInitialSession = async (): Promise<void> => {
      try {
        const {
          data: { session: initialSession },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          console.warn('Session init error:', error);
        }

        if (!mounted) return;

        // Событие авторизации имеет приоритет над начальным
        // запросом, если оно успело прийти раньше.
        if (!authEventReceivedRef.current) {
          applySession(initialSession);
        }
      } catch (error) {
        console.warn('Session init error:', error);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    void getInitialSession();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, fetchProfile]);

  const signInWithGoogle = React.useCallback(async (): Promise<void> => {
    try {
      const requestedPath =
        typeof window !== 'undefined'
          ? localStorage.getItem('login_redirect_path') ||
            `${window.location.pathname}${window.location.search}`
          : '/art-engine';

      const safePath =
        requestedPath.startsWith('/') &&
        !requestedPath.startsWith('//')
          ? requestedPath
          : '/art-engine';

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/login?next=${encodeURIComponent(
            safePath,
          )}`,
        },
      });

      if (error) throw error;
    } catch (error) {
      console.error('Google sign-in error:', error);
      throw error;
    }
  }, [supabase]);

  const signInWithPasskey = React.useCallback(async (): Promise<void> => {
    try {
      if (
        typeof window === 'undefined' ||
        !window.PublicKeyCredential
      ) {
        throw new Error(
          'WebAuthn is not supported by this browser.',
        );
      }

      // Passkey API может отсутствовать в текущих типах Supabase.
      const auth = supabase.auth as typeof supabase.auth & {
        signInWithPasskey?: () => Promise<{
          error: Error | null;
        }>;
      };

      if (typeof auth.signInWithPasskey !== 'function') {
        throw new Error(
          'Passkey sign-in is not available in the installed Supabase client.',
        );
      }

      const { error } = await auth.signInWithPasskey();

      if (error) throw error;
    } catch (error) {
      console.error('Passkey sign-in error:', error);
      throw error;
    }
  }, [supabase]);

  const signOut = React.useCallback(async (): Promise<void> => {
    const { error } = await supabase.auth.signOut();

    if (error) throw error;

    activeUserIdRef.current = null;
    loadedProfileForUserRef.current = null;
    profileRequestRef.current = null;

    setUser(null);
    setProfile(null);
    setSession(null);
    setRoles([]);
    setIsLoading(false);

    router.refresh();
  }, [supabase, router]);

  const value = React.useMemo<AuthContextType>(
    () => ({
      user,
      profile,
      session,
      roles,
      isLoading,
      signInWithGoogle,
      signInWithPasskey,
      signOut,
      refreshProfile,
    }),
    [
      user,
      profile,
      session,
      roles,
      isLoading,
      signInWithGoogle,
      signInWithPasskey,
      signOut,
      refreshProfile,
    ],
  );

  return (
    <AuthContext.Provider value={value}>
      {props.children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => React.useContext(AuthContext);