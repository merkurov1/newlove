import { NextResponse } from 'next/server';
import { sendNewsletterToSubscriber } from '@/lib/newsletter/sendNewsletterToSubscriber';

// Test-send endpoint: attempts to run the newsletter send flow for a single
// test subscriber. This endpoint is safe to call in environments without
// RESEND or SUPABASE service role keys — the underlying function will
// perform a dry-run and return `{ status: 'skipped' }` when keys are missing.
export async function GET() {
  try {
    const testSubscriber = { id: 'test-subscriber', email: 'test@example.com' };
    const testLetter = {
      title: 'Test newsletter from local environment',
      content: [{ type: 'richText', data: { html: '<p>This is a test preview of the newsletter HTML.</p>' } }],
    };

    const result = await sendNewsletterToSubscriber(testSubscriber, testLetter);
    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    console.error('test-send error', err);
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';