import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';

export async function GET(req: Request) {
  try {
    // Return incoming header snapshot for diagnostics
    const headers: Record<string, string | null> = {};
    for (const k of Array.from(req.headers.keys())) headers[k] = req.headers.get(k);
    try {
      const user = await requireAdminFromRequest(req as Request);
      return NextResponse.json({ ok: true, user, headers });
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: String(e), headers }, { status: 403 });
    }
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
