import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { isAuthenticationError } from '@/lib/auth/errors';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdminFromRequest();
    // Prisma removed; return empty list for now or implement Supabase table lookup
    const subscribers: Array<any> = [];
    return NextResponse.json({ subscribers });
  } catch (error) {
    if (isAuthenticationError(error)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching subscribers:', error);
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
