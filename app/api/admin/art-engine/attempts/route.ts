import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { listRecentAttempts } from '@/lib/lots/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function summarizeAttempt(row: Record<string, any>) {
  const payload =
    row.payload && typeof row.payload === 'object' ? row.payload : {};

  return {
    id: row.id,
    url: row.url,
    status: row.status,
    error_message: row.error_message,
    house: row.house,
    parsed_title: row.parsed_title,
    execution_time_ms: row.execution_time_ms,
    created_at: row.created_at,
    parser: payload.parser || null,
    parser_version: payload.parser_version || null,
    lot_id: payload.lot_id || null,
    http_status: payload.http_status || null,
    fetch_method: payload.fetch_method || null,
    warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
    errors: Array.isArray(payload.errors) ? payload.errors : [],
    missing_fields: Array.isArray(payload.missing_fields)
      ? payload.missing_fields
      : [],
    image_availability: payload.image?.availability || null,
  };
}

export async function GET(req: Request) {
  try {
    await requireAdminFromRequest(req);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get('limit') || 20);

  try {
    const rows = await listRecentAttempts(limit);
    return NextResponse.json({
      attempts: rows.map((row) => summarizeAttempt(row)),
    });
  } catch (error) {
    console.error('[ArtEngine] list attempts failed:', error);
    return NextResponse.json(
      { error: 'Unable to load parser attempts.' },
      { status: 500 },
    );
  }
}
