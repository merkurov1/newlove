export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminFromRequest, getServerSupabaseClient } from '@/lib/serverAuth';

export async function GET(request: NextRequest) {
  try {
    await requireAdminFromRequest(request as Request);
    // Use centralized server client to list users
    const supabase = getServerSupabaseClient();
    const { data, error } = await supabase.auth.admin.listUsers();
    if (error) throw error;
    const users = (data.users || []).map(u => ({
      id: u.id,
      name: u.user_metadata?.name || null,
      username: u.user_metadata?.username || null,
      email: u.email || null,
      role: u.user_metadata?.role || 'USER',
      image: u.user_metadata?.image || null,
      bio: u.user_metadata?.bio || null,
      website: u.user_metadata?.website || null,
      subscription: null,
      _count: { articles: 0, projects: 0, messages: 0 },
    }));

    // orphan subscribers: if Prisma removed, return empty list for now
    const orphanSubscribers: Array<any> = [];

    return NextResponse.json({ users, orphanSubscribers });
  } catch (error) {
    console.error('Error fetching users:', error);
    if (String(error).includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}