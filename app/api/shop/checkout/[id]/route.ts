import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-08-27.basil',
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  // Получаем товар из Supabase
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/products?id=eq.${id}&select=*`, {
    headers: {
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    },
    cache: 'no-store',
  });
  if (!res.ok) return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  const data = await res.json();
  const product = data[0];
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });

  // Создаём Stripe Checkout Session
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'rub',
          product_data: {
            name: product.name,
            description: product.description || undefined,
            images: product.image ? [product.image] : undefined,
          },
          unit_amount: product.price * 100, // рубли → копейки
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/shop/success`,
    cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/shop/cancel`,
    metadata: {
      product_id: product.id,
      product_name: product.name,
    },
  });

  return NextResponse.redirect(session.url!, 303);
}
