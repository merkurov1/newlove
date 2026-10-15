import { NextRequest, NextResponse } from 'next/server';
import { parseUrl } from '@/lib/flow/parseUrl';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get('url');

    if (!url || !url.trim()) {
      return NextResponse.json({ error: 'url parameter is required' }, { status: 400 });
    }

    const preview = await parseUrl(url.trim());
    return NextResponse.json(preview);
  } catch (err: any) {
    console.error('[api/flow/parse-url] GET error:', err);
    return NextResponse.json({ error: err.message || 'Failed to parse URL' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const url = body?.url;

    if (!url || typeof url !== 'string' || !url.trim()) {
      return NextResponse.json({ error: 'url is required in request body' }, { status: 400 });
    }

    const preview = await parseUrl(url.trim());
    return NextResponse.json(preview);
  } catch (err: any) {
    console.error('[api/flow/parse-url] POST error:', err);
    return NextResponse.json({ error: err.message || 'Failed to parse URL' }, { status: 500 });
  }
}
