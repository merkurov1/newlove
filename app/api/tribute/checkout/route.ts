import { NextResponse } from 'next/server';
import Stripe from 'stripe';

// Используем ту же инициализацию, что у тебя в проекте
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-08-27.basil' as any, // Подстраиваемся под твою версию
});

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { amount, currency = 'usd', donor_name, message } = await req.json();

    if (!amount || amount < 1) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    // Определяем URL возврата
    const origin = req.headers.get('origin') || 'https://merkurov.love';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: 'Temple Tribute',
              description: 'Fuel for the Digital Altar',
            },
            unit_amount: amount * 100, // Stripe принимает центы
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${origin}/tribute?status=success`,
      cancel_url: `${origin}/tribute?status=cancel`,
      // ВАЖНО: Метаданные нужны для Webhook и записи в базу
      metadata: {
        donor_name: donor_name || 'Anonymous',
        message: message || '',
        type: 'tribute_v1' // Маркер, чтобы отличить от других платежей
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error('Stripe error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}