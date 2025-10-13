import { NextResponse } from 'next/server';

// Minimal stub for postcards order-success webhook/page during migration.
// Full implementation will be replaced with Supabase-friendly logic later.
export async function GET() {
  return NextResponse.json({ ok: true, message: 'order-success stub (migrate to Supabase)' });
}

export const dynamic = 'force-dynamic';