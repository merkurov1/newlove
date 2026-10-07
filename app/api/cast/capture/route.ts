import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(sbUrl, sbKey);

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: Request) {
  try {
    let body: any;

    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body.' },
        { status: 400 }
      );
    }

    const recordId =
      typeof body?.recordId === 'string'
        ? body.recordId.trim()
        : '';

    const email =
      typeof body?.email === 'string'
        ? body.email.trim().toLowerCase()
        : '';

    if (!recordId || !email) {
      return NextResponse.json(
        { error: 'Missing data.' },
        { status: 400 }
      );
    }

    if (email.length > 254 || !isValidEmail(email)) {
      return NextResponse.json(
        { error: 'Invalid email address.' },
        { status: 400 }
      );
    }

    const { data: existingRecord, error: lookupError } =
      await supabase
        .from('casts')
        .select('id')
        .eq('id', recordId)
        .maybeSingle();

    if (lookupError) {
      console.error(
        '[Cast Capture] Lookup error:',
        lookupError
      );

      return NextResponse.json(
        { error: 'Could not locate the protocol record.' },
        { status: 500 }
      );
    }

    if (!existingRecord) {
      return NextResponse.json(
        { error: 'Protocol record not found.' },
        { status: 404 }
      );
    }

    const { error } = await supabase
      .from('casts')
      .update({
        email,
        status: 'identified'
      })
      .eq('id', recordId);

    if (error) {
      console.error(
        '[Cast Capture] DB update error:',
        error
      );

      return NextResponse.json(
        { error: 'Could not secure the protocol record.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true
    });
  } catch (error) {
    console.error('[Cast Capture] Fatal error:', error);

    return NextResponse.json(
      {
        error: 'Internal Core Error.'
      },
      {
        status: 500
      }
    );
  }
}