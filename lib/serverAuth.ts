import { createClient } from './supabase-server';

export async function getServerUser() {
  const supabase = createClient();
  try {
    const { data } = await supabase.auth.getUser();
    return data.user || null;
  } catch (e) {
    return null;
  }
}

export async function requireAdmin() {
  const user = await getServerUser();
  if (!user) throw new Error('Unauthorized');
  const role = (user.user_metadata as any)?.role || 'USER';
  if (role !== 'ADMIN') throw new Error('Unauthorized');
  return user;
}

export async function requireUser() {
  const user = await getServerUser();
  if (!user) throw new Error('Unauthorized');
  return user;
}
