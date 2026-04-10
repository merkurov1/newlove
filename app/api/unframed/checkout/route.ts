import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-08-27.basil' as any,
});

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { amount, currency = 'usd', email, successUrl, cancelUrl } = await req.json();
    const finalAmount = typeof amount === 'number' && amount > 0 ? amount : 1400; // $14.00 по умолчанию
    if (!finalAmount || finalAmount < 1) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }
    const origin = req.headers.get('origin') || 'https://merkurov.love';
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: 'Unframed Book Access',
              description: 'Доступ к книге Unframed',
            },
            unit_amount: finalAmount, // в центах
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: successUrl || `${origin}/unframed/book/?paid=1`,
      cancel_url: cancelUrl || `${origin}/unframed/book/?cancel=1`,
      customer_email: email,
      metadata: {
        type: 'unframed_book',
        email: email || '',
      },
    });
    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error('Stripe error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
