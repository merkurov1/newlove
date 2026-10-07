// lib/serverAuth.ts

import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

type ServerAuthOptions = {
  useServiceRole?: boolean;
};

export interface AuthenticatedUser {
  id: string;
  email?: string;
  role: 'USER' | 'ADMIN';
  profile: any;
  user?: any;
}

/**
 * Service-role / anonymous server client.
 *
 * Used by server-side jobs and internal operations where there is
 * no browser session.
 */
export function getServerSupabaseClient(
  options: ServerAuthOptions = {},
): SupabaseClient {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL;

  const useServiceRole = options.useServiceRole === true;

  const supabaseKey = useServiceRole
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      useServiceRole
        ? 'Missing Supabase service-role environment variables.'
        : 'Missing Supabase environment variables.',
    );
  }

  return createSupabaseClient(
    supabaseUrl,
    supabaseKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  );
}

/**
 * Get the current browser/server session user.
 *
 * Authentication comes from the Supabase SSR cookie session.
 */
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    /*
     * Authorization comes from our own database.
     *
     * Do NOT use user.user_metadata.role here.
     * Supabase user metadata is user-editable.
     */
    const { data: profile, error: profileError } =
      await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

    if (profileError) {
      console.error(
        '[serverAuth] profile lookup failed:',
        profileError,
      );

      return null;
    }

    const role =
      profile?.role === 'ADMIN'
        ? 'ADMIN'
        : 'USER';

    const result: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      role,
      profile,
      user,
    };

    return result;
  } catch (error) {
    console.error(
      '[serverAuth] getCurrentUser failed:',
      error,
    );

    return null;
  }
}

/**
 * Legacy-compatible server user getter.
 */
export async function getServerUser(): Promise<AuthenticatedUser | null> {
  return getCurrentUser();
}

/**
 * Require an authenticated user.
 */
export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  return user;
}

/**
 * Require ADMIN role.
 */
export async function requireAdmin(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();

  if (!user || user.role !== 'ADMIN') {
    throw new Error('Unauthorized: Admin access required');
  }

  return user;
}

/**
 * Require ADMIN for a Route Handler request.
 *
 * Supports two auth modes:
 *
 * 1. Normal browser request:
 *    Supabase SSR cookie session.
 *
 * 2. Explicit Authorization: Bearer <JWT>:
 *    Used by API clients / integrations.
 *
 * In both cases the ADMIN role is resolved from public.users,
 * never from user_metadata.
 */
export async function requireAdminFromRequest(
  req?: Request | null,
): Promise<AuthenticatedUser> {
  const authorization =
    req?.headers.get('authorization');

  const token =
    authorization
      ?.match(/^Bearer\s+(.+)$/i)?.[1]
      ?.trim();

  /*
   * Explicit bearer-token mode.
   */
  if (token) {
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.SUPABASE_URL;

    const anonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_KEY;

    if (!supabaseUrl || !anonKey) {
      throw new Error(
        'Missing Supabase URL or publishable key.',
      );
    }

    const authClient = createSupabaseClient(
      supabaseUrl,
      anonKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      },
    );

    const {
      data: { user },
      error,
    } = await authClient.auth.getUser(token);

    if (error || !user) {
      throw new Error('Unauthorized');
    }

    /*
     * Service-role client is used only for the server-side
     * role lookup.
     */
    const serviceClient =
      getServerSupabaseClient({
        useServiceRole: true,
      });

    const {
      data: profile,
      error: profileError,
    } = await serviceClient
      .from('users')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error(
        '[serverAuth] bearer profile lookup failed:',
        profileError,
      );

      throw new Error('Failed to verify administrator role.');
    }

    if (profile?.role !== 'ADMIN') {
      throw new Error(
        'Unauthorized: Admin access required',
      );
    }

    return {
      id: user.id,
      email: user.email,
      role: 'ADMIN',
      profile,
      user,
    };
  }

  /*
   * Normal browser request:
   * authenticate through the SSR cookie session.
   */
  return requireAdmin();
}

const serverAuthDefault = {
  getServerSupabaseClient,
  getCurrentUser,
  getServerUser,
  requireUser,
  requireAdmin,
  requireAdminFromRequest,
};

export default serverAuthDefault;