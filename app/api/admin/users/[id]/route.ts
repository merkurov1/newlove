import { NextRequest, NextResponse } from 'next/server';

// Minimal PATCH handler stub for admin user updates during migration.
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Real implementation will use Supabase/Onboard and proper authorization.
  const userId = params.id;
  const body = await request.json().catch(() => ({}));
  return NextResponse.json({ ok: true, id: userId, updates: body });
}