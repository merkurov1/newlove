import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { requireAdminFromRequest } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  // Build a request with current cookies so requireAdminFromRequest can validate
  const cookieHeader = cookies()
    .getAll()
    .map((c: any) => `${c.name}=${encodeURIComponent(c.value)}`)
    .join('; ');
  const r = new Request('http://localhost', { headers: { cookie: cookieHeader } });

  try {
    await requireAdminFromRequest(r);
  } catch (e) {
    return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });
  }

  try {
    revalidatePath('/letters');
    return NextResponse.json({ status: 'ok', message: 'Revalidation requested' });
  } catch (e) {
    console.error('API revalidate error:', e);
    return NextResponse.json({ status: 'error', message: String(e) }, { status: 500 });
  }
}
