'use me'
'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/serverAuth';
import { revalidatePath } from 'next/cache';

export async function updateProfile(formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return { error: 'Пользователь не авторизован' };
  }

  const fullName = formData.get('fullName') as string;
  const avatarUrl = formData.get('avatarUrl') as string;

  const supabase = await createClient();
  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: fullName,
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', currentUser.id);

  if (error) {
    return { error: 'Не удалось обновить профиль' };
  }

  revalidatePath('/profile');
  return { success: true };
}
