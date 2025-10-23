export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';

// Minimal stub for editor-image-supabase route while migrating auth.
export async function POST(_req: NextRequest) {
  return NextResponse.json({ ok: true, message: 'editor-image-supabase stub (implement Supabase upload later)' });
}