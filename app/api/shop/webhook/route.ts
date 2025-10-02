import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

// Проверка переменных окружения при билде
if (!process.env.STRIPE_SECRET_KEY && process.env.NODE_ENV !== 'development') {
  console.warn('⚠️ STRIPE_SECRET_KEY not configured');
}

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-08-27.basil',
}) : null;

export async function POST(req: NextRequest) {
  // Проверка конфигурации Stripe
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('❌ Stripe not configured');
    return NextResponse.json({ error: 'Service temporarily unavailable' }, { status: 503 });
  }

  const sig = req.headers.get('stripe-signature');
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig!, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return NextResponse.json({ error: 'Webhook Error' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const productName = session.metadata?.product_name || '';
    const productId = session.metadata?.product_id || '';
    const email = session.customer_details?.email || session.customer_email || '';
    // Сохраняем заказ в Supabase
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        product_id: productId,
        product_name: productName,
        user_email: email,
        stripe_session_id: session.id,
        status: 'paid',
      }),
    });
  }

  return NextResponse.json({ received: true });
}
