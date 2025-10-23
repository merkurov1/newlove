import { NextResponse } from 'next/server';

// Minimal slug validation stub during migration. Replaced with Supabase logic later.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'Slug required' }, { status: 400 });
  // In real impl we'll check DB; for now assume available.
  return NextResponse.json({ exists: false, available: true });
}