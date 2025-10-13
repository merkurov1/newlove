import { NextRequest, NextResponse } from 'next/server';

// Simple stubbed DELETE handler while migrating auth to Supabase/Onboard.
// This avoids referencing next-auth/prisma during the migration.
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const files = body?.fileNames || (body?.fileName ? [body.fileName] : []);

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    // In the real implementation we'll call Supabase admin storage here.
    return NextResponse.json({ success: true, deleted: files.length, files });
  } catch (err) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';