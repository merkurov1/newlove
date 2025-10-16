import { NextResponse } from 'next/server';
import { getServerSupabaseClient } from '@/lib/serverAuth';

export async function GET() {
  try {
    const svc = getServerSupabaseClient({ useServiceRole: true });

    // 1) Test SELECT
    let selectOk = false;
    let selectError: any = null;
    try {
      const { data, error } = await svc.from('projects').select('id').limit(1).maybeSingle();
      if (error) throw error;
      selectOk = true;
    } catch (e: any) {
      selectError = { message: e?.message || String(e), code: e?.code || null };
    }

    // 2) Test INSERT (safe minimal insert + cleanup)
    const testId = 'debug-project-' + Date.now().toString(36);
    let insertOk = false;
    let insertError: any = null;
    try {
      const payload: any = { id: testId, title: 'debug test', slug: `debug-${testId}`, content: '[]', published: false, authorId: null };
      const { data, error } = await svc.from('projects').insert(payload).select().maybeSingle();
      if (error) throw error;
      insertOk = true;
      // cleanup: attempt delete
      try { await svc.from('projects').delete().eq('id', testId); } catch (e) { /* ignore cleanup errors */ }
    } catch (e: any) {
      insertError = { message: e?.message || String(e), code: e?.code || null };
    }

    return NextResponse.json({ ok: true, select: { ok: selectOk, error: selectError }, insert: { ok: insertOk, error: insertError } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e), stack: e?.stack }, { status: 500 });
  }
}
