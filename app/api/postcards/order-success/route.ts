import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { getServerSupabaseClient } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-08-27.basil',
});

const SESSION_PATTERN = /^cs_[A-Za-z0-9_]{8,200}$/;
const CONFIRMED_STATUSES = ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'];

/**
 * Reads the result of an existing postcard Checkout Session.
 *
 * It deliberately does not mark anything paid: `confirmed` comes only from the
 * order status written by the trusted Stripe webhook. A paid Stripe session
 * whose webhook has not arrived yet is reported as awaiting confirmation.
 */
export async function GET(request: Request) {
  const limited = checkRateLimit(getClientIp(request), {
    interval: 60 * 1000,
    maxRequests: 30,
    keyPrefix: 'postcard-order-status',
  });

  if (limited) return limited;

  const sessionId = new URL(request.url).searchParams.get('session_id') || '';

  if (!SESSION_PATTERN.test(sessionId)) {
    return NextResponse.json({ error: 'Invalid checkout session.' }, { status: 400 });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: 'Order status is temporarily unavailable.' },
      { status: 503 }
    );
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const metadata = session.metadata || {};

    if (metadata.type !== 'postcard_v1' || !metadata.orderId) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    const supabase = getServerSupabaseClient({ useServiceRole: true });
    const { data: order, error } = await supabase
      .from('postcard_orders')
      .select('id, status, amount')
      .eq('id', metadata.orderId)
      .maybeSingle();

    if (error) {
      console.error('Postcard order status lookup failed:', error);
      return NextResponse.json({ error: 'Could not read the order status.' }, { status: 500 });
    }

    if (!order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    const confirmed = CONFIRMED_STATUSES.includes(order.status);

    return NextResponse.json({
      order: {
        // Short reference only; the full id is not needed by the browser.
        id: String(order.id).slice(-8),
        status: order.status,
        confirmed,
        paymentReceived: session.payment_status === 'paid',
        amount: order.amount,
        currency: 'GBP',
        // Safe product label kept for the older order-success pages. No
        // recipient name, address, email or personal message is returned.
        postcard: { title: 'Heart & Angel postcard', image: '' },
      },
    });
  } catch (error) {
    console.error('Postcard order status failed:', error);
    return NextResponse.json({ error: 'Could not read the order status.' }, { status: 500 });
  }
}
