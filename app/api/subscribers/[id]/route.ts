import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser, getServerSupabaseClient, requireAdminFromRequest } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdminFromRequest(req);
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

  const { id } = params;

  if (!id || id.length > 200) {
    return NextResponse.json({ error: 'Invalid subscriber id' }, { status: 400 });
  }

  try {
    const store = getServerSupabaseClient({ useServiceRole: true });
    const { error } = await store.from('subscribers').delete().eq('id', id).limit(1);

    if (error) {
      console.error('[api/subscribers/delete] deletion failed');
      return NextResponse.json({ error: 'Deletion failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    console.error('[api/subscribers/delete] unexpected error');
    return NextResponse.json({ error: 'Deletion failed' }, { status: 500 });
  }
}
