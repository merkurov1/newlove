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
    return { user, supabase };
  } catch (e) {
    console.error('Error validating supabase token', e);
    return { user: null, supabase };
  }
}

// Provide a default export as well to be resilient to different import styles
// and to help with circular-import/interop resolution in built bundles.
export default getUserAndSupabaseFromRequest;
