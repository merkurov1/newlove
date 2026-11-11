import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createHash } from 'node:crypto';
import fs from 'fs/promises';
import path from 'path';
import { UNFRAMED_EXPECTED_SHA256, UNFRAMED_SOURCE_PATH } from '@/lib/knowledge/unframed';
import { verifyUnframedToken } from '@/lib/unframed/access';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const cookieStore = await cookies();

    const hasAccess = verifyUnframedToken(cookieStore.get('unframed_access')?.value, 'access');
    const isAdmin = verifyUnframedToken(cookieStore.get('unframed_admin')?.value, 'admin');

    if (!hasAccess && !isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: { 'Cache-Control': 'private, no-store' } }
      );
    }

    const filePath = path.join(process.cwd(), UNFRAMED_SOURCE_PATH);
    const fileContent = await fs.readFile(filePath, 'utf8');
    const version = createHash('sha256').update(fileContent, 'utf8').digest('hex');

    if (version !== UNFRAMED_EXPECTED_SHA256) {
      console.error('[unframed/content] Manuscript integrity check failed', {
        expected: UNFRAMED_EXPECTED_SHA256,
        actual: version,
      });

      return NextResponse.json(
        { error: 'Manuscript integrity check failed' },
        {
          status: 503,
          headers: { 'Cache-Control': 'private, no-store' },
        }
      );
    }

    return NextResponse.json(
      { content: fileContent, version },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;

    if (code === 'ENOENT') {
      console.error('[unframed/content] Manuscript file is missing');
      return NextResponse.json(
        { error: 'Manuscript not found' },
        { status: 404, headers: { 'Cache-Control': 'private, no-store' } }
      );
    }

    console.error('[unframed/content] Failed to read manuscript', error);
    return NextResponse.json(
      { error: 'Manuscript temporarily unavailable' },
      { status: 500, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }
}
