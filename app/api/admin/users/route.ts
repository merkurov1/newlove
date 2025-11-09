export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminFromRequest, getServerSupabaseClient } from '@/lib/serverAuth';
import { adminDeleteUser, adminUpdateUserRole } from '@/app/admin/actions';
import { z } from 'zod';

const AdminUserActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('updateRole'),
    userId: z.string().uuid('Invalid user ID'),
    role: z.enum(['USER', 'ADMIN'], { message: 'Role must be USER or ADMIN' }),
  }),
  z.object({
    action: z.literal('deleteUser'),
    userId: z.string().uuid('Invalid user ID'),
  }),
  z.object({
    action: z.literal('toggleSubscription'),
    userId: z.string().uuid('Invalid user ID'),
    subscribe: z.boolean(),
  }),
]);

export async function GET(request: NextRequest) {
  try {
    await requireAdminFromRequest(request as Request);
  // Use centralized server client to list users (requires service role privileges)
  const supabase = getServerSupabaseClient({ useServiceRole: true });
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

export async function POST(request: NextRequest) {
  try {
    await requireAdminFromRequest(request as Request);
    const body = await request.json();
    
    // Validate input with Zod
    const validation = AdminUserActionSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { 
          status: 'error', 
          message: 'Validation failed', 
          details: validation.error.flatten().fieldErrors 
        }, 
        { status: 400 }
      );
    }
    
    const { action, userId } = validation.data;

    if (action === 'updateRole') {
      const result = await adminUpdateUserRole(userId, validation.data.role);
      return NextResponse.json(result);
    }

    if (action === 'deleteUser') {
      const result = await adminDeleteUser(userId);
      return NextResponse.json(result);
    }

    if (action === 'toggleSubscription') {
      const { adminToggleUserSubscription } = await import('@/app/admin/actions');
      const result = await adminToggleUserSubscription(userId, validation.data.subscribe);
      return NextResponse.json(result);
    }

    return NextResponse.json({ status: 'error', message: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Error in POST /api/admin/users:', error);
    if (String(error).includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ status: 'error', message: String(error) }, { status: 500 });
  }
}