import { getServerSupabaseClient } from '@/lib/serverAuth';

// Lightweight helper to get the current user from an App Router Request.
// Accepts the standard Request and reads cookies to validate the session
// using a centralized server-side Supabase client.
export async function getUserAndSupabaseFromRequest(req: Request) {
  const cookieHeader = (req as any).headers?.get?.('cookie') || '';
  const cookies = Object.fromEntries(
    cookieHeader
      .split(';')
      .map((s: string) => {
        const [k, ...v] = s.split('=');
        return [k?.trim(), decodeURIComponent((v || []).join('='))];
      })
      .filter(Boolean)
  );

  const accessToken = cookies['sb-access-token'] || cookies['supabase-access-token'] || '';
  if (!accessToken) return { user: null, supabase: null };

  let supabase = null;
  try {
    supabase = getServerSupabaseClient();
  } catch (e) {
    console.error('Unable to create server supabase client', e);
    return { user: null, supabase: null };
  }

  try {
    const {
      data: { user },
      error,
    } = (await supabase.auth.getUser(accessToken as string)) as any;
    if (error) {
      console.error('Supabase getUser error', error);
      return { user: null, supabase };
    }
    if (!user) return { user: null, supabase };

    // SSR RBAC: Проверяем user_roles/roles для ADMIN
    let role = user.user_metadata?.role || user.role || 'USER';
    if (role !== 'ADMIN') {
      try {
        // Используем service role для доступа к user_roles
        const serviceSupabase = getServerSupabaseClient({ useServiceRole: true });
        const { data: rolesData, error: rolesError } = await serviceSupabase
          .from('user_roles')
          .select('role_id,roles(name)')
          .eq('user_id', user.id);
        if (!rolesError && Array.isArray(rolesData)) {
          const hasAdmin = rolesData.some(r => {
            const roleList: any = r.roles;
            if (Array.isArray(roleList)) return roleList.some((roleObj: any) => roleObj.name === 'ADMIN');
            return roleList?.name === 'ADMIN';
          });
          if (hasAdmin) role = 'ADMIN';
        }
      } catch (e) {
        // ignore
      }
    }
    // Возвращаем user с корректной ролью
    return {
      user: {
        ...user,
        role,
      },
      supabase,
    };
  } catch (e) {
    console.error('Error validating supabase token', e);
    return { user: null, supabase };
  }
}

// Provide a default export as well to be resilient to different import styles
// and to help with circular-import/interop resolution in built bundles.
export default getUserAndSupabaseFromRequest;
