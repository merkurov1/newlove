import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser, getServerSupabaseClient, requireAdminFromRequest } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

/**
 * Protected PATCH handler for admin user updates.
 *
 * Role changes go to public.users.role, the same column serverAuth reads.
 * Request-body fields are allowlisted; passwords, email and auth metadata are
 * never accepted here.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdminFromRequest(request);
  } catch {
    let authenticated = false;

    try {
      authenticated = Boolean(await getCurrentUser());
    } catch {
      authenticated = false;
    }

    return NextResponse.json(
      { error: authenticated ? 'Forbidden' : 'Unauthorized' },
      { status: authenticated ? 403 : 401 }
    );
  }

  const userId = params.id;

  if (!userId || userId.length > 200) {
    return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const allowed = ['name', 'username', 'role', 'bio', 'website'];
  const updates = Object.fromEntries(
    Object.entries(body || {}).filter(([key]) => allowed.includes(key))
  ) as Record<string, unknown>;

  if ('role' in updates) {
    updates.role = String(updates.role).toUpperCase() === 'ADMIN' ? 'ADMIN' : 'USER';
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No supported updates supplied' }, { status: 400 });
  }

  updates.updated_at = new Date().toISOString();

  try {
    const supabase = getServerSupabaseClient({ useServiceRole: true });
    const { error } = await supabase.from('users').update(updates).eq('id', userId);

    if (error) {
      console.error('[api/admin/users/:id] update failed');
      return NextResponse.json({ error: 'Unable to update user' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: userId });
  } catch {
    console.error('[api/admin/users/:id] unexpected error');
    return NextResponse.json({ error: 'Unable to update user' }, { status: 500 });
  }
}
