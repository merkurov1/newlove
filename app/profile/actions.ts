'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/serverAuth';
import { revalidatePath } from 'next/cache';

export async function updateProfile(prevState: any, formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return { status: 'error', message: 'You are not authorized.' };
  }

  const username = String(formData.get('username') || '').toLowerCase().trim();
  const name = String(formData.get('name') || '').trim();
  const bio = String(formData.get('bio') || '').trim();
  const website = String(formData.get('website') || '').trim();

  if (!username || !name) return { status: 'error', message: 'Username and display name are required.' };
  if (!/^[a-z0-9_.]+$/.test(username)) return { status: 'error', message: 'Username may contain lowercase letters, numbers, underscores and dots.' };
  if (username.length < 3 || username.length > 32) return { status: 'error', message: 'Username must be between 3 and 32 characters.' };
  if (name.length > 120 || bio.length > 1000 || website.length > 240) return { status: 'error', message: 'One or more fields are too long.' };
  if (website && !/^https?:\/\//i.test(website)) return { status: 'error', message: 'Website must start with http:// or https://.' };

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from('users')
    .upsert({
      id: currentUser.id,
      username,
      name,
      bio: bio || null,
      website: website || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    .select('username')
    .single();

  if (error) {
    if (error.code === '23505') return { status: 'error', message: 'That username is already taken.' };
    console.error('Profile update failed:', error);
    return { status: 'error', message: 'Failed to update profile.' };
  }

  revalidatePath('/profile');
  revalidatePath(`/you/${updated?.username || username}`);
  return { status: 'success', message: 'Profile updated.', username: updated?.username || username };
}
