import { NextResponse } from 'next/server';

// Minimal DELETE stub for messages during migration.
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const id = params.id;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  return NextResponse.json({ ok: true, id });
}

export const dynamic = 'force-dynamic';
