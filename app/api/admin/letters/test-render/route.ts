import { NextResponse } from 'next/server';
import { renderNewsletterEmail } from '@/emails/NewsletterEmail';

export async function GET() {
  try {
    const testLetter = {
      title: 'Preview: newsletter HTML',
      content: [{ type: 'richText', data: { html: '<p>This is a preview of the newsletter HTML.</p>' } }],
    };
    const unsubscribeUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://merkurov.love'}/api/newsletter-unsubscribe?token=preview-token`;
    const html = renderNewsletterEmail(testLetter, unsubscribeUrl);
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  } catch (err: any) {
    console.error('test-render error', err);
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
