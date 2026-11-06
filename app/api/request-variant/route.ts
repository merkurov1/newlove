import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  return NextResponse.json(
    { ok: false, error: 'variant_reservation_not_implemented' },
    { status: 501, headers: { 'Cache-Control': 'no-store' } }
  );
}
