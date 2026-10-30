import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import fs from 'fs/promises';
import path from 'path';
import { UNFRAMED_SOURCE_PATH } from '@/lib/knowledge/unframed';
import { verifyUnframedToken } from '@/lib/unframed/access';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const cookieStore = await cookies();

    const hasAccess = verifyUnframedToken(
      cookieStore.get('unframed_access')?.value,
      'access',
    );
    const isAdmin = verifyUnframedToken(
      cookieStore.get('unframed_admin')?.value,
      'admin',
    );

    if (!hasAccess && !isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const filePath = path.join(process.cwd(), UNFRAMED_SOURCE_PATH);
    const fileContent = await fs.readFile(filePath, 'utf8');

    return NextResponse.json(
      { content: fileContent },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch {
    return NextResponse.json({ error: 'Manuscript not found' }, { status: 404 });
  }
}
