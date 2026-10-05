import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, getServerSupabaseClient } from '@/lib/serverAuth';

// Protected PATCH handler for admin user updates.
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();
    const userId = params.id;
    const body = await request.json().catch(() => ({}));
    const allowed = ['name', 'username', 'role'];
    const updates = Object.fromEntries(Object.entries(body).filter(([key]) => allowed.includes(key)));
    if (!Object.keys(updates).length) return NextResponse.json({ error: 'No supported updates supplied' }, { status: 400 });
    const supabase = getServerSupabaseClient({ useServiceRole: true });
    const { error } = await supabase.from('users').update(updates).eq('id', userId);
    if (error) throw error;
    return NextResponse.json({ ok: true, id: userId });
  } catch (error: any) {
    const message = error?.message || 'Unable to update user';
    return NextResponse.json({ error: message }, { status: message.includes('Unauthorized') ? 401 : 500 });
  }
}
