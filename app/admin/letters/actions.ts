'use server';

import { revalidatePath } from 'next/cache';

export async function deleteLetter(formData: FormData) {
  const id = formData.get('id');
  if (!id) return;

  try {
    const { getServerSupabaseClient } = await import('@/lib/serverAuth');
    // При желании здесь можно добавить проверку сессии/роли администратора перед удалением

    const serverSupabase = getServerSupabaseClient({ useServiceRole: true });

    const { error } = await serverSupabase.from('letters').delete().eq('id', id);

    if (error) {
      console.error('Error deleting letter:', error);
      throw error;
    }

    // Ревалидация вызывается только при успешном удалении
    revalidatePath('/journal');
    revalidatePath('/admin/letters');
  } catch (e) {
    console.error('Failed to delete letter server action:', e);
    throw new Error('Could not delete the letter.');
  }
}
