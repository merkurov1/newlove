export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';

// Minimal stub for editor-image upload route during Supabase migration.
// Keeps implementation tiny and avoids next-auth/prisma imports.
export async function POST(_req: NextRequest) {
  return NextResponse.json({ ok: true, message: 'editor-image upload stub (migrate to Supabase storage)' });
}