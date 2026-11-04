import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { confirmTributeCheckoutSession } from '@/lib/tributes/paymentConfirmation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-08-27.basil',
});

const SESSION_ID_PATTERN = /^cs_[A-Za-z0-9_]{8,200}$/;

function publicAmount(session: Stripe.Checkout.Session): number | null {
  return typeof session.amount_total === 'number' && session.amount_total > 0
    ? session.amount_total / 100
    : null;
}

export async function GET(req: Request) {
  const limited = checkRateLimit(getClientIp(req), {
    interval: 60 * 1000,
    maxRequests: 30,
    keyPrefix: 'tribute-verify',
  });

  if (limited) return limited;

  const url = new URL(req.url);
  const sessionId = (url.searchParams.get('session_id') || '').trim();

  if (!SESSION_ID_PATTERN.test(sessionId)) {
    return NextResponse.json(
      { status: 'failed', error: 'Invalid checkout session.' },
      { status: 400 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey || !process.env.STRIPE_SECRET_KEY) {
    console.error('Tribute verify: missing server configuration');
    return NextResponse.json(
      {
        status: 'processing',
        message:
          'Payment verification is temporarily unavailable. Please check again.',
      },
      { status: 503 }
    );
  }

  let session: Stripe.Checkout.Session;

  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (error) {
    // A genuinely unknown session is final. A provider/network failure is
    // temporary: keep the donation in `processing` so the visitor can check
    // again instead of paying twice.
    const providerError = error as {
      statusCode?: number;
      code?: string;
    };

    const notFound =
      providerError?.statusCode === 404 ||
      providerError?.code === 'resource_missing';

    console.warn(
      'Tribute verify: session lookup failed',
      providerError?.statusCode || providerError?.code || 'unknown'
    );

    if (!notFound) {
      return NextResponse.json(
        {
          status: 'processing',
          message:
            'The payment could not be checked yet. Please try again without creating another donation.',
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { status: 'failed', error: 'Checkout session not found.' },
      { status: 404 }
    );
  }

  if (session.metadata?.type !== 'tribute_v1') {
    return NextResponse.json(
      { status: 'failed', error: 'Not a Tribute checkout.' },
      { status: 404 }
    );
  }

  const amount = publicAmount(session);
  const currency =
    typeof session.currency === 'string'
      ? session.currency.toLowerCase()
      : 'usd';

  // Card payments normally reach `paid` immediately. A session that is still
  // open (or awaiting an asynchronous method) is not a donation yet.
  if (session.payment_status !== 'paid') {
    if (session.status === 'expired') {
      return NextResponse.json({
        status: 'cancelled',
        amount,
        currency,
      });
    }

    return NextResponse.json({
      status: 'processing',
      amount,
      currency,
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const outcome = await confirmTributeCheckoutSession(supabaseAdmin, session);

  if (outcome.status === 'confirmed' || outcome.status === 'duplicate') {
    return NextResponse.json({
      status: 'confirmed',
      amount,
      currency,
    });
  }

  if (outcome.status === 'rejected') {
    console.error(
      `Tribute verify: paid session ${session.id} could not be recorded (${outcome.code})`
    );

    return NextResponse.json({
      status: 'processing',
      recorded: false,
      amount,
      currency,
      message:
        'Payment was received. The Temple is still recording the tribute.',
    });
  }

  return NextResponse.json({
    status: 'processing',
    amount,
    currency,
  });
}
