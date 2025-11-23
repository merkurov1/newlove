import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Эта строка гарантирует, что Next.js воспринимает файл как динамический модуль
export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  // Используем ту же версию API, что и в checkout, чтобы не было конфликтов типов
  apiVersion: '2024-12-18.acacia' as any, 
  typescript: true,
});

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(req: Request) {
  try {
    const body = await req.text();
    const headerList = headers();
    const sig = headerList.get('stripe-signature');

    if (!sig || !endpointSecret) {
      console.error('Webhook Error: Missing signature or secret');
      return NextResponse.json({ error: 'Missing signature or secret' }, { status: 400 });
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
    } catch (err: any) {
      console.error(`Webhook Signature Error: ${err.message}`);
      return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
    }

    // Обработка события
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;

      // Проверяем, что это наш тип платежа (Tribute)
      // Если metadata пустой (например, старый код), считаем это просто донатом
      const metadata = session.metadata || {};
      
      // Логика для Tribute
      const amountCents = session.amount_total || 0;
      const currency = session.currency || 'usd';
      const donorName = metadata.donor_name || 'Anonymous';
      const message = metadata.message || '';

      console.log(`Processing tribute from ${donorName}: ${amountCents} cents`);

      // Пишем в Supabase
      const { error } = await supabaseAdmin
        .from('tributes')
        .insert({
          amount_cents: amountCents,
          currency,
          provider: 'stripe',
          status: 'succeeded',
          donor_name: donorName,
          message: message,
          stripe_session_id: session.id
        });

      if (error) {
        console.error('Supabase Insert Error:', error);
        // Возвращаем 500, чтобы Stripe попробовал отправить вебхук еще раз
        return NextResponse.json({ error: 'DB Error' }, { status: 500 });
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error('Webhook Handler Error:', err);
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}